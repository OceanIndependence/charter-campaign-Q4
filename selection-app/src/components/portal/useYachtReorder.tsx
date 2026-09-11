"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import styles from "./PortalForm.module.css";

/**
 * Pointer-driven reordering of the yacht cards, shared by both portal forms.
 *
 * Press the handle and the card's header lifts off as a ghost that follows
 * the pointer; the card itself stays in the list as a faded, dashed
 * placeholder. As the pointer crosses the middle of another card the list
 * reorders live (the other cards slide out of the way), so the placeholder
 * always shows where the yacht will land. Release to commit; Escape or a
 * cancelled pointer puts everything back. Open card bodies are hidden for
 * the duration so the list stays short enough to drag across.
 *
 * The forms render their cards from `order`, mark each card with
 * data-yacht-uid and spread `handleProps(uid)` on to the handle.
 */

interface Ghost {
  uid: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Options {
  /** Card uids in the draft's order. */
  uids: string[];
  /** Commit the new order once the pointer is released. */
  onCommit: (uids: string[]) => void;
}

const FLIP_MS = 170;

export function useYachtReorder({ uids, onCommit }: Options) {
  const [dragUid, setDragUid] = useState<string | null>(null);
  /** Live order during a drag; null outside one. */
  const [liveOrder, setLiveOrder] = useState<string[] | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Grab offset inside the header, so the ghost does not jump on pick-up. */
  const grab = useRef({ dx: 0, dy: 0 });
  /** Card tops measured just before a reorder, for the FLIP slide. */
  const prevTops = useRef<Map<string, number> | null>(null);
  const liveRef = useRef<string[] | null>(null);

  const order = liveOrder ?? uids;

  const cards = useCallback((): HTMLElement[] => {
    const root = listRef.current;
    return root ? Array.from(root.querySelectorAll<HTMLElement>("[data-yacht-uid]")) : [];
  }, []);

  const measureTops = useCallback(() => {
    const tops = new Map<string, number>();
    for (const el of cards()) tops.set(el.dataset.yachtUid ?? "", el.getBoundingClientRect().top);
    prevTops.current = tops;
  }, [cards]);

  // FLIP: after the list re-renders in a new order, start every moved card
  // at its previous position and let it slide to the new one.
  useLayoutEffect(() => {
    const prev = prevTops.current;
    prevTops.current = null;
    if (!prev) return;
    const moved: HTMLElement[] = [];
    for (const el of cards()) {
      const before = prev.get(el.dataset.yachtUid ?? "");
      if (before == null) continue;
      const delta = before - el.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${delta}px)`;
      moved.push(el);
    }
    if (!moved.length) return;
    // Force the start position to paint before the transition begins.
    void moved[0].getBoundingClientRect();
    const frame = requestAnimationFrame(() => {
      for (const el of moved) {
        el.style.transition = `transform ${FLIP_MS}ms ease`;
        el.style.transform = "";
      }
    });
    const timer = window.setTimeout(() => {
      for (const el of moved) {
        el.style.transition = "";
        el.style.transform = "";
      }
    }, FLIP_MS + 40);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [liveOrder, cards]);

  const reset = useCallback(() => {
    liveRef.current = null;
    setDragUid(null);
    setLiveOrder(null);
    setGhost(null);
  }, []);
  /** Latest endDrag for the Escape listener (defined below). */
  const endDragRef = useRef<(commit: boolean) => void>(() => {});

  // Escape cancels; the body cursor says "grabbing" for the whole drag.
  useEffect(() => {
    if (!dragUid) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endDragRef.current(false);
    };
    window.addEventListener("keydown", onKey);
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.cursor = prevCursor;
    };
  }, [dragUid]);

  const cardAt = useCallback((x: number, y: number): HTMLElement | null => {
    const hit = document.elementFromPoint(x, y) as HTMLElement | null;
    const card = hit?.closest<HTMLElement>("[data-yacht-uid]") ?? null;
    return card && listRef.current?.contains(card) ? card : null;
  }, []);

  /**
   * The drag in progress. Listeners live on the window rather than as
   * pointer capture on the handle: React moves the cards in the DOM as the
   * order changes, and a moved node loses its capture, which would leave
   * the drag stuck half way.
   */
  const active = useRef<{ uid: string; pointerId: number } | null>(null);
  const uidsRef = useRef(uids);
  uidsRef.current = uids;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const listeners = useRef<(() => void) | null>(null);

  const endDrag = useCallback(
    (commit: boolean) => {
      listeners.current?.();
      listeners.current = null;
      const drag = active.current;
      active.current = null;
      const next = liveRef.current;
      if (commit && drag && next && next.some((u, i) => u !== uidsRef.current[i])) commitRef.current(next);
      reset();
    },
    [reset]
  );

  endDragRef.current = endDrag;

  useEffect(() => () => listeners.current?.(), []);

  const onWindowMove = useCallback(
    (e: PointerEvent) => {
      const drag = active.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      setGhost((g) => (g ? { ...g, x: e.clientX - grab.current.dx, y: e.clientY - grab.current.dy } : g));
      const current = liveRef.current;
      if (!current) return;
      const over = cardAt(e.clientX, e.clientY);
      const overUid = over?.dataset.yachtUid;
      if (!over || !overUid || overUid === drag.uid) return;
      const from = current.indexOf(drag.uid);
      const to = current.indexOf(overUid);
      if (from === -1 || to === -1) return;
      // Swap only once the pointer has crossed the other card's middle in
      // the direction of travel — no flicker while hovering its edge.
      const rect = over.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const crossed = to > from ? e.clientY > mid : e.clientY < mid;
      if (!crossed) return;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, drag.uid);
      measureTops();
      liveRef.current = next;
      setLiveOrder(next);
    },
    [cardAt, measureTops]
  );

  const handleProps = useCallback(
    (uid: string) => ({
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        if (active.current) return;
        e.preventDefault();
        e.stopPropagation();
        const card = e.currentTarget.closest<HTMLElement>("[data-yacht-uid]");
        const header = e.currentTarget.closest<HTMLElement>("[data-yacht-header]") ?? card;
        if (!card || !header) return;
        const rect = header.getBoundingClientRect();
        grab.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
        active.current = { uid, pointerId: e.pointerId };
        liveRef.current = uidsRef.current;
        setDragUid(uid);
        setLiveOrder(uidsRef.current);
        setGhost({ uid, x: rect.left, y: rect.top, width: rect.width, height: rect.height });

        const onUp = (ev: PointerEvent) => {
          if (ev.pointerId !== active.current?.pointerId) return;
          // The release lands on whichever header is under the pointer; the
          // click that follows must not toggle it open.
          const swallow = (c: MouseEvent) => {
            c.stopPropagation();
            c.preventDefault();
          };
          window.addEventListener("click", swallow, { capture: true, once: true });
          window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 250);
          endDrag(true);
        };
        const onCancel = (ev: PointerEvent) => {
          if (ev.pointerId !== active.current?.pointerId) return;
          endDrag(false);
        };
        window.addEventListener("pointermove", onWindowMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onCancel);
        listeners.current = () => {
          window.removeEventListener("pointermove", onWindowMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onCancel);
        };
      },
    }),
    [endDrag, onWindowMove]
  );

  return {
    /** Card uids in the order to render — the live order mid-drag. */
    order,
    /** The card being dragged, or null. */
    dragUid,
    /** The floating ghost's geometry, or null. */
    ghost,
    /** Put on the list container. */
    listRef,
    /** Class names for the list container (adds the reordering state). */
    listClassName: `${styles.yachtList} ${dragUid ? styles.reordering : ""}`,
    /** Spread on to a card's drag handle. */
    handleProps,
  };
}

/** Six-dot grip; the handle every card carries on its left. */
export function DragHandle({
  label,
  ...props
}: { label: string } & ReturnType<ReturnType<typeof useYachtReorder>["handleProps"]>) {
  return (
    <span className={styles.dragHandle} data-drag-handle role="button" aria-label={label} title={label} {...props}>
      <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true" focusable="false">
        <circle cx="2.5" cy="2.5" r="1.6" />
        <circle cx="7.5" cy="2.5" r="1.6" />
        <circle cx="2.5" cy="8" r="1.6" />
        <circle cx="7.5" cy="8" r="1.6" />
        <circle cx="2.5" cy="13.5" r="1.6" />
        <circle cx="7.5" cy="13.5" r="1.6" />
      </svg>
    </span>
  );
}

/** The header copy that follows the pointer while a card is dragged. */
export function DragGhost({ ghost, index, name }: { ghost: Ghost | null; index: number; name: string }) {
  if (!ghost) return null;
  const style: CSSProperties = {
    left: ghost.x,
    top: ghost.y,
    width: ghost.width,
    minHeight: ghost.height,
  };
  return (
    <div className={styles.dragGhost} style={style} aria-hidden="true">
      <span className={styles.dragHandle}>
        <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true" focusable="false">
          <circle cx="2.5" cy="2.5" r="1.6" />
          <circle cx="7.5" cy="2.5" r="1.6" />
          <circle cx="2.5" cy="8" r="1.6" />
          <circle cx="7.5" cy="8" r="1.6" />
          <circle cx="2.5" cy="13.5" r="1.6" />
          <circle cx="7.5" cy="13.5" r="1.6" />
        </svg>
      </span>
      <span className={styles.yachtNum}>{String(index + 1).padStart(2, "0")}</span>
      <span className={styles.yachtTitle}>{name.trim() ? name.trim().toUpperCase() : "UNTITLED YACHT"}</span>
    </div>
  );
}
