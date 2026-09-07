import type { Yacht } from "./types";

/**
 * House style for every currency: ISO code, space, comma-grouped amount, no
 * symbol — "EUR 250,000", "USD 275,000", "GBP 210,000". Never €, $ or £.
 */
export function fmtMoney(currency: string | undefined, amount: number): string {
  return `${(currency || "EUR").toUpperCase()} ${Math.round(amount).toLocaleString("en-GB")}`;
}

/** Weekly rate, "From EUR 250,000" when the season rate is a range. */
export function fmtWeeklyRate(yacht: Yacht): string | undefined {
  if (yacht.weeklyRate == null) return undefined;
  return (yacht.weeklyRateIsFrom ? "From " : "") + fmtMoney(yacht.currency, yacht.weeklyRate);
}

/** Ring-card price, upper-case "FROM EUR 250,000". */
/**
 * Ring-card rate line: "[FROM] EUR 245,000 + APA EUR 85,750 + VAT", with the
 * VAT amount appended when it is known and just "VAT" when it is not.
 */
export function fmtCardRate(yacht: Yacht): string | undefined {
  if (yacht.weeklyRate == null) return undefined;
  const cur = yacht.currency;
  const parts = [(yacht.weeklyRateIsFrom ? "FROM " : "") + fmtMoney(cur, yacht.weeklyRate)];
  if (yacht.apaAmount != null) parts.push(`APA ${fmtMoney(cur, yacht.apaAmount)}`);
  parts.push(yacht.vatAmount != null ? `VAT ${fmtMoney(cur, yacht.vatAmount)}` : "VAT");
  return parts.join(" + ");
}

/** "47.00 metres" for the spec panel */
export function fmtLength(yacht: Yacht): string | undefined {
  if (yacht.lengthM == null) return undefined;
  return yacht.lengthM.toFixed(2) + " metres";
}

/** "47M" for the ring-card stat */
export function fmtLengthShort(yacht: Yacht): string | undefined {
  if (yacht.lengthM == null) return undefined;
  return Math.round(yacht.lengthM) + "M";
}

/** "6 (5 double, 1 twin)", or just "6" when no breakdown is known */
export function fmtStaterooms(yacht: Yacht): string | undefined {
  if (!yacht.staterooms) return undefined;
  const { count, breakdown } = yacht.staterooms;
  return breakdown ? `${count} (${breakdown})` : String(count);
}

const WORDS = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"];

/** House style: one–nine as words, 10+ as numerals (all-caps context) */
export function countWord(n: number): string {
  return n < 10 ? WORDS[n] : String(n);
}

/** House-style long date: "07 September 2026" (no comma). */
export function fmtDateLong(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  return `${day} ${month} ${d.getFullYear()}`;
}
