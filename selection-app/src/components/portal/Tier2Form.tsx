"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { matchDestinationsByArea } from "@/lib/area-match";
import { useRouter } from "next/navigation";
import type {
  AtlasDestinationContent,
  AtlasDestinationOption,
  ContentBlock,
  FleetCache,
  FleetDetail,
  FleetEntry,
  FleetImages,
  RateOptions,
  Tier2DestinationDraft,
  Tier2Draft,
  Tier2DraftYacht,
} from "@/lib/portal-types";
import {
  TIER2_DEFAULT_DISCLAIMER,
  TIER2_MAX_YACHTS,
  TIER2_MIN_YACHTS,
  emptyTier2Destination,
  emptyTier2Yacht,
} from "@/lib/portal-types";
import { suggestTier2Slug, tier2PublishProblems, tier2Warnings } from "@/lib/atlas-map";
import { slugify } from "@/server/yachtfolio/normalise.mjs";
import FleetSelect from "./FleetSelect";
import ImagePicker from "./ImagePicker";
import styles from "./PortalForm.module.css";

const AUTOSAVE_MS = 2500;
type SaveState = "idle" | "saving" | "saved" | "error";

/** Yachtfolio-managed fields (as in the Tier 3 form): edits stop a re-fetch overwriting them. */
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
const IMAGE_SLOT_KEYS = ["leadImageUrl", "interiorImageUrl", "exteriorImageUrl", "lifestyleImageUrl"] as const;
const CURRENCIES = ["EUR", "USD", "GBP", "CAD", "AUD", "NZD"];

type CopyBlockKey = "eyebrow" | "deckLine" | "description";
const COPY_BLOCKS: Array<{ key: CopyBlockKey; label: string; rows?: number; hint?: string }> = [
  { key: "eyebrow", label: "EYEBROW", hint: "small caps line above the name" },
  { key: "deckLine", label: "DECK LINE", hint: "one line under the name" },
  { key: "description", label: "DESCRIPTION", rows: 4 },
];

const fmtMoneyForm = (currency: string, amount: number) => `${(currency || "EUR").toUpperCase()} ${Math.round(amount).toLocaleString("en-GB")}`;

const num = (v: string) => {
  const t = (v ?? "").replace(/[^\d.]/g, "");
  const x = t ? Number(t) : NaN;
  return Number.isFinite(x) && x > 0 ? x : undefined;
};

/**
 * Yachtfolio cruising areas → the chosen destinations. A destination is
 * ticked when one of its own terms (its name, its places, its country)
 * appears in the area string; when none does, every destination in a
 * matching region is ticked instead ("West Mediterranean" ticks all three
 * Mediterranean choices). The consultant confirms or changes the result.
 */
export function mapCruisingArea(cruisingArea: string, destinations: Tier2DestinationDraft[]): string[] {
  // Shared with the public fleet page (src/lib/area-match.ts); same rules.
  return matchDestinationsByArea(
    cruisingArea,
    destinations.filter((d) => d.destinationId).map((d) => ({ id: d.destinationId as string, areaTerms: d.areaTerms ?? [] }))
  );
}

/** Resolve the weekly rate from the Yachtfolio rate matrix for a season/tier (as on Tier 3). */
function rateFromOptions(
  options: RateOptions | undefined,
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
  preparingImages: boolean;
  error: string | null;
  warnings: string[];
}

interface DestFetchState {
  fetching: boolean;
  error: string | null;
}

