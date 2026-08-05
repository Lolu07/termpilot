import React, { useEffect, useRef } from "react";

export default function ConfirmDialog({ title, description, confirmLabel, busy, onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  cancelRef.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const backdrop = dialogRef.current?.parentElement;
    const backgroundNodes = backdrop?.parentElement
      ? [...backdrop.parentElement.children].filter(node => node !== backdrop)
      : [];
    const previousInert = backgroundNodes.map(node => node.inert);
    backgroundNodes.forEach(node => { node.inert = true; });
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector(".confirm-cancel")?.focus();

    const handleKey = event => {
      if (event.key === "Escape" && !busyRef.current) cancelRef.current();
      if (event.key !== "Tab") return;
      const buttons = [...dialogRef.current.querySelectorAll("button:not([disabled])")];
      if (!buttons.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = buttons[0];
      const last = buttons.at(-1);
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
      backgroundNodes.forEach((node, index) => { node.inert = previousInert[index]; });
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <div className="confirm-backdrop">
      <section ref={dialogRef} className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description" tabIndex={-1}>
        <div className="eyebrow">Please confirm</div>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-description">{description}</p>
        <div className="confirm-actions">
          <button className="button-secondary confirm-cancel" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="confirm-primary" type="button" onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
