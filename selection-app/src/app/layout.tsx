import type { Metadata, Viewport } from "next";
import "./globals.css";

/**
 * Absolute base for canonical / Open Graph URLs on public pages. Set
 * NEXT_PUBLIC_SITE_URL in Vercel (e.g. https://atlas.oceanindependence.com);
 * production deployments fall back to the Vercel project URL.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Yacht Charter Selection — Ocean Independence",
  description: "A personal selection of charter yachts, prepared for you by Ocean Independence.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#04080A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