export default function Tier2Form({ selectionId }: { selectionId: string }) {
  const router = useRouter();
  const api = `/api/selections/${encodeURIComponent(selectionId)}`;
  const [draft, setDraft] = useState<Tier2Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fleet, setFleet] = useState<FleetEntry[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set());
  const [fleetError, setFleetError] = useState<string | null>(null);
  const [fleetDemo, setFleetDemo] = useState(false);
  const [destOptions, setDestOptions] = useState<AtlasDestinationOption[]>([]);
  const [destState, setDestState] = useState<Record<number, DestFetchState>>({});
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [cardState, setCardState] = useState<Record<string, CardFetchState>>({});
  const dirtyFields = useRef<Map<string, Set<AutoField>>>(new Map());
  const fetchSeq = useRef<Map<string, number>>(new Map());
  const destSeq = useRef<Map<number, number>>(new Map());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [published, setPublished] = useState<{ slug: string; url: string } | null>(null);
  const [publishFlash, setPublishFlash] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null);
  const [dragUid, setDragUid] = useState<string | null>(null);
  const [overUid, setOverUid] = useState<string | null>(null);
  /** True once the consultant has typed a slug by hand (auto-suggestion stops). */
  const slugTouched = useRef(false);

  const saveTimer = useRef<number | undefined>(undefined);
  const draftRef = useRef<Tier2Draft | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  draftRef.current = draft;

  /* ----------------------------------------------------------- loading */

  useEffect(() => {
    (async () => {
      try {
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
        const next: Tier2Draft = body?.draft;
        if (!next) return;
        next.slug ??= "";
        next.clientGreeting ??= "";
        next.introNote ??= "";
        next.seasonNote ??= null;
        next.footerDisclaimer ??= TIER2_DEFAULT_DISCLAIMER;
        const slots = (next.destinations ?? []).slice(0, 3);
        while (slots.length < 3) slots.push(emptyTier2Destination());
        next.destinations = slots as Tier2Draft["destinations"];
        next.yachts = (next.yachts ?? []).map((y) => ({
          ...emptyTier2Yacht(y.uid || crypto.randomUUID()),
          ...y,
          uid: y.uid || crypto.randomUUID(),
          gallery: y.gallery ?? [],
          destinationIds: y.destinationIds ?? [],
        }));
        if (next.slug) slugTouched.current = true;
        setDraft(next);
        if (next.publishedSlug) setPublished({ slug: next.publishedSlug, url: `/atlas/${next.publishedSlug}` });
        setOpenIds(new Set(next.yachts.slice(0, 1).map((y) => y.uid)));
      } catch {
        setLoadError("Could not load this selection — check the connection and reload.");
      }
    })();
  }, [api]);

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
        const cache: FleetCache & { source?: string } = await res.json();
        setFleet(cache.yachts ?? []);
        setRemovedIds(new Set(Object.keys(cache.removed ?? {}).map(Number)));
        setFleetDemo(cache.source === "demo");
      } catch (err) {
        setFleetError(`${err instanceof Error && err.message ? err.message : "The fleet list is unavailable."} Fields can still be completed by hand.`);
      }
    })();
    (async () => {
      try {
        const res = await fetch("/api/atlas/destinations");
        if (!res.ok) return;
        const body = await res.json();
        setDestOptions(body.destinations ?? []);
      } catch {
        /* the pickers stay empty; the error shows on pick */
      }
    })();
  }, []);

  /* ---------------------------------------------------------- autosave */

  const putDraft = useCallback(
    async (d: Tier2Draft): Promise<boolean> => {
      try {
        const res = await fetch(api, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(d) });
        return res.ok;
      } catch {
        return false;
      }
    },
    [api]
  );

  const update = useCallback(
    (mutate: (d: Tier2Draft) => Tier2Draft) => {
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

  useEffect(() => {
    const flush = () => {
      if (saveTimer.current === undefined || !draftRef.current) return;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
      void fetch(api, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(draftRef.current), keepalive: true });
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

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const flushSave = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(saveTimer.current);
    const d = draftRef.current;
    if (!d) return false;
    setSaveState("saving");
    const ok = await putDraft(d);
    setSaveState(ok ? "saved" : "error");
    return ok;
  }, [putDraft]);

  /* -------------------------------------------------------- destinations */

  const setDestination = useCallback(
    (i: number, patch: Partial<Tier2DestinationDraft> | ((d: Tier2DestinationDraft) => Tier2DestinationDraft)) => {
      update((d) => {
        const slots = [...d.destinations] as Tier2Draft["destinations"];
        slots[i] = typeof patch === "function" ? patch(slots[i]) : { ...slots[i], ...patch };
        return { ...d, destinations: slots };
      });
    },
    [update]
  );

  /** Consultant edits a block: the value changes and the source flips to "consultant". */
  const editBlock = useCallback(
    (i: number, key: CopyBlockKey | "consultantNote", value: string) => {
      setDestination(i, (slot) => ({ ...slot, [key]: { value, source: "consultant" } as ContentBlock }));
    },
    [setDestination]
  );

  const restoreBlock = useCallback(
    (i: number, key: CopyBlockKey) => {
      setDestination(i, (slot) => (slot.atlas ? { ...slot, [key]: { value: slot.atlas[key], source: "atlas" } } : slot));
    },
    [setDestination]
  );

  const setImage = useCallback(
    (i: number, n: 0 | 1, value: string, source: ContentBlock["source"]) => {
      setDestination(i, (slot) => {
        const images = [...slot.images] as [ContentBlock, ContentBlock];
        images[n] = { value, source };
        return { ...slot, images };
      });
    },
    [setDestination]
  );

  /** Choosing a destination pre-fills every block from the Atlas. */
  const pickDestination = useCallback(
    async (i: number, id: string) => {
      if (!id) {
        setDestination(i, emptyTier2Destination());
        return;
      }
      const option = destOptions.find((o) => o.id === id);
      const seq = (destSeq.current.get(i) ?? 0) + 1;
      destSeq.current.set(i, seq);
      setDestination(i, { ...emptyTier2Destination(), destinationId: id, name: option?.name ?? id });
      setDestState((s) => ({ ...s, [i]: { fetching: true, error: null } }));
      try {
        const res = await fetch(`/api/atlas/destinations/${id}`);
        const body = await res.json().catch(() => null);
        if (destSeq.current.get(i) !== seq) return;
        if (!res.ok) throw new Error(body?.error ?? "The Atlas content is unavailable.");
        const content: AtlasDestinationContent = body;
        const atlas = (v: string): ContentBlock => ({ value: v, source: "atlas" });
        setDestination(i, {
          destinationId: content.id,
          name: content.name,
          eyebrow: atlas(content.atlas.eyebrow),
          deckLine: atlas(content.atlas.deckLine),
          description: atlas(content.atlas.description),
          consultantNote: { value: "", source: "consultant" },
          images: [atlas(content.atlas.images[0] ?? ""), atlas(content.atlas.images[1] ?? content.atlas.images[0] ?? "")],
          atlas: content.atlas,
          areaTerms: content.areaTerms,
        });
        setDestState((s) => ({ ...s, [i]: { fetching: false, error: null } }));
      } catch (err) {
        if (destSeq.current.get(i) !== seq) return;
        setDestState((s) => ({ ...s, [i]: { fetching: false, error: err instanceof Error ? err.message : "The Atlas content is unavailable." } }));
      }
    },
    [destOptions, setDestination]
  );

  /* -------------------------------------------------------------- yachts */

  const setYacht = useCallback(
    (uid: string, patch: Partial<Tier2DraftYacht>) => {
      update((d) => ({ ...d, yachts: d.yachts.map((y) => (y.uid === uid ? { ...y, ...patch } : y)) }));
    },
    [update]
  );

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
   * flag); the rate stays editable afterwards.
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
      const base: CardFetchState = s[uid] ?? { fetching: false, preparingImages: false, error: null, warnings: [] };
      return { ...s, [uid]: { ...base, ...patch } };
    });
  }, []);

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
        const patch: Partial<Tier2DraftYacht> = { gallery: imgs.gallery ?? [] };
        for (const key of IMAGE_SLOT_KEYS) {
          const keep = dirtyNow.has(key) || (onlyEmpty && (current?.[key] ?? "").trim() !== "");
          if (!keep) patch[key] = imgs[key] ?? "";
        }
        setYacht(uid, patch);
        setCardState((s) => {
          const base = s[uid] ?? { fetching: false, preparingImages: false, error: null, warnings: [] };
          return { ...s, [uid]: { ...base, preparingImages: false, warnings: [...base.warnings, ...(imgs.warnings ?? [])] } };
        });
      } catch (err) {
        if (fetchSeq.current.get(uid) !== seq) return;
        setCard(uid, { preparingImages: false, error: err instanceof Error ? err.message : "Yachtfolio did not return this yacht's images." });
      }
    },
    [setCard, setYacht]
  );

  const pickYacht = useCallback(
    async (uid: string, entry: FleetEntry) => {
      dirtyFields.current.set(uid, new Set());
      const seq = (fetchSeq.current.get(uid) ?? 0) + 1;
      fetchSeq.current.set(uid, seq);
      setYacht(uid, { yfId: entry.id, name: entry.name.toUpperCase() });
      setCard(uid, { fetching: true, preparingImages: false, error: null, warnings: [] });
      try {
        const res = await fetch(`/api/fleet/${entry.id}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "Yachtfolio did not return this yacht's details.");
        if (fetchSeq.current.get(uid) !== seq) return;
        const detail: FleetDetail = body;
        const patch: Partial<Tier2DraftYacht> = {
          yfId: entry.id,
          name: detail.name || entry.name.toUpperCase(),
          lengthM: detail.lengthM != null ? String(detail.lengthM) : "",
          yearRefit: detail.yearRefit,
          guests: detail.guests != null ? String(detail.guests) : "",
          crew: detail.crew != null ? String(detail.crew) : "",
          staterooms: detail.staterooms,
          cruisingArea: detail.cruisingArea,
          currency: detail.currency || "EUR",
          keyFeatures: (detail.keyFeatures ?? []).join("\n"),
          rateOptions: detail.rateOptions,
          rateSeason: detail.rateSeason ?? "summer",
          rateTier: detail.rateTier ?? "low",
          weeklyRate: detail.weeklyRate != null ? String(detail.weeklyRate) : "",
          weeklyRateIsFrom: detail.weeklyRateIsFrom,
          // Pre-tick the destinations the Yachtfolio cruising areas point at.
          destinationIds: mapCruisingArea(detail.cruisingArea, draftRef.current?.destinations ?? []),
        };
        setYacht(uid, patch);
        setCard(uid, { fetching: false, preparingImages: true, error: null, warnings: detail.warnings ?? [] });
        await loadImages(uid, entry.id, seq);
      } catch (err) {
        if (fetchSeq.current.get(uid) !== seq) return;
        setCard(uid, { fetching: false, error: err instanceof Error ? err.message : "Yachtfolio did not return this yacht's details." });
      }
    },
    [loadImages, setCard, setYacht]
  );

  // Heal yachts saved before their images arrived.
  const healed = useRef(false);
  useEffect(() => {
    if (!draft || healed.current) return;
    healed.current = true;
    for (const y of draft.yachts) {
      if (y.yfId != null && (!y.gallery?.length || !y.leadImageUrl.trim())) {
        const seq = (fetchSeq.current.get(y.uid) ?? 0) + 1;
        fetchSeq.current.set(y.uid, seq);
        setCard(y.uid, { preparingImages: true });
        void loadImages(y.uid, y.yfId, seq, true);
      }
    }
  }, [draft, loadImages, setCard]);

  const addYacht = useCallback(() => {
    const uid = crypto.randomUUID();
    update((d) => (d.yachts.length >= TIER2_MAX_YACHTS ? d : { ...d, yachts: [...d.yachts, emptyTier2Yacht(uid)] }));
    setOpenIds((s) => new Set(s).add(uid));
  }, [update]);

  const removeYacht = useCallback(
    (uid: string, name: string) => {
      if (!window.confirm(`Remove ${name.trim() ? name.trim().toUpperCase() : "this yacht"} from the shortlist?`)) return;
      dirtyFields.current.delete(uid);
      fetchSeq.current.delete(uid);
      update((d) => ({ ...d, yachts: d.yachts.filter((y) => y.uid !== uid) }));
    },
    [update]
  );

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

  const toggleDestination = useCallback(
    (uid: string, id: string) => {
      update((d) => ({
        ...d,
        yachts: d.yachts.map((y) => {
          if (y.uid !== uid) return y;
          const has = y.destinationIds.includes(id);
          return { ...y, destinationIds: has ? y.destinationIds.filter((x) => x !== id) : [...y.destinationIds, id] };
        }),
      }));
    },
    [update]
  );

  /* ------------------------------------------------- preview / publish */

  const openPreview = useCallback(async () => {
    if (await flushSave()) window.open(`/portal/preview?id=${encodeURIComponent(selectionId)}`, "_blank", "noopener");
  }, [flushSave, selectionId]);

  const saveAndClose = useCallback(async () => {
    if (await flushSave()) router.push("/portal");
  }, [flushSave, router]);

  const publish = useCallback(async () => {
    const d = draftRef.current;
    if (!d || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      if (!(await flushSave())) throw new Error("The draft could not be saved — check the connection.");
      const res = await fetch(`${api}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Publishing failed — please try again.");
      setPublished({ slug: body.slug, url: body.url });
      update((prev) => ({ ...prev, publishedSlug: body.slug }));
      setPublishFlash(true);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setPublishFlash(false), 3200);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Publishing failed — please try again.");
    } finally {
      setPublishing(false);
    }
  }, [api, flushSave, publishing, update]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  /* -------------------------------------------------------------- render */

  const statusLine = useMemo(() => {
    if (publishFlash) return "Client page updated — the link is ready to send.";
    if (saveState === "error") return "Draft could not be saved — check the connection.";
    if (saveState === "saving") return "Draft — saving…";
    return "Draft — changes are saved as you type.";
  }, [publishFlash, saveState]);

  const grouped = useMemo(() => {
    const groups: Array<{ region: string; options: AtlasDestinationOption[] }> = [];
    for (const o of destOptions) {
      let g = groups.find((x) => x.region === o.regionName);
      if (!g) groups.push((g = { region: o.regionName, options: [] }));
      g.options.push(o);
    }
    return groups;
  }, [destOptions]);

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

  const problems = tier2PublishProblems(draft);
  const warnings = tier2Warnings(draft);
  const chosen = draft.destinations.filter((d) => d.destinationId);
  const canAdd = draft.yachts.length < TIER2_MAX_YACHTS;

  return (
    <>
      <main className={styles.main}>
        <div>
          <div className={styles.eyebrow}>CLIENT PRESENTATION · TIER 2</div>
          <h1 className={styles.title}>Personalised Atlas</h1>
          <p className={styles.intro}>
            The 2027 Atlas for one client. Choose three destinations and a shortlist of yachts; the client gets the globe with those three pinned
            bright, the yachts in a rail beneath it and a detail drawer for each. Destination copy and imagery arrive from the Atlas and can be
            edited or restored at any time.
          </p>
        </div>

        {/* 01 — CLIENT & NOTE */}
        <section className={`${styles.card} ${styles.cardFirst}`}>
          <div className={styles.sectionHead}>01 — CLIENT &amp; NOTE</div>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>CLIENT NAME(S)</span>
              <input
                type="text"
                className={styles.input}
                placeholder="Mr and Mrs Harrington"
                value={draft.clientNames}
                onChange={(e) => {
                  const v = e.target.value;
                  update((d) => ({ ...d, clientNames: v, slug: slugTouched.current ? d.slug : suggestTier2Slug(v) }));
                }}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                PAGE ADDRESS <span className={styles.fieldLabelHint}>— /atlas/…</span>
              </span>
              <input
                type="text"
                className={styles.input}
                placeholder="harrington-summer-2027"
                value={draft.slug}
                disabled={Boolean(draft.publishedSlug)}
                title={draft.publishedSlug ? "The address is fixed once published." : undefined}
                onChange={(e) => {
                  slugTouched.current = true;
                  const v = e.target.value;
                  update((d) => ({ ...d, slug: v }));
                }}
                onBlur={() => update((d) => ({ ...d, slug: slugify(d.slug) }))}
              />
            </label>
            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span className={styles.fieldLabel}>GREETING</span>
              <input
                type="text"
                className={styles.input}
                placeholder="Mr and Mrs Harrington, your summer 2027."
                value={draft.clientGreeting}
                onChange={(e) => update((d) => ({ ...d, clientGreeting: e.target.value }))}
              />
            </label>
            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span className={styles.fieldLabel}>
                YOUR NOTE <span className={styles.fieldLabelHint}>— signed with your first name on the page</span>
              </span>
              <textarea
                rows={3}
                className={styles.textarea}
                placeholder="Last July you cruised the Amalfi Coast aboard SERENITY. I wanted you to see the 2027 season before we open it more widely."
                value={draft.introNote}
                onChange={(e) => update((d) => ({ ...d, introNote: e.target.value }))}
              />
            </label>
          </div>
        </section>
        {/* 02 — DESTINATIONS */}
        <section className={styles.card}>
          <div className={styles.sectionHeadRow}>
            <div className={styles.sectionHead}>02 — THREE DESTINATIONS</div>
            <span className={styles.counter}>{chosen.length} OF 3</span>
          </div>
          <p className={styles.sectionNote}>
            Each destination is a page of the 2027 Atlas. Choosing one fills its copy and images from the Atlas; anything you edit is marked as
            yours, and the client page labels each block accordingly. Images are cropped to 2000 x 1250 px (16:10).
          </p>
          <div className={styles.yachtList}>
            {draft.destinations.map((slot, i) => {
              const st = destState[i] ?? { fetching: false, error: null };
              const usedElsewhere = new Set(draft.destinations.filter((_, j) => j !== i).map((d) => d.destinationId));
              return (
                <div key={i} className={styles.destSlot}>
                  <div className={styles.destSlotHead}>
                    <span className={styles.yachtNum}>{String(i + 1).padStart(2, "0")}</span>
                    <span className={styles.yachtTitle}>{slot.name ? slot.name.toUpperCase() : "CHOOSE A DESTINATION"}</span>
                    {st.fetching && <span className={styles.headerNote}>Fetching from the Atlas…</span>}
                    {slot.atlas && !st.fetching && (
                      <span className={styles.destNote}>
                        {slot.atlas.contentSource === "live" ? "Copy re-read from the website" : "Copy from the cached Atlas snapshot"}
                      </span>
                    )}
                  </div>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      ATLAS DESTINATION <span className={styles.fieldLabelHint}>— Mediterranean first</span>
                    </span>
                    <select className={styles.input} value={slot.destinationId ?? ""} onChange={(e) => pickDestination(i, e.target.value)}>
                      <option value="">{destOptions.length ? "Choose…" : "Loading the Atlas…"}</option>
                      {grouped.map((g) => (
                        <optgroup key={g.region} label={g.region}>
                          {g.options.map((o) => (
                            <option key={o.id} value={o.id} disabled={usedElsewhere.has(o.id)}>
                              {`${"  ".repeat(Math.max(0, o.level - 1))}${o.name}${o.pathLabel && o.level > 2 ? ` — ${o.pathLabel}` : ""}`}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  {st.error && <p className={styles.fetchWarning}>{st.error}</p>}
                  {slot.destinationId && (
                    <>
                      <div className={styles.grid}>
                        {COPY_BLOCKS.map((b) => {
                          const block = slot[b.key];
                          const edited = block.source === "consultant";
                          return (
                            <label key={b.key} className={`${styles.field} ${b.key === "eyebrow" || b.key === "deckLine" ? "" : styles.fieldFull}`}>
                              <span className={styles.blockHead}>
                                <span className={styles.fieldLabel}>
                                  {b.label}
                                  {b.hint && <span className={styles.fieldLabelHint}> — {b.hint}</span>}
                                </span>
                                <span style={{ display: "inline-flex", gap: 10, alignItems: "baseline" }}>
                                  {edited && slot.atlas && (
                                    <button type="button" className={styles.restoreLink} onClick={() => restoreBlock(i, b.key)}>
                                      Restore Atlas text
                                    </button>
                                  )}
                                  <span className={`${styles.sourceTag} ${edited ? styles.sourceTagEdited : ""}`}>{edited ? "Edited by you" : "From the Atlas"}</span>
                                </span>
                              </span>
                              {b.rows ? (
                                <textarea rows={b.rows} className={styles.textarea} value={block.value} onChange={(e) => editBlock(i, b.key, e.target.value)} />
                              ) : (
                                <input type="text" className={styles.input} value={block.value} onChange={(e) => editBlock(i, b.key, e.target.value)} />
                              )}
                            </label>
                          );
                        })}
                        <label className={`${styles.field} ${styles.fieldFull}`}>
                          <span className={styles.fieldLabel}>
                            YOUR NOTE ON THIS DESTINATION <span className={styles.fieldLabelHint}>— optional, signed with your first name</span>
                          </span>
                          <textarea
                            rows={2}
                            className={styles.textarea}
                            placeholder="I would expect SERENITY’s July weeks to be committed before Christmas."
                            value={slot.consultantNote.value}
                            onChange={(e) => editBlock(i, "consultantNote", e.target.value)}
                          />
                        </label>
                      </div>
                      <div className={styles.field}>
                        <span className={styles.fieldLabel}>
                          TWO IMAGES <span className={styles.fieldLabelHint}>— from the website, replaceable</span>
                        </span>
                        <div className={styles.imageSlots}>
                          {([0, 1] as const).map((n) => {
                            const img = slot.images[n];
                            const candidates = slot.atlas?.images ?? [];
                            const fromAtlas = img.source === "atlas";
                            return (
                              <div key={n} className={styles.imageSlot}>
                                <span className={styles.blockHead}>
                                  <span className={styles.fieldLabel}>IMAGE {n + 1}</span>
                                  <span className={`${styles.sourceTag} ${fromAtlas ? "" : styles.sourceTagEdited}`}>{fromAtlas ? "From the Atlas" : "Edited by you"}</span>
                                </span>
                                <button
                                  type="button"
                                  className={styles.imagePreview}
                                  onClick={() => img.value && setLightbox({ url: img.value, label: `${slot.name} image ${n + 1}` })}
                                  aria-label="View this image larger"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  {img.value && <img src={img.value} alt="" loading="lazy" />}
                                </button>
                                {candidates.length > 0 && (
                                  <div className={styles.thumbStrip}>
                                    {candidates.map((u) => (
                                      <div key={u} className={`${styles.thumb} ${img.value === u ? styles.thumbSelected : ""}`}>
                                        <button type="button" className={styles.thumbPick} onClick={() => setImage(i, n, u, "atlas")} aria-label="Use this image" aria-pressed={img.value === u}>
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={u} alt="" loading="lazy" />
                                          {img.value === u && <span className={styles.thumbCheck} aria-hidden="true">✓</span>}
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <details className={styles.slotCustom}>
                                  <summary>Paste a custom image URL</summary>
                                  <input
                                    type="url"
                                    className={styles.input}
                                    placeholder="https://…"
                                    value={fromAtlas ? "" : img.value}
                                    onChange={(e) => setImage(i, n, e.target.value, "consultant")}
                                  />
                                </details>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 03 — YACHTS */}
        <section className={styles.card}>
          <div className={styles.sectionHeadRow}>
            <div className={styles.sectionHead}>03 — THE SHORTLIST</div>
            <span className={styles.counter}>
              {draft.yachts.length} OF {TIER2_MAX_YACHTS}
            </span>
          </div>
          <p className={styles.sectionNote}>
            Between {TIER2_MIN_YACHTS === 2 ? "two" : TIER2_MIN_YACHTS} and eight yachts, in rail order — drag a yacht’s grey bar (or use the arrows) to reorder. Facts, rates and images
            arrive from Yachtfolio when a yacht is chosen; destinations are pre-ticked from its cruising areas for you to confirm.
          </p>
          {fleetError && <p className={styles.fetchWarning}>{fleetError}</p>}
          {fleetDemo && <p className={styles.fetchWarning}>Demo fleet — YACHTFOLIO_PASSKEY is not configured on this server, so the fleet list is the six demo yachts.</p>}
          {warnings.length > 0 && (
            <ul className={styles.problemList} style={{ marginBottom: 20 }}>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className={styles.yachtList}>
            {draft.yachts.map((y, i) => {
              const open = openIds.has(y.uid);
              const card = cardState[y.uid] ?? { fetching: false, preparingImages: false, error: null, warnings: [] };
              const fetching = card.fetching;
              const preparing = !fetching && card.preparingImages;
              const gone = y.yfId != null && fleet.length > 0 && !fleet.some((f) => f.id === y.yfId);
              const removedRecord = y.yfId != null && removedIds.has(y.yfId);
              const rate = num(y.weeklyRate);
              const apa = num(y.apaPct);
              const apaAmount = rate != null && apa != null ? Math.round((rate * apa) / 100) : undefined;
              const total = rate != null ? rate + (apaAmount ?? 0) : undefined;
              const noDest = y.name.trim() && !y.destinationIds.some((id) => chosen.some((d) => d.destinationId === id));
              return (
                <div
                  key={y.uid}
                  data-yacht-uid={y.uid}
                  className={`${styles.yachtEntry} ${dragUid === y.uid ? styles.dragging : ""} ${overUid === y.uid && dragUid && dragUid !== y.uid ? styles.dropTarget : ""}`}
                >
                  <button
                    type="button"
                    className={styles.yachtHeader}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("[data-drag-handle]")) return;
                      toggleOpen(y.uid);
                    }}
                  >
                    <span
                      className={styles.dragHandle}
                      data-drag-handle
                      role="button"
                      aria-label="Drag to change the order in the rail"
                      title="Drag to change the order in the rail"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        setDragUid(y.uid);
                        setOverUid(null);
                      }}
                      onPointerMove={(e) => {
                        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                        const uid = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-yacht-uid]")?.dataset.yachtUid ?? null;
                        setOverUid((cur) => (cur === uid ? cur : uid));
                      }}
                      onPointerUp={(e) => {
                        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                        e.currentTarget.releasePointerCapture(e.pointerId);
                        const uid = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-yacht-uid]")?.dataset.yachtUid;
                        if (uid && uid !== y.uid) moveYacht(y.uid, uid);
                        setDragUid(null);
                        setOverUid(null);
                      }}
                      onPointerCancel={() => {
                        setDragUid(null);
                        setOverUid(null);
                      }}
                    >
                      ⋮⋮
                    </span>
                    <span className={styles.yachtNum}>{String(i + 1).padStart(2, "0")}</span>
                    <span className={styles.yachtTitle}>
                      {y.name.trim() ? y.name.trim().toUpperCase() : "UNTITLED YACHT"}
                      {(gone || removedRecord) && <span className={styles.yachtWarning}> NO LONGER LISTED IN YACHTFOLIO</span>}
                      {noDest && <span className={styles.yachtWarning}> NO DESTINATION TICKED</span>}
                      {(fetching || preparing) && (
                        <span className={styles.headerNote} aria-live="polite">
                          {" "}
                          {fetching ? "Fetching" : "Preparing"} {y.name.trim() ? y.name.trim().toUpperCase() : "this yacht"}&rsquo;s {fetching ? "details…" : "images…"}
                        </span>
                      )}
                    </span>
                    <span className={styles.orderBtns}>
                      <span role="button" tabIndex={0} className={styles.orderBtn} aria-label="Move up" aria-disabled={i === 0} onClick={(e) => { e.stopPropagation(); moveBy(y.uid, -1); }}>
                        ▲
                      </span>
                      <span role="button" tabIndex={0} className={styles.orderBtn} aria-label="Move down" aria-disabled={i === draft.yachts.length - 1} onClick={(e) => { e.stopPropagation(); moveBy(y.uid, 1); }}>
                        ▼
                      </span>
                    </span>
                    <span role="button" tabIndex={0} className={styles.removeBtn} title="Remove yacht" onClick={(e) => { e.stopPropagation(); removeYacht(y.uid, y.name); }}>
                      REMOVE
                    </span>
                    <span className={styles.toggleIcon}>{open ? "−" : "+"}</span>
                  </button>
                  {open && (
                    <div className={styles.yachtBody}>
                      <label className={`${styles.field} ${styles.fieldFull}`}>
                        <span className={styles.fieldLabel}>
                          YACHT <span className={styles.fieldLabelHint}>— FROM FLEET API</span>
                        </span>
                        <FleetSelect fleet={fleet} value={y.name} yfId={y.yfId} disabled={fetching} onPick={(entry) => pickYacht(y.uid, entry)} onNameChange={(name) => editAutoField(y.uid, "name", name)} />
                      </label>
                      {card.error && <p className={styles.fetchWarning}>{card.error}</p>}
                      {card.warnings.length > 0 && <p className={styles.fetchWarning}>{card.warnings.join(" · ")}</p>}

                      <div className={`${styles.field} ${styles.fieldFull}`}>
                        <span className={styles.fieldLabel}>
                          DESTINATIONS <span className={styles.fieldLabelHint}>— pre-ticked from Yachtfolio cruising areas{y.cruisingArea ? `: ${y.cruisingArea}` : ""}</span>
                        </span>
                        <div className={styles.chipRow}>
                          {chosen.length === 0 && <span className={styles.destNote}>Choose destinations above first.</span>}
                          {chosen.map((d) => {
                            const on = y.destinationIds.includes(d.destinationId as string);
                            return (
                              <button key={d.destinationId} type="button" className={`${styles.chipToggle} ${on ? styles.chipOn : ""}`} aria-pressed={on} onClick={() => toggleDestination(y.uid, d.destinationId as string)}>
                                {d.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <label className={`${styles.field} ${styles.fieldFull}`}>
                        <span className={styles.fieldLabel}>
                          YOUR NOTE <span className={styles.fieldLabelHint}>— one line</span>
                        </span>
                        <input type="text" className={styles.input} placeholder="Same Captain, same crew, and the corners you missed." value={y.consultantNote} onChange={(e) => setYacht(y.uid, { consultantNote: e.target.value })} />
                      </label>

                      {(
                        [
                          ["LENGTH (M)", "lengthM"],
                          ["YEAR / REFIT", "yearRefit"],
                          ["GUESTS", "guests"],
                          ["CREW", "crew"],
                          ["STATEROOMS", "staterooms"],
                          ["CRUISING AREA", "cruisingArea"],
                        ] as Array<[string, AutoField]>
                      ).map(([label, key]) => (
                        <label key={key} className={styles.field}>
                          <span className={styles.fieldLabel}>{label}</span>
                          <input type="text" className={styles.input} placeholder="Auto-filled on selection" value={y[key]} onChange={(e) => editAutoField(y.uid, key, e.target.value)} />
                        </label>
                      ))}

                      {y.rateOptions && (
                        <>
                          <label className={styles.field}>
                            <span className={styles.fieldLabel}>RATE SEASON</span>
                            <select className={styles.input} value={y.rateSeason} onChange={(e) => setRateSelector(y.uid, "rateSeason", e.target.value)}>
                              <option value="summer">
                                Summer 2027{y.rateOptions.summer.low == null && y.rateOptions.summer.high == null ? " — no rate" : ""}
                              </option>
                              <option value="winter">
                                Winter 2027{y.rateOptions.winter.low == null && y.rateOptions.winter.high == null ? " — no rate" : ""}
                              </option>
                            </select>
                          </label>
                          <label className={styles.field}>
                            <span className={styles.fieldLabel}>RATE</span>
                            <select className={styles.input} value={y.rateTier} onChange={(e) => setRateSelector(y.uid, "rateTier", e.target.value)}>
                              <option value="low">Low rate</option>
                              <option value="high">High rate</option>
                            </select>
                          </label>
                        </>
                      )}
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>WEEKLY RATE</span>
                        <div className={styles.rateRow}>
                          <select className={styles.currencySelect} aria-label="Currency" value={y.currency || "EUR"} onChange={(e) => editAutoField(y.uid, "currency", e.target.value)}>
                            {CURRENCIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <input type="text" className={styles.input} placeholder="Auto-filled — editable" value={y.weeklyRate} onChange={(e) => editAutoField(y.uid, "weeklyRate", e.target.value)} />
                        </div>
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>APA %</span>
                        <input type="number" className={styles.input} placeholder="35" value={y.apaPct} onChange={(e) => setYacht(y.uid, { apaPct: e.target.value })} />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>VAT</span>
                        <input type="text" className={styles.input} placeholder="Varies by location" value={y.vatText} onChange={(e) => setYacht(y.uid, { vatText: e.target.value })} />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>
                          E-BROCHURE LINK <span className={styles.fieldLabelHint}>— Yachtfolio</span>
                        </span>
                        <input type="url" className={styles.input} placeholder="https://…" value={y.brochureUrl} onChange={(e) => setYacht(y.uid, { brochureUrl: e.target.value })} />
                      </label>
                      {rate != null && (
                        <div className={`${styles.priceReadout} ${styles.fieldFull}`}>
                          <span>RATE {fmtMoneyForm(y.currency, rate)}</span>
                          {apaAmount != null && (
                            <span>
                              APA {fmtMoneyForm(y.currency, apaAmount)} ({apa}%)
                            </span>
                          )}
                          <span>VAT {y.vatText || "Varies by location"}</span>
                          {total != null && <span className={styles.priceTotal}>TOTAL {fmtMoneyForm(y.currency, total)}</span>}
                        </div>
                      )}

                      <label className={`${styles.field} ${styles.fieldFull}`}>
                        <span className={styles.fieldLabel}>
                          KEY FEATURES <span className={styles.fieldLabelHint}>— from Yachtfolio, one per line, editable; the drawer’s highlights</span>
                        </span>
                        <textarea
                          rows={3}
                          className={styles.textarea}
                          placeholder="Auto-filled from Yachtfolio — one feature per line, editable"
                          value={y.keyFeatures}
                          onChange={(e) => editAutoField(y.uid, "keyFeatures", e.target.value)}
                        />
                      </label>
                      <div className={`${styles.field} ${styles.fieldFull}`}>
                        <ImagePicker
                          gallery={y.gallery ?? []}
                          values={{ leadImageUrl: y.leadImageUrl, interiorImageUrl: y.interiorImageUrl, exteriorImageUrl: y.exteriorImageUrl, lifestyleImageUrl: y.lifestyleImageUrl }}
                          onPick={(slot, url) => editAutoField(y.uid, slot, url)}
                          onExpand={(url, label) => setLightbox({ url, label })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" className={styles.addBtn} onClick={addYacht} disabled={!canAdd}>
            {canAdd ? "+ ADD A YACHT" : `${TIER2_MAX_YACHTS} YACHTS IS THE MAXIMUM`}
          </button>
        </section>

        {/* 04 — SEASON NOTE */}
        <section className={styles.card}>
          <div className={styles.sectionHead}>04 — SEASON NOTE</div>
          <p className={styles.sectionNote}>Shown beneath the shortlist, before your details — a short word on timing for the client’s season.</p>
          <div className={styles.grid}>
            <label className={`${styles.checkRow} ${styles.fieldFull}`}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={draft.seasonNote !== null}
                onChange={(e) =>
                  update((d) => ({ ...d, seasonNote: e.target.checked ? d.seasonNote ?? { eyebrow: "A NOTE ON JULY", body: "" } : null }))
                }
              />
              <span className={styles.checkLabel}>Include a season note beneath the shortlist</span>
            </label>
            {draft.seasonNote && (
              <>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>SEASON NOTE EYEBROW</span>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="A NOTE ON JULY"
                    value={draft.seasonNote.eyebrow}
                    onChange={(e) => update((d) => ({ ...d, seasonNote: { eyebrow: e.target.value, body: d.seasonNote?.body ?? "" } }))}
                  />
                </label>
                <label className={`${styles.field} ${styles.fieldFull}`}>
                  <span className={styles.fieldLabel}>SEASON NOTE</span>
                  <textarea
                    rows={3}
                    className={styles.textarea}
                    placeholder="You chartered in the third week of July, consistently the most requested week of the Mediterranean season…"
                    value={draft.seasonNote.body}
                    onChange={(e) => update((d) => ({ ...d, seasonNote: { eyebrow: d.seasonNote?.eyebrow ?? "", body: e.target.value } }))}
                  />
                </label>
              </>
            )}
          </div>
        </section>

        {/* 05 — YOUR DETAILS */}
        <section className={styles.card}>
          <div className={styles.sectionHead}>05 — YOUR DETAILS</div>
          <div className={styles.grid}>
            {(
              [
                ["NAME", "name", "Lucy", "text"],
                ["TITLE", "title", "Charter Consultant, Ocean Independence", "text"],
                ["PHONE", "phone", "+41 44 000 00 00", "tel"],
                ["EMAIL", "email", "lucy@oceanindependence.com", "email"],
                ["WHATSAPP NUMBER", "whatsapp", "+41 44 000 00 00", "tel"],
                ["PHOTO URL", "photoUrl", "https://...", "url"],
              ] as const
            ).map(([label, key, placeholder, type]) => (
              <label key={key} className={styles.field}>
                <span className={styles.fieldLabel}>{label}</span>
                <input type={type} className={styles.input} placeholder={placeholder} value={draft.consultant[key]} onChange={(e) => update((d) => ({ ...d, consultant: { ...d.consultant, [key]: e.target.value } }))} />
              </label>
            ))}
            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span className={styles.fieldLabel}>
                FOOTER DISCLAIMER <span className={styles.fieldLabelHint}>— the last line of the page, under your details</span>
              </span>
              <input
                type="text"
                className={styles.input}
                placeholder={TIER2_DEFAULT_DISCLAIMER}
                value={draft.footerDisclaimer}
                onChange={(e) => update((d) => ({ ...d, footerDisclaimer: e.target.value }))}
              />
            </label>
          </div>
        </section>
      </main>

      <div className={styles.publishBar}>
        <span className={styles.statusLine}>
          {publishError ? publishError : statusLine}
          {published && (
            <>
              {" "}
              <a className={styles.statusLink} href={published.url} target="_blank" rel="noopener noreferrer">
                /atlas/{published.slug}
              </a>
            </>
          )}
          {!publishError && problems.length > 0 && <> · Before publishing: {problems.join(" ")}</>}
        </span>
        <div className={styles.barButtons}>
          <button type="button" className={styles.previewBtn} onClick={saveAndClose}>
            SAVE &amp; CLOSE
          </button>
          <button type="button" className={styles.previewBtn} onClick={openPreview}>
            PREVIEW CLIENT PAGE
          </button>
          <button type="button" className={styles.publishBtn} onClick={publish} disabled={publishing || problems.length > 0} title={problems.join(" ") || undefined}>
            {publishFlash ? "PUBLISHED ✓" : "PUBLISH TO CLIENT PAGE"}
          </button>
        </div>
      </div>

      {lightbox && (
        <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Image preview" onClick={() => setLightbox(null)}>
          <button type="button" className={styles.lightboxClose} onClick={() => setLightbox(null)} aria-label="Close preview">
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.lightboxImg} src={lightbox.url} alt={lightbox.label} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}
