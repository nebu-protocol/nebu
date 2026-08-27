"use server";

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { revalidatePath } from "next/cache";
import { createPublicClient, http, parseAbi } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";

import { getBalanceEth } from "@/lib/lpdata";
import type { RiskCustom } from "@/lib/risk";
import { encryptSecret, getKeySecret } from "@/server/lpbot-crypto";
import { getSiweAddress } from "@/server/siwe";

const DB_PATH = process.env.LPBOT_DB_PATH ?? resolve(process.cwd(), "../../data/lp.db");
const REPO = resolve(process.cwd(), "../..");

const VAULT_FACTORY = (process.env.NEXT_PUBLIC_LP_VAULT_FACTORY ?? "").toLowerCase();
const BSC_RPC = process.env.NEXT_PUBLIC_BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org";
const factoryAbi = parseAbi(["function vaultOf(address) view returns (address)"]);

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
 * Buat AGENT WALLET untuk owner (address SIWE terverifikasi). Bot generate keypair
 * baru — user TIDAK pernah paste private key-nya sendiri. User deposit ETH ke address
 * agent, bot LP dari saldo itu, withdraw balik ke owner. Key dienkripsi (AES-256-GCM).
 */
export async function createAgentAction(): Promise<void> {
  const owner = await requireSiwe();
  const secret = getKeySecret();
  if (!secret) throw new Error("Server belum dikonfigurasi (LPBOT_KEY_SECRET).");

  const pk = generatePrivateKey();
  const agent = privateKeyToAccount(pk).address.toLowerCase();
  const encPk = encryptSecret(pk, secret);
  const name = `agent ${agent.slice(0, 6)}…${agent.slice(-4)}`;

  withDb((db) => {
    const exists = db.prepare("SELECT 1 FROM wallets WHERE lower(owner) = ?").get(owner);
    if (exists) throw new Error("Kamu sudah punya agent wallet.");
    db.prepare(
      `INSERT INTO wallets (address, name, enc_pk, owner, fund_eth, max_per_pool_eth, automation, autoswap, created_at)
       VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?)`,
    ).run(agent, name, encPk, owner, Math.floor(Date.now() / 1000));
  });
  revalidatePath("/portfolio");
}

/**
 * Simpan alamat LpVault owner ke wallets.vault_address — SETELAH diverifikasi on-chain
 * bahwa factory.vaultOf(owner) == alamat itu (anti-spoof: user tak bisa set vault sembarang).
 * Begitu diset, bot menjalankan LP lewat vault (dana di vault, agent tak bisa kuras).
 */
export async function setVaultAddressAction(vaultAddress: string): Promise<void> {
  const owner = await requireSiwe();
  if (!VAULT_FACTORY) throw new Error("Factory vault belum dikonfigurasi di server.");
  if (!/^0x[0-9a-fA-F]{40}$/.test(vaultAddress)) throw new Error("Alamat vault tidak valid.");
  const client = createPublicClient({ chain: bsc, transport: http(BSC_RPC) });
  const onchain = (await client.readContract({
    address: VAULT_FACTORY as `0x${string}`,
    abi: factoryAbi,
    functionName: "vaultOf",
    args: [owner as `0x${string}`],
  })) as string;
  if (onchain.toLowerCase() !== vaultAddress.toLowerCase())
    throw new Error("Vault tidak cocok dengan factory untuk owner ini.");
  withDb((db) => {
    const w = db.prepare("SELECT address FROM wallets WHERE lower(owner) = ?").get(owner);
    if (!w) throw new Error("Buat agent wallet dulu.");
    db.prepare("UPDATE wallets SET vault_address = ? WHERE lower(owner) = ?").run(
      vaultAddress.toLowerCase(),
      owner,
    );
  });
  revalidatePath("/portfolio");
}

/** Set fund + toggle automation/autoswap untuk agent wallet owner. */
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
        "UPDATE wallets SET fund_eth = ?, max_per_pool_eth = ?, automation = ?, autoswap = ? WHERE lower(owner) = ?",
      )
      .run(fundEth, maxPerPoolEth, automation, autoswap, owner),
  );
  revalidatePath("/portfolio");
}

/** Aktifkan automation + set fund (dipanggil setelah deposit — "deposit sekalian automation"). */
export async function armAgentAction(fundEth: number): Promise<void> {
  const owner = await requireSiwe();
  if (!Number.isFinite(fundEth) || fundEth < 0) return;
  withDb((db) =>
    db
      .prepare("UPDATE wallets SET fund_eth = ?, automation = 1, autoswap = 1 WHERE lower(owner) = ?")
      .run(fundEth, owner),
  );
  revalidatePath("/portfolio");
}

/**
 * Tarik saldo agent wallet ke owner. Dijalankan di bot (decrypt + kirim tx di sana,
 * key tak pernah keluar ke web). Kosongkan amount = tarik semua idle (sisakan gas).
 */
