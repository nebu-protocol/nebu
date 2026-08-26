"use client";

import { useEffect, useState } from "react";

import { GeneratedAvatar } from "@/components/generated-avatar";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Judul halaman portfolio: Welcome + jam hidup (client), ganti teks "Portfolio". */
export function WelcomeHeader({ address }: { address: string }) {
  const [now, setNow] = useState("");
  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const date = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      const time = d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      return `${date} at ${time}`;
    };
    setNow(fmt());
    const id = setInterval(() => setNow(fmt()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <GeneratedAvatar name={address} size={40} />
        <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
          Welcome, <span className="font-mono">{short(address)}</span>
        </h1>
      </div>
      <span className="hidden whitespace-nowrap text-sm text-soft sm:block">{now}</span>
    </div>
  );
}
