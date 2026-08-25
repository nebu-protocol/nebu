import { cookies } from "next/headers";

import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = process.env.LPBOT_DB_PATH ?? resolve(process.cwd(), "../../data/lp.db");

export const SESSION_COOKIE = "lpbot_session";
const SESSION_TTL_S = 60 * 60 * 12; // 12 jam

export type Role = "admin" | "member" | "viewer";
export type Session = { username: string; role: Role };

const ROLES: Role[] = ["admin", "member", "viewer"];
const normalizeRole = (r: unknown): Role => (ROLES.includes(r as Role) ? (r as Role) : "viewer");

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.LPBOT_KEY_SECRET;
  if (!s) throw new Error("SESSION_SECRET (atau LPBOT_KEY_SECRET) belum di-set");
  return s;
}

/** Verifikasi login; balikkan role bila cocok, null bila gagal. */
export function verifyLogin(username: string, password: string): Role | null {
  const db = new DatabaseSync(DB_PATH);
  try {
    const row = db.prepare("SELECT pass_hash, role FROM users WHERE username = ?").get(username) as
      | { pass_hash: string; role: string }
      | undefined;
    if (!row) return null;
    const [v, saltHex, hashHex] = row.pass_hash.split(":");
    if (v !== "s1" || !saltHex || !hashHex) return null;
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), 32);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    return normalizeRole(row.role);
  } finally {
    db.close();
  }
}

const b64url = (b: Buffer) => b.toString("base64url");

/** Token sesi: base64url(payload).base64url(HMAC-SHA256). Payload memuat role. */
export function createSessionToken(username: string, role: Role): string {
  const payload = b64url(
    Buffer.from(JSON.stringify({ u: username, r: role, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S })),
  );
  const sig = b64url(createHmac("sha256", sessionSecret()).update(payload).digest());
  return `${payload}.${sig}`;
}

/** Verifikasi + decode cookie sesi (Node side, untuk server action). null bila invalid. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = b64url(createHmac("sha256", sessionSecret()).update(payload).digest());
  // konstan-waktu: bandingkan panjang lalu byte
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { u, r, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof exp !== "number" || exp <= Math.floor(Date.now() / 1000)) return null;
    return { username: String(u), role: normalizeRole(r) };
  } catch {
    return null;
  }
}

/** Guard: admin saja (pause bot, kelola user). */
export async function requireAdmin(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("Sesi tidak valid — silakan login ulang.");
  if (s.role !== "admin") throw new Error("Aksi ini hanya untuk admin.");
  return s;
}

/** Keputusan murni: boleh edit wallet? admin selalu; member hanya miliknya; viewer tak pernah. */
export function canEditWallet(role: Role, username: string, walletOwner: string | null): boolean {
  if (role === "admin") return true;
  if (role === "viewer") return false;
  return walletOwner !== null && walletOwner === username;
}

/** Guard: member atau admin (boleh pakai bot / kelola wallet sendiri). */
export async function requireMember(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("Sesi tidak valid — silakan login ulang.");
  if (s.role === "viewer") throw new Error("Akun viewer tidak bisa mengelola wallet.");
  return s;
}

export const sessionMaxAge = SESSION_TTL_S;
