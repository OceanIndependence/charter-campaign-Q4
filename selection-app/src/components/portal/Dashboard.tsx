"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SelectionMeta, SelectionStatus, Tier, VersionInfo } from "@/lib/portal-types";
import { TIER_LABEL, clientPagePath, selectionTitle } from "@/lib/portal-types";
import { fmtDateShort } from "@/lib/format";
import ConfirmDialog from "./ConfirmDialog";
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
  /** Destructive action awaiting confirmation in the portal's own dialog. */
  const [pending, setPending] = useState<
    { title: string; body: string; confirmLabel: string; run: () => void } | null
  >(null);
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionInfo[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  /** Row whose MORE menu is open. */
  const [menuFor, setMenuFor] = useState<string | null>(null);

  // Any click outside a row menu closes it.
  useEffect(() => {
    if (!menuFor) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-row-menu]")) setMenuFor(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuFor]);

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
      setPending({
        title: "Take this page offline?",
        body: `The client link for ${selectionTitle(m)} will stop working. The record and its versions are kept, so it can be published again.`,
        confirmLabel: "TAKE OFFLINE",
        run: () => act(m.id, () => fetch(`/api/selections/${m.id}/unpublish`, { method: "POST" })),
      });
    },
    [act]
  );

  const remove = useCallback(
    (m: SelectionMeta) => {
      setPending({
        title: "Delete this draft?",
        body: `${selectionTitle(m)} will be deleted. This cannot be undone.`,
        confirmLabel: "DELETE DRAFT",
        run: () => act(m.id, () => fetch(`/api/selections/${m.id}`, { method: "DELETE" })),
      });
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
      setPending({
        title: `Roll back to version ${v.version}?`,
        body: `The client page returns to the version published on ${fmtDateShort(v.publishedAt)}. A new version is recorded; your draft is not changed.`,
        confirmLabel: "ROLL BACK",
        run: () =>
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
          ),
      });
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
              aria-label="Filter by page type"
            >
              <option value="all">All page types</option>
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
                    <th>STATUS</th>
                    <th>EDITED</th>
                    <th>PUBLISHED</th>
                    <th aria-label="Actions" />
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
                        menuOpen={menuFor === m.id}
                        onToggleMenu={() => setMenuFor((cur) => (cur === m.id ? null : m.id))}
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
      {pending && (
        <ConfirmDialog
          title={pending.title}
          body={pending.body}
          confirmLabel={pending.confirmLabel}
          onConfirm={() => {
            const run = pending.run;
            setPending(null);
            run();
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </main>
  );
}

/* ------------------------------------------------------- format chooser */

const TIER_CARDS: Array<{ tier: Tier; title: string; body: string; cta: string }> = [
  {
    tier: 2,
    title: "Personalised destinations and shortlist",
    body: "Three destinations for one client, pinned bright on the globe, with the yachts in a rail beneath it and a detail drawer for each.",
    cta: "CREATE A PERSONALISED SELECTION",
  },
  {
    tier: 3,
    title: "Yacht Selection",
    body: "A shortlist of specific yachts for a client whose destination is already settled: the ring carousel, specification panels and your contact details.",
    cta: "CREATE A YACHT SELECTION",
  },
];

function TierChooser({ busy, onPick, onCancel }: { busy: boolean; onPick: (tier: Tier) => void; onCancel?: () => void }) {
  return (
    <section className={`${styles.card} ${styles.cardFirst} ${styles.chooser}`}>
      <div className={styles.sectionHeadRow}>
        <div className={styles.sectionHead}>NEW SELECTION — CHOOSE A FORMAT</div>
        {onCancel && (
          <button type="button" className={styles.actionBtn} onClick={onCancel}>
            CANCEL
          </button>
        )}
      </div>
      <p className={styles.sectionNote}>This decides what the client page is and cannot be changed once the selection exists.</p>
      <div className={styles.tierGrid}>
        {TIER_CARDS.map((c) => (
          <button type="button" key={c.tier} className={styles.tierCard} onClick={() => onPick(c.tier)} disabled={busy}>
            <span className={styles.tierTitle}>{c.title}</span>
            <span className={styles.tierBody}>{c.body}</span>
            <span className={styles.tierCta}>{busy ? "CREATING…" : c.cta}</span>
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
  menuOpen: boolean;
  onToggleMenu: () => void;
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

const COLS = 5;

/**
 * One selection: the client name with a quiet subline (tier, yachts,
 * consultant), the status with its version history, two short dates, and a
 * single OPEN action with everything else behind MORE.
 */
function RowGroup(p: RowProps) {
  const { m } = p;
  const title = selectionTitle(m);
  // Preview always renders the current draft (what the next publish will
  // show); the live client page is a separate action.
  const previewHref = `/portal/preview?id=${m.id}`;
  const tier = tierOf(m);
  const liveHref = m.slug ? clientPagePath(tier, m.slug) : "#";
  const published = m.status === "published";
  const subline = [
    TIER_LABEL[tier],
    `${m.yachtCount} ${m.yachtCount === 1 ? "yacht" : "yachts"}`,
    p.showOwner ? m.owner?.name || m.owner?.email || null : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const menuItem = (label: string, onClick: () => void, danger = false) => (
    <button
      type="button"
      className={`${styles.menuItem} ${danger ? styles.menuItemDanger : ""}`}
      onClick={() => {
        p.onToggleMenu();
        onClick();
      }}
      disabled={p.isBusy}
    >
      {label}
    </button>
  );
  return (
    <>
      <tr className={`${styles.row} ${p.isBusy ? styles.rowBusy : ""}`} data-id={m.id}>
        <td className={styles.tdWrap}>
          <span className={styles.rowClient}>{m.clientNames.trim() || title}</span>
          <span className={styles.rowSub}>{subline}</span>
        </td>
        <td>
          <span className={`${styles.status} ${styles[`status_${m.status}`]}`}>{STATUS_LABEL[m.status]}</span>
          {m.version > 1 && (
            <button type="button" className={styles.versionBtn} onClick={p.onToggleVersions} aria-expanded={p.versionsOpen} title="Version history">
              {m.version} versions {p.versionsOpen ? "▴" : "▾"}
            </button>
          )}
        </td>
        <td title={`Created ${fmtDateShort(m.createdAt)}`}>{fmtDateShort(m.updatedAt)}</td>
        <td>{m.publishedAt ? fmtDateShort(m.publishedAt) : "—"}</td>
        <td className={styles.rowActionsCell}>
          {p.mine ? (
            <>
              <button type="button" className={styles.openBtn} onClick={p.onOpen} disabled={p.isBusy}>
                OPEN
              </button>
              <span className={styles.menuWrap} data-row-menu>
                <button type="button" className={styles.menuBtn} onClick={p.onToggleMenu} aria-expanded={p.menuOpen} aria-haspopup="menu" aria-label="More actions">
                  MORE {p.menuOpen ? "▴" : "▾"}
                </button>
                {p.menuOpen && (
                  <div className={styles.menu} role="menu">
                    <a className={styles.menuItem} href={previewHref} target="_blank" rel="noopener noreferrer" onClick={p.onToggleMenu}>
                      Preview
                    </a>
                    {published && m.slug && (
                      <a className={styles.menuItem} href={liveHref} target="_blank" rel="noopener noreferrer" onClick={p.onToggleMenu}>
                        Live page
                      </a>
                    )}
                    {published && menuItem(p.copied ? "Copied" : "Copy link", p.onCopy)}
                    {menuItem("Duplicate", p.onDuplicate)}
                    {published && menuItem("Unpublish", p.onUnpublish, true)}
                    {m.status === "draft" && menuItem("Delete draft", p.onDelete, true)}
                  </div>
                )}
              </span>
            </>
          ) : (
            published &&
            m.slug && (
              <a className={styles.openBtn} href={liveHref} target="_blank" rel="noopener noreferrer">
                VIEW PAGE
              </a>
            )
          )}
        </td>
      </tr>
      {p.versionsOpen && (
        <tr className={styles.versionsRow}>
          <td colSpan={COLS}>
            {p.versions === null ? (
              <span className={styles.dashEmptyFilter}>Loading versions…</span>
            ) : p.versions.length === 0 ? (
              <span className={styles.dashEmptyFilter}>No versions recorded.</span>
            ) : (
              <ul className={styles.versionList}>
                {p.versions.map((v) => (
                  <li key={v.version} className={styles.versionItem}>
                    <span className={styles.versionLabel}>
                      VERSION {v.version}
                      {v.isCurrent && <span className={styles.versionCurrent}> — LIVE</span>}
                      {v.rolledBackFrom && <span className={styles.versionNote}> — restored from version {v.rolledBackFrom}</span>}
                    </span>
                    <span className={styles.versionMeta}>
                      {fmtDateShort(v.publishedAt)} · {v.yachtCount} {v.yachtCount === 1 ? "yacht" : "yachts"}
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
