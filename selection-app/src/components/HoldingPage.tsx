import type { Consultant } from "@/lib/types";
import ConsultantBlock from "./ConsultantBlock";

/**
 * Shown in place of a client page when its snapshot or a yacht record
 * cannot be read: a calm note and the consultant's contact details, never a
 * 500. Server component; the storage failure is logged by the caller.
 */
export default function HoldingPage({ consultant, atlasUrl }: { consultant?: Consultant | null; atlasUrl?: string }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0f1113",
        color: "#e9e7e2",
        fontFamily: "Gotham, Helvetica Neue, Arial, sans-serif",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <section style={{ padding: "96px 24px 64px", textAlign: "center" }}>
        <p style={{ fontSize: 10, letterSpacing: "0.3em", color: "#9a9a96", margin: "0 0 18px" }}>OCEAN INDEPENDENCE</p>
        <h1 style={{ fontSize: 26, fontWeight: 300, letterSpacing: "0.06em", margin: "0 0 18px" }}>Your selection is taking a moment</h1>
        <p style={{ fontSize: 14, lineHeight: 1.8, letterSpacing: "0.04em", color: "#c9c7c2", maxWidth: 520, margin: "0 auto" }}>
          This page could not be loaded just now. Please try again in a few minutes
          {consultant?.name ? ", or contact your Charter Consultant below" : ""}.
        </p>
      </section>
      {consultant?.name ? (
        <ConsultantBlock consultant={consultant} atlasUrl={atlasUrl} />
      ) : (
        <p style={{ textAlign: "center", fontSize: 12, letterSpacing: "0.1em", color: "#9a9a96", padding: "0 24px 64px" }}>
          <a href="https://www.oceanindependence.com/" style={{ color: "#e9e7e2" }}>
            oceanindependence.com
          </a>
        </p>
      )}
    </main>
  );
}
