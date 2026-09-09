/* Thin 1px-stroke line icons only (OI brand) — no emoji, no icon fonts. */

/* Stroke colours come from the theme token layer (src/app/theme-tokens.css):
   mint line work in the dark theme, Graphite in the light theme. */
const ICON = "var(--icon-stroke)";
const ICON_CONTACT = "var(--icon-stroke-contact)";

export function GuestsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="5" cy="4.5" r="2" stroke={ICON} strokeWidth="1" />
      <path d="M1.5 12C1.5 9.8 3 8.5 5 8.5C7 8.5 8.5 9.8 8.5 12" stroke={ICON} strokeWidth="1" />
      <circle cx="10" cy="4.5" r="1.6" stroke={ICON} strokeWidth="1" />
      <path d="M10.8 8.2C12 8.6 12.8 9.9 12.8 11.4" stroke={ICON} strokeWidth="1" />
    </svg>
  );
}

export function StateroomsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1.5 11.5V6.5H12.5V11.5" stroke={ICON} strokeWidth="1" />
      <path d="M1.5 9.5H12.5" stroke={ICON} strokeWidth="1" />
      <path d="M3 6.5V4.5C3 3.9 3.4 3.5 4 3.5H6C6.6 3.5 7 3.9 7 4.5V6.5" stroke={ICON} strokeWidth="1" />
    </svg>
  );
}

export function LengthIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1 7H13" stroke={ICON} strokeWidth="1" />
      <path d="M3 5L1 7L3 9" stroke={ICON} strokeWidth="1" />
      <path d="M11 5L13 7L11 9" stroke={ICON} strokeWidth="1" />
    </svg>
  );
}

export function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="10" height="20" viewBox="0 0 10 20" fill="none" aria-hidden="true">
      <path
        d={dir === "left" ? "M9 1L1 10L9 19" : "M1 1L9 10L1 19"}
        stroke="var(--icon-chevron)"
        strokeWidth="1"
      />
    </svg>
  );
}

export function SmallChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="7" height="14" viewBox="0 0 7 14" fill="none" aria-hidden="true">
      <path
        d={dir === "left" ? "M6 1L1 7L6 13" : "M1 1L6 7L1 13"}
        style={{ stroke: "var(--icon-ctl)" }}
        strokeWidth="1"
      />
    </svg>
  );
}

export function CompareToggleIcon({ selected }: { selected: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d={selected ? "M2.5 7.5L5.5 10.5L11.5 3.5" : "M7 2V12M2 7H12"}
        style={{ stroke: selected ? "var(--icon-on)" : "var(--icon-ctl)" }}
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function SpeakerIcon({ on }: { on: boolean }) {
  const ink = on ? "var(--icon-on)" : "var(--icon-off)";
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M1 4H3.5L7 1V11L3.5 8H1V4Z" style={{ stroke: ink }} strokeWidth="1" fill="none" />
      <path d="M9 4C9.8 4.9 9.8 7.1 9 8" stroke={on ? "var(--icon-on)" : "transparent"} strokeWidth="1" />
    </svg>
  );
}

export function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M3 1.5H5L6 4.5L4.5 5.5C5.2 7 7 8.8 8.5 9.5L9.5 8L12.5 9V11C12.5 11.8 11.8 12.5 11 12.5C5.8 12.2 1.8 8.2 1.5 3C1.5 2.2 2.2 1.5 3 1.5Z"
        stroke={ICON_CONTACT}
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1.5" y="3" width="11" height="8" stroke={ICON_CONTACT} strokeWidth="1" />
      <path d="M1.5 3.5L7 8L12.5 3.5" stroke={ICON_CONTACT} strokeWidth="1" />
    </svg>
  );
}
