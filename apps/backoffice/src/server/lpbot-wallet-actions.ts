"use server";

import { revalidatePath } from "next/cache";

import { privateKeyToAccount } from "viem/accounts";

import { encryptSecret, getKeySecret } from "@/server/lpbot-crypto";

import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = process.env.LPBOT_DB_PATH ?? resolve(process.cwd(), "../../data/lp.db");

function withDb<T>(fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(DB_PATH);
  try {
    db.exec("PRAGMA busy_timeout = 3000");
    return fn(db);
  } finally {
    db.close();
  }
}

/**
 * Tambah wallet: paste private key, atau kosongkan untuk generate baru.
 * Key langsung dienkripsi (AES-256-GCM) — plaintext tidak pernah disimpan/di-log.
 */
export async function addLpbotWallet(formData: FormData): Promise<void> {
  const secret = getKeySecret();
  if (!secret) throw new Error("Set LPBOT_KEY_SECRET di .env root dulu (string acak panjang).");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Nama wallet wajib diisi.");

  let pk = String(formData.get("privateKey") ?? "").trim();
  if (pk === "") pk = `0x${randomBytes(32).toString("hex")}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("Private key harus 0x + 64 hex.");

  const address = privateKeyToAccount(pk as `0x${string}`).address.toLowerCase();
  const encPk = encryptSecret(pk, secret);
  pk = "";

  withDb((db) =>
    db
      .prepare(
        `INSERT INTO wallets (address, name, enc_pk, fund_eth, max_per_pool_eth, automation, autoswap, created_at)
         VALUES (?, ?, ?, 0, 0, 0, 0, ?)`,
      )
      .run(address, name, encPk, Math.floor(Date.now() / 1000)),
  );
  revalidatePath("/dashboard/lpbot");
}

/** Update fund cap + toggle automation/autoswap satu wallet. */
export async function updateLpbotWallet(formData: FormData): Promise<void> {
  const address = String(formData.get("address") ?? "").toLowerCase();
  const fundEth = Number(formData.get("fundEth") ?? 0);
  const maxPerPoolEth = Number(formData.get("maxPerPoolEth") ?? 0);
  const automation = formData.get("automation") === "on" ? 1 : 0;
  const autoswap = formData.get("autoswap") === "on" ? 1 : 0;
  if (!address || !Number.isFinite(fundEth) || !Number.isFinite(maxPerPoolEth) || fundEth < 0 || maxPerPoolEth < 0)
    throw new Error("Input tidak valid.");

  withDb((db) =>
    db
      .prepare("UPDATE wallets SET fund_eth = ?, max_per_pool_eth = ?, automation = ?, autoswap = ? WHERE address = ?")
      .run(fundEth, maxPerPoolEth, automation, autoswap, address),
  );
  revalidatePath("/dashboard/lpbot");
}

/** Hapus wallet dari DB. Key ikut terhapus — pastikan sudah dibackup di tempat lain. */
export async function deleteLpbotWallet(formData: FormData): Promise<void> {
  const address = String(formData.get("address") ?? "").toLowerCase();
  if (!address) throw new Error("Alamat kosong.");
  withDb((db) => db.prepare("DELETE FROM wallets WHERE address = ?").run(address));
  revalidatePath("/dashboard/lpbot");
}
