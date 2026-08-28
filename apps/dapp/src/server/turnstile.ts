const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Site key (publik). Client baca NEXT_PUBLIC_TURNSTILE_SITE_KEY langsung; ini utk server. */
export function turnstileSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;
}

/**
 * Verifikasi token Turnstile ke Cloudflare (server-side, pakai SECRET_KEY).
 * Enforce HANYA kalau FULLY dikonfigurasi — SECRET_KEY *dan* NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * (kalau site key kosong widget tak render → tak ada token → jangan kunci login). Salah satu
 * kosong → dianggap lolos (dev / belum diaktifkan). Fully-set tapi token invalid → gagal.
 */
export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!secret || !siteKey) return true; // belum fully-configured → no-op (jangan kunci login)
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch(VERIFY_URL, { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false; // fail-closed pada error jaringan
  }
}
