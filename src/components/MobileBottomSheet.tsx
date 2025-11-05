"use client";

import { useEffect, useRef } from "react";

type MobileBottomSheetProps = {
  open: boolean;
  title?: string;
  allowClose?: boolean; // cuando false, deshabilita cerrar por backdrop/Escape
  onClose: () => void;
  children: React.ReactNode;
};

export default function MobileBottomSheet({ open, title, allowClose = true, onClose, children }: MobileBottomSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Bloquea scroll del body cuando está abierto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && allowClose) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, allowClose, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" aria-modal="true" role="dialog">
      <div
        className="sheet-backdrop"
        onClick={() => { if (allowClose) onClose(); }}
        aria-hidden="true"
      />
      <div ref={panelRef} className="sheet" data-role="mobile-sheet">
        <div className="sheet__header">
          <div className="sheet__handle" />
          {title ? <div className="sheet__title">{title}</div> : null}
          {allowClose && (
            <button className="sheet__close" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          )}
        </div>
        <div className="sheet__body">
          {children}
        </div>
      </div>
    </div>
  );
}
