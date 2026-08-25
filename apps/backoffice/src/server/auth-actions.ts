"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { createSessionToken, registerUser, SESSION_COOKIE, sessionMaxAge, verifyLogin } from "@/server/auth";
import { verifyTurnstile } from "@/server/turnstile";

async function clientIp(): Promise<string | undefined> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
}

async function setSession(username: string, role: "admin" | "member" | "viewer") {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(username, role), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAge,
  });
}

export async function loginAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const token = String(formData.get("cf-turnstile-response") ?? "");
  if (!username || !password) return "Username dan password wajib diisi.";
  if (!(await verifyTurnstile(token, await clientIp()))) return "Verifikasi anti-bot gagal, coba lagi.";
  const role = verifyLogin(username, password);
  if (!role) return "Username atau password salah.";

  await setSession(username, role);
  redirect("/dashboard/lpbot");
}

export async function registerAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const token = String(formData.get("cf-turnstile-response") ?? "");
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) return "Username 3–32 karakter (huruf, angka, _ . -).";
  if (password.length < 8) return "Password minimal 8 karakter.";
  if (!(await verifyTurnstile(token, await clientIp()))) return "Verifikasi anti-bot gagal, coba lagi.";

  const r = registerUser(username, password);
  if (!r.ok) return r.error ?? "Registrasi gagal.";

  await setSession(username, "member");
  redirect("/dashboard/lpbot");
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/auth/login");
}
