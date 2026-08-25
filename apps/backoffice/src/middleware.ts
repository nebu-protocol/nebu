import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Gerbang auth multi-user untuk SELURUH app — panel ini mengelola wallet/key,
 * tidak boleh publik. Cek cookie sesi (HMAC + expiry) pakai Web Crypto (edge-safe).
 * FAIL CLOSED: tanpa SESSION_SECRET, semua ditolak.
 */
const SESSION_COOKIE = "lpbot_session";

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function validSession(token: string, secret: string): Promise<boolean> {
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    b64urlToBytes(sig) as BufferSource,
    new TextEncoder().encode(payload) as BufferSource,
  );
  if (!ok) return false;
  try {
    const { exp } = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
    return typeof exp === "number" && exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const secret = process.env.SESSION_SECRET ?? process.env.LPBOT_KEY_SECRET;
  if (!secret) {
    return new NextResponse("SESSION_SECRET belum di-set di server (fail-closed).", { status: 503 });
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await validSession(token, secret))) return NextResponse.next();

  // API → 401 JSON; halaman → redirect ke login
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/auth/login";
  url.search = "";
  return NextResponse.redirect(url);
}

// Lindungi semua kecuali login, aset statis, dan file publik ringan.
export const config = {
  matcher: [
    "/((?!auth/login|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|icon-192.png|icon-512.png|manifest.webmanifest|robots.txt).*)",
  ],
};
