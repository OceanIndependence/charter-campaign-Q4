"use client";

import styles from "./PortalForm.module.css";

/** Signs out of the current identity (keeps the staging gate). */
export default function SignOutButton() {
  const signOut = async () => {
    await fetch("/api/auth/identity", { method: "DELETE" }).catch(() => {});
    window.location.href = "/portal/sign-in";
  };
  return (
    <button type="button" className={styles.signOutBtn} onClick={signOut}>
      SIGN OUT
    </button>
  );
}
