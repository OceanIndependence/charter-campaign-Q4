import type { MetadataRoute } from "next";

/**
 * Crawlers are allowed to FETCH everything and indexed on nothing.
 *
 * That is deliberate: the exclusion is carried by the X-Robots-Tag header
 * (next.config.ts) and the robots meta tag (the root layout), and a crawler
 * has to be able to read a page to see either of them. "Disallow: /" would
 * block the fetch, leaving the directives unread — a URL someone links to
 * could then still be listed, with no description. There is no sitemap, by
 * design: no address here should be discoverable.
 */
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
  };
}
