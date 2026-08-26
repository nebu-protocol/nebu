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
 * Widget Cloudflare Turnstile dengan render EKSPLISIT (?render=explicit).
 * Auto-render bawaan hanya jalan saat full page load; render manual di useEffect
 * membuat widget muncul juga saat navigasi client-side (login <-> daftar).
 * Menyisipkan hidden input cf-turnstile-response yang diverifikasi server.
 */
export function TurnstileWidget({ siteKey }: { siteKey: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    const tryRender = () => {
      if (cancelled || !ref.current || widgetId.current || !window.turnstile) return false;
      widgetId.current = window.turnstile.render(ref.current, { sitekey: siteKey, theme: "auto" });
      return true;
    };

    // Script mungkin belum siap saat mount — poll sampai window.turnstile ada.
    const iv = tryRender() ? null : setInterval(() => tryRender() && iv && clearInterval(iv), 150);

    return () => {
      cancelled = true;
      if (iv) clearInterval(iv);
      // biome-ignore lint/suspicious/noUnnecessaryConditions: widgetId.current di-set di dalam closure tryRender yang tak dilacak analisis alur biome (bukan selalu null)
      if (widgetId.current) {
        try {
          window.turnstile?.remove(widgetId.current);
        } catch {
          // widget sudah hilang — abaikan
        }
        widgetId.current = null;
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      <div ref={ref} />
    </>
  );
}
