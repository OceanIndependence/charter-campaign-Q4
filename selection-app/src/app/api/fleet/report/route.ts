import { NextRequest, NextResponse } from "next/server";
import { getAtlasIndex } from "@/server/atlas/content";
import { getFleetFacts } from "@/server/fleet-facts.mjs";
import { selectFleetForDestination, type FleetFactsDoc } from "@/server/fleet-page";
import { isPortalAuthed } from "@/server/portal-auth";
import { FURTHER_BAND, LENGTH_BANDS, bandFor } from "@/lib/fleet-bands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fleet page coverage report (Markdown) — what /2027-charter-season/yachts/…
 * shows from the current facts document: fleet-wide band distribution,
 * yachts with no length or no rate, currencies, Yachtfolio data_source
 * values, and per destination the match level, count and bands. Same
 * selection as the page. Authorised like the Cron: the CRON_SECRET bearer,
 * or a signed-in consultant.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization");
  const cronOk = Boolean(secret) && bearer === `Bearer ${secret}`;
  const devOk = !secret && process.env.NODE_ENV !== "production";
  if (!cronOk && !devOk && !isPortalAuthed(request)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const facts = (await getFleetFacts()) as FleetFactsDoc;
  const index = getAtlasIndex();
  const yachts = Object.values(facts.yachts ?? {});
  const bands = [...LENGTH_BANDS, FURTHER_BAND];
  const names = (list: typeof yachts) => list.map((y) => y.name).sort().join(", ");
  const tally = (key: (y: (typeof yachts)[number]) => string) => {
    const m = new Map<string, number>();
    for (const y of yachts) m.set(key(y), (m.get(key(y)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ") || "—";
  };

  const L: string[] = [];
  L.push("# Fleet page report", "");
  L.push(`Source: ${facts.source}${facts.fallback ? ` (${facts.fallback})` : ""}. ${yachts.length} yachts; facts updated ${facts.updatedAt ?? "—"}.`, "");
  L.push("## Fleet-wide", "");
  L.push("| Length band | Yachts |", "|---|---|");
  for (const b of bands) L.push(`| ${b.label} | ${yachts.filter((y) => bandFor(y.lengthM).key === b.key).length} |`);
  L.push("");
  const noLength = yachts.filter((y) => !(y.lengthM != null && y.lengthM > 0));
  const noRate = yachts.filter((y) => !(y.rateMin != null && y.rateMin > 0));
  const unavailable = yachts.filter((y) => y.unavailableForTarget);
  L.push(`- No length ("Further yachts"): ${noLength.length}${noLength.length ? ` — ${names(noLength)}` : ""}`);
  L.push(`- No weekly rate ("Rate on application"): ${noRate.length}${noRate.length ? ` — ${names(noRate)}` : ""}`);
  L.push(`- Unavailable for the target season (not listed): ${unavailable.length}${unavailable.length ? ` — ${names(unavailable)}` : ""}`);
  L.push(`- Currencies: ${tally((y) => y.currency ?? "none")}`);
  L.push(`- Yachtfolio general.data_source: ${tally((y) => y.dataSource ?? "none")}`);
  L.push(`- Normaliser "missing" flags: ${tally((y) => (y.missing?.length ? y.missing.join("+") : "none"))}`);
  L.push("");
  L.push("## By destination", "");
  L.push(`| Destination | Match | Yachts | ${bands.map((b) => b.label).join(" | ")} |`);
  L.push(`|---|---|---|${bands.map(() => "---").join("|")}|`);
  const gaps: string[] = [];
  const dests = [...index.byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  for (const d of dests) {
    const sel = selectFleetForDestination(d, index, facts);
    if (sel.level === "none") gaps.push(d.id);
    const counts = bands.map((b) => sel.yachts.filter((m) => bandFor(m.yacht.lengthM).key === b.key).length);
    L.push(`| \`${d.id}\` | ${sel.level} | ${sel.yachts.length} | ${counts.join(" | ")} |`);
  }
  L.push("", "## Mapping gaps (empty state on the fleet page)", "");
  L.push(gaps.length ? gaps.map((g) => `- \`${g}\``).join("\n") : "None.");
  L.push("");

  return new NextResponse(L.join("\n"), { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" } });
}
