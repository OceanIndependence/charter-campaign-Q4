"use client";

import { useState } from "react";
import type { ConsultantIdentity } from "@/server/auth/types";
import styles from "./PortalForm.module.css";

/** Dev-stub identity picker: choose a fake consultant to test ownership. */
export default function SignInPicker({ identities }: { identities: ConsultantIdentity[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/auth/identity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Sign-in failed.");
        return;
      }
      window.location.href = "/portal";
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {identities.map((i) => (
        <button
          key={i.id}
          type="button"
          className={styles.previewBtn}
          style={{ textAlign: "left", padding: "14px 18px", letterSpacing: "0.04em" }}
          disabled={Boolean(busy)}
          onClick={() => pick(i.id)}
        >
          {busy === i.id ? "SIGNING IN…" : `${i.name} · ${i.email}`}
        </button>
      ))}
      {error && <span className={styles.loginError}>{error}</span>}
    </div>
  );
}
