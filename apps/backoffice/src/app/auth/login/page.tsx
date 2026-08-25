import type { Metadata } from "next";

import { LoginPanel } from "./login-panel";

export const metadata: Metadata = { title: "Login" };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <LoginPanel />
    </div>
  );
}
