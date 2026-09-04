"use client";

import { useState } from "react";
import PortalHeader from "@/components/portal/PortalHeader";
import styles from "@/components/portal/PortalForm.module.css";

export default function PortalLoginPage() {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "That access key is not recognised.");
        return;
      }
      window.location.href = "/portal";
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <PortalHeader consultant="CHARTER PORTAL" initial="OI" />
      <div className={styles.loginWrap}>
        <form className={styles.loginCard} onSubmit={submit}>
          <div>
            <div className={styles.eyebrow}>CHARTER PORTAL</div>
            <h1 className={styles.title} style={{ fontSize: "clamp(22px, 3vw, 28px)" }}>
              Sign In
            </h1>
            <p className={styles.intro}>
              Enter the portal access key to build and publish client presentations.
            </p>
          </div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>ACCESS KEY</span>
            <input
              type="password"
              className={styles.input}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoFocus
            />
          </label>
          {error && <span className={styles.loginError}>{error}</span>}
          <button type="submit" className={styles.publishBtn} disabled={busy || !key}>
            {busy ? "SIGNING IN…" : "SIGN IN"}
          </button>
        </form>
      </div>
    </div>
  );
}
