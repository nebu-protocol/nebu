"use server";

import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { revalidatePath } from "next/cache";

import { getAgent } from "@/lib/agents";
import { getSiweAddress } from "@/server/siwe";

// "Hire" = grant sesi ber-scope pada vault sendiri (cap belanja + kadaluarsa). Non-custodial:
// LpVault on-chain yang menegakkan "gabisa narik" — tabel ini menyimpan scope + status.
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

function ensure(db: DatabaseSync) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS hires (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       owner TEXT NOT NULL, agent_id TEXT NOT NULL,
       cap_eth REAL NOT NULL, expiry_ts INTEGER NOT NULL,
       status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL
     )`,
  );
}

const now = () => Math.floor(Date.now() / 1000);

export interface ActiveHire {
  capEth: number;
  expiryTs: number;
  createdAt: number;
}

/** Sesi aktif user (SIWE) untuk agent tsb, atau null. Dipanggil dari server component. */
export async function getActiveHire(agentId: string): Promise<ActiveHire | null> {
  const owner = await getSiweAddress();
  if (!owner) return null;
  return withDb((db) => {
    ensure(db);
    const r = db
      .prepare(
        "SELECT cap_eth, expiry_ts, created_at FROM hires WHERE lower(owner)=? AND agent_id=? AND status='active' AND expiry_ts>? ORDER BY id DESC LIMIT 1",
      )
      .get(owner.toLowerCase(), agentId, now()) as { cap_eth: number; expiry_ts: number; created_at: number } | undefined;
    return r ? { capEth: r.cap_eth, expiryTs: r.expiry_ts, createdAt: r.created_at } : null;
  });
}

export async function hireAgentAction(agentId: string, capEth: number, days: number): Promise<{ ok: boolean; error?: string }> {
  const owner = await getSiweAddress();
  if (!owner) return { ok: false, error: "Connect and verify your wallet first." };
  const agent = getAgent(agentId);
  if (!agent) return { ok: false, error: "Unknown agent." };
  if (agent.status !== "live") return { ok: false, error: "This agent isn't live yet." };
  const cap = Number(capEth);
  const d = Math.round(Number(days));
  if (!Number.isFinite(cap) || cap <= 0 || cap > 1000) return { ok: false, error: "Budget must be between 0 and 1000 BNB." };
  if (!Number.isFinite(d) || d < 1 || d > 365) return { ok: false, error: "Duration must be 1–365 days." };

  withDb((db) => {
    ensure(db);
    db.prepare("UPDATE hires SET status='revoked' WHERE lower(owner)=? AND agent_id=? AND status='active'").run(owner.toLowerCase(), agentId);
    db.prepare("INSERT INTO hires(owner,agent_id,cap_eth,expiry_ts,status,created_at) VALUES(?,?,?,?,'active',?)").run(
      owner.toLowerCase(),
      agentId,
      cap,
      now() + d * 86400,
      now(),
    );
  });
  revalidatePath(`/marketplace/${agentId}`);
  return { ok: true };
}

export async function revokeHireAction(agentId: string): Promise<{ ok: boolean }> {
  const owner = await getSiweAddress();
  if (!owner) return { ok: false };
  withDb((db) => {
    ensure(db);
    db.prepare("UPDATE hires SET status='revoked' WHERE lower(owner)=? AND agent_id=? AND status='active'").run(owner.toLowerCase(), agentId);
  });
  revalidatePath(`/marketplace/${agentId}`);
  return { ok: true };
}
