/**
 * Minimal in-memory sliding-window rate limiter for the portal API routes.
 *
 * Per serverless instance only — enough to stop a runaway client or naive
 * scraping in staging; swap for a shared store (KV) if this ever fronts
 * real traffic.
 */

const hits = new Map<string, number[]>();

export function rateLimit(bucket: string, ip: string, max: number, windowMs: number): boolean {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const windowStart = now - windowMs;
  const list = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (list.length >= max) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 10000) hits.clear(); // crude memory guard
  return true;
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}
