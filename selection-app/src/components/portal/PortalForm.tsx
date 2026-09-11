"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  DraftItineraryLink,
  DraftYacht,
  FleetCache,
  FleetDetail,
  FleetEntry,
  FleetImages,
  PortalDraft,
} from "@/lib/portal-types";
import { emptyDraftYacht, emptyItineraryLink } from "@/lib/portal-types";
import { MAX_ITINERARY_LINKS } from "@/lib/types";
import FleetSelect from "./FleetSelect";
import ImagePicker from "./ImagePicker";
import ConfirmDialog from "./ConfirmDialog";
import { DragGhost, DragHandle, useYachtReorder } from "./useYachtReorder";
import styles from "./PortalForm.module.css";

const MAX_YACHTS = 10;
// Each save is two billed Blob writes at most; pause longer between them and
// flush when the tab is hidden or closed so nothing is lost.
const AUTOSAVE_MS = 2500;

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Fields the Yachtfolio auto-fill manages. Consultant fields (notes, the
 * brochure link) and APA are never auto-filled; edits to the fields below
 * are tracked so a re-fetch cannot clobber them.
 */
const AUTO_FIELDS = [
  "name",
  "lengthM",
  "yearRefit",
  "guests",
  "crew",
  "staterooms",
  "cruisingArea",
  "currency",
  "weeklyRate",
  "keyFeatures",
  "leadImageUrl",
  "interiorImageUrl",
  "exteriorImageUrl",
  "lifestyleImageUrl",
] as const;
type AutoField = (typeof AUTO_FIELDS)[number];

const CURRENCIES = ["EUR", "USD", "GBP", "CAD", "AUD", "NZD"];

/** Live price maths for the form readout (mirrors portal-map at publish). */
function computePrice(y: { weeklyRate: string; apaPct: string; vatPct: string; deliveryFee?: string }) {
  const n = (v: string) => {
    const t = (v ?? "").replace(/[^\d.]/g, "");
    const x = t ? Number(t) : NaN;
    return Number.isFinite(x) && x > 0 ? x : undefined;
  };
  const rate = n(y.weeklyRate);
  const apaPct = n(y.apaPct);
  const vatPct = n(y.vatPct);
  const delivery = n(y.deliveryFee ?? "");
  const apaAmount = rate != null && apaPct != null ? Math.round((rate * apaPct) / 100) : undefined;
  const vatAmount = rate != null && vatPct != null ? Math.round((rate * vatPct) / 100) : undefined;
  const total = rate != null ? rate + (apaAmount ?? 0) + (vatAmount ?? 0) + (delivery ?? 0) : undefined;
  return { rate, apaPct, vatPct, delivery, apaAmount, vatAmount, total };
}

const fmtMoneyForm = (currency: string, amount: number) =>
  `${(currency || "EUR").toUpperCase()} ${Math.round(amount).toLocaleString("en-GB")}`;

/** Resolve the weekly rate from the Yachtfolio rate matrix for a season/tier. */
function rateFromOptions(
  options: import("@/lib/portal-types").RateOptions | undefined,
  season: "summer" | "winter",
  tier: "low" | "high"
): { weeklyRate: string; currency?: string; weeklyRateIsFrom: boolean } | null {
  const o = options?.[season];
  if (!o) return null;
  const val = tier === "high" ? o.high : o.low;
  const isFrom = tier === "low" && o.high != null && o.low != null && o.high !== o.low;
  return {
    weeklyRate: val != null ? String(val) : "",
    currency: o.currency || undefined,
    weeklyRateIsFrom: val != null ? isFrom : false,
  };
}

interface CardFetchState {
  fetching: boolean;
  /** Facts have arrived; the gallery is still being prepared. */
  preparingImages: boolean;
  error: string | null;
  warnings: string[];
  lastEntry: FleetEntry | null;
}