export async function withdrawAction(formData: FormData): Promise<void> {
  const owner = await requireSiwe();
  const amount = String(formData.get("amountEth") ?? "").trim();
  const cmd = ["withdraw", owner];
  if (amount && Number(amount) > 0) cmd.push(amount);
  await new Promise<void>((res) => {
    const child = spawn(resolve(REPO, "node_modules/.bin/tsx"), [resolve(REPO, "apps/bot/src/index.ts"), ...cmd], {
      cwd: resolve(REPO, "apps/bot"),
      env: { ...process.env, DB_PATH },
      timeout: 120_000,
    });
    child.on("close", () => res());
    child.on("error", () => res());
  });
  revalidatePath("/portfolio");
}

/** Hentikan automation + hapus agent wallet owner. Ditolak kalau masih ada dana. */
export async function removeWalletAction(): Promise<void> {
  const owner = await requireSiwe();
  const wallet = await getOwnedWallet();
  if (wallet) {
    const bal = await getBalanceEth(wallet.address);
    // Sisa dust (≈ gas reserve) boleh; di atas itu = masih ada dana → withdraw dulu.
    if (bal !== null && bal > 0.0005)
      throw new Error("Masih ada dana di agent wallet — withdraw dulu sebelum hapus.");
  }
  withDb((db) => db.prepare("DELETE FROM wallets WHERE lower(owner) = ?").run(owner));
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

/** Spawn perintah bot (tsx CLI) — key & tx di bot, tak keluar ke web. */
async function spawnBot(cmd: string[], timeoutMs = 180_000): Promise<void> {
  await new Promise<void>((res) => {
    const child = spawn(
      resolve(REPO, "node_modules/.bin/tsx"),
      [resolve(REPO, "apps/bot/src/index.ts"), ...cmd],
      { cwd: resolve(REPO, "apps/bot"), env: { ...process.env, DB_PATH }, timeout: timeoutMs },
    );
    child.on("close", () => res());
    child.on("error", () => res());
  });
}

/** Tutup satu posisi LP (burn + swap token1→ETH balik). */
export async function closePositionAction(formData: FormData): Promise<void> {
  const owner = await requireSiwe();
  const poolId = String(formData.get("poolId") ?? "");
  if (!/^0x[0-9a-fA-F]{64}$/.test(poolId)) throw new Error("poolId tidak valid.");
  await spawnBot(["close", owner, poolId]);
  revalidatePath("/portfolio");
}

/** Cabut SEMUA LP (burn+swap balik) lalu withdraw seluruh saldo ke owner. */
export async function closeAllAndWithdrawAction(): Promise<void> {
  const owner = await requireSiwe();
  await spawnBot(["close", owner]); // burn semua + swap token1→ETH
  await spawnBot(["withdraw", owner]); // tarik semua idle ke owner
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
  risk_profile: string | null;
  risk_stop_loss: number | null;
  risk_price_stop: number | null;
  risk_tp_arm: number | null;
  risk_tp_trail: number | null;
  deposited_eth: number | null; // total ETH disetor owner (ledger on-chain)
  withdrawn_eth: number | null; // total ETH ditarik ke owner
  token_holdings_eth: number | null; // nilai ETH token ERC20 lepas (stuck/sisa mint)
  vault_address: string | null; // LpVault owner (BSC) — kalau diset, bot LP lewat vault
} | null;

export async function getOwnedWallet(): Promise<OwnedWallet> {
  const owner = await getSiweAddress();
  if (!owner) return null;
  return withDb((db) => {
    const w = db
      .prepare(
        `SELECT address, name, fund_eth, max_per_pool_eth, automation, autoswap,
                risk_profile, risk_stop_loss, risk_price_stop, risk_tp_arm, risk_tp_trail,
                deposited_eth, withdrawn_eth, token_holdings_eth, vault_address
         FROM wallets WHERE lower(owner) = ?`,
      )
      .get(owner) as OwnedWallet;
    return w ? { ...w } : null;
  });
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/**
 * Set profil risk manager agent wallet: safe (default) / aggressive / custom.
 * Bot (exit-manager) baca kolom ini per-wallet. Custom di-clamp ke rentang aman.
 */
export async function setRiskProfileAction(
  profile: "safe" | "aggressive" | "custom",
  custom?: RiskCustom,
): Promise<void> {
  const owner = await requireSiwe();
  if (profile === "custom") {
    if (!custom) return;
    const sl = clamp(Number(custom.stopLoss), -90, -1);
    const ps = clamp(Number(custom.priceStop), 1, 90);
    const arm = clamp(Number(custom.tpArm), 1, 500);
    const trail = clamp(Number(custom.tpTrail), 1, 200);
    if ([sl, ps, arm, trail].some((v) => !Number.isFinite(v))) return;
    withDb((db) =>
      db
        .prepare(
          "UPDATE wallets SET risk_profile='custom', risk_stop_loss=?, risk_price_stop=?, risk_tp_arm=?, risk_tp_trail=? WHERE lower(owner) = ?",
        )
        .run(sl, ps, arm, trail, owner),
    );
  } else if (profile === "safe" || profile === "aggressive") {
    withDb((db) =>
      db
        .prepare(
          "UPDATE wallets SET risk_profile=?, risk_stop_loss=NULL, risk_price_stop=NULL, risk_tp_arm=NULL, risk_tp_trail=NULL WHERE lower(owner) = ?",
        )
        .run(profile, owner),
    );
  }
  revalidatePath("/portfolio");
}
