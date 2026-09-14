import type { Consultant } from "./types";

/**
 * The generic charter desk contact block shown on a client page whose
 * consultant is inactive. ONE place to change it: edit the defaults here,
 * or set the CHARTER_DESK_* variables in Vercel without a deploy of code.
 *
 * The block renders whatever is present: a blank phone or WhatsApp hides
 * that row, a blank photo lets the text stand alone. The desk's email and
 * phone are deliberately blank here until marketing confirms them — set
 * CHARTER_DESK_EMAIL and CHARTER_DESK_PHONE (and optionally
 * CHARTER_DESK_WHATSAPP) so an inactive consultant's clients have a way in.
 */
const DEFAULTS: Consultant = {
  name: "Ocean Independence",
  title: "Charter Desk",
  phone: "",
  email: "",
  whatsapp: "",
  photoUrl: "",
};

export function charterDeskContact(): Consultant {
  const env = (key: string) => (process.env[key] ?? "").trim();
  return {
    name: env("CHARTER_DESK_NAME") || DEFAULTS.name,
    title: env("CHARTER_DESK_TITLE") || DEFAULTS.title,
    phone: env("CHARTER_DESK_PHONE") || DEFAULTS.phone,
    email: env("CHARTER_DESK_EMAIL") || DEFAULTS.email,
    whatsapp: env("CHARTER_DESK_WHATSAPP") || DEFAULTS.whatsapp,
    photoUrl: "",
  };
}
