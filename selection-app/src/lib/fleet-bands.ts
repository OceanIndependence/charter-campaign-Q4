/**
 * Public fleet page rules: length bands and the "from" rate line. Pure
 * functions shared by the server render and the client filter.
 */

import { fmtMoney } from "./format";

export interface LengthBand {
  key: string;
  label: string;
  /** inclusive lower bound in metres; null for the "no length" group */
  min: number | null;
  /** exclusive upper bound; null for open-ended */
  max: number | null;
}

/** In display order; lower bounds are inclusive. */
export const LENGTH_BANDS: LengthBand[] = [
  { key: "under-30", label: "Under 30m", min: 0, max: 30 },
  { key: "30-40", label: "30 – 40m", min: 30, max: 40 },
  { key: "40-50", label: "40 – 50m", min: 40, max: 50 },
  { key: "50-plus", label: "50m and above", min: 50, max: null },
];

/** Yachts with no length value are listed after the bands. */
export const FURTHER_BAND: LengthBand = { key: "further", label: "Further yachts", min: null, max: null };

export function bandFor(lengthM: number | null | undefined): LengthBand {
  if (lengthM == null || !Number.isFinite(lengthM) || lengthM <= 0) return FURTHER_BAND;
  for (const b of LENGTH_BANDS) {
    if (lengthM >= (b.min ?? 0) && (b.max == null || lengthM < b.max)) return b;
  }
  return FURTHER_BAND;
}

/** Group by band in display order, each band sorted by length descending. */
export function groupByBand<T extends { lengthM?: number | null }>(yachts: T[]): Array<{ band: LengthBand; yachts: T[] }> {
  const groups = new Map<string, T[]>();
  for (const y of yachts) {
    const b = bandFor(y.lengthM);
    if (!groups.has(b.key)) groups.set(b.key, []);
    groups.get(b.key)!.push(y);
  }
  const byLength = (a: T, b: T) => (b.lengthM ?? 0) - (a.lengthM ?? 0);
  return [...LENGTH_BANDS, FURTHER_BAND]
    .filter((b) => groups.has(b.key))
    .map((band) => ({ band, yachts: (groups.get(band.key) ?? []).sort(byLength) }));
}

/**
 * "From EUR 250,000 per week plus 35% APA plus VAT" — the weekly rate
 * minimum in the yacht's own currency (ISO code, comma-grouped, no symbol),
 * never converted, followed by the APA percentage and a VAT note. No rate:
 * "Rate on application" with no APA or VAT.
 */
export function fmtFromRate(currency: string | null | undefined, rateMin: number | null | undefined, apaPct: number): string {
  if (rateMin == null || !Number.isFinite(rateMin) || rateMin <= 0) return "Rate on application";
  return `From ${fmtMoney(currency ?? "EUR", rateMin)} per week plus ${apaPct}% APA plus VAT`;
}

/** Short card form: "FROM EUR 250,000 + 35% APA + VAT" */
export function fmtFromRateShort(currency: string | null | undefined, rateMin: number | null | undefined, apaPct: number): string {
  if (rateMin == null || !Number.isFinite(rateMin) || rateMin <= 0) return "RATE ON APPLICATION";
  return `FROM ${fmtMoney(currency ?? "EUR", rateMin)} + ${apaPct}% APA + VAT`;
}
