"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useSheetBehavior } from "@/hooks/use-sheet";

const EXIT_MS = 200; // keep in sync with duration-200 below

/**
 * Bottom sheet with slide-up/fade in-out transitions. Stays mounted while
 * the exit transition plays; scroll lock + Escape come from
 * useSheetBehavior. Honors prefers-reduced-motion via motion-reduce.
 */
export function Sheet({
  open,
  onClose,
  closeLabel,
  className = "",
  panelClassName = "",
  children,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  closeLabel: string;
  className?: string;
  panelClassName?: string;
  children: React.ReactNode;
}>) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useSheetBehavior(open, onClose);

  // Render-phase adjustment (not an effect): mount in the same pass the
  // sheet opens so the panel exists before the enter transition starts.
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open) {
      // Double rAF: the panel must paint off-screen once before the
      // transition class flips, or the browser skips the animation.
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(raf);
    }
    const raf = requestAnimationFrame(() => setShown(false));
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [open]);

  if (!mounted) return null;
  // Portal to <body>: rendered in place, ancestors with z-index/transform
  // (sticky header, fixed bars) would trap the sheet in their stacking
  // context and paint over it.
  return createPortal(
    <div className={`fixed inset-0 z-50 ${className}`} role="dialog" aria-modal>
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 rounded-t-3xl bg-white transition-transform duration-200 ease-out motion-reduce:transition-none ${
          shown ? "translate-y-0" : "translate-y-full"
        } ${panelClassName}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
