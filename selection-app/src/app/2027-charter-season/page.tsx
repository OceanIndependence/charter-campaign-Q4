import type { Metadata } from "next";
import snapshot from "../../../data/destinations.json";
import AtlasPage from "@/components/atlas/AtlasPage";

/**
 * The 2027 Atlas — a public page. Every destination, its copy and its yachts
 * come from data/destinations.json (npm run import:destinations), so the page
 * is prerendered as a static shell; the globe engine and the content chunk
 * load in the browser. Meta tags only: no server-rendered content mirror.
 */

const PATH = "/2027-charter-season";
const TITLE = "The 2027 Charter Season — Ocean Independence";
const DESCRIPTION =
  "Every Ocean Independence charter destination on one interactive globe. From the Mediterranean to the Caribbean, the Indian Ocean and the South Pacific, explore the cruising grounds and the yachts cruising them in 2027.";
const OG_IMAGE = snapshot.site.heroImage ?? snapshot.site.ogImage ?? "/assets/logo-white.png";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "Ocean Independence",
    title: TITLE,
    description: DESCRIPTION,
    url: PATH,
    images: [{ url: OG_IMAGE, alt: "Ocean Independence — the 2027 charter season" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export default function Page() {
  return <AtlasPage />;
}
