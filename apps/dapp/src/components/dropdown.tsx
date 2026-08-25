"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { useOutsideClick } from "@/hooks/use-outside-click";

export type DropdownOption = { value: string; label: React.ReactNode };

/** Move focus through the open menu's items, wrapping at the ends. */
function moveMenuFocus(root: HTMLElement | null, step: number) {
  const items = [...(root?.querySelectorAll<HTMLButtonElement>("[data-menu] button") ?? [])];
  if (items.length === 0) return;
  const idx = items.indexOf(document.activeElement as HTMLButtonElement);
  items[(idx + step + items.length) % items.length].focus();
}

export function Dropdown({
  value,
  options,
  onChange,
  buttonClassName = "",
  buttonLabel,
}: Readonly<{
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  buttonClassName?: string;
  /** Fixed trigger content (e.g. an icon) instead of the selected label. */
  buttonLabel?: React.ReactNode;
}>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setOpen(false), []);
  useOutsideClick(ref, closeMenu, open);

  const current = options.find((o) => o.value === value);

  // Keyboard support: Escape dismisses (focus returns to the trigger),
  // arrow keys move between menu items.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      setOpen(false);
      buttonRef.current?.focus();
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && open) {
      e.preventDefault();
      moveMenuFocus(ref.current, e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keyboard dismissal/roving focus for the popover; the trigger button is the interactive element
    <div ref={ref} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex items-center gap-1.5 ${buttonClassName}`}
      >
        {buttonLabel ?? current?.label ?? value}
        <ChevronDown size={15} strokeWidth={2} className="text-soft" />
      </button>
      {open && (
        <div
          data-menu
          className="absolute right-0 z-30 mt-2 min-w-44 rounded-2xl border border-line bg-white py-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.10)]"
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
                buttonRef.current?.focus();
              }}
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-shade ${
                o.value === value ? "font-medium text-ink" : "text-body"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
