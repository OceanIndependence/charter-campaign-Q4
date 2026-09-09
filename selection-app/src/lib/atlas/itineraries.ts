/**
 * Repo-held itineraries for the 2027 Atlas: authored per destination in
 * content/itineraries/<id>.json, validated and aggregated into
 * data/itineraries.json by `npm run build:itineraries` (also the prebuild
 * step). The editorial `status` field never reaches this side.
 */

import type { RoutePoint } from "./globe";

export interface ItineraryDay {
  day: number;
  place: string;
  lat: number;
  lng: number;
  note: string;
}

export interface Itinerary {
  id: string;
  nights: number;
  title: string;
  intro: string;
  days: ItineraryDay[];
}

export interface ItinerariesData {
  generatedAt: string;
  /** destination id → itineraries (five-day, seven-day) */
  destinations: Record<string, Itinerary[]>;
}

/** The aggregate is a separate chunk, fetched alongside the destination snapshot. */
export async function loadItineraries(): Promise<ItinerariesData> {
  const mod = await import("../../../data/itineraries.json");
  return mod.default as unknown as ItinerariesData;
}

export function routePoints(it: Itinerary): RoutePoint[] {
  return it.days.map((d) => ({ day: d.day, place: d.place, lat: d.lat, lon: d.lng }));
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** "FIVE NIGHTS" / "SEVEN NIGHTS" / "12 NIGHTS" — house style for the card label. */
export function nightsLabel(n: number): string {
  return `${n < 10 ? WORDS[n] : String(n)} ${n === 1 ? "night" : "nights"}`.toUpperCase();
}
