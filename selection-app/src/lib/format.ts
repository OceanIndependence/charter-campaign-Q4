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
 * Ring-card rate line: "EUR 245,000 + 35% APA + 20% VAT" — exactly the rate
 * the consultant chose in the form (no "from"), with APA and VAT as
 * percentages only (just "VAT" when the rate is not known). The figures
 * belong to the spec panel's cost rows.
 */
export function fmtCardRate(yacht: Yacht): string | undefined {
  if (yacht.weeklyRate == null) return undefined;
  const cur = yacht.currency;
  const parts = [fmtMoney(cur, yacht.weeklyRate)];
  if (yacht.apaPct != null) parts.push(`${yacht.apaPct}% APA`);
  parts.push(yacht.vatPct != null ? `${yacht.vatPct}% VAT` : "VAT");
  return parts.join(" + ");
}

/**
 * Ring/rail-card total: "TOTAL EUR 389,650", the sum of the rate line above
 * it — charter fee, APA, VAT and any delivery fee — as frozen at publish.
 * Like the rate line, it is the figure itself: no "from", whatever the season
 * rate behind it. The spec panel carries the "from" wording.
 */
export function fmtCardTotal(yacht: Yacht): string | undefined {
  if (yacht.totalAmount == null) return undefined;
  return `TOTAL ${fmtMoney(yacht.currency, yacht.totalAmount)}`;
}

/**
 * Metres to feet on the international foot (1 ft = 0.3048 m exactly).
 *
 * Feet are derived from the metre figure shown beside them rather than
 * carried as their own field, so the two always reconcile — a consultant who
 * edits LENGTH (M) in the form cannot leave a stale feet value behind it.
 * Whatever length fields Yachtfolio carries are reported by `lengthFields` on
 * GET /api/fleet/:yfId?debug=1.
 */
export function metresToFeet(metres: number): number {
  return metres / 0.3048;
}

/** "47.00m / 154.20'" for the spec panel and the Compare overlay */
export function fmtLength(yacht: Yacht): string | undefined {
  if (yacht.lengthM == null) return undefined;
  return `${yacht.lengthM.toFixed(2)}m / ${metresToFeet(yacht.lengthM).toFixed(2)}'`;
}

/** "47M / 154'" for the ring-card stat and the Tier 2 rail card — both rounded */
export function fmtLengthShort(yacht: Yacht): string | undefined {
  if (yacht.lengthM == null) return undefined;
  return `${Math.round(yacht.lengthM)}M / ${Math.round(metresToFeet(yacht.lengthM))}'`;
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

/** Short date for dense tables: "07 Sep 2026" (no comma). */
export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  // Fixed three-letter months: en-GB locales render September as "Sept".
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
  return `${day} ${month} ${d.getFullYear()}`;
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

/**
 * WhatsApp link from whatever the consultant typed: a full URL is kept, a
 * phone number becomes https://wa.me/<digits> (the wa.me pattern shared by
 * every client page).
 */
/**
 * wa.me link for a stored WhatsApp number: every space, plus sign and piece
 * of punctuation stripped, an international "00" prefix dropped, and a
 * bracketed trunk zero — "+44 (0)7000 …" — removed rather than kept as a
 * digit, since wa.me expects the number exactly as dialled from abroad.
 * A full URL is passed through.
 */
export function whatsappHref(value: string | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const digits = v
    .replace(/\(\s*0\s*\)/g, "")
    .replace(/[^\d]/g, "")
    .replace(/^00/, "");
  return digits ? `https://wa.me/${digits}` : "";
}
