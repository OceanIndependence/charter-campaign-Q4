"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SelectionMeta, SelectionStatus, Tier, VersionInfo } from "@/lib/portal-types";
import { TIER_LABEL, clientPagePath, selectionTitle } from "@/lib/portal-types";
import { fmtDateLong } from "@/lib/format";
import styles from "./PortalForm.module.css";

type Scope = "mine" | "all";
type StatusFilter = "all" | SelectionStatus;
type TierFilter = "all" | "2" | "3";

/** Tier of a dashboard row; rows written before tiers existed are Tier 3. */
const tierOf = (m: { tier?: Tier }): Tier => (m.tier === 2 ? 2 : 3);

const STATUS_LABEL: Record<SelectionStatus, string> = {
  draft: "Draft",
  published: "Published",
  unpublished: "Unpublished",
};

/** In prose (version history), one–nine as words, 10 and above as numerals. */
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const yachtCountWord = (n: number) => (n < WORDS.length ? WORDS[n] : String(n));

/** Version count in words: "second version" up to ninth, then "10th version". */
const ORDINALS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"];
const ordinal = (n: number) => (n < ORDINALS.length ? ORDINALS[n] : `${n}th`);

export default function Dashboard() {
  const router = useRouter();
  const [items, setItems] = useState<SelectionMeta[] | null>(null);
  const [scope, setScope] = useState<Scope>("mine");
  const [canViewAll, setCanViewAll] = useState(false);
  const [me, setMe] = useState<string>("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [tier, setTier] = useState<TierFilter>("all");
  /** The tier chooser shown before a new selection is created. */
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionInfo[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async (s: Scope) => {
    try {
      const res = await fetch(`/api/selections?scope=${s}`);
      if (res.status === 401) {
        window.location.href = "/portal/sign-in";
        return;
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "The selection list is unavailable.");
      setItems(body.items ?? []);
      setCanViewAll(Boolean(body.canViewAll));
      setMe(body.me ?? "");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The selection list is unavailable.");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load(scope);
  }, [load, scope]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items ?? []).filter((m) => {
      if (status !== "all" && m.status !== status) return false;
      if (tier !== "all" && String(tierOf(m)) !== tier) return false;
      if (!needle) return true;
      return (
        m.clientNames.toLowerCase().includes(needle) ||
        m.headline.toLowerCase().includes(needle) ||
        (m.slug ?? "").toLowerCase().includes(needle)
      );
    });
  }, [items, q, status, tier]);

  /* --------------------------------------------------------- actions */

  const act = useCallback(
    async (id: string, run: () => Promise<Response>, after?: (body: Record<string, unknown>) => void) => {
      setBusy(id);
      try {
        const res = await run();
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? "That did not work — please try again.");
        after?.(body);
        await load(scope);
      } catch (err) {
        setError(err instanceof Error ? err.message : "That did not work — please try again.");
      } finally {
        setBusy(null);
      }
    },
    [load, scope]
  );

  /** Create a selection of the chosen tier, or duplicate one (which keeps its tier). */
  const createNew = useCallback(
    (opts: { tier?: Tier; duplicateOf?: string } = {}) =>
      act(
        opts.duplicateOf ?? "new",
        () =>
          fetch("/api/selections", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(opts.duplicateOf ? { duplicateOf: opts.duplicateOf } : { tier: opts.tier ?? 3 }),
          }),
        (body) => {
          if (typeof body.id === "string") router.push(`/portal/edit/${body.id}`);
        }
      ),
    [act, router]
  );

  const unpublish = useCallback(
    (m: SelectionMeta) => {
      if (!window.confirm(`Take ${selectionTitle(m)} offline? The client link will stop working; the record and its versions are kept.`)) return;
      act(m.id, () => fetch(`/api/selections/${m.id}/unpublish`, { method: "POST" }));
    },
    [act]
  );

  const remove = useCallback(
    (m: SelectionMeta) => {
      if (!window.confirm(`Delete the draft ${selectionTitle(m)}? This cannot be undone.`)) return;
      act(m.id, () => fetch(`/api/selections/${m.id}`, { method: "DELETE" }));
    },
    [act]
  );

  const copyLink = useCallback(async (m: SelectionMeta) => {
    if (!m.slug) return;
    const url = `${window.location.origin}${clientPagePath(tierOf(m), m.slug)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(m.id);
      window.setTimeout(() => setCopied(null), 2200);
    } catch {
      window.prompt("Copy the client link:", url);
    }
  }, []);

  const toggleVersions = useCallback(async (m: SelectionMeta) => {
    if (versionsFor === m.id) {
      setVersionsFor(null);
      setVersions(null);
      return;
    }
    setVersionsFor(m.id);
    setVersions(null);
    const res = await fetch(`/api/selections/${m.id}/versions`);
    const body = await res.json().catch(() => ({}));
    setVersions(res.ok ? body.versions ?? [] : []);
  }, [versionsFor]);

  const rollback = useCallback(
    (m: SelectionMeta, v: VersionInfo) => {
      if (!window.confirm(`Restore the client page to the ${ordinal(v.version)} version (${fmtDateLong(v.publishedAt)})? A new version is recorded; your draft is not changed.`)) return;
      act(
        m.id,
        () =>
          fetch(`/api/selections/${m.id}/versions`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ version: v.version }),
          }),
        () => {
          setVersionsFor(null);
          setVersions(null);
        }
      );
    },
    [act]
  );

  /* ---------------------------------------------------------- render */

  if (items === null) {
    return (
      <main className={styles.main}>
        <div className={styles.eyebrow}>CHARTER PORTAL</div>
        <p className={styles.intro}>Loading your selections…</p>
      </main>
    );
  }

  const nothingYet = items.length === 0 && scope === "mine";

  return (
    <main className={`${styles.main} ${styles.dashMain}`}>
      <div className={styles.dashHead}>
        <div>
          <div className={styles.eyebrow}>CHARTER PORTAL</div>
          <h1 className={styles.title}>Your Selections</h1>
          <p className={styles.intro}>
            Every client presentation you have prepared, newest first. Open one to keep working on it,
            or start a new selection for a new client.
          </p>
        </div>
        {!nothingYet && (
          <button type="button" className={styles.publishBtn} onClick={() => setChoosing((c) => !c)} disabled={busy === "new"}>
            NEW SELECTION
          </button>
        )}
      </div>

      {error && <p className={styles.dashError}>{error}</p>}

      {(choosing || nothingYet) && (
        <TierChooser busy={busy === "new"} onPick={(t) => createNew({ tier: t })} onCancel={nothingYet ? undefined : () => setChoosing(false)} />
      )}

      {nothingYet ? null : (
        <section className={`${styles.card} ${styles.cardFirst} ${styles.dashCard}`}>
          <div className={styles.toolbar}>
            <input
              type="search"
              className={`${styles.input} ${styles.search}`}
              placeholder="Search by client name"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search by client name"
            />
            <select
              className={styles.select}
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="unpublished">Unpublished</option>
            </select>
            <select
              className={styles.select}
              value={tier}
              onChange={(e) => setTier(e.target.value as TierFilter)}
              aria-label="Filter by tier"
            >
              <option value="all">All tiers</option>
              <option value="2">{TIER_LABEL[2]}</option>
              <option value="3">{TIER_LABEL[3]}</option>
            </select>
            {canViewAll && (
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={scope === "all"}
                  onChange={(e) => setScope(e.target.checked ? "all" : "mine")}
                />
                <span>ALL CONSULTANTS</span>
              </label>
            )}
            <span className={styles.counter}>
              {visible.length} OF {items.length}
            </span>
          </div>

          {visible.length === 0 ? (
            <p className={styles.dashEmptyFilter}>No selections match that search or filter.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>CLIENT</th>
                    <th>TIER</th>
                    {scope === "all" && <th>CONSULTANT</th>}
                    <th>YACHTS SELECTED</th>
                    <th>STATUS</th>
                    <th>CREATED</th>
                    <th>LAST EDITED</th>
                    <th>PUBLISHED</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((m) => {
                    const mine = !me || m.owner?.id === me;
                    const isBusy = busy === m.id;
                    const open = versionsFor === m.id;
                    return (
                      <RowGroup
                        key={m.id}
                        m={m}
                        mine={mine}
                        showOwner={scope === "all"}
                        isBusy={isBusy}
                        copied={copied === m.id}
                        versionsOpen={open}
                        versions={open ? versions : null}
                        onOpen={() => router.push(`/portal/edit/${m.id}`)}
                        onDuplicate={() => createNew({ duplicateOf: m.id })}
                        onCopy={() => copyLink(m)}
                        onUnpublish={() => unpublish(m)}
                        onDelete={() => remove(m)}
                        onToggleVersions={() => toggleVersions(m)}
                        onRollback={(v) => rollback(m, v)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

/* --------------------------------------------------------- tier chooser */

const TIER_CARDS: Array<{ tier: Tier; title: string; body: string; points: string[] }> = [
  {
    tier: 2,
    title: "Personalised Atlas",
    body: "The 2027 Atlas for one client: three destinations pinned bright on the globe, the yachts in a rail beneath it, and a detail drawer for each.",
    points: ["Three destinations", "Yachts in a rail", "Client explores the globe"],
  },
  {
    tier: 3,
    title: "Yacht Selection",
    body: "A shortlist of specific yachts for a client whose destination is already settled: the ring carousel, specification panels and your contact details.",
    points: ["Yachts only", "Destination already known", "Ring carousel and spec panels"],
  },
];

function TierChooser({ busy, onPick, onCancel }: { busy: boolean; onPick: (tier: Tier) => void; onCancel?: () => void }) {
  return (
    <section className={`${styles.card} ${styles.cardFirst} ${styles.chooser}`}>
      <div className={styles.sectionHeadRow}>
        <div className={styles.sectionHead}>NEW SELECTION — CHOOSE A TIER</div>
        {onCancel && (
          <button type="button" className={styles.actionBtn} onClick={onCancel}>
            CANCEL
          </button>
        )}
      </div>
      <p className={styles.sectionNote}>The tier decides what the client page is and cannot be changed once the selection exists.</p>
      <div className={styles.tierGrid}>
        {TIER_CARDS.map((c) => (
          <button type="button" key={c.tier} className={styles.tierCard} onClick={() => onPick(c.tier)} disabled={busy}>
            <span className={styles.tierEyebrow}>TIER {c.tier}</span>
            <span className={styles.tierTitle}>{c.title}</span>
            <span className={styles.tierBody}>{c.body}</span>
            <span className={styles.tierPoints}>
              {c.points.map((pt) => (
                <span key={pt}>{pt}</span>
              ))}
            </span>
            <span className={styles.tierCta}>{busy ? "CREATING…" : `CREATE A ${c.title.toUpperCase()}`}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ row */

interface RowProps {
  m: SelectionMeta;
  mine: boolean;
  showOwner: boolean;
  isBusy: boolean;
  copied: boolean;
  versionsOpen: boolean;
  versions: VersionInfo[] | null;
  onOpen: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
  onToggleVersions: () => void;
  onRollback: (v: VersionInfo) => void;
}

function RowGroup(p: RowProps) {
  const { m } = p;
  const title = selectionTitle(m);
  // Preview always renders the current draft (what the next publish will
  // show); the live client page is a separate action.
  const previewHref = `/portal/preview?id=${m.id}`;
  const tier = tierOf(m);
  const liveHref = m.slug ? clientPagePath(tier, m.slug) : "#";
  const cols = p.showOwner ? 8 : 7; // table columns, for the full-width rows
  return (
    <>
      <tr className={p.isBusy ? styles.rowBusy : undefined} data-id={m.id}>
        <td className={styles.tdWrap}>
          <span className={styles.rowClient}>{m.clientNames.trim() || title}</span>
        </td>
        <td>
          <span className={`${styles.tierTag} ${tier === 2 ? styles.tierTag2 : ""}`}>{TIER_LABEL[tier]}</span>
        </td>
        {p.showOwner && <td>{m.owner?.name || m.owner?.email || "—"}</td>}
        <td>{m.yachtCount}</td>
        <td>
          <span className={`${styles.status} ${styles[`status_${m.status}`]}`}>{STATUS_LABEL[m.status]}</span>
          {m.version > 1 && (
            <button
              type="button"
              className={styles.versionBtn}
              onClick={p.onToggleVersions}
              aria-expanded={p.versionsOpen}
              title="Version history"
            >
              {ordinal(m.version).toUpperCase()} VERSION {p.versionsOpen ? "−" : "+"}
            </button>
          )}
        </td>
        <td>{fmtDateLong(m.createdAt)}</td>
        <td>{fmtDateLong(m.updatedAt)}</td>
        <td>{m.publishedAt ? fmtDateLong(m.publishedAt) : "—"}</td>
      </tr>
      <tr className={styles.actionsRow} data-actions-for={m.id}>
        <td colSpan={cols}>
          {p.mine ? (
            <div className={styles.rowActions}>
              <button type="button" className={styles.actionBtn} onClick={p.onOpen} disabled={p.isBusy}>
                OPEN
              </button>
              <a className={styles.actionBtn} href={previewHref} target="_blank" rel="noopener noreferrer">
                PREVIEW
              </a>
              {m.status === "published" && m.slug && (
                <a className={styles.actionBtn} href={liveHref} target="_blank" rel="noopener noreferrer">
                  LIVE PAGE
                </a>
              )}
              {m.status === "published" && (
                <button type="button" className={styles.actionBtn} onClick={p.onCopy}>
                  {p.copied ? "COPIED" : "COPY LINK"}
                </button>
              )}
              <button type="button" className={styles.actionBtn} onClick={p.onDuplicate} disabled={p.isBusy}>
                DUPLICATE
              </button>
              {m.status === "published" && (
                <button type="button" className={styles.actionBtn} onClick={p.onUnpublish} disabled={p.isBusy}>
                  UNPUBLISH
                </button>
              )}
              {m.status === "draft" && (
                <button type="button" className={`${styles.actionBtn} ${styles.actionDanger}`} onClick={p.onDelete} disabled={p.isBusy}>
                  DELETE
                </button>
              )}
            </div>
          ) : (
            <div className={styles.rowActions}>
              {m.status === "published" && m.slug && (
                <a className={styles.actionBtn} href={liveHref} target="_blank" rel="noopener noreferrer">
                  VIEW PAGE
                </a>
              )}
            </div>
          )}
        </td>
      </tr>
      {p.versionsOpen && (
        <tr className={styles.versionsRow}>
          <td colSpan={cols}>
            {p.versions === null ? (
              <span className={styles.dashEmptyFilter}>Loading versions…</span>
            ) : p.versions.length === 0 ? (
              <span className={styles.dashEmptyFilter}>No versions recorded.</span>
            ) : (
              <ul className={styles.versionList}>
                {p.versions.map((v) => (
                  <li key={v.version} className={styles.versionItem}>
                    <span className={styles.versionLabel}>
                      {ordinal(v.version).toUpperCase()} VERSION
                      {v.isCurrent && <span className={styles.versionCurrent}> — LIVE</span>}
                      {v.rolledBackFrom && (
                        <span className={styles.versionNote}> — restored from the {ordinal(v.rolledBackFrom)} version</span>
                      )}
                    </span>
                    <span className={styles.versionMeta}>
                      {fmtDateLong(v.publishedAt)} · {yachtCountWord(v.yachtCount)} {v.yachtCount === 1 ? "yacht" : "yachts"}
                      {v.clientNames ? ` · ${v.clientNames}` : ""}
                    </span>
                    {p.mine && !v.isCurrent && (
                      <button type="button" className={styles.actionBtn} onClick={() => p.onRollback(v)} disabled={p.isBusy}>
                        ROLL BACK TO THIS
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
