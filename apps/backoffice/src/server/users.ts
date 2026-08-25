import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = process.env.LPBOT_DB_PATH ?? resolve(process.cwd(), "../../data/lp.db");

export type LpUser = {
  username: string;
  role: string;
  blocked: number;
  created_at: number;
  wallet_count: number;
};

/** Daftar semua user + jumlah wallet mereka. Dipanggil hanya dari halaman admin. */
export function listUsers(): LpUser[] {
  const db = new DatabaseSync(DB_PATH);
  try {
    return (
      db
        .prepare(
          `SELECT u.username, u.role, u.blocked, u.created_at,
                  (SELECT COUNT(*) FROM wallets w WHERE w.owner = u.username) AS wallet_count
           FROM users u ORDER BY u.created_at`,
        )
        .all() as LpUser[]
    ).map((r) => ({ ...r }));
  } finally {
    db.close();
  }
}
