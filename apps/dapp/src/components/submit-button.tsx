"use client";

import { useFormStatus } from "react-dom";

/** Tombol submit dengan feedback pending (server action bisa makan beberapa detik). */
export function SubmitButton({
  children,
  pendingText,
  disabled,
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className={className}>
      {pending ? (pendingText ?? "Memproses…") : children}
    </button>
  );
}
