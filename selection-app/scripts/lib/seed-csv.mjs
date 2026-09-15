/**
 * Parser for data/consultants-seed.csv — used only at build time
 * (scripts/build-consultants-seed.mjs) and by the local test script. The
 * deployed app never reads the CSV; it imports the generated module at
 * src/data/consultants-seed.ts.
 *
 * Columns: Name,Job title,Mobile phone,Email,WhatsApp,Photo URL (Sirv)
 * The file carries a UTF-8 BOM, stripped here.
 */

export const COLUMNS = {
  name: "Name",
  jobTitle: "Job title",
  phone: "Mobile phone",
  email: "Email",
  whatsapp: "WhatsApp",
  photoUrl: "Photo URL (Sirv)",
};

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/**
 * Seed rows as objects, after stripping the BOM. Emails are lowercased
 * here so the generated module already carries the canonical address.
 * Throws when a required column is missing.
 */
export function readSeed(text) {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const [header, ...rows] = parseCsv(clean);
  const heads = (header ?? []).map((h) => h.trim());
  for (const wanted of Object.values(COLUMNS)) {
    if (!heads.includes(wanted)) throw new Error(`Seed CSV is missing the "${wanted}" column (found: ${heads.join(", ")}).`);
  }
  const at = (row, key) => (row[heads.indexOf(COLUMNS[key])] ?? "").trim();
  return rows.map((row, i) => ({
    line: i + 2,
    name: at(row, "name"),
    jobTitle: at(row, "jobTitle"),
    phone: at(row, "phone"),
    email: at(row, "email").toLowerCase(),
    whatsapp: at(row, "whatsapp"),
    photoUrl: at(row, "photoUrl"),
  }));
}
