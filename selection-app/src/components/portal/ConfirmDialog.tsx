"use client";

import { useEffect, useRef } from "react";
import styles from "./PortalForm.module.css";

/**
 * In-app confirmation for a destructive action, in place of window.confirm —
 * the browser dialog cannot be styled and reads as if it came from the
 * browser rather than the portal. Escape or the backdrop cancels; the
 * confirm button takes focus so Enter confirms and Tab stays in the box.
 */
export default function ConfirmDialog({
  title,
  body,
  confirmLabel = "REMOVE",
  cancelLabel = "CANCEL",
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      // Keep focus between the two buttons while the dialog is open.
      if (e.key === "Tab") {
        e.preventDefault();
        (document.activeElement === confirmRef.current ? cancelRef : confirmRef).current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onCancel]);

  return (
    <div className={styles.confirmBackdrop} onClick={onCancel} role="presentation">
      <div
        className={styles.confirmBox}
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-confirm-title"
        aria-describedby={body ? "portal-confirm-body" : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.confirmTitle} id="portal-confirm-title">
          {title}
        </h2>
        {body && (
          <p className={styles.confirmBody} id="portal-confirm-body">
            {body}
          </p>
        )}
        <div className={styles.confirmActions}>
          <button type="button" ref={cancelRef} className={styles.confirmCancel} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" ref={confirmRef} className={styles.confirmGo} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
