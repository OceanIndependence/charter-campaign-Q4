/**
 * Normalisation of Yachtfolio payloads into the Tier 3 data model — pure
 * functions, no I/O. Shared by the build script and the fleet API routes.
 *
 * House style is applied here: cabin types lowercase, "staterooms" not
 * "cabins", EUR amounts as plain numbers formatted by the UI.
 */

/** Charter season the campaign quotes rates for (default auto-fill). */
export const TARGET_SEASON = { name: "summer", year: "2027", label: "summer 2027" };

/** Seasons the consultant can pick a rate from, this campaign. */
export const RATE_SEASONS = [
  { key: "summer", name: "summer", year: "2027", label: "Summer 2027" },
  { key: "winter", name: "winter", year: "2027", label: "Winter 2027" },
];

export function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function stripHtml(html) {
  if (!html) return undefined;
  const text = String(html)
    .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&(quot|#34);/gi, '"')
    .replace(/&(apos|#39|rsquo);/gi, "’")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return text || undefined;
}

/** First numeric value from strings like "30.48 metres (100')" or "47.500000". */
export function parseMetres(value) {
  if (value == null) return undefined;
  const m = String(value).match(/\d+(?:\.\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function pickSeason(seasons, { name, year } = TARGET_SEASON) {
  return (
    (seasons ?? []).find(
      (s) =>
        String(s.name ?? "").toLowerCase().includes(name) &&
        String(s.year ?? "").includes(year)
    ) ?? null
  );
}

/** "1 Single, 1 Double, 1 Twin" → "1 single, 1 double, 1 twin" (house style). */
export function normaliseCabinConfig(text) {
  const clean = stripHtml(text);
  if (!clean) return undefined;
  return clean.replace(/\b(Single|Double|Twin|Triple|Convertible|Master|VIP|Pullman)\b/g, (w) =>
    w === "VIP" ? w : w.toLowerCase()
  );
}

export function breakdownFromCounts(rec) {
  const parts = [];
  const add = (n, label) => {
    if (typeof n === "number" && n > 0) parts.push(`${n} ${label}`);
  };
  add(rec?.double_cabins, "double");
  add(rec?.twin_cabins, "twin");
  add(rec?.single_cabins, "single");
  add(rec?.triple_cabins, "triple");
  add(rec?.convertible_cabins, "convertible");
  return parts.length ? parts.join(", ") : undefined;
}

/** The spec block carrying cabin_config/bed_config/toys/engines moves with data_source. */
export function specBlocks(brochure) {
  const ds = brochure?.general?.data_source;
  const detail =
    ds === "auto" ? brochure?.auto : ds === "manual" ? brochure?.manual : brochure?.manual_text;
  return { ds, detail: detail ?? {}, spec: brochure?.specifications ?? {} };
}

/** Lookup helpers over the cached reference data. */
export function buildReference({ seasons, operating_areas }) {
  const areasById = new Map((operating_areas?.areas ?? []).map((a) => [a.id, a.area_name]));
  return {
    seasons: seasons ?? [],
    areasById,
    seasonLabel(id) {
      const s = (seasons ?? []).find((x) => x.id === id);
      return s ? `${s.name} ${s.year}` : `season ${id}`;
    },
  };
}

/**
 * Extract the Tier 3 facts for one yacht from its brochure (+ optional basic
 * record fallback). Pure; returns undefined for anything genuinely missing,
 * with the misses listed in `missing`.
 */
export function extractYachtFacts({ brochure, basic, reference, targetSeason }) {
  const { ds, detail, spec } = specBlocks(brochure);
  const missing = [];
  const notes = [];

  const name = String(basic?.yacht_name ?? "").trim() || undefined;

  const lengthM =
    parseMetres(spec.length_metres) ?? parseMetres(detail.length) ?? parseMetres(basic?.length_metric);
  if (!lengthM) missing.push("length");

  const yearBuilt = spec.year_built ?? detail.built ?? basic?.year_built;
  const yearRefitYr = spec.year_refit ?? detail.refit ?? basic?.year_refit;
  const yearRefit = yearBuilt
    ? yearRefitYr
      ? `${yearBuilt} / ${yearRefitYr}`
      : String(yearBuilt)
    : undefined;
  if (!yearRefit) missing.push("yearRefit");

  const guests = spec.guests_sleeping ?? detail.guests ?? basic?.guests_sleeping ?? undefined;
  if (!guests) missing.push("guests");

  const builder = spec.builder ?? detail.builder ?? basic?.builder ?? undefined;
  if (!builder) missing.push("builder");

  const cabins = spec.cabins ?? detail.cabins ?? basic?.cabins;
  const breakdown =
    normaliseCabinConfig(detail.cabin_config) ??
    breakdownFromCounts(spec) ??
    breakdownFromCounts(basic);
  const staterooms = cabins ? { count: cabins, breakdown: breakdown ?? "" } : undefined;
  if (!staterooms) missing.push("staterooms");
  else if (!breakdown) missing.push("staterooms.breakdown");

  const location = spec.summer_base_port ?? basic?.summer_base_port ?? undefined;
  if (!location) missing.push("location");

  let cruisingArea;
  if (targetSeason) {
    const areaIds =
      brochure?.operating_areas?.[String(targetSeason.id)] ??
      basic?.operating_areas_new?.find((o) => o.season_id === targetSeason.id)?.areas ??
      [];
    const names = areaIds.map((id) => reference.areasById.get(id)).filter(Boolean);
    if (names.length) cruisingArea = names.join(", ").toUpperCase();
  }
  if (!cruisingArea) missing.push("cruisingArea");

  // Currency is reported per rate row (keyed by season); for the season we
  // quote this is one currency per yacht. Carry it through as-is — never
  // convert, never hide a non-EUR rate.
  let weeklyRate;
  let currency;
  let weeklyRateIsFrom = false;
  if (targetSeason) {
    const priceRow =
      brochure?.prices?.[String(targetSeason.id)]?.[0] ??
      basic?.rates?.find((r) => r.season_id === targetSeason.id);
    if (priceRow && priceRow.min_rate != null) {
      weeklyRate = priceRow.min_rate;
      currency = (priceRow.currency ?? "EUR").toUpperCase();
      weeklyRateIsFrom = priceRow.max_rate != null && priceRow.max_rate !== priceRow.min_rate;
    }
  }
  if (weeklyRate == null) missing.push(`weeklyRate (${TARGET_SEASON.label})`);

  const nullRateSeasons = [];
  for (const [seasonId, rows] of Object.entries(brochure?.prices ?? {})) {
    if (rows?.[0] && rows[0].min_rate == null && rows[0].max_rate == null) {
      nullRateSeasons.push(reference.seasonLabel(Number(seasonId)));
    }
  }

  const unavailableForTarget = Boolean(
    targetSeason && basic?.seasons_unavailable?.includes(targetSeason.id)
  );
  if (unavailableForTarget) {
    notes.push(`marked unavailable for ${TARGET_SEASON.label} in Yachtfolio (seasons_unavailable)`);
  }

  const description =
    ds === "text"
      ? stripHtml(detail.text_specs) ?? stripHtml(brochure?.general?.general_description)
      : stripHtml(brochure?.general?.general_description);
  const keyFeatures = (brochure?.key_features ?? [])
    .map((f) => stripHtml(f?.content))
    .filter(Boolean);

  return {
    name,
    lengthM,
    yearRefit,
    guests,
    builder,
    staterooms,
    location,
    cruisingArea,
    currency,
    weeklyRate,
    weeklyRateIsFrom,
    description,
    keyFeatures,
    dataSource: ds,
    available: brochure?.general?.available,
    nullRateSeasons: [...new Set(nullRateSeasons)],
    unavailableForTarget,
    missing,
    notes,
  };
}

/** True when a filename/url points at a PDF (ignoring any query string). */
function looksLikePdfName(name) {
  if (!name) return false;
  const path = String(name).split(/[?#]/)[0].toLowerCase();
  return path.endsWith(".pdf");
}

/**
 * The brochure PDF file, if the yacht has one. Yachtfolio's `PDF` gallery is
 * a slot brokers can (and do) upload the wrong thing into — some yachts hold
 * only a JPEG cover render there, not a real PDF — so we select by file type,
 * not by position: the first entry whose filename is genuinely `.pdf` wins,
 * scanning the whole gallery (the PDF can sit behind an image), then the
 * sample menu if it too is a PDF. The returned url embeds the passkey, so
 * callers must download it server-side, never hand it to a browser.
 *
 * Returns { id_file, filename, url } for a usable PDF entry; otherwise
 * { pdfEntries } reporting how many non-PDF entries the gallery held, so the
 * caller can note "no PDF brochure" honestly rather than downloading a JPEG.
 */
export function extractBrochureFile(brochure) {
  const entries = (brochure?.galleries?.PDF ?? []).filter((f) => f?.url);
  const pdf = entries.find((f) => looksLikePdfName(f.filename) || looksLikePdfName(f.url));
  if (pdf) return { id_file: pdf.id_file, filename: pdf.filename ?? `${pdf.id_file}.pdf`, url: pdf.url };
  const menu = brochure?.sample_menu;
  if (menu?.url && looksLikePdfName(menu.filename ?? menu.url)) {
    return { id_file: menu.id_file, filename: menu.filename ?? `${menu.id_file}.pdf`, url: menu.url };
  }
  return { pdfEntries: entries.length };
}

/**
 * Rate matrix for the pickable seasons: for each of summer/winter 2027, the
 * low (min_rate) and high (max_rate) figures and the currency, taken from
 * that season's rate row (brochure prices, or the basic record's rates).
 * Currency is carried through as-is, never converted.
 */
export function extractRateOptions({ brochure, basic, reference }) {
  const out = {};
  for (const s of RATE_SEASONS) {
    const season = pickSeason(reference.seasons, s);
    let row = null;
    if (season) {
      row =
        brochure?.prices?.[String(season.id)]?.[0] ??
        basic?.rates?.find((r) => r.season_id === season.id) ??
        null;
    }
    out[s.key] = row
      ? {
          low: row.min_rate ?? null,
          high: row.max_rate ?? null,
          currency: (row.currency ?? "EUR").toUpperCase(),
          label: s.label,
        }
      : { low: null, high: null, currency: null, label: s.label };
  }
  return out;
}

/**
 * The documentation dates from 2023 — compare the live brochure shape with
 * what the doc promises and report differences instead of guessing.
 */
export function checkBrochureShape(brochure) {
  const notes = [];
  const expectedTop = [
    "crew", "specifications", "operating_areas", "key_features", "galleries",
    "video", "general", "crew_members", "broker", "sample_menu", "prices",
  ];
  const keys = Object.keys(brochure ?? {});
  for (const k of expectedTop) if (!keys.includes(k)) notes.push(`missing top-level key \`${k}\``);
  // last_modified: observed live 2026-09, absent from the 2023 doc — accepted.
  const known = new Set([...expectedTop, "auto", "manual", "manual_text", "errors", "data", "last_modified"]);
  for (const k of keys) if (!known.has(k)) notes.push(`unexpected top-level key \`${k}\``);

  const general = brochure?.general;
  if (general) {
    // general.available: documented but absent from live responses (observed
    // 2026-09) — only its value, when present, is reported.
    for (const k of ["data_source", "general_description"]) {
      if (!(k in general)) notes.push(`missing \`general.${k}\``);
    }
    const ds = general.data_source;
    if (ds && !["auto", "manual", "text"].includes(ds)) {
      notes.push(`unexpected \`general.data_source\` value "${ds}"`);
    }
    const block = ds === "auto" ? "auto" : ds === "manual" ? "manual" : ds === "text" ? "manual_text" : null;
    if (block && !(block in (brochure ?? {}))) {
      notes.push(`data_source is "${ds}" but the \`${block}\` block is absent`);
    }
  }
  if (brochure?.galleries) {
    for (const cat of ["EXTERIOR", "INTERIOR", "LIFESTYLE", "LAYOUT", "FULL"]) {
      if (!(cat in brochure.galleries)) notes.push(`missing gallery category \`${cat}\``);
    }
    const anyImage = Object.values(brochure.galleries).flat().find(Boolean);
    if (anyImage) {
      for (const k of ["id_file", "url", "filename", "id_order"]) {
        if (!(k in anyImage)) notes.push(`gallery image missing \`${k}\``);
      }
    }
  }
  const priceArr = Object.values(brochure?.prices ?? {})[0];
  if (Array.isArray(priceArr) && priceArr[0]) {
    for (const k of ["min_rate", "max_rate", "currency"]) {
      if (!(k in priceArr[0])) notes.push(`season price missing \`${k}\``);
    }
  }
  return notes;
}
