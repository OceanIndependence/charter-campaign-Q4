/**
 * Website extraction for destination content — SERVER-ONLY, shared by the
 * Tier 1 import (scripts/import-destinations.mjs, which writes
 * data/destinations.json at build time) and the Tier 2 live refresh
 * (src/server/atlas/content.ts, which re-reads a chosen destination's page on
 * demand and falls back to the checked-in snapshot when the website is
 * unreachable). Pure parsing plus one fetch helper; no storage here.
 */

import { parse } from "node-html-parser";

export const SITE = "https://www.oceanindependence.com";
export const INDEX_URL = `${SITE}/yacht-charter/destinations/`;
export const USER_AGENT = "OceanIndependence-Atlas-Import/1.0 (+https://www.oceanindependence.com)";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function decode(text) {
  return (text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8220;|&ldquo;/g, "“")
    .replace(/&#8221;|&rdquo;/g, "”")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#8230;|&hellip;/g, "…")
    .replace(/&#038;|&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

export const text = (node) => (node ? decode(node.text) : "");

/** Path id under /yacht-charter/destinations/, e.g. "mediterranean/italy". */
export function idFromUrl(url) {
  const m = url.match(/\/yacht-charter\/destinations\/([^?#]*)/);
  if (!m) return null;
  return m[1].replace(/\/+$/, "");
}

export function canonicalUrl(href) {
  if (!href) return null;
  let url = href.trim();
  if (url.startsWith("/")) url = SITE + url;
  if (!url.startsWith(SITE + "/yacht-charter/destinations/")) return null;
  url = url.split("#")[0].split("?")[0];
  if (!url.endsWith("/")) url += "/";
  if (/\/page\/\d+\/$/.test(url)) return null; // paginated listing duplicates
  if (/\/(de|es|fr|it|ru)\//.test(url.replace(SITE, ""))) return null;
  return url;
}

/** Sirv images: always ask for the 2000px rendition. Other hosts unchanged. */
export function sirv2000(url) {
  if (!url) return url;
  if (/oceanindependence\.sirv\.com/.test(url)) return url.replace(/\?.*$/, "") + "?w=2000";
  return url;
}

export async function fetchHtml(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html" }, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (attempt >= 4) throw err;
    await sleep(500 * 2 ** attempt);
    return fetchHtml(url, attempt + 1);
  }
}


/* --------------------------------------------------------------- parsing */

export function parseYachtCard(card) {
  const link = card.querySelector("a.o-card__inner-link") || card.querySelector("a[href*='/yacht-charter/yacht/']");
  const url = link?.getAttribute("href") || null;
  const name = text(card.querySelector(".c-yacht-card__title"));
  const ps = card.querySelectorAll(".c-yacht-card__details p").map(text).filter(Boolean);
  const specsRaw = ps.find((p) => /\d+m/i.test(p)) || ps[0] || "";
  const rateRaw = ps.find((p) => /\/\s*week|per week/i.test(p)) || "";
  const img = card.querySelector(".c-yacht-card__media img")?.getAttribute("src") || null;
  const favourite = card.querySelector("[data-yacht-id]")?.getAttribute("data-yacht-id");
  const slug = url ? url.replace(/\/+$/, "").split("/").pop() : name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const id = favourite ? `yf-${favourite}` : slug;
  const tags = card.querySelectorAll(".c-yacht-card__tag").map(text).filter(Boolean);

  // "58m (191') - Trinity Yachts - 2009 - 12 Guests"
  const specs = specsRaw.split(/\s+-\s+/).map((s) => s.trim());
  const lengthMatch = specs[0]?.match(/^([\d.]+)\s*m(?:\s*\(([^)]*)\))?/i);
  const yearIdx = specs.findIndex((s) => /^\d{4}$/.test(s));
  const guestsIdx = specs.findIndex((s) => /guests?/i.test(s));
  const builder = specs.slice(1).filter((_, i) => i + 1 !== yearIdx && i + 1 !== guestsIdx)[0] || null;
  const rateMatch = rateRaw.match(/(from\s+)?([A-Z]{3})\s*([\d,.]+)/i);

  return {
    id,
    name,
    url,
    image: sirv2000(img),
    specsRaw,
    rateRaw,
    lengthM: lengthMatch ? Number.parseFloat(lengthMatch[1]) : null,
    lengthFt: lengthMatch?.[2] ? lengthMatch[2].replace(/['’]/g, "") : null,
    builder,
    year: yearIdx >= 0 ? Number.parseInt(specs[yearIdx], 10) : null,
    guests: guestsIdx >= 0 ? Number.parseInt(specs[guestsIdx], 10) : null,
    currency: rateMatch ? rateMatch[2].toUpperCase() : null,
    weeklyRate: rateMatch ? Number.parseInt(rateMatch[3].replace(/[,.]/g, ""), 10) : null,
    weeklyRateIsFrom: rateMatch ? Boolean(rateMatch[1]) : false,
    tags,
  };
}

export function parsePage(url, html) {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });
  const id = idFromUrl(url);

  const hero = root.querySelector(".c-hero");
  const h1 = hero?.querySelector("h1") || root.querySelector("h1");
  let name = "";
  if (h1) {
    const eyebrow = h1.querySelector(".h5");
    if (eyebrow) eyebrow.remove();
    name = text(h1);
  }
  const metaTitle = text(root.querySelector("title"));
  const metaDescription = root.querySelector('meta[name="description"]')?.getAttribute("content") || "";
  const ogImage = root.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;

  let heroImage =
    hero?.querySelector('picture source[media*="min-width"]')?.getAttribute("srcset") ||
    hero?.querySelector("picture img")?.getAttribute("src") ||
    hero?.querySelector("img")?.getAttribute("src") ||
    ogImage;
  heroImage = sirv2000(heroImage ? heroImage.split(/\s+/)[0] : null);
  const heroMobile = hero?.querySelector('picture source[media*="max-width"]')?.getAttribute("srcset")?.split(/\s+/)[0] || null;
  const heroVideo = hero?.querySelector("video source")?.getAttribute("src") || null;

  const main = root.querySelector("main.o-sidebar-layout__main") || root.querySelector("main");
  // Intro copy, verbatim: the large lede block(s) then the standard blocks,
  // in page order. Only the blocks that sit directly inside <main> count —
  // the tick list, map and sidebar are separate.
  const lede = [];
  const paragraphs = [];
  if (main) {
    for (const block of main.childNodes) {
      if (block.nodeType !== 1) continue;
      const cls = block.getAttribute("class") || "";
      if (!/s-standard-content/.test(cls)) continue;
      const ps = block.querySelectorAll("p").map(text).filter(Boolean);
      (/u-text-huge/.test(cls) ? lede : paragraphs).push(...ps);
    }
  } else {
    // Hub pages (e.g. North America) have no <main>: any standalone copy block
    // in the first section is the intro; slider intros and cards are not.
    const first = root.querySelector("section.o-section");
    for (const block of first ? first.querySelectorAll(".s-standard-content") : []) {
      const cls = block.getAttribute("class") || "";
      if (/c-featured-items-slider__intro/.test(cls) || block.closest(".o-card")) continue;
      const ps = block.querySelectorAll("p").map(text).filter(Boolean);
      (/u-text-huge/.test(cls) ? lede : paragraphs).push(...ps);
    }
  }
  const keyFacts = root.querySelectorAll(".o-key-facts figure.o-meta").map((fig) => {
    const label = text(fig.querySelector(".o-meta__label")).replace(/:$/, "");
    const cap = fig.querySelector("figcaption");
    if (cap) cap.remove();
    const badges = fig.querySelectorAll(".o-badge").map(text).filter(Boolean);
    return { label, value: badges.length ? badges.join(" · ") : text(fig) };
  });

  let mapPins = [];
  let mapZoom = null;
  const map = root.querySelector(".o-google-map[data-map-locations]");
  if (map) {
    try {
      const raw = decode(map.getAttribute("data-map-locations"));
      mapPins = JSON.parse(raw)
        .map((p) => [Number.parseFloat(p.latitude), Number.parseFloat(p.longitude)])
        .filter(([la, lo]) => Number.isFinite(la) && Number.isFinite(lo) && !(la === 0 && lo === 0));
    } catch {
      mapPins = [];
    }
    mapZoom = Number.parseInt(map.getAttribute("data-map-zoom") || "", 10) || null;
  }

  // Child destinations — the "Destination Guides" cards on this page.
  const cards = root.querySelectorAll(".c-destination-card").map((card) => {
    const href = canonicalUrl(card.getAttribute("href") || card.querySelector("a")?.getAttribute("href"));
    const img = card.querySelector("img");
    let image = img?.getAttribute("src") || null;
    const srcset = img?.getAttribute("srcset");
    if (srcset) {
      // Largest rendition offered.
      const best = srcset
        .split(",")
        .map((s) => s.trim().split(/\s+/))
        .map(([u, w]) => [u, Number.parseInt(w || "0", 10)])
        .sort((a, b) => b[1] - a[1])[0];
      if (best) image = best[0];
    }
    return {
      url: href,
      name: text(card.querySelector(".c-destination-card__title")),
      summary: text(card.querySelector(".c-destination-card__details")),
      image: sirv2000(image),
    };
  }).filter((c) => c.url);

  // Every destination link on the page, for tree discovery (region pages list
  // grandchildren too).
  const links = new Set();
  for (const a of root.querySelectorAll("a[href]")) {
    const u = canonicalUrl(a.getAttribute("href"));
    if (u && u !== INDEX_URL) links.add(u);
  }

  // Featured charter yachts — "Yachts in the Area".
  let yachtSection = root.querySelector("#yachts-in-the-area");
  if (!yachtSection) {
    yachtSection = root
      .querySelectorAll(".c-featured-items-slider")
      .find((s) => /yacht/i.test(text(s.querySelector("h2"))) && s.querySelector(".c-yacht-card"));
  }
  const yachts = yachtSection ? yachtSection.querySelectorAll(".c-yacht-card").map(parseYachtCard).filter((y) => y.name) : [];

  return {
    id,
    url,
    name,
    metaTitle,
    metaDescription: decode(metaDescription),
    ogImage,
    heroImage,
    heroMobile,
    heroVideo,
    lede: lede.join(" "),
    paragraphs,
    keyFacts,
    mapPins,
    mapZoom,
    cards,
    links: [...links],
    yachts,
  };
}