export default function PortalForm({ selectionId }: { selectionId: string }) {
  const router = useRouter();
  const api = `/api/selections/${encodeURIComponent(selectionId)}`;
  const [draft, setDraft] = useState<PortalDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fleet, setFleet] = useState<FleetEntry[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set());
  const [fleetError, setFleetError] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [cardState, setCardState] = useState<Record<string, CardFetchState>>({});
  /** Auto-fill-managed fields the consultant has edited, per yacht entry. */
  const dirtyFields = useRef<Map<string, Set<AutoField>>>(new Map());
  /** Monotonic pick counter per entry so a stale response never applies. */
  const fetchSeq = useRef<Map<string, number>>(new Map());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [published, setPublished] = useState<{ slug: string; url: string } | null>(null);
  const [publishFlash, setPublishFlash] = useState(false);
  const [publishing, setPublishing] = useState(false);
  /** Full-size image shown in the lightbox popup, or null when closed. */
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null);

  const saveTimer = useRef<number | undefined>(undefined);
  const draftRef = useRef<PortalDraft | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  draftRef.current = draft;

  /* ------------------------------------------------ draft load / restore */

  useEffect(() => {
    (async () => {
      try {
        // One of the signed-in consultant's selections; ownership is
        // enforced server-side by identity (404 for anyone else's).
        const res = await fetch(api);
        if (res.status === 401) {
          window.location.href = "/portal/sign-in";
          return;
        }
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setLoadError(body?.error ?? "This selection could not be loaded.");
          return;
        }
        const next: PortalDraft = body?.draft ?? null;
        if (!next) return;
        next.subHeadline ??= "";
        next.welcome ??= "";
        // Ensure each yacht has a stable client key for React lists; seed one
        // empty entry so a fresh draft opens with a card ready to fill.
        // Drafts saved before the slots were renamed (deck → exterior,
        // watertoys → lifestyle) carry the old keys; carry them across.
        next.yachts = (next.yachts ?? []).map((raw) => {
          const y = raw as typeof raw & { deckImageUrl?: string; watertoysImageUrl?: string };
          return {
            ...y,
            uid: y.uid || crypto.randomUUID(),
            gallery: y.gallery ?? [],
            crew: y.crew ?? "",
            deliveryFee: y.deliveryFee ?? "",
            exteriorImageUrl: y.exteriorImageUrl ?? y.deckImageUrl ?? "",
            lifestyleImageUrl: y.lifestyleImageUrl ?? y.watertoysImageUrl ?? "",
          };
        });
        if (next.yachts.length === 0) next.yachts = [emptyDraftYacht(crypto.randomUUID())];
        // Drafts saved before several itineraries were possible carry one
        // itineraryUrl; it becomes the first link. A stable uid per row keys
        // the list, and one empty row is seeded so there is always a field.
        const savedLinks = next.sections.itineraryLinks?.length
          ? next.sections.itineraryLinks
          : next.sections.itineraryUrl
            ? [{ uid: "", label: "", url: next.sections.itineraryUrl }]
            : [];
        next.sections.itineraryLinks = savedLinks
          .slice(0, MAX_ITINERARY_LINKS)
          .map((l) => ({ ...l, uid: l.uid || crypto.randomUUID() }));
        if (next.sections.itineraryLinks.length === 0) {
          next.sections.itineraryLinks = [emptyItineraryLink(crypto.randomUUID())];
        }
        delete next.sections.itineraryUrl;
        setDraft(next);
        if (next.publishedSlug) {
          setPublished({ slug: next.publishedSlug, url: `/selection/${next.publishedSlug}` });
        }
        setOpenIds(new Set(next.yachts.slice(0, 1).map((y) => y.uid)));
      } catch {
        setLoadError("Could not load this selection — check the connection and reload.");
      }
    })();
  }, [api]);

  /* ------------------------------------------------------- fleet list */

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/fleet");
        if (res.status === 401) {
          window.location.href = "/portal/sign-in";
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "The fleet list is unavailable.");
        }
        const cache: FleetCache = await res.json();
        setFleet(cache.yachts ?? []);
        setRemovedIds(new Set(Object.keys(cache.removed ?? {}).map(Number)));
      } catch (err) {
        const detail = err instanceof Error && err.message ? err.message : "The fleet list is unavailable.";
        setFleetError(`${detail} Fields can still be completed by hand.`);
      }
    })();
  }, []);

  /* --------------------------------------------------------- autosave */

  const putDraft = useCallback(async (d: PortalDraft): Promise<boolean> => {
    try {
      const res = await fetch(api, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(d),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [api]);

  const update = useCallback(
    (mutate: (d: PortalDraft) => PortalDraft) => {
      setDraft((d) => {
        if (!d) return d;
        const next = mutate(d);
        window.clearTimeout(saveTimer.current);
        setSaveState("saving");
        saveTimer.current = window.setTimeout(async () => {
          const ok = await putDraft(next);
          setSaveState(ok ? "saved" : "error");
        }, AUTOSAVE_MS);
        return next;
      });
    },
    [putDraft]
  );

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  // Flush a pending save when the page is hidden or closed.
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current === undefined || !draftRef.current) return;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
      void fetch(api, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draftRef.current),
        keepalive: true,
      });
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [api]);

  // Close the image lightbox on Escape while it is open.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  /** Immediate save (before preview/publish). */
  const flushSave = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(saveTimer.current);
    const d = draftRef.current;
    if (!d) return false;
    setSaveState("saving");
    const ok = await putDraft(d);
    setSaveState(ok ? "saved" : "error");
    return ok;
  }, [putDraft]);

  /* ----------------------------------------------------- yacht helpers */

  const setYacht = useCallback(
    (uid: string, patch: Partial<PortalDraft["yachts"][number]>) => {
      update((d) => ({
        ...d,
        yachts: d.yachts.map((y) => (y.uid === uid ? { ...y, ...patch } : y)),
      }));
    },
    [update]
  );

  /** Consultant typing into an auto-fill-managed field: save and mark dirty. */
  const editAutoField = useCallback(
    (uid: string, field: AutoField, value: string) => {
      const set = dirtyFields.current.get(uid) ?? new Set<AutoField>();
      set.add(field);
      dirtyFields.current.set(uid, set);
      if (field === "name") setYacht(uid, { name: value, yfId: null });
      else if (field === "weeklyRate") setYacht(uid, { weeklyRate: value, weeklyRateIsFrom: false });
      else setYacht(uid, { [field]: value });
    },
    [setYacht]
  );

  /**
   * Changing the season or rate tier re-fills the weekly rate from the stored
   * Yachtfolio matrix and makes it authoritative again (clears the edited
   * flag) — the rate stays editable afterwards.
   */
  const setRateSelector = useCallback(
    (uid: string, key: "rateSeason" | "rateTier", value: string) => {
      update((d) => ({
        ...d,
        yachts: d.yachts.map((y) => {
          if (y.uid !== uid) return y;
          const next = { ...y, [key]: value } as typeof y;
          const r = rateFromOptions(next.rateOptions, next.rateSeason, next.rateTier);
          if (r) {
            next.weeklyRate = r.weeklyRate;
            next.weeklyRateIsFrom = r.weeklyRateIsFrom;
            if (r.currency) next.currency = r.currency;
            const dirty = dirtyFields.current.get(uid);
            dirty?.delete("weeklyRate");
            dirty?.delete("currency");
          }
          return next;
        }),
      }));
    },
    [update]
  );

  const setCard = useCallback((uid: string, patch: Partial<CardFetchState>) => {
    setCardState((s) => {
      const base: CardFetchState = s[uid] ?? { fetching: false, preparingImages: false, error: null, warnings: [], lastEntry: null };
      return { ...s, [uid]: { ...base, ...patch } };
    });
  }, []);

  const IMAGE_SLOT_KEYS = ["leadImageUrl", "interiorImageUrl", "exteriorImageUrl", "lifestyleImageUrl"] as const;

  /**
   * Second, slower half of a pick: the prepared gallery and default slot
   * images. Slots the consultant has edited are left alone; with onlyEmpty
   * (healing a draft saved before its images arrived) filled slots are too.
   */
  const loadImages = useCallback(
    async (uid: string, yfId: number, seq: number, onlyEmpty = false) => {
      try {
        const res = await fetch(`/api/fleet/${yfId}/images`);
        const body = await res.json().catch(() => null);
        if (fetchSeq.current.get(uid) !== seq) return;
        if (!res.ok) throw new Error(body?.error ?? "Yachtfolio did not return this yacht's images.");
        const imgs: FleetImages = body;
        const dirtyNow = dirtyFields.current.get(uid) ?? new Set<AutoField>();
        const current = draftRef.current?.yachts.find((y) => y.uid === uid);
        const patch: Partial<DraftYacht> = { gallery: imgs.gallery ?? [] };
        for (const key of IMAGE_SLOT_KEYS) {
          const keep = dirtyNow.has(key) || (onlyEmpty && (current?.[key] ?? "").trim() !== "");
          if (!keep) patch[key] = imgs[key] ?? "";
        }
        setYacht(uid, patch);
        setCardState((s) => {
          const base = s[uid] ?? { fetching: false, preparingImages: false, error: null, warnings: [], lastEntry: null };
          return { ...s, [uid]: { ...base, preparingImages: false, warnings: [...base.warnings, ...(imgs.warnings ?? [])] } };
        });
      } catch (err) {
        if (fetchSeq.current.get(uid) !== seq) return;
        setCard(uid, {
          preparingImages: false,
          error: err instanceof Error && err.message ? err.message : "Yachtfolio did not return this yacht's images.",
        });
      }
    },
    [setCard, setYacht]
  );

  const pickYacht = useCallback(
    async (uid: string, entry: FleetEntry) => {
      // Only warn when replacing a yacht that was already auto-filled and
      // then edited — typing a name to search the fleet is not an "edit".
      const current = draftRef.current?.yachts.find((y) => y.uid === uid);
      const dirty = dirtyFields.current.get(uid);
      const hasEdits = current?.yfId != null && dirty && [...dirty].some((f) => f !== "name");
      if (hasEdits) {
        const proceed = window.confirm(
          `You have edited fields on this yacht. Replace them with ${entry.name.toUpperCase()}'s Yachtfolio details?`
        );
        if (!proceed) return;
      }
      dirtyFields.current.set(uid, new Set());
      const seq = (fetchSeq.current.get(uid) ?? 0) + 1;
      fetchSeq.current.set(uid, seq);

      setYacht(uid, { yfId: entry.id, name: entry.name.toUpperCase() });
      setCard(uid, { fetching: true, preparingImages: false, error: null, warnings: [], lastEntry: entry });
      try {
        const res = await fetch(`/api/fleet/${entry.id}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error ?? "Yachtfolio did not return this yacht's details.");
        }
        if (fetchSeq.current.get(uid) !== seq) return; // superseded by a newer pick
        const detail: FleetDetail = body;

        // Apply fetched values, skipping anything edited while the fetch ran.
        // Fields Yachtfolio does not return become empty, never a guess;
        // notes is consultant-voice and stays untouched.
        const dirtyNow = dirtyFields.current.get(uid) ?? new Set<AutoField>();
        const patch: Partial<PortalDraft["yachts"][number]> = { yfId: entry.id };
        const apply = (field: AutoField, value: string) => {
          if (!dirtyNow.has(field)) Object.assign(patch, { [field]: value });
        };
        if (detail.name) apply("name", detail.name);
        apply("lengthM", detail.lengthM != null ? String(detail.lengthM) : "");
        apply("yearRefit", detail.yearRefit);
        apply("guests", detail.guests != null ? String(detail.guests) : "");
        apply("crew", detail.crew != null ? String(detail.crew) : "");
        apply("staterooms", detail.staterooms);
        apply("cruisingArea", detail.cruisingArea);
        apply("currency", detail.currency || "EUR");
        apply("keyFeatures", (detail.keyFeatures ?? []).join("\n"));
        // Rate matrix + selection reset to the default (summer / low) on a pick.
        patch.rateOptions = detail.rateOptions;
        patch.rateSeason = detail.rateSeason ?? "summer";
        patch.rateTier = detail.rateTier ?? "low";
        if (!dirtyNow.has("weeklyRate")) {
          patch.weeklyRate = detail.weeklyRate != null ? String(detail.weeklyRate) : "";
          patch.weeklyRateIsFrom = detail.weeklyRateIsFrom;
        }
        // Facts first — the form fills now; the gallery follows in a second
        // request while the card header says so.
        setYacht(uid, patch);
        setCard(uid, { fetching: false, preparingImages: true, error: null, warnings: detail.warnings ?? [] });
        await loadImages(uid, entry.id, seq);
      } catch (err) {
        if (fetchSeq.current.get(uid) !== seq) return;
        setCard(uid, {
          fetching: false,
          error:
            err instanceof Error && err.message
              ? err.message
              : "Yachtfolio did not return this yacht's details.",
        });
      }
    },
    [loadImages, setCard, setYacht]
  );

  // Heal yachts saved before their images arrived (or from older drafts):
  // fetch the gallery once the draft is loaded, filling only empty slots.
  const healed = useRef(false);
  useEffect(() => {
    if (!draft || healed.current) return;
    healed.current = true;
    for (const y of draft.yachts) {
      if (y.yfId != null && (!(y.gallery?.length) || !y.leadImageUrl.trim())) {
        const seq = (fetchSeq.current.get(y.uid) ?? 0) + 1;
        fetchSeq.current.set(y.uid, seq);
        setCard(y.uid, { preparingImages: true });
        void loadImages(y.uid, y.yfId, seq, true);
      }
    }
  }, [draft, loadImages, setCard]);

  /** The yacht awaiting removal confirmation, if any. */
  const [pendingRemove, setPendingRemove] = useState<{ uid: string; label: string } | null>(null);

  const addYacht = useCallback(() => {
    const uid = crypto.randomUUID();
    update((d) =>
      d.yachts.length >= MAX_YACHTS ? d : { ...d, yachts: [...d.yachts, emptyDraftYacht(uid)] }
    );
    setOpenIds((s) => new Set(s).add(uid));
  }, [update]);

  /* ------------------------------------------------- itinerary links */

  const setLinks = useCallback(
    (mutate: (links: DraftItineraryLink[]) => DraftItineraryLink[]) => {
      update((d) => ({
        ...d,
        sections: { ...d.sections, itineraryLinks: mutate(d.sections.itineraryLinks ?? []) },
      }));
    },
    [update]
  );

  const addItineraryLink = useCallback(() => {
    setLinks((links) =>
      links.length >= MAX_ITINERARY_LINKS
        ? links
        : [...links, emptyItineraryLink(crypto.randomUUID())]
    );
  }, [setLinks]);

  const editItineraryLink = useCallback(
    (uid: string, patch: Partial<Omit<DraftItineraryLink, "uid">>) => {
      setLinks((links) => links.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
    },
    [setLinks]
  );

  const removeItineraryLink = useCallback(
    (uid: string) => {
      setLinks((links) => links.filter((l) => l.uid !== uid));
    },
    [setLinks]
  );

  /** Ask first, in the portal's own dialog rather than the browser's. */
  const removeYacht = useCallback((uid: string, name: string) => {
    setPendingRemove({ uid, label: name.trim() ? name.trim().toUpperCase() : "this yacht" });
  }, []);

  const confirmRemoveYacht = useCallback(() => {
    const uid = pendingRemove?.uid;
    setPendingRemove(null);
    if (!uid) return;
    dirtyFields.current.delete(uid);
    fetchSeq.current.delete(uid);
    update((d) => ({ ...d, yachts: d.yachts.filter((y) => y.uid !== uid) }));
  }, [pendingRemove, update]);

  /** Reorder: move `fromUid` to the position of `toUid` (ring order follows). */
  const moveYacht = useCallback(
    (fromUid: string, toUid: string) => {
      if (fromUid === toUid) return;
      update((d) => {
        const list = [...d.yachts];
        const from = list.findIndex((y) => y.uid === fromUid);
        const to = list.findIndex((y) => y.uid === toUid);
        if (from === -1 || to === -1) return d;
        const [moved] = list.splice(from, 1);
        list.splice(to, 0, moved);
        return { ...d, yachts: list };
      });
    },
    [update]
  );

  const moveBy = useCallback(
    (uid: string, delta: -1 | 1) => {
      const list = draftRef.current?.yachts ?? [];
      const i = list.findIndex((y) => y.uid === uid);
      const target = list[i + delta];
      if (i !== -1 && target) moveYacht(uid, target.uid);
    },
    [moveYacht]
  );

  const toggleOpen = useCallback((uid: string) => {
    setOpenIds((s) => {
      const next = new Set(s);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  /* Drag-to-reorder: a ghost follows the pointer and the list reorders live. */
  const yachtUids = useMemo(() => draft?.yachts.map((y) => y.uid) ?? [], [draft]);
  const commitOrder = useCallback(
    (uids: string[]) => {
      update((d) => {
        const byUid = new Map(d.yachts.map((y) => [y.uid, y]));
        const ordered = uids.map((u) => byUid.get(u)).filter((y): y is DraftYacht => Boolean(y));
        const rest = d.yachts.filter((y) => !uids.includes(y.uid));
        return { ...d, yachts: [...ordered, ...rest] };
      });
    },
    [update]
  );
  const reorder = useYachtReorder({ uids: yachtUids, onCommit: commitOrder });

  /* --------------------------------------------------- preview / publish */

  const openPreview = useCallback(async () => {
    const ok = await flushSave();
    if (ok) window.open(`/portal/preview?id=${encodeURIComponent(selectionId)}`, "_blank", "noopener");
  }, [flushSave, selectionId]);

  /** Save now and return to the dashboard, where the row is listed. */
  const saveAndClose = useCallback(async () => {
    const ok = await flushSave();
    if (ok) router.push("/portal");
  }, [flushSave, router]);

  const publish = useCallback(async () => {
    const d = draftRef.current;
    if (!d || publishing) return;
    setPublishing(true);
    try {
      const saved = await flushSave();
      if (!saved) throw new Error("save failed");
      const res = await fetch(`${api}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "publish failed");
      setPublished({ slug: body.slug, url: body.url });
      update((prev) => ({ ...prev, publishedSlug: body.slug }));
      setPublishFlash(true);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setPublishFlash(false), 3200);
    } catch (err) {
      setFleetError(err instanceof Error && err.message !== "save failed" ? err.message : "Publishing failed — please try again.");
    } finally {
      setPublishing(false);
    }
  }, [api, flushSave, publishing, update]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  /* ------------------------------------------------------------ render */

  const statusLine = useMemo(() => {
    if (publishFlash) return "Client page updated — the link is ready to send.";
    if (saveState === "error") return "Draft could not be saved — check the connection.";
    if (saveState === "saving") return "Draft — saving…";
    return "Draft — changes are saved as you type.";
  }, [publishFlash, saveState]);

  if (loadError) {
    return (
      <main className={styles.main}>
        <div className={styles.eyebrow}>CHARTER PORTAL</div>
        <p className={styles.intro}>{loadError}</p>
        <p className={styles.intro}>
          <a className={styles.statusLink} href="/portal">
            Back to your selections
          </a>
        </p>
      </main>
    );
  }
  if (!draft) {
    return (
      <main className={styles.main}>
        <div className={styles.eyebrow}>CHARTER PORTAL</div>
        <p className={styles.intro}>Loading the form…</p>
      </main>
    );
  }

  const canAdd = draft.yachts.length < MAX_YACHTS;

  return (
    <>
      <main className={styles.main}>
        <div>
          <div className={styles.eyebrow}>CLIENT PRESENTATION</div>
          <h1 className={styles.title}>Yacht Selection</h1>
          <p className={styles.intro}>
            Complete the fields below to build the client&rsquo;s landing page. Every field maps to
            the presentation — the ring carousel, specification panel and your contact block are
            generated automatically.
          </p>
        </div>

        {/* 01 — CLIENT & SEASON */}
        <section className={`${styles.card} ${styles.cardFirst}`}>
          <div className={styles.sectionHead}>01 — CLIENT &amp; SEASON</div>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>CLIENT NAME(S)</span>
              <input
                type="text"
                className={styles.input}
                placeholder="Example – Mr and Mrs Harrington"
                value={draft.clientNames}
                onChange={(e) => update((d) => ({ ...d, clientNames: e.target.value }))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>SEASON</span>
              <input
                type="text"
                className={styles.input}
                placeholder="Example – Summer 2027"
                value={draft.season}
                onChange={(e) => update((d) => ({ ...d, season: e.target.value }))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>REGION</span>
              <input
                type="text"
                className={styles.input}
                placeholder="Example – Mediterranean"
                value={draft.region}
                onChange={(e) => update((d) => ({ ...d, region: e.target.value }))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>PAGE HEADLINE</span>
              <input
                type="text"
                className={styles.input}
                placeholder="Example – Yacht Charter Selection"
                value={draft.headline}
                onChange={(e) => update((d) => ({ ...d, headline: e.target.value }))}
              />
            </label>
            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span className={styles.fieldLabel}>
                SUB-HEADLINE <span className={styles.fieldLabelHint}>— optional, above the title</span>
              </span>
              <input
                type="text"
                className={styles.input}
                placeholder="Example – Time to start planning ahead (the default when blank)"
                value={draft.subHeadline}
                onChange={(e) => update((d) => ({ ...d, subHeadline: e.target.value }))}
              />
            </label>
            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span className={styles.fieldLabel}>
                WELCOME GREETING <span className={styles.fieldLabelHint}>— optional</span>
              </span>
              <textarea
                rows={2}
                className={styles.textarea}
                placeholder={`Example – Prepared for ${draft.clientNames || "the client"} by ${draft.consultant.name || "you"}${draft.season ? ` — ${draft.season}` : ""} (the default when blank)`}
                value={draft.welcome}
                onChange={(e) => update((d) => ({ ...d, welcome: e.target.value }))}
              />
            </label>
          </div>
        </section>

        {/* 02 — THE SELECTION */}
        <section className={styles.card}>
          <div className={styles.sectionHeadRow}>
            <div className={styles.sectionHead}>02 — THE SELECTION</div>
            <span className={styles.counter}>
              {draft.yachts.length} OF {MAX_YACHTS}
            </span>
          </div>
          <p className={styles.sectionNote}>
            Yachts appear on the ring in this order — drag a yacht by the handle on its left (or use the arrows) to reorder. Images are prepared automatically at
            2000 x 1250 px (16:10) when a yacht is selected from the fleet.
          </p>
          {fleetError && <p className={styles.fetchWarning}>{fleetError}</p>}
          {(() => {
            const currencies = new Set(
              draft.yachts
                .filter((y) => (y.weeklyRate ?? "").trim())
                .map((y) => (y.currency || "EUR").toUpperCase())
            );
            return currencies.size > 1 ? (
              <p className={styles.fetchWarning}>
                This selection mixes currencies ({[...currencies].join(", ")}). Each yacht shows its
                own; they are not converted or combined.
              </p>
            ) : null;
          })()}
          <div className={reorder.listClassName} ref={reorder.listRef}>
            {reorder.order.map((uid, i) => {
              const y = draft.yachts.find((entry) => entry.uid === uid);
              if (!y) return null;
              const open = openIds.has(y.uid);
              const card = cardState[y.uid] ?? { fetching: false, error: null, warnings: [], lastEntry: null };
              const fetching = card.fetching;
              const preparing = !fetching && card.preparingImages;
              const gone = y.yfId != null && fleet.length > 0 && !fleet.some((f) => f.id === y.yfId);
              const removedRecord = y.yfId != null && removedIds.has(y.yfId);
              return (
                <div
                  key={y.uid}
                  data-yacht-uid={y.uid}
                  className={`${styles.yachtEntry} ${reorder.dragUid === y.uid ? styles.dragging : ""}`}
                >
                  <button
                    type="button"
                    data-yacht-header
                    className={styles.yachtHeader}
                    onClick={(e) => {
                      // A press on the drag handle is not a toggle.
                      if ((e.target as HTMLElement).closest("[data-drag-handle]")) return;
                      toggleOpen(y.uid);
                    }}
                  >
                    <DragHandle label="Drag to change the order on the ring" {...reorder.handleProps(y.uid)} />
                    <span className={styles.yachtNum}>{String(i + 1).padStart(2, "0")}</span>
                    <span className={styles.yachtTitle}>
                      {y.name.trim() ? y.name.trim().toUpperCase() : "UNTITLED YACHT"}
                      {(gone || removedRecord) && (
                        <>
                          {" "}
                          <span className={styles.yachtWarning}>
                            NO LONGER LISTED IN YACHTFOLIO
                          </span>
                        </>
                      )}
                      {(fetching || preparing) && (
                        <>
                          {" "}
                          <span className={styles.headerNote} aria-live="polite">
                            {fetching ? "Fetching" : "Preparing"}{" "}
                            {y.name.trim() ? y.name.trim().toUpperCase() : "this yacht"}
                            &rsquo;s {fetching ? "details…" : "images…"}
                          </span>
                        </>
                      )}
                    </span>
                    <span className={styles.orderBtns}>
                      <span
                        role="button"
                        tabIndex={0}
                        className={styles.orderBtn}
                        aria-label="Move up"
                        title="Move up"
                        aria-disabled={i === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveBy(y.uid, -1);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            moveBy(y.uid, -1);
                          }
                        }}
                      >
                        ▲
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        className={styles.orderBtn}
                        aria-label="Move down"
                        title="Move down"
                        aria-disabled={i === draft.yachts.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveBy(y.uid, 1);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            moveBy(y.uid, 1);
                          }
                        }}
                      >
                        ▼
                      </span>
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      className={styles.removeBtn}
                      title="Remove yacht"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeYacht(y.uid, y.name);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          removeYacht(y.uid, y.name);
                        }
                      }}
                    >
                      REMOVE
                    </span>
                    <span className={styles.toggleIcon}>{open ? "−" : "+"}</span>
                  </button>
                  {open && (
                    <div className={styles.yachtBody}>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>
                          YACHT NAME <span className={styles.fieldLabelHint}>— FROM FLEET API</span>
                        </span>
                        <FleetSelect
                          fleet={fleet}
                          value={y.name}
                          yfId={y.yfId}
                          disabled={fetching}
                          onPick={(entry) => pickYacht(y.uid, entry)}
                          onNameChange={(name) => editAutoField(y.uid, "name", name)}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>LENGTH (M)</span>
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Auto-filled on selection"
                          value={y.lengthM}
                          onChange={(e) => editAutoField(y.uid, "lengthM", e.target.value)}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>YEAR / REFIT</span>
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Auto-filled on selection"
                          value={y.yearRefit}
                          onChange={(e) => editAutoField(y.uid, "yearRefit", e.target.value)}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>GUESTS</span>
                        <input
                          type="number"
                          className={styles.input}
                          placeholder="Auto-filled"
                          value={y.guests}
                          onChange={(e) => editAutoField(y.uid, "guests", e.target.value)}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>CREW</span>
                        <input
                          type="number"
                          className={styles.input}
                          placeholder="Auto-filled"
                          value={y.crew}
                          onChange={(e) => editAutoField(y.uid, "crew", e.target.value)}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>STATEROOMS</span>
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Auto-filled"
                          value={y.staterooms}
                          onChange={(e) => editAutoField(y.uid, "staterooms", e.target.value)}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>
                          LOCATION <span className={styles.checkTag}>check</span>
                          <span className={styles.fieldLabelHint}> — the current summer base port</span>
                        </span>
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Auto-filled"
                          value={y.cruisingArea}
                          onChange={(e) => editAutoField(y.uid, "cruisingArea", e.target.value)}
                        />
                      </label>
                      {y.rateOptions && (
                        <>
                          <label className={styles.field}>
                            <span className={styles.fieldLabel}>RATE SEASON</span>
                            <select
                              className={styles.input}
                              value={y.rateSeason}
                              onChange={(e) => setRateSelector(y.uid, "rateSeason", e.target.value)}
                            >
                              <option value="summer">
                                Summer 2027
                                {y.rateOptions.summer.low == null && y.rateOptions.summer.high == null
                                  ? " — no rate"
                                  : ""}
                              </option>
                              <option value="winter">
                                Winter 2027
                                {y.rateOptions.winter.low == null && y.rateOptions.winter.high == null
                                  ? " — no rate"
                                  : ""}
                              </option>
                            </select>
                          </label>
                          <label className={styles.field}>
                            <span className={styles.fieldLabel}>RATE</span>
                            <select
                              className={styles.input}
                              value={y.rateTier}
                              onChange={(e) => setRateSelector(y.uid, "rateTier", e.target.value)}
                            >
                              <option value="low">Low rate</option>
                              <option value="high">High rate</option>
                            </select>
                          </label>
                        </>
                      )}
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>WEEKLY RATE</span>
                        <div className={styles.rateRow}>
                          <select
                            className={styles.currencySelect}
                            aria-label="Currency"
                            value={y.currency || "EUR"}
                            onChange={(e) => editAutoField(y.uid, "currency", e.target.value)}
                          >
                            {CURRENCIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            className={styles.input}
                            placeholder="Auto-filled — editable"
                            value={y.weeklyRate}
                            onChange={(e) => editAutoField(y.uid, "weeklyRate", e.target.value)}
                          />
                        </div>
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>
                          APA % <span className={styles.checkTag}>check</span>
                        </span>
                        <input
                          type="number"
                          className={styles.input}
                          placeholder="Example – 35"
                          value={y.apaPct}
                          onChange={(e) => setYacht(y.uid, { apaPct: e.target.value })}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>
                          VAT % <span className={styles.checkTag}>check</span>
                          <span className={styles.fieldLabelHint}> — blank reads TBC on the page</span>
                        </span>
                        <input
                          type="number"
                          className={styles.input}
                          placeholder="Example – 22"
                          value={y.vatPct}
                          onChange={(e) => setYacht(y.uid, { vatPct: e.target.value })}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>
                          DELIVERY FEE <span className={styles.fieldLabelHint}>— optional, added to the total</span>
                        </span>
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Leave blank if none"
                          value={y.deliveryFee ?? ""}
                          onChange={(e) => setYacht(y.uid, { deliveryFee: e.target.value })}
                        />
                      </label>
                      {(() => {
                        const p = computePrice(y);
                        if (p.rate == null) return null;
                        const cur = y.currency || "EUR";
                        const pre = y.weeklyRateIsFrom ? "from " : "";
                        return (
                          <div className={`${styles.priceReadout} ${styles.fieldFull}`}>
                            <span>
                              VAT{" "}
                              {p.vatAmount != null ? `${pre}${fmtMoneyForm(cur, p.vatAmount)} (${p.vatPct}%)` : "TBC"}
                            </span>
                            {p.apaAmount != null && (
                              <span>
                                APA {pre}
                                {fmtMoneyForm(cur, p.apaAmount)} ({p.apaPct}%)
                              </span>
                            )}
                            {p.delivery != null && <span>DELIVERY FEE {fmtMoneyForm(cur, p.delivery)}</span>}
                            {p.total != null && (
                              <span className={styles.priceTotal}>
                                TOTAL {pre}
                                {fmtMoneyForm(cur, p.total)}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      <label className={`${styles.field} ${styles.fieldFull}`}>
                        <span className={styles.fieldLabel}>YOUR NOTE TO THE CLIENT</span>
                        <textarea
                          rows={2}
                          className={styles.textarea}
                          placeholder="Example – The yacht you know. I would expect her July weeks to be committed before Christmas."
                          value={y.notes}
                          onChange={(e) => setYacht(y.uid, { notes: e.target.value })}
                        />
                      </label>
                      <label className={`${styles.field} ${styles.fieldFull}`}>
                        <span className={styles.fieldLabel}>
                          KEY FEATURES <span className={styles.fieldLabelHint}>— optional, one per line</span>
                        </span>
                        <textarea
                          rows={3}
                          className={styles.textarea}
                          placeholder="Auto-filled from Yachtfolio — one feature per line, editable"
                          value={y.keyFeatures}
                          onChange={(e) => editAutoField(y.uid, "keyFeatures", e.target.value)}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>
                          BROCHURE LINK <span className={styles.fieldLabelHint}>— paste the Yachtfolio e-brochure link</span>
                        </span>
                        <input
                          type="url"
                          className={styles.input}
                          placeholder="Example – https://www.yachtfolio.com/e-brochure/…"
                          value={y.brochureUrl}
                          onChange={(e) => setYacht(y.uid, { brochureUrl: e.target.value })}
                        />
                      </label>
                      <div className={`${styles.field} ${styles.fieldFull}`}>
                        <ImagePicker
                          gallery={y.gallery ?? []}
                          values={{
                            leadImageUrl: y.leadImageUrl,
                            interiorImageUrl: y.interiorImageUrl,
                            exteriorImageUrl: y.exteriorImageUrl,
                            lifestyleImageUrl: y.lifestyleImageUrl,
                          }}
                          onPick={(slot, url) => editAutoField(y.uid, slot, url)}
                          onExpand={(url, label) => setLightbox({ url, label })}
                        />
                      </div>
                      {card.error && !fetching && (
                        <span className={styles.fetchWarning}>
                          {card.error}{" "}
                          {card.lastEntry && (
                            <button
                              type="button"
                              className={styles.retryBtn}
                              onClick={() => pickYacht(y.uid, card.lastEntry as FleetEntry)}
                            >
                              RETRY
                            </button>
                          )}
                        </span>
                      )}
                      {card.warnings.length > 0 && !fetching && (
                        <span className={styles.fetchWarning}>
                          {card.warnings.map((w) => `Yachtfolio note: ${w}`).join(" · ")}
                        </span>
                      )}
                      {(gone || removedRecord) && (
                        <span className={styles.fetchWarning}>
                          This yacht is no longer listed in Yachtfolio. The details below are a frozen
                          snapshot — confirm with the central agent before sending, or replace the
                          yacht.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" className={styles.addBtn} onClick={addYacht} disabled={!canAdd}>
            {canAdd ? "+ ADD A YACHT" : "SELECTION FULL — 10 YACHTS"}
          </button>
        </section>

        {/* 03 — PAGE SECTIONS */}
        <section className={styles.card}>
          <div className={styles.sectionHead}>03 — PAGE SECTIONS</div>
          <div className={styles.checkGrid}>
            <div className={styles.checkChild} style={{ paddingLeft: 0 }}>
              <span className={styles.fieldLabel}>
                THEME <span className={styles.fieldLabelHint}>— the client page&rsquo;s colour scheme</span>
              </span>
              <div className={styles.segmented} role="radiogroup" aria-label="Client page theme">
                {(["dark", "light"] as const).map((t) => {
                  const on = (draft.theme ?? "dark") === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`${styles.segment} ${on ? styles.segmentOn : ""}`}
                      onClick={() => update((d) => ({ ...d, theme: t }))}
                    >
                      {t.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={draft.sections.costs}
                onChange={(e) =>
                  update((d) => ({ ...d, sections: { ...d.sections, costs: e.target.checked } }))
                }
              />
              <span className={styles.checkLabel}>
                Costs involved (charter fee, APA, VAT, delivery, gratuity)
              </span>
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={draft.sections.itinerary}
                onChange={(e) =>
                  update((d) => ({ ...d, sections: { ...d.sections, itinerary: e.target.checked } }))
                }
              />
              <span className={styles.checkLabel}>Suggested itinerary</span>
            </label>
            <div className={styles.checkChild}>
              <span className={styles.fieldLabel}>
                ITINERARY LINKS{" "}
                <span className={styles.fieldLabelHint}>
                  &mdash; up to {MAX_ITINERARY_LINKS}, each with its own button text
                </span>
              </span>
              {(draft.sections.itineraryLinks ?? []).map((link, i) => (
                <div key={link.uid} className={styles.linkRow}>
                  <input
                    type="text"
                    className={styles.input}
                    aria-label={`Itinerary ${i + 1} button text`}
                    placeholder="Example – Naples to Sicily"
                    value={link.label}
                    onChange={(e) => editItineraryLink(link.uid, { label: e.target.value })}
                  />
                  <input
                    type="url"
                    className={styles.input}
                    aria-label={`Itinerary ${i + 1} link`}
                    placeholder="Example – https://… (the client itinerary page)"
                    value={link.url}
                    onChange={(e) => editItineraryLink(link.uid, { url: e.target.value })}
                  />
                  <button
                    type="button"
                    className={styles.removeBtn}
                    title="Remove this itinerary link"
                    onClick={() => removeItineraryLink(link.uid)}
                  >
                    REMOVE
                  </button>
                </div>
              ))}
              <span className={styles.linkHint}>
                Blank button text reads &ldquo;View your suggested itinerary&rdquo; on the client
                page. Links with no address are left off.
              </span>
              {(draft.sections.itineraryLinks ?? []).length < MAX_ITINERARY_LINKS && (
                <button type="button" className={styles.addLinkBtn} onClick={addItineraryLink}>
                  + ADD AN ITINERARY LINK
                </button>
              )}
            </div>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={draft.sections.compare}
                onChange={(e) =>
                  update((d) => ({ ...d, sections: { ...d.sections, compare: e.target.checked } }))
                }
              />
              <span className={styles.checkLabel}>Compare feature (side-by-side specifications)</span>
            </label>
          </div>
        </section>

        {/* 04 — YOUR DETAILS */}
        <section className={styles.card}>
          <div className={styles.sectionHead}>04 — YOUR DETAILS</div>
          <div className={styles.grid}>
            {(
              [
                ["NAME", "name", "Example – Lucy", "text"],
                ["TITLE", "title", "Example – Charter Consultant", "text"],
                ["PHONE", "phone", "Example – +41 44 000 00 00", "tel"],
                ["EMAIL", "email", "Example – lucy@oceanindependence.com", "email"],
                ["WHATSAPP NUMBER", "whatsapp", "Example – +41 44 000 00 00", "tel"],
                ["PHOTO URL", "photoUrl", "Example – https://…", "url"],
              ] as const
            ).map(([label, key, placeholder, type]) => (
              <label key={key} className={styles.field}>
                <span className={styles.fieldLabel}>{label}</span>
                <input
                  type={type}
                  className={styles.input}
                  placeholder={placeholder}
                  value={draft.consultant[key]}
                  onChange={(e) =>
                    update((d) => ({ ...d, consultant: { ...d.consultant, [key]: e.target.value } }))
                  }
                />
              </label>
            ))}
          </div>
        </section>
      </main>

      {/* Publish bar */}
      <div className={styles.publishBar}>
        <span className={styles.statusLine}>
          {statusLine}
          {published && (
            <>
              {" "}
              <a
                className={styles.statusLink}
                href={published.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                /selection/{published.slug}
              </a>
            </>
          )}
        </span>
        <div className={styles.barButtons}>
          <button type="button" className={styles.previewBtn} onClick={saveAndClose}>
            SAVE &amp; CLOSE
          </button>
          <button type="button" className={styles.previewBtn} onClick={openPreview}>
            PREVIEW CLIENT PAGE
          </button>
          <button type="button" className={styles.publishBtn} onClick={publish} disabled={publishing}>
            {publishFlash ? "PUBLISHED ✓" : "PUBLISH TO CLIENT PAGE"}
          </button>
        </div>
      </div>

      <DragGhost
        ghost={reorder.ghost}
        index={reorder.ghost ? reorder.order.indexOf(reorder.ghost.uid) : 0}
        name={draft.yachts.find((y) => y.uid === reorder.ghost?.uid)?.name ?? ""}
      />

      {lightbox && (
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className={styles.lightboxClose}
            onClick={() => setLightbox(null)}
            aria-label="Close preview"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.lightboxImg}
            src={lightbox.url}
            alt={lightbox.label}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {pendingRemove && (
        <ConfirmDialog
          title="Remove this yacht?"
          body={`${pendingRemove.label} will be taken out of the selection. Nothing is published until you publish again.`}
          confirmLabel="REMOVE YACHT"
          onConfirm={confirmRemoveYacht}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </>
  );
}
