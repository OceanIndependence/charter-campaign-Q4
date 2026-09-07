"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FleetCache, FleetDetail, FleetEntry, PortalDraft } from "@/lib/portal-types";
import { emptyDraftYacht } from "@/lib/portal-types";
import FleetSelect from "./FleetSelect";
import styles from "./PortalForm.module.css";

const MAX_YACHTS = 10;
const AUTOSAVE_MS = 900;

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Fields the Yachtfolio auto-fill manages. Consultant-voice fields
 * (availability, notes) and APA are never auto-filled; edits to the fields
 * below are tracked so a re-fetch cannot clobber them.
 */
const AUTO_FIELDS = [
  "name",
  "lengthM",
  "yearRefit",
  "guests",
  "staterooms",
  "cruisingArea",
  "currency",
  "weeklyRate",
  "keyFeatures",
  "leadImageUrl",
  "interiorImageUrl",
  "deckImageUrl",
  "watertoysImageUrl",
  "brochureUrl",
] as const;
type AutoField = (typeof AUTO_FIELDS)[number];

const CURRENCIES = ["EUR", "USD", "GBP", "CAD", "AUD", "NZD"];

/** Live price maths for the form readout (mirrors portal-map at publish). */
function computePrice(y: { weeklyRate: string; apaPct: string; vatPct: string }) {
  const n = (v: string) => {
    const t = (v ?? "").replace(/[^\d.]/g, "");
    const x = t ? Number(t) : NaN;
    return Number.isFinite(x) && x > 0 ? x : undefined;
  };
  const rate = n(y.weeklyRate);
  const apaPct = n(y.apaPct);
  const vatPct = n(y.vatPct);
  const apaAmount = rate != null && apaPct != null ? Math.round((rate * apaPct) / 100) : undefined;
  const vatAmount = rate != null && vatPct != null ? Math.round((rate * vatPct) / 100) : undefined;
  const total = rate != null ? rate + (apaAmount ?? 0) + (vatAmount ?? 0) : undefined;
  return { rate, apaPct, vatPct, apaAmount, vatAmount, total };
}

const fmtMoneyForm = (currency: string, amount: number) =>
  `${(currency || "EUR").toUpperCase()} ${Math.round(amount).toLocaleString("en-GB")}`;

interface CardFetchState {
  fetching: boolean;
  error: string | null;
  warnings: string[];
  lastEntry: FleetEntry | null;
}

