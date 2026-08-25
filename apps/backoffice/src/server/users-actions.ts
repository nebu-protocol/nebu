"use server";

import { revalidatePath } from "next/cache";

import { hashPassword, requireAdmin } from "@/server/auth";

import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = process.env.LPBOT_DB_PATH ?? resolve(process.cwd(), "../../data/lp.db");
const ROLES = ["admin", "member", "viewer"];

function withDb<T>(fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(DB_PATH);
  try {
    db.exec("PRAGMA busy_timeout = 3000");
    return fn(db);
  } finally {
    db.close();
  }
}

/** Buat user baru (admin). */
export async function createUserAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "viewer");
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) throw new Error("Username 3–32 (huruf, angka, _ . -).");
  if (password.length < 8) throw new Error("Password minimal 8 karakter.");
  if (!ROLES.includes(role)) throw new Error("Role tidak valid.");

  withDb((db) => {
    if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) {
      throw new Error("Username sudah dipakai.");
    }
    db.prepare("INSERT INTO users (username, pass_hash, role, blocked, created_at) VALUES (?, ?, ?, 0, ?)").run(
      username,
      hashPassword(password),
      role,
      Math.floor(Date.now() / 1000),
    );
  });
  revalidatePath("/dashboard/users");
}

/** Ubah role user (admin). */
export async function setUserRoleAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const username = String(formData.get("username") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!ROLES.includes(role)) throw new Error("Role tidak valid.");
  withDb((db) => db.prepare("UPDATE users SET role = ? WHERE username = ?").run(role, username));
  revalidatePath("/dashboard/users");
}

/** Reset password user (admin). */
export async function resetUserPasswordAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) throw new Error("Password minimal 8 karakter.");
  withDb((db) => db.prepare("UPDATE users SET pass_hash = ? WHERE username = ?").run(hashPassword(password), username));
  revalidatePath("/dashboard/users");
}

/** Blokir / buka blokir user (admin). Tidak boleh memblokir diri sendiri. */
export async function toggleBlockAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const username = String(formData.get("username") ?? "");
  if (username === session.username) throw new Error("Tidak bisa memblokir akun sendiri.");
  withDb((db) => db.prepare("UPDATE users SET blocked = 1 - blocked WHERE username = ?").run(username));
  revalidatePath("/dashboard/users");
}

/** Hapus user (admin). Tidak boleh menghapus diri sendiri; wallet-nya dilepas ownernya. */
export async function deleteUserAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const username = String(formData.get("username") ?? "");
  if (username === session.username) throw new Error("Tidak bisa menghapus akun sendiri.");
  withDb((db) => {
    db.prepare("UPDATE wallets SET automation = 0 WHERE owner = ?").run(username); // hentikan bot wallet-nya
    db.prepare("DELETE FROM users WHERE username = ?").run(username);
  });
  revalidatePath("/dashboard/users");
}
