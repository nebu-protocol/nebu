"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/server/auth";

import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = process.env.LPBOT_DB_PATH ?? resolve(process.cwd(), "../../data/lp.db");

/** Kill switch bot LP: strategist berhenti mengambil keputusan baru saat paused. ADMIN ONLY. */
export async function toggleLpbotPause(): Promise<void> {
  await requireAdmin();
  const db = new DatabaseSync(DB_PATH);
  try {
    db.exec("PRAGMA busy_timeout = 3000");
    const current = (db.prepare("SELECT value FROM meta WHERE key = 'paused'").get() as { value: string } | undefined)
      ?.value;
    const next = current === "1" ? "0" : "1";
    db.prepare(
      "INSERT INTO meta (key, value) VALUES ('paused', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(next);
  } finally {
    db.close();
  }
  revalidatePath("/dashboard/lpbot");
}
