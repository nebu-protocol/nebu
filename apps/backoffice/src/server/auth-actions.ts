"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createSessionToken, SESSION_COOKIE, sessionMaxAge, verifyLogin } from "@/server/auth";

export async function loginAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return "Username dan password wajib diisi.";
  const role = verifyLogin(username, password);
  if (!role) return "Username atau password salah.";

  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(username, role), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAge,
  });
  redirect("/dashboard/lpbot");
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/auth/login");
}
