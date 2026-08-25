"use server";

import { revalidatePath } from "next/cache";

import { privateKeyToAccount } from "viem/accounts";

import { canEditWallet, requireMember, type Session } from "@/server/auth";
import { encryptSecret, getKeySecret } from "@/server/lpbot-crypto";

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = process.env.LPBOT_DB_PATH ?? resolve(process.cwd(), "../../data/lp.db");
const REPO = resolve(process.cwd(), "../..");

/**
 * Jalankan executor bot sekali sekarang (tanpa nunggu siklus 1 jam).
 * Spawn `tsx apps/bot/src/index.ts execute`. Idempotent (executor dedup per
 * wallet+pool), jadi aman diklik berkali-kali. Tetap hormati EXECUTOR_LIVE.
 */
export async function executeNowAction(): Promise<void> {
  await requireMember();
  await new Promise<void>((res) => {
    const child = spawn(resolve(REPO, "node_modules/.bin/tsx"), [resolve(REPO, "apps/bot/src/index.ts"), "execute"], {
      cwd: resolve(REPO, "apps/bot"),
      env: { ...process.env, DB_PATH },
      timeout: 90_000,
    });
    child.on("close", () => res());
    child.on("error", () => res());
  });
  revalidatePath("/dashboard/lpbot");
}

function withDb<T>(fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(DB_PATH);
  try {
    db.exec("PRAGMA busy_timeout = 3000");
    return fn(db);
  } finally {
    db.close();
  }
}

/** Pastikan sesi boleh mengubah wallet ini: admin bebas, member hanya miliknya. */
function assertCanEdit(db: DatabaseSync, address: string, session: Session) {
  const row = db.prepare("SELECT owner FROM wallets WHERE address = ?").get(address) as
    | { owner: string | null }
    | undefined;
  if (!row) throw new Error("Wallet tidak ditemukan.");
  if (!canEditWallet(session.role, session.username, row.owner)) throw new Error("Bukan wallet milikmu.");
}

/**
 * Tambah wallet: paste private key, atau kosongkan untuk generate baru.
 * Key langsung dienkripsi (AES-256-GCM) — plaintext tidak pernah disimpan/di-log.
 * Member+admin saja; wallet dimiliki oleh pembuatnya.
 */
export async function addLpbotWallet(formData: FormData): Promise<void> {
  const session = await requireMember();
  const secret = getKeySecret();
  if (!secret) throw new Error("Set LPBOT_KEY_SECRET di .env server dulu.");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Nama wallet wajib diisi.");

  let pk = String(formData.get("privateKey") ?? "").trim();
  if (pk === "") pk = `0x${randomBytes(32).toString("hex")}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("Private key harus 0x + 64 hex.");

  const address = privateKeyToAccount(pk as `0x${string}`).address.toLowerCase();
  const encPk = encryptSecret(pk, secret);
  pk = "";

  withDb((db) => {
    // wallet unik: satu address hanya boleh dimiliki satu user
    const existing = db.prepare("SELECT owner FROM wallets WHERE address = ?").get(address) as
      | { owner: string | null }
      | undefined;
    if (existing) {
      throw new Error(
        existing.owner === session.username
          ? "Wallet ini sudah kamu tambahkan."
          : "Wallet ini sudah dipakai user lain.",
      );
    }
    db.prepare(
      `INSERT INTO wallets (address, name, enc_pk, owner, fund_eth, max_per_pool_eth, automation, autoswap, created_at)
       VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?)`,
    ).run(address, name, encPk, session.username, Math.floor(Date.now() / 1000));
  });
  revalidatePath("/dashboard/lpbot");
}

/** Update fund cap + toggle automation/autoswap. Admin bebas; member hanya wallet miliknya. */
export async function updateLpbotWallet(formData: FormData): Promise<void> {
  const session = await requireMember();
  const address = String(formData.get("address") ?? "").toLowerCase();
  const fundEth = Number(formData.get("fundEth") ?? 0);
  const maxPerPoolEth = Number(formData.get("maxPerPoolEth") ?? 0);
  const automation = formData.get("automation") === "on" ? 1 : 0;
  const autoswap = formData.get("autoswap") === "on" ? 1 : 0;
  if (!address || !Number.isFinite(fundEth) || !Number.isFinite(maxPerPoolEth) || fundEth < 0 || maxPerPoolEth < 0)
    throw new Error("Input tidak valid.");

  withDb((db) => {
    assertCanEdit(db, address, session);
    db.prepare(
      "UPDATE wallets SET fund_eth = ?, max_per_pool_eth = ?, automation = ?, autoswap = ? WHERE address = ?",
    ).run(fundEth, maxPerPoolEth, automation, autoswap, address);
  });
  revalidatePath("/dashboard/lpbot");
}

/** Hapus wallet. Admin bebas; member hanya wallet miliknya. */
export async function deleteLpbotWallet(formData: FormData): Promise<void> {
  const session = await requireMember();
  const address = String(formData.get("address") ?? "").toLowerCase();
  if (!address) throw new Error("Alamat kosong.");
  withDb((db) => {
    assertCanEdit(db, address, session);
    db.prepare("DELETE FROM wallets WHERE address = ?").run(address);
  });
  revalidatePath("/dashboard/lpbot");
}
