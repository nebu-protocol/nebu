"use client";

import { useEffect, useRef } from "react";

import Script from "next/script";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Widget Cloudflare Turnstile, render eksplisit (aman untuk navigasi client-side).
 * onToken menerima token saat verifikasi berhasil.
 */
export function TurnstileWidget({
  siteKey,
  onToken,
}: {
  siteKey: string | null;
  onToken?: (token: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    const tryRender = () => {
      if (cancelled || !ref.current || widgetId.current || !window.turnstile) return false;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        theme: "auto",
        callback: (token: string) => cb.current?.(token),
      });
      return true;
    };
    const iv = tryRender() ? null : setInterval(() => tryRender() && iv && clearInterval(iv), 150);
    return () => {
      cancelled = true;
      if (iv) clearInterval(iv);
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* sudah hilang */
        }
        widgetId.current = null;
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />
      <div ref={ref} />
    </>
  );
}
