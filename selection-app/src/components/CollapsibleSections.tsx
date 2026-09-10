"use client";

import { useState } from "react";
import { DEFAULT_ITINERARY_LABEL, type ItineraryLink } from "@/lib/types";
import styles from "./CollapsibleSections.module.css";

function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className={styles.section}>
      <button type="button" className={styles.toggle} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <h2 className={styles.title}>{title}</h2>
        <span className={styles.toggleIcon}>{open ? "−" : "+"}</span>
      </button>
      {open && children}
    </section>
  );
}

const COSTS = [
  ["CHARTER FEE", "Covers the yacht and the crew."],
  [
    "APA",
    "The Advanced Provisioning Allowance is calculated at 35–40% of the charter fee and is an account of your money managed by the Captain to pay for fuel, marina/berth fees, food and drink provisions etc. throughout the charter. A breakdown of all costs incurred together with proof of purchase will be presented to you on the last day of your charter, and any remainder can be held on account and reimbursed.",
  ],
  ["DELIVERY FEE", "May be applicable, I will advise per yacht."],
  ["VAT", "Varies dependent on location."],
  [
    "CREW GRATUITY",
    "A crew gratuity is customary but given at your discretion; we advise anything between 5–15% of the charter fee.",
  ],
] as const;

export function CostsSection() {
  return (
    <CollapsibleSection title="COSTS INVOLVED">
      <div className={styles.costsBody}>
        <div className={styles.costsImage}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/pptx/image5.jpg" alt="Swim platform at dusk" />
        </div>
        <div className={styles.costsList}>
          {COSTS.map(([label, copy]) => (
            <div key={label}>
              <div className={styles.costLabel}>{label}</div>
              <p className={styles.costCopy}>{copy}</p>
            </div>
          ))}
        </div>
      </div>
    </CollapsibleSection>
  );
}

export function ItinerarySection({
  itineraryUrl,
  itineraryLinks,
}: {
  itineraryUrl?: string;
  itineraryLinks?: ItineraryLink[];
}) {
  // Pages published before a selection could carry several itineraries have
  // one URL and no button text of their own.
  const links: ItineraryLink[] = itineraryLinks?.length
    ? itineraryLinks
    : itineraryUrl
      ? [{ url: itineraryUrl }]
      : [];
  return (
    <CollapsibleSection title="YOUR ITINERARY">
      <div className={styles.itinBody}>
        <div className={styles.itinInner}>
          <p className={styles.itinIntro}>
            {links.length > 1 ? "These itineraries are" : "This itinerary is"} purely a suggestion,
            and we shall work with the captain of your chosen yacht to curate an itinerary with your
            preferences in mind.
          </p>
          {links.length > 0 && (
            <div className={styles.itinLinks}>
              {links.map((link, i) => (
                <a key={`${link.url}-${i}`} href={link.url} className={styles.itinLink}>
                  {link.label?.trim() || DEFAULT_ITINERARY_LABEL}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}
