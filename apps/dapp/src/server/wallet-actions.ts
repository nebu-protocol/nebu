"use server";

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { revalidatePath } from "next/cache";
import { privateKeyToAccount } from "viem/accounts";

import { encryptSecret, getKeySecret } from "@/server/lpbot-crypto";
import { getSiweAddress } from "@/server/siwe";

const DB_PATH = process.env.LPBOT_DB_PATH ?? resolve(process.cwd(), "../../data/lp.db");
const REPO = resolve(process.cwd(), "../..");

function withDb<T>(fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(DB_PATH);
  try {
    db.exec("PRAGMA busy_timeout = 3000");
    return fn(db);
  } finally {
    db.close();
  }
}

async function requireSiwe(): Promise<string> {
  const addr = await getSiweAddress();
  if (!addr) throw new Error("Verifikasi wallet dulu (sign message).");
  return addr;
}

/**
 * Aktifkan automation untuk wallet yang di-sign. Private key yang di-paste HARUS
 * menurunkan ke address SIWE (kamu hanya bisa menambah wallet yang kamu kendalikan).
 * Key dienkripsi (AES-256-GCM) sebelum disimpan.
 */
export async function addWalletAction(formData: FormData): Promise<void> {
  const owner = await requireSiwe();
  const secret = getKeySecret();
  if (!secret) throw new Error("Server belum dikonfigurasi (LPBOT_KEY_SECRET).");

  let pk = String(formData.get("privateKey") ?? "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("Private key harus 0x + 64 hex.");
  const derived = privateKeyToAccount(pk as `0x${string}`).address.toLowerCase();
  if (derived !== owner) {
    pk = "";
    throw new Error("Private key ini bukan untuk wallet yang kamu sign. Paste key wallet yang di-connect.");
  }
  const encPk = encryptSecret(pk, secret);
  pk = "";
  const name = String(formData.get("name") ?? "").trim() || `${derived.slice(0, 6)}…${derived.slice(-4)}`;

  withDb((db) => {
    const exists = db.prepare("SELECT 1 FROM wallets WHERE address = ?").get(derived);
    if (exists) throw new Error("Wallet ini sudah terdaftar.");
    db.prepare(
      `INSERT INTO wallets (address, name, enc_pk, owner, fund_eth, max_per_pool_eth, automation, autoswap, created_at)
       VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?)`,
    ).run(derived, name, encPk, owner, Math.floor(Date.now() / 1000));
  });
  revalidatePath("/portfolio");
}

/** Set fund + toggle automation/autoswap untuk wallet SIWE. */
export async function updateWalletAction(formData: FormData): Promise<void> {
  const owner = await requireSiwe();
  const fundEth = Number(formData.get("fundEth") ?? 0);
  const maxPerPoolEth = Number(formData.get("maxPerPoolEth") ?? 0);
  const automation = formData.get("automation") === "on" ? 1 : 0;
  const autoswap = formData.get("autoswap") === "on" ? 1 : 0;
  if (!Number.isFinite(fundEth) || !Number.isFinite(maxPerPoolEth) || fundEth < 0 || maxPerPoolEth < 0)
    throw new Error("Input tidak valid.");
  withDb((db) =>
    db
      .prepare(
        "UPDATE wallets SET fund_eth = ?, max_per_pool_eth = ?, automation = ?, autoswap = ? WHERE lower(address) = ?",
      )
      .run(fundEth, maxPerPoolEth, automation, autoswap, owner),
  );
  revalidatePath("/portfolio");
}

/** Hentikan automation + hapus wallet SIWE. */
export async function removeWalletAction(): Promise<void> {
  const owner = await requireSiwe();
  withDb((db) => db.prepare("DELETE FROM wallets WHERE lower(address) = ?").run(owner));
  revalidatePath("/portfolio");
}

/** Jalankan executor sekarang (idempotent; hormati EXECUTOR_LIVE). */
export async function executeNowAction(): Promise<void> {
  await requireSiwe();
  await new Promise<void>((res) => {
    const child = spawn(
      resolve(REPO, "node_modules/.bin/tsx"),
      [resolve(REPO, "apps/bot/src/index.ts"), "execute"],
      { cwd: resolve(REPO, "apps/bot"), env: { ...process.env, DB_PATH }, timeout: 90_000 },
    );
    child.on("close", () => res());
    child.on("error", () => res());
  });
  revalidatePath("/portfolio");
}

export async function signOutAction(): Promise<void> {
  const { signOutSiwe } = await import("@/server/siwe");
  await signOutSiwe();
  revalidatePath("/portfolio");
}

// Bisa dipakai server component untuk baca wallet milik address SIWE (tanpa enc_pk).
export type OwnedWallet = {
  address: string;
  name: string;
  fund_eth: number;
  max_per_pool_eth: number;
  automation: number;
  autoswap: number;
} | null;

export async function getOwnedWallet(): Promise<OwnedWallet> {
  const owner = await getSiweAddress();
  if (!owner) return null;
  return withDb((db) => {
    const w = db
      .prepare(
        "SELECT address, name, fund_eth, max_per_pool_eth, automation, autoswap FROM wallets WHERE lower(address) = ?",
      )
      .get(owner) as OwnedWallet;
    return w ? { ...w } : null;
  });
}
