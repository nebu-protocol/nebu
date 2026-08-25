const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Site key (publik, aman dikirim ke client). Kosong = Turnstile nonaktif. */
export function turnstileSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY || null;
}

/**
 * Verifikasi token Turnstile ke Cloudflare (server-side, pakai SECRET_KEY).
 * Kalau SECRET_KEY tidak di-set → dianggap lolos (mis. dev lokal).
 * Kalau di-set tapi token kosong/invalid → gagal.
 */
export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // Turnstile nonaktif
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
