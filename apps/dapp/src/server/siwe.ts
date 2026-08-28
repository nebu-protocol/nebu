import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { verifyMessage } from "viem";

export const SIWE_SESSION = "lp_siwe";
export const SIWE_NONCE = "lp_siwe_nonce";
const TTL_S = 60 * 60 * 6; // 6 jam

function secret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.LPBOT_KEY_SECRET;
  if (!s) throw new Error("SESSION_SECRET belum di-set");
  return s;
}

const DOMAIN = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nebu.ifajar.dev";

/** Pesan yang ditandatangani wallet — mengikat address + nonce + domain. */
export function siweMessage(address: string, nonce: string): string {
  return `Nebu ingin memverifikasi kepemilikan wallet ini.\n\nAddress: ${address}\nDomain: ${DOMAIN}\nNonce: ${nonce}\n\nTanda tangan ini tidak memicu transaksi apa pun.`;
}

export async function issueNonce(): Promise<string> {
  const nonce = randomBytes(16).toString("hex");
  (await cookies()).set(SIWE_NONCE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  return nonce;
}

const b64url = (b: Buffer) => b.toString("base64url");

function makeSession(address: string): string {
  const payload = b64url(Buffer.from(JSON.stringify({ a: address.toLowerCase(), exp: Math.floor(Date.now() / 1000) + TTL_S })));
  const sig = b64url(createHmac("sha256", secret()).update(payload).digest());
  return `${payload}.${sig}`;
}

/** Verifikasi signature terhadap nonce cookie; set session bila valid. */
export async function verifySiwe(address: string, signature: `0x${string}`): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false;
  const jar = await cookies();
  const nonce = jar.get(SIWE_NONCE)?.value;
  if (!nonce) return false;
  const ok = await verifyMessage({
    address: address as `0x${string}`,
    message: siweMessage(address, nonce),
    signature,
  }).catch(() => false);
  if (!ok) return false;
  jar.delete(SIWE_NONCE);
  jar.set(SIWE_SESSION, makeSession(address), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_S,
  });
  return true;
}

/** Address yang terverifikasi SIWE (lowercase), atau null. */
export async function getSiweAddress(): Promise<string | null> {
  const token = (await cookies()).get(SIWE_SESSION)?.value;
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const expected = b64url(createHmac("sha256", secret()).update(payload).digest());
  const a = Buffer.from(token.slice(dot + 1));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { a: addr, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof exp !== "number" || exp <= Math.floor(Date.now() / 1000)) return null;
    return String(addr).toLowerCase();
  } catch {
    return null;
  }
}

export async function signOutSiwe(): Promise<void> {
  (await cookies()).delete(SIWE_SESSION);
}
