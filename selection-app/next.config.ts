import type { NextConfig } from "next";

/**
 * Nothing in this project is meant to be found: the portal is staff-only,
 * client selection pages are private links, and the 2027 Atlas is shared
 * deliberately rather than searched for. The robots header below is applied
 * to every path, so it rides on API JSON, images and fonts as well as pages,
 * on every hostname — the custom domains, the project's own .vercel.app and
 * every preview deployment. The root layout carries a matching robots meta
 * tag as a second layer for anything that only reads HTML.
 *
 * Referrer-Policy keeps client page slugs out of third-party logs: without
 * it, a client following an itinerary or brochure link hands that site the
 * full URL of their own selection page in the Referer header.
 */
const NOINDEX_HEADERS = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" },
  { key: "Referrer-Policy", value: "no-referrer" },
];

const nextConfig: NextConfig = {
  async headers() {
    // Client pages and previews change on every publish/edit — never let a
    // browser or CDN hold an old copy.
    const noStore = [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }];
    return [
      // "/:path*" matches the root and every path beneath it, including
      // /api/*, /_next/* and everything served from public/.
      { source: "/:path*", headers: NOINDEX_HEADERS },
      { source: "/selection/:path*", headers: noStore },
      { source: "/destinations/:path*", headers: noStore },
      { source: "/portal/preview", headers: noStore },
    ];
  },
  /**
   * Tier 2 client pages moved from /atlas/<slug> to /destinations/<slug>.
   * Links already in clients' hands — emails, short links, QR codes — are
   * permanent, so this redirect is too. It has to stay for as long as any
   * of those links might be followed, which is indefinitely.
   *
   * Note that redirects are evaluated before files in public/ are served,
   * which is why the globe's country geometry now lives at /geo/ rather
   * than /atlas/: left where it was, it would be redirected into nothing
   * and the globe would fail to draw on both Tier 1 and Tier 2.
   */
  async redirects() {
    return [{ source: "/atlas/:slug", destination: "/destinations/:slug", permanent: true }];
  },
};

export default nextConfig;
