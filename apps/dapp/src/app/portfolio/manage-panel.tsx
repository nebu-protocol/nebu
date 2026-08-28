"use client";

import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChainIcon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { Toggle } from "@/components/toggle";
import { ACTIVE_CHAIN, NATIVE } from "@/lib/chain";
import { useT } from "@/lib/i18n-client";
import type { OwnedWallet } from "@/server/wallet-actions";
import {
  armAgentAction,
  closeAllAndWithdrawAction,
  createAgentAction,
  executeNowAction,
  removeWalletAction,
  updateWalletAction,
  withdrawAction,
} from "@/server/wallet-actions";

const fmtUsd = (n: number) =>
  n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `$${n.toFixed(2)}`;

/** Desimal ETH menyesuaikan besar saldo — saldo kecil butuh lebih banyak angka. */
const fmtEth = (n: number) => {
  const a = Math.abs(n);
  const dp = a === 0 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : a >= 0.0001 ? 6 : 8;
  return n.toFixed(dp);
};
const fmtApr = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: n >= 100 ? 0 : 2 })}%`;

// Sisakan gas saat MAX deposit (tx dikirim dari wallet owner).
const DEPOSIT_GAS_RESERVE = 0.0002;

type Tab = "deposit" | "withdraw" | "automation";

export function ManagePanel({
  owner,
  agent,
  wallet,
  balanceEth,
  ownerBalanceEth,
  ethUsd,
  estApr,
  initialTab = "deposit",
}: {
  owner: string;
  agent: string | null;
  wallet: OwnedWallet;
  balanceEth: number | null; // saldo AGENT (untuk withdraw/deploy)
  ownerBalanceEth: number | null; // saldo wallet USER (sumber deposit)
  ethUsd: number | null;
  estApr: number | null;
  initialTab?: Tab;
}) {
  const router = useRouter();
  const t = useT();
  const { primaryWallet } = useDynamicContext();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [amount, setAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [depMsg, setDepMsg] = useState<string | null>(null);
  const [fund, setFund] = useState(String(wallet?.fund_eth ?? ""));
  const [wMode, setWMode] = useState<"all" | "custom">("all");
  const [justDeposited, setJustDeposited] = useState(false);
  const [autoArm, setAutoArm] = useState(true);

  const amountEth = Number(amount) || 0;
  const baseEth = amountEth > 0 ? amountEth : (ownerBalanceEth ?? 0);
  const baseUsd = ethUsd ? baseEth * ethUsd : 0;
  const aprFrac = (estApr ?? 0) / 100;
  const funded = balanceEth !== null && balanceEth > 0.0005;
  const maxDeposit = ownerBalanceEth === null ? 0 : Math.max(0, ownerBalanceEth - DEPOSIT_GAS_RESERVE);
  // Minimal saldo agent utk deploy 1 posisi ($1) + gas — di bawah ini Execute tak berguna.
  const minDeployEth = (ethUsd ? 0.5 / ethUsd : 0.0002) + 0.0005;
  const canDeploy = balanceEth !== null && balanceEth >= minDeployEth;

  const deposit = async () => {
    if (!agent || amountEth <= 0) return;
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) return setDepMsg(t("Wallet tidak terhubung."));
    if (primaryWallet.address.toLowerCase() !== owner.toLowerCase())
      return setDepMsg(t("Pindah ke wallet yang kamu connect (owner) dulu."));
    setDepositing(true);
    setDepMsg(null);
    try {
      const walletClient = await primaryWallet.getWalletClient();
      await walletClient.sendTransaction({
        to: agent as `0x${string}`,
        value: BigInt(Math.round(amountEth * 1e18)),
      });
      // Sekalian aktifkan automation + set fund ke saldo baru (opsional).
      if (autoArm) {
        try {
          await armAgentAction((balanceEth ?? 0) + amountEth);
        } catch {
          /* biarkan — user bisa set manual di Automation */
        }
      }
      setDepMsg(autoArm ? t("Deposit terkirim ✓ · automation aktif") : t("Deposit terkirim ✓"));
      setAmount("");
      // Invalidate data server (RSC) supaya saldo/agent ke-refresh; kasih 1 blok.
      setTimeout(() => router.refresh(), 1500);
      if (!autoArm) {
        // Ingatkan set Fund kalau tak auto-arm — deposit percuma kalau cap Fund kecil.
        setJustDeposited(true);
        setTab("automation");
      }
    } catch {
      setDepMsg(t("Deposit dibatalkan / gagal."));
    } finally {
      setDepositing(false);
    }
  };

  // Belum ada agent → prompt buat wallet (tanpa tab).
  if (!wallet || !agent) {
    return (
      <div className="rounded-2xl border border-line/60 p-5">
        <h3 className="text-sm font-medium">{t("Agent wallet")}</h3>
        <p className="mt-2 text-sm text-soft">
          {t("Bot bikin wallet baru khusus kamu. Kamu")} <b>deposit {NATIVE}</b>{" "}
          {t("ke address-nya, bot LP dari saldo itu, dan bisa")} <b>{t("withdraw")}</b>{" "}
          {t("balik ke wallet ini kapan saja — tanpa share private key sendiri.")}
        </p>
        <form action={createAgentAction} className="mt-4">
          <SubmitButton
            pendingText={t("Membuat…")}
            className="w-full rounded-2xl bg-[#4f7cff] px-4 py-4 text-base font-semibold text-white disabled:opacity-60"
          >
            {t("Buat agent wallet")}
          </SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line/60 p-4 sm:p-5">
      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-shade p-1 text-sm">
        {(["deposit", "withdraw", "automation"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-2 py-1.5 font-medium capitalize transition ${
              tab === t ? "bg-white text-ink shadow-sm" : "text-soft hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "deposit" && (
        <>
          <div className="rounded-2xl bg-shade/50 p-4">
            <div className="mb-1 flex items-start justify-between">
              <span className="text-sm text-soft">Deposit {NATIVE}</span>
              <ChainIcon size={28} />
            </div>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
              className="w-full bg-transparent text-4xl font-semibold tracking-tight outline-none placeholder:text-soft/50"
            />
            <div className="mt-2 flex items-center justify-between text-sm text-soft">
              <span>{ethUsd ? fmtUsd(amountEth * ethUsd) : "—"}</span>
              <div className="flex items-center gap-2">
                <span>{t("Wallet:")} {ownerBalanceEth === null ? "—" : `${fmtEth(ownerBalanceEth)} ${NATIVE}`}</span>
                <button
                  type="button"
                  onClick={() => setAmount(fmtEth(maxDeposit))}
                  disabled={maxDeposit <= 0}
                  className="rounded-lg border border-line/60 px-2 py-1 text-xs hover:bg-shade disabled:opacity-50"
                >
                  {t("MAX")}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-line/60 px-4">
            <Row
              label={t("Network")}
              value={
                <span className="flex items-center justify-end gap-1.5">
                  <ChainIcon size={16} />
                  {ACTIVE_CHAIN.name}
                </span>
              }
            />
            <Row label={`Deposit (${NATIVE})`} value={fmtEth(amountEth)} />
            <Row
              label={t("Fee APR")}
              value={estApr === null ? "—" : `✨ ${fmtApr(estApr)}`}
              sub={estApr === null ? undefined : t("est. gross · fee saja")}
            />
            <Row label={t("Est. fee / bln")} value={ethUsd ? fmtUsd((baseUsd * aprFrac) / 12) : "—"} />
            <Row label={t("Est. fee / thn")} value={ethUsd ? fmtUsd(baseUsd * aprFrac) : "—"} last />
          </div>
          <p className="text-[11px] leading-snug text-soft">
            {t("⚠️ Ini estimasi")} <b>{t("fee saja")}</b>
            {t(". PnL LP sebenarnya didominasi")} <b>{t("harga token")}</b>{" "}
            {t("(bisa naik/turun jauh) — fee cuma sebagian kecil.")}
          </p>

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={autoArm} onChange={(e) => setAutoArm(e.target.checked)} />
            {t("Langsung aktifkan automation (bot pakai dana ini)")}
          </label>

          <button
            type="button"
            onClick={deposit}
            disabled={depositing || amountEth <= 0}
            className="w-full rounded-2xl bg-[#4f7cff] px-4 py-4 text-base font-semibold text-white disabled:opacity-50"
          >
            {depositing ? t("Mengirim…") : autoArm ? t("Deposit + aktifkan") : t("Deposit")}
          </button>
          {depMsg && <p className="text-center text-xs text-soft">{depMsg}</p>}
        </>
      )}

      {tab === "withdraw" && (
        <form action={withdrawAction} className="flex flex-col gap-4">
          <div className="rounded-2xl bg-shade/50 p-4">
            <div className="text-sm text-soft">{t("Saldo agent")}</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight">
              {balanceEth === null ? "—" : `${fmtEth(balanceEth)} ${NATIVE}`}
            </div>
            {ethUsd && balanceEth !== null && (
              <div className="mt-0.5 text-sm text-soft">{fmtUsd(balanceEth * ethUsd)}</div>
            )}
          </div>

          {/* All / Custom */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-shade p-1 text-sm">
            {(["all", "custom"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setWMode(m)}
                className={`rounded-lg px-2 py-1.5 font-medium capitalize transition ${
                  wMode === m ? "bg-white text-ink shadow-sm" : "text-soft hover:text-ink"
                }`}
              >
                {m === "all" ? t("Withdraw all") : t("Custom")}
              </button>
            ))}
          </div>

          {wMode === "custom" ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-soft">{t("Jumlah")} ({NATIVE})</span>
              <input
                name="amountEth"
                type="number"
                step="0.00000001"
                min="0"
                placeholder={balanceEth ? fmtEth(balanceEth) : "0.0"}
                className="rounded-lg border border-line/60 px-3 py-2 text-sm"
              />
            </label>
          ) : (
            <p className="text-xs text-soft">{t("Tarik seluruh saldo agent (sisakan sedikit untuk gas).")}</p>
          )}
          <p className="text-xs text-soft">{t("Dana ditarik ke wallet owner yang kamu connect.")}</p>
          <SubmitButton
            pendingText={t("Menarik…")}
            disabled={!balanceEth}
            className="w-full rounded-2xl bg-[#4f7cff] px-4 py-4 text-base font-semibold text-white disabled:opacity-50"
          >
            {wMode === "all" ? t("Withdraw all") : t("Withdraw")}
          </SubmitButton>
        </form>
      )}

      {tab === "withdraw" && (
        <form action={closeAllAndWithdrawAction} className="border-t border-line/60 pt-3">
          <SubmitButton
            pendingText={t("Menutup semua LP + menarik… (bisa ~1 menit)")}
            className="w-full rounded-2xl border border-[#4f7cff]/50 px-4 py-3 text-sm font-semibold text-[#4f7cff] hover:bg-[#4f7cff]/10 disabled:opacity-60"
          >
            {t("Cabut semua LP + withdraw semua")}
          </SubmitButton>
          <p className="mt-1.5 text-center text-[11px] text-soft">
            {t("Tutup semua posisi (burn + swap balik ke")} {NATIVE}{t("), lalu tarik seluruh saldo ke owner.")}
          </p>
        </form>
      )}

      {tab === "automation" && (
        <div className="flex flex-col gap-4">
          {justDeposited && (
            <div className="rounded-xl border border-[#4f7cff]/40 bg-[#4f7cff]/10 p-3 text-xs">
              <b>{t("Deposit diterima.")}</b> {t("Naikkan")} <b>{t("Fund")}</b>{" "}
              {t("ke saldo agent baru — bot cuma deploy sampai batas Fund, jadi deposit tanpa naikin Fund tak terpakai.")}
              <button
                type="button"
                onClick={() => balanceEth !== null && setFund(fmtEth(balanceEth))}
                disabled={balanceEth === null}
                className="ml-2 rounded-lg border border-line/60 px-2 py-0.5 hover:bg-shade disabled:opacity-50"
              >
                {t("Set Fund = saldo")}
              </button>
            </div>
          )}
          <form action={updateWalletAction} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-soft">Fund ({NATIVE}) — {t("dari saldo agent")}</span>
              <div className="flex items-center gap-1">
                <input
                  name="fundEth"
                  type="number"
                  step="0.00000001"
                  min="0"
                  value={fund}
                  onChange={(e) => setFund(e.target.value)}
                  className="flex-1 rounded-lg border border-line/60 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => balanceEth !== null && setFund(fmtEth(balanceEth))}
                  disabled={balanceEth === null}
                  className="rounded-lg border border-line/60 px-3 py-2 text-xs hover:bg-shade disabled:opacity-50"
                >
                  {t("MAX")}
                </button>
              </div>
              <span className="text-xs text-soft">
                {t("Saldo agent:")} {balanceEth === null ? "—" : `${fmtEth(balanceEth)} ${NATIVE}`}
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-soft">Max per pool ({NATIVE})</span>
              <input
                name="maxPerPoolEth"
                type="number"
                step="0.00000001"
                min="0"
                defaultValue={wallet.max_per_pool_eth}
                className="rounded-lg border border-line/60 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex items-center gap-4">
              <Toggle name="automation" defaultChecked={wallet.automation === 1} label={t("automation")} />
              <Toggle name="autoswap" defaultChecked={wallet.autoswap === 1} label={t("auto-swap")} />
            </div>
            <SubmitButton
              pendingText={t("Menyimpan…")}
              className="w-full rounded-xl border border-line/60 px-4 py-2 text-sm font-medium hover:bg-shade disabled:opacity-60"
            >
              {t("Save settings")}
            </SubmitButton>
          </form>

          <div className="flex items-center justify-between border-t border-line/60 pt-4">
            <form action={executeNowAction}>
              <SubmitButton
                pendingText={t("Menjalankan…")}
                disabled={wallet.automation === 0 || !canDeploy}
                title={!canDeploy ? t("Saldo agent kurang untuk deploy 1 posisi + gas — deposit dulu") : undefined}
                className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {t("Execute now")}
              </SubmitButton>
            </form>
            <form action={removeWalletAction}>
              <button
                type="submit"
                disabled={funded}
                title={funded ? t("Withdraw dulu — masih ada dana") : undefined}
                className="text-sm text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-soft disabled:no-underline"
              >
                {t("remove agent")}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

function Row({
  label,
  value,
  sub,
  last,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2.5 ${last ? "" : "border-b border-line/50"}`}>
      <span className="text-sm text-soft">{label}</span>
      <div className="text-right">
        <div className="text-sm font-medium">{value}</div>
        {sub && <div className="text-[11px] text-soft">{sub}</div>}
      </div>
    </div>
  );
}
