"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FleetEntry } from "@/lib/portal-types";
import styles from "./PortalForm.module.css";

interface FleetSelectProps {
  fleet: FleetEntry[];
  /** Current yacht name shown in the input */
  value: string;
  yfId: number | null;
  onPick: (entry: FleetEntry) => void;
  /** Free-typed name (no fleet pick) — keeps the field editable per spec */
  onNameChange: (name: string) => void;
  disabled?: boolean;
}

const MAX_OPTIONS = 60;

/**
 * Searchable dropdown over the full Yachtfolio charter fleet. Options render
 * as "NAME — YF-1234"; typing filters, arrows navigate, Enter picks.
 */
export default function FleetSelect({ fleet, value, yfId, onPick, onNameChange, disabled }: FleetSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const shown = query !== null ? query : value;

  const options = useMemo(() => {
    const q = (query ?? "").trim().toLowerCase();
    const matches = q
      ? fleet.filter((f) => f.name.toLowerCase().includes(q) || String(f.id).includes(q))
      : fleet;
    return matches.slice(0, MAX_OPTIONS);
  }, [fleet, query]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (entry: FleetEntry) => {
    setOpen(false);
    setQuery(null);
    onPick(entry);
  };

  return (
    <div className={styles.combo} ref={rootRef}>
      <input
        type="text"
        className={styles.input}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        placeholder={fleet.length ? "Type to search the fleet…" : "Loading the fleet list…"}
        value={shown}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
          onNameChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            setOpen(true);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && options[active]) {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery(null);
          }
        }}
      />
      {open && (
        <ul className={styles.comboList} role="listbox" ref={listRef}>
          {options.length === 0 && <li className={styles.comboEmpty}>No yachts match that search.</li>}
          {options.map((f, i) => (
            <li
              key={f.id}
              role="option"
              aria-selected={i === active || f.id === yfId}
              className={styles.comboOption}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(f);
              }}
            >
              {f.name.toUpperCase()} <span className={styles.comboOptionId}>— YF-{f.id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
