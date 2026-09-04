import type { Yacht } from "./types";

/** House style: currency code, space, comma-grouped — "EUR 245,000" */
export function fmtEUR(amount: number): string {
  return "EUR " + Math.round(amount).toLocaleString("en-GB");
}

export function apaEUR(yacht: Yacht): number {
  return Math.round((yacht.weeklyRateEUR * yacht.apaPct) / 100);
}

export function totalEUR(yacht: Yacht): number {
  return yacht.weeklyRateEUR + apaEUR(yacht);
}

/** "47.00 metres" for the spec panel */
export function fmtLength(yacht: Yacht): string {
  return yacht.lengthM.toFixed(2) + " metres";
}

/** "47M" for the ring-card stat */
export function fmtLengthShort(yacht: Yacht): string {
  return Math.round(yacht.lengthM) + "M";
}

/** "6 (5 double, 1 twin)" */
export function fmtStaterooms(yacht: Yacht): string {
  return `${yacht.staterooms.count} (${yacht.staterooms.breakdown})`;
}

const WORDS = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"];

/** House style: one–nine as words, 10+ as numerals (all-caps context) */
export function countWord(n: number): string {
  return n < 10 ? WORDS[n] : String(n);
}
