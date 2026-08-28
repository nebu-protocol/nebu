"use client";

import { useState } from "react";

import { useT } from "@/lib/i18n-client";
import { signOutAction } from "@/server/wallet-actions";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Info agent wallet (address + copy + owner + sign out) — di samping kartu status bot. */
export function AgentInfo({ agent, owner }: { agent: string; owner: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard?.writeText(agent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });

  return (
    <div className="flex flex-col gap-1 text-xs sm:items-end">
      <div className="flex items-center gap-2">
        <span className="text-soft">{t("Agent")}</span>
        <code className="font-mono">{short(agent)}</code>
        <button
          type="button"
          onClick={copy}
          className="rounded border border-line/60 px-2 py-0.5 hover:bg-shade"
        >
          {copied ? t("copied") : t("copy")}
        </button>
        <form action={signOutAction}>
          <button type="submit" className="text-red-600 hover:underline">
            {t("disconnect")}
          </button>
        </form>
      </div>
      <span className="text-soft">
        {t("owner")} {owner.slice(0, 6)}…{owner.slice(-4)} · {t("withdraw balik ke sini")}
      </span>
    </div>
  );
}
