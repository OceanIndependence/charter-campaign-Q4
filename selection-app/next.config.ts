import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // Client pages and previews change on every publish/edit — never let a
    // browser or CDN hold an old copy.
    const noStore = [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }];
    // The public fleet listing is live (nightly cache), not frozen: a short
    // shared cache keeps it fresh without hammering storage.
    const fleetCache = [{ key: "Cache-Control", value: "public, s-maxage=600, stale-while-revalidate=3600" }];
    return [
      { source: "/2027-charter-season/yachts/:path*", headers: fleetCache },
      { source: "/selection/:path*", headers: noStore },
      { source: "/atlas/:path*", headers: noStore },
      { source: "/portal/preview", headers: noStore },
    ];
  },
};

export default nextConfig;
