"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FleetCache, FleetDetail, FleetEntry, PortalDraft } from "@/lib/portal-types";
import { emptyDraftYacht } from "@/lib/portal-types";
import FleetSelect from "./FleetSelect";
import styles from "./PortalForm.module.css";

const MAX_YACHTS = 10;
const AUTOSAVE_MS = 900;
const DRAFT_KEY = "oi-portal-draft-id";

function newDraft(id: string): PortalDraft {
  return {
    id,
    updatedAt: new Date().toISOString(),
    clientNames: "",
    season: "",
    region: "",
    headline: "",
    yachts: [emptyDraftYacht(crypto.randomUUID())],
    sections: { costs: true, itinerary: true, itineraryUrl: "", compare: true },
    consultant: {
      name: "Lucy",
      title: "Charter Consultant, Ocean Independence",
      phone: "+41 44 000 00 00",
      email: "lucy@ocyachts.com",
      whatsapp: "https://wa.me/41440000000",
      photoUrl: "/assets/drops/lucy-photo.webp",
    },
  };
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function PortalForm() {
  const [draft, setDraft] = useState<PortalDraft | null>(null);
  const [fleet, setFleet] = useState<FleetEntry[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set());
  const [fleetError, setFleetError] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());
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
    let draftId = localStorage.getItem(DRAFT_KEY);
    if (!draftId) {
      draftId = crypto.randomUUID();
      localStorage.setItem(DRAFT_KEY, draftId);
    }
    (async () => {
      try {
        const res = await fetch(`/api/drafts/${draftId}`);
        if (res.status === 401) {
          window.location.href = "/portal/login";
          return;
        }
        const body = await res.json();
        const restored: PortalDraft | null = body?.draft ?? null;
        const next = restored ?? newDraft(draftId as string);
        setDraft(next);
        if (restored?.publishedSlug) {
          setPublished({ slug: restored.publishedSlug, url: `/selection/${restored.publishedSlug}` });
        }
        setOpenIds(new Set(next.yachts.slice(0, 1).map((y) => y.uid)));
      } catch {
        setDraft(newDraft(draftId as string));
      }
    })();
  }, []);

  /* ------------------------------------------------------- fleet list */

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/fleet");
        if (res.status === 401) {
          window.location.href = "/portal/login";
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const cache: FleetCache = await res.json();
        setFleet(cache.yachts ?? []);
        setRemovedIds(new Set(Object.keys(cache.removed ?? {}).map(Number)));
      } catch {
        setFleetError("The fleet list is unavailable — fields can still be completed by hand.");
      }
    })();
  }, []);

  /* --------------------------------------------------------- autosave */

  const putDraft = useCallback(async (d: PortalDraft): Promise<boolean> => {
    try {
      const res = await fetch(`/api/drafts/${d.id}`, {
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

  const pickYacht = useCallback(
    async (uid: string, entry: FleetEntry) => {
      setYacht(uid, { yfId: entry.id, name: entry.name.toUpperCase() });
      setFetchingIds((s) => new Set(s).add(uid));
      try {
        const res = await fetch(`/api/fleet/${entry.id}`);
        if (!res.ok) throw new Error(String(res.status));
        const detail: FleetDetail = await res.json();
        setYacht(uid, {
          yfId: entry.id,
          name: detail.name || entry.name.toUpperCase(),
          lengthM: detail.lengthM != null ? String(detail.lengthM) : "",
          yearRefit: detail.yearRefit,
          guests: detail.guests != null ? String(detail.guests) : "",
          staterooms: detail.staterooms,
          location: detail.location,
          cruisingArea: detail.cruisingArea,
          availability: detail.availability,
          weeklyRateEUR: detail.weeklyRateEUR != null ? String(detail.weeklyRateEUR) : "",
          weeklyRateIsFrom: detail.weeklyRateIsFrom,
          leadImageUrl: detail.leadImageUrl,
          interiorImageUrl: detail.interiorImageUrl,
          deckImageUrl: detail.deckImageUrl,
          watertoysImageUrl: detail.watertoysImageUrl,
          brochureUrl: detail.brochureUrl,
        });
      } catch {
        setYacht(uid, {
          availability: "",
        });
        setFleetError("Yachtfolio did not return that yacht's details — the fields stay as they are.");
      } finally {
        setFetchingIds((s) => {
          const next = new Set(s);
          next.delete(uid);
          return next;
        });
      }
    },
    [setYacht]
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
    const d = draftRef.current;
    if (ok && d) window.open(`/portal/preview/${d.id}`, "_blank", "noopener");
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
        body: JSON.stringify({ draftId: d.id }),
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
          <div className={styles.yachtList}>
            {draft.yachts.map((y, i) => {
              const open = openIds.has(y.uid);
              const fetching = fetchingIds.has(y.uid);
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
                          onNameChange={(name) => setYacht(y.uid, { name, yfId: null })}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>LENGTH (M)</span>
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Auto-filled on selection"
                          value={y.lengthM}
                          onChange={(e) => setYacht(y.uid, { lengthM: e.target.value })}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>YEAR / REFIT</span>
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Auto-filled on selection"
                          value={y.yearRefit}
                          onChange={(e) => setYacht(y.uid, { yearRefit: e.target.value })}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>GUESTS</span>
                        <input
                          type="number"
                          className={styles.input}
                          placeholder="Auto-filled"
                          value={y.guests}
                          onChange={(e) => setYacht(y.uid, { guests: e.target.value })}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>STATEROOMS</span>
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Auto-filled"
                          value={y.staterooms}
                          onChange={(e) => setYacht(y.uid, { staterooms: e.target.value })}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>LOCATION</span>
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Auto-filled"
                          value={y.location}
                          onChange={(e) => setYacht(y.uid, { location: e.target.value })}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>CRUISING AREA</span>
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Auto-filled"
                          value={y.cruisingArea}
                          onChange={(e) => setYacht(y.uid, { cruisingArea: e.target.value })}
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
                        <span className={styles.fieldLabel}>WEEKLY RATE (EUR)</span>
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Auto-filled — editable"
                          value={y.weeklyRateEUR}
                          onChange={(e) =>
                            setYacht(y.uid, { weeklyRateEUR: e.target.value, weeklyRateIsFrom: false })
                          }
                        />
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
                        <span className={styles.fieldLabel}>LEAD IMAGE URL — 2000 x 1250</span>
                        <input
                          type="url"
                          className={styles.input}
                          placeholder="Auto-filled from the fleet library — replace to override"
                          value={y.leadImageUrl}
                          onChange={(e) => setYacht(y.uid, { leadImageUrl: e.target.value })}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>INTERIOR IMAGE URL</span>
                        <input
                          type="url"
                          className={styles.input}
                          placeholder="https://..."
                          value={y.interiorImageUrl}
                          onChange={(e) => setYacht(y.uid, { interiorImageUrl: e.target.value })}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>DECK IMAGE URL</span>
                        <input
                          type="url"
                          className={styles.input}
                          placeholder="https://..."
                          value={y.deckImageUrl}
                          onChange={(e) => setYacht(y.uid, { deckImageUrl: e.target.value })}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>WATERTOYS IMAGE URL</span>
                        <input
                          type="url"
                          className={styles.input}
                          placeholder="https://..."
                          value={y.watertoysImageUrl}
                          onChange={(e) => setYacht(y.uid, { watertoysImageUrl: e.target.value })}
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>BROCHURE LINK</span>
                        <input
                          type="url"
                          className={styles.input}
                          placeholder="https://..."
                          value={y.brochureUrl}
                          onChange={(e) => setYacht(y.uid, { brochureUrl: e.target.value })}
                        />
                      </label>
                      {fetching && (
                        <span className={styles.fetchNote}>
                          Fetching this yacht&rsquo;s details and preparing images…
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
