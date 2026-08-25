"use client";

import Script from "next/script";

/**
 * Widget Cloudflare Turnstile. Menyisipkan hidden input cf-turnstile-response
 * yang diverifikasi server. Kalau siteKey kosong (Turnstile nonaktif), tak render apa-apa.
 */
export function TurnstileWidget({ siteKey }: { siteKey: string | null }) {
  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div className="cf-turnstile" data-sitekey={siteKey} data-theme="auto" />
    </>
  );
}
