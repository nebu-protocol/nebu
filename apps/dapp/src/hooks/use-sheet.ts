"use client";

import { useEffect } from "react";

/**
 * Shared modal-sheet behavior: lock body scroll while open and close on
 * Escape. (Full focus trapping is a known gap — evergreen screen readers
 * handle aria-modal, but keyboard focus can still leave the sheet.)
 */
export function useSheetBehavior(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
}
