"use client";

import { useFormStatus } from "react-dom";

import { useT } from "@/lib/i18n-client";

/** Tombol submit dengan feedback pending (server action bisa makan beberapa detik). */
export function SubmitButton({
  children,
  pendingText,
  disabled,
  className,
  title,
}: {
  children: React.ReactNode;
  pendingText?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" disabled={disabled || pending} className={className} title={title}>
      {pending ? (pendingText ?? t("Processing…")) : children}
    </button>
  );
}
