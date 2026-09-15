/** Field validation shared by the consultant admin routes — SERVER-ONLY. */

import { normaliseEmail } from "./consultants.mjs";

const MAX_TEXT = 120;
const invalid = (message: string) => Object.assign(new Error(message), { code: "INVALID" });

/** A trimmed text field, capped; required fields may not be blank. */
export function adminText(v: unknown, label: string, required = false): string {
  const s = String(v ?? "").trim();
  if (required && !s) throw invalid(`${label} is required.`);
  if (s.length > MAX_TEXT) throw invalid(`${label} is too long.`);
  return s;
}

/** Lowercased email; blank allowed only when not required. */
export function adminEmail(v: unknown, required: boolean): string {
  const email = normaliseEmail(v) as string;
  if (!email && !required) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid("Enter a valid email address.");
  return email;
}
