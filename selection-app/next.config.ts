import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // Client pages and previews change on every publish/edit — never let a
    // browser or CDN hold an old copy.
    const noStore = [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }];
    return [
      { source: "/selection/:path*", headers: noStore },
      { source: "/portal/preview", headers: noStore },
    ];
  },
};

export default nextConfig;
