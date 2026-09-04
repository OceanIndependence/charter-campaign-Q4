import type { Yacht } from "./types";

/** House style: currency code, space, comma-grouped — "EUR 245,000" */
export function fmtEUR(amount: number): string {
  return "EUR " + Math.round(amount).toLocaleString("en-GB");
}

export function apaEUR(yacht: Yacht): number | undefined {
  if (yacht.weeklyRateEUR == null) return undefined;
  return Math.round((yacht.weeklyRateEUR * yacht.apaPct) / 100);
}

export function totalEUR(yacht: Yacht): number | undefined {
  const apa = apaEUR(yacht);
  if (yacht.weeklyRateEUR == null || apa == null) return undefined;
  return yacht.weeklyRateEUR + apa;
}

/** "EUR 245,000", or "FROM EUR 245,000" when the season rate is a range */
export function fmtWeeklyRate(yacht: Yacht): string | undefined {
  if (yacht.weeklyRateEUR == null) return undefined;
  return (yacht.weeklyRateIsFrom ? "FROM " : "") + fmtEUR(yacht.weeklyRateEUR);
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