export default function PortalForm() {
  const [draft, setDraft] = useState<PortalDraft | null>(null);
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

  const saveTimer = useRef<number | undefined>(undefined);
  const draftRef = useRef<PortalDraft | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  draftRef.current = draft;

  /* ------------------------------------------------ draft load / restore */

  useEffect(() => {
    (async () => {
      try {
        // The signed-in consultant's own working draft (server creates one
        // if none exists); ownership is enforced server-side by identity.
        const res = await fetch("/api/drafts/current");
        if (res.status === 401) {
          window.location.href = "/portal/sign-in";
          return;
        }
        const body = await res.json();
        const next: PortalDraft = body?.draft ?? null;
        if (!next) return;
        // Ensure each yacht has a stable client key for React lists; seed one
        // empty entry so a fresh draft opens with a card ready to fill.
        next.yachts = (next.yachts ?? []).map((y) => ({ ...y, uid: y.uid || crypto.randomUUID() }));
        if (next.yachts.length === 0) next.yachts = [emptyDraftYacht(crypto.randomUUID())];
        setDraft(next);
        if (next.publishedSlug) {
          setPublished({ slug: next.publishedSlug, url: `/selection/${next.publishedSlug}` });
        }
        setOpenIds(new Set(next.yachts.slice(0, 1).map((y) => y.uid)));
      } catch {
        setFleetError("Could not load your working draft — check the connection and reload.");
      }
    })();
  }, []);

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
      const res = await fetch("/api/drafts/current", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(d),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

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

  const setCard = useCallback((uid: string, patch: Partial<CardFetchState>) => {
    setCardState((s) => {
      const base: CardFetchState = s[uid] ?? { fetching: false, error: null, warnings: [], lastEntry: null };
      return { ...s, [uid]: { ...base, ...patch } };
    });
  }, []);

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
      setCard(uid, { fetching: true, error: null, warnings: [], lastEntry: entry });
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
        // availability and notes are consultant-voice and stay untouched.
        const dirtyNow = dirtyFields.current.get(uid) ?? new Set<AutoField>();
        const patch: Partial<PortalDraft["yachts"][number]> = { yfId: entry.id };
        const apply = (field: AutoField, value: string) => {
          if (!dirtyNow.has(field)) Object.assign(patch, { [field]: value });
        };
        if (detail.name) apply("name", detail.name);
        apply("lengthM", detail.lengthM != null ? String(detail.lengthM) : "");
        apply("yearRefit", detail.yearRefit);
        apply("guests", detail.guests != null ? String(detail.guests) : "");
        apply("staterooms", detail.staterooms);
        apply("cruisingArea", detail.cruisingArea);
        apply("currency", detail.currency || "EUR");
        apply("keyFeatures", (detail.keyFeatures ?? []).join("\n"));
        if (!dirtyNow.has("weeklyRate")) {
          patch.weeklyRate = detail.weeklyRate != null ? String(detail.weeklyRate) : "";
          patch.weeklyRateIsFrom = detail.weeklyRateIsFrom;
        }
        apply("leadImageUrl", detail.leadImageUrl);
        apply("interiorImageUrl", detail.interiorImageUrl);
        apply("deckImageUrl", detail.deckImageUrl);
        apply("watertoysImageUrl", detail.watertoysImageUrl);
        apply("brochureUrl", detail.brochureUrl);
        setYacht(uid, patch);
        setCard(uid, { fetching: false, error: null, warnings: detail.warnings ?? [] });
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
    [setCard, setYacht]
  );

  const addYacht = useCallback(() => {
    const uid = crypto.randomUUID();
    update((d) =>
      d.yachts.length >= MAX_YACHTS ? d : { ...d, yachts: [...d.yachts, emptyDraftYacht(uid)] }
    );
    setOpenIds((s) => new Set(s).add(uid));
  }, [update]);

  const removeYacht = useCallback(
    (uid: string, name: string) => {
      const label = name.trim() ? name.trim().toUpperCase() : "this yacht";
      if (!window.confirm(`Remove ${label} from the selection?`)) return;
      dirtyFields.current.delete(uid);
      fetchSeq.current.delete(uid);
      update((d) => ({ ...d, yachts: d.yachts.filter((y) => y.uid !== uid) }));
    },
    [update]
  );

  const toggleOpen = useCallback((uid: string) => {
    setOpenIds((s) => {
      const next = new Set(s);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  /* --------------------------------------------------- preview / publish */

  const openPreview = useCallback(async () => {
    const ok = await flushSave();
    if (ok) window.open("/portal/preview", "_blank", "noopener");
  }, [flushSave]);

  const publish = useCallback(async () => {
    const d = draftRef.current;
    if (!d || publishing) return;
    setPublishing(true);
    try {
      const saved = await flushSave();
      if (!saved) throw new Error("save failed");
      const res = await fetch("/api/pages", {
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
  }, [flushSave, publishing, update]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  /* ------------------------------------------------------------ render */

  const statusLine = useMemo(() => {
    if (publishFlash) return "Client page updated — the link is ready to send.";
    if (saveState === "error") return "Draft could not be saved — check the connection.";
    if (saveState === "saving") return "Draft — saving…";
    return "Draft — changes are saved as you type.";
  }, [publishFlash, saveState]);

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
          <div className={styles.eyebrow}>NEW CLIENT PRESENTATION</div>
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
                placeholder="Mr and Mrs Harrington"
                value={draft.clientNames}
                onChange={(e) => update((d) => ({ ...d, clientNames: e.target.value }))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>SEASON</span>
              <input
                type="text"
                className={styles.input}
                placeholder="Summer 2027"
                value={draft.season}
                onChange={(e) => update((d) => ({ ...d, season: e.target.value }))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>REGION</span>
              <input
                type="text"
                className={styles.input}
                placeholder="Mediterranean"
                value={draft.region}
                onChange={(e) => update((d) => ({ ...d, region: e.target.value }))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>PAGE HEADLINE</span>
              <input
                type="text"
                className={styles.input}
                placeholder="Yacht Charter Selection"
                value={draft.headline}
                onChange={(e) => update((d) => ({ ...d, headline: e.target.value }))}
              />
            </label>
            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span className={styles.fieldLabel}>
                WELCOME GREETING <span className={styles.fieldLabelHint}>— optional</span>
              </span>
              <textarea
                rows={2}
                className={styles.textarea}
                placeholder={`Optional. Defaults to “Prepared for ${draft.clientNames || "the client"} by ${draft.consultant.name || "you"}${draft.season ? ` — ${draft.season}` : ""}”.`}
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
            Yachts appear on the ring in this order. Images are prepared automatically at
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
          <div className={styles.yachtList}>
            {draft.yachts.map((y, i) => {
              const open = openIds.has(y.uid);
              const card = cardState[y.uid] ?? { fetching: false, error: null, warnings: [], lastEntry: null };
              const fetching = card.fetching;
              const gone = y.yfId != null && fleet.length > 0 && !fleet.some((f) => f.id === y.yfId);
              const removedRecord = y.yfId != null && removedIds.has(y.yfId);
              return (
                <div key={y.uid} className={styles.yachtEntry}>
                  <button type="button" className={styles.yachtHeader} onClick={() => toggleOpen(y.uid)}>
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
                        <span className={styles.fieldLabel}>CRUISING AREA</span>
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Auto-filled"
                          value={y.cruisingArea}
                          onChange={(e) => editAutoField(y.uid, "cruisingArea", e.target.value)}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>AVAILABILITY</span>
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Auto-filled — editable"
                          value={y.availability}
                          onChange={(e) => setYacht(y.uid, { availability: e.target.value })}
                        />
                      </label>
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
                        <span className={styles.fieldLabel}>APA %</span>
                        <input
                          type="number"
                          className={styles.input}
                          placeholder="35"
                          value={y.apaPct}
                          onChange={(e) => setYacht(y.uid, { apaPct: e.target.value })}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>VAT %</span>
                        <input
                          type="number"
                          className={styles.input}
                          placeholder="TBC"
                          value={y.vatPct}
                          onChange={(e) => setYacht(y.uid, { vatPct: e.target.value })}
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
                          placeholder="The yacht you know. I would expect her July weeks to be committed before Christmas."
                          value={y.notes}
                          onChange={(e) => setYacht(y.uid, { notes: e.target.value })}
                        />
                      </label>
                      <label className={`${styles.field} ${styles.fieldFull}`}>
                        <span className={styles.fieldLabel}>
                          KEY FEATURES <span className={styles.fieldLabelHint}>— one per line</span>
                        </span>
                        <textarea
                          rows={3}
                          className={styles.textarea}
                          placeholder="Auto-filled from Yachtfolio — one feature per line, editable"
                          value={y.keyFeatures}
                          onChange={(e) => editAutoField(y.uid, "keyFeatures", e.target.value)}
                        />
                      </label>
                      <label className={`${styles.field} ${styles.fieldFull}`}>
                        <span className={styles.fieldLabel}>LEAD IMAGE URL — 2000 x 1250</span>
                        <input
                          type="url"
                          className={styles.input}
                          placeholder="Auto-filled from the fleet library — replace to override"
                          value={y.leadImageUrl}
                          onChange={(e) => editAutoField(y.uid, "leadImageUrl", e.target.value)}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>INTERIOR IMAGE URL</span>
                        <input
                          type="url"
                          className={styles.input}
                          placeholder="https://..."
                          value={y.interiorImageUrl}
                          onChange={(e) => editAutoField(y.uid, "interiorImageUrl", e.target.value)}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>DECK IMAGE URL</span>
                        <input
                          type="url"
                          className={styles.input}
                          placeholder="https://..."
                          value={y.deckImageUrl}
                          onChange={(e) => editAutoField(y.uid, "deckImageUrl", e.target.value)}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>WATERTOYS IMAGE URL</span>
                        <input
                          type="url"
                          className={styles.input}
                          placeholder="https://..."
                          value={y.watertoysImageUrl}
                          onChange={(e) => editAutoField(y.uid, "watertoysImageUrl", e.target.value)}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>BROCHURE LINK</span>
                        <input
                          type="url"
                          className={styles.input}
                          placeholder="https://..."
                          value={y.brochureUrl}
                          onChange={(e) => editAutoField(y.uid, "brochureUrl", e.target.value)}
                        />
                      </label>
                      {fetching && (
                        <span className={styles.fetchNote}>
                          Fetching {y.name.trim() ? y.name.trim().toUpperCase() : "this yacht"}
                          &rsquo;s details and preparing images…
                        </span>
                      )}
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
              <span className={styles.fieldLabel}>ITINERARY LINK</span>
              <input
                type="url"
                className={styles.input}
                placeholder="https://... (client itinerary page)"
                value={draft.sections.itineraryUrl}
                onChange={(e) =>
                  update((d) => ({ ...d, sections: { ...d.sections, itineraryUrl: e.target.value } }))
                }
              />
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
                ["NAME", "name", "Lucy", "text"],
                ["TITLE", "title", "Charter Consultant", "text"],
                ["PHONE", "phone", "+41 44 000 00 00", "tel"],
                ["EMAIL", "email", "lucy@oceanindependence.com", "email"],
                ["WHATSAPP NUMBER", "whatsapp", "+41 44 000 00 00", "tel"],
                ["PHOTO URL", "photoUrl", "https://...", "url"],
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
          <button type="button" className={styles.previewBtn} onClick={openPreview}>
            PREVIEW CLIENT PAGE
          </button>
          <button type="button" className={styles.publishBtn} onClick={publish} disabled={publishing}>
            {publishFlash ? "PUBLISHED ✓" : "PUBLISH TO CLIENT PAGE"}
          </button>
        </div>
      </div>
    </>
  );
}
