import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Enkripsi private key — format & derivasi HARUS identik dengan
 * apps/bot/src/core/crypto.ts (bot yang men-decrypt). Backoffice hanya
 * meng-enkripsi; decrypt sengaja tidak ada di sini.
 */
const SALT = "lpbot-wallet-v1";

export function getKeySecret(): string | undefined {
  if (process.env.LPBOT_KEY_SECRET) return process.env.LPBOT_KEY_SECRET;
  // Next hanya load .env milik app — fallback baca .env root monorepo
  try {
    const txt = readFileSync(resolve(process.cwd(), "../../.env"), "utf8");
    return txt.match(/^LPBOT_KEY_SECRET=(.*)$/m)?.[1]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function encryptSecret(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(secret, SALT, 32), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}
