"use client";

import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useState } from "react";
import { createPublicClient, http, parseAbi } from "viem";
import { bsc } from "viem/chains";
import { useRouter } from "next/navigation";

import { useT } from "@/lib/i18n-client";
import { setVaultAddressAction } from "@/server/wallet-actions";

const FACTORY = (process.env.NEXT_PUBLIC_LP_VAULT_FACTORY ?? "") as `0x${string}` | "";
const BSC_RPC = process.env.NEXT_PUBLIC_BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org";

const factoryAbi = parseAbi([
  "function createVault(address agent, uint256 maxNotionalPerOp) returns (address)",
  "function vaultOf(address) view returns (address)",
]);

const pub = () => createPublicClient({ chain: bsc, transport: http(BSC_RPC) });

/**
 * Kelola LpVault: kalau belum ada, deploy (owner tanda tangan factory.createVault dengan
 * agent + cap notional). Kalau sudah ada, deposit BNB ke vault. Dana di vault — bot cuma
 * bisa LP, tak bisa kuras; owner-only withdraw. Butuh NEXT_PUBLIC_LP_VAULT_FACTORY.
 */
export function VaultCard({
  owner,
  agent,
  vaultAddress,
}: {
  owner: string;
  agent: string | null;
  vaultAddress: string | null;
}) {
  const { primaryWallet } = useDynamicContext();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [capEth, setCapEth] = useState("0.05");
  const [depEth, setDepEth] = useState("");
  const t = useT();

  if (!FACTORY) {
    return (
      <div className="rounded-2xl border border-line/60 p-5 text-sm text-soft">
        {t("Vault factory belum dikonfigurasi (deploy dulu, set NEXT_PUBLIC_LP_VAULT_FACTORY).")}
      </div>
    );
  }

  type Switchable = { chain?: { id: number }; switchChain: (a: { id: number }) => Promise<unknown> };
  const ensureBsc = async (wc: Switchable) => {
    if (wc.chain?.id === bsc.id) return;
    try {
      await wc.switchChain({ id: bsc.id });
    } catch {
      throw new Error(t("Pindahkan wallet ke BNB Smart Chain (56) dulu."));
    }
  };

  const createVault = async () => {
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) return setMsg(t("Wallet tidak terhubung."));
    if (primaryWallet.address.toLowerCase() !== owner.toLowerCase())
      return setMsg(t("Connect wallet owner-mu dulu."));
    if (!agent) return setMsg(t("Buat agent wallet dulu."));
    setBusy(true);
    setMsg(null);
    try {
      const wc = await primaryWallet.getWalletClient();
      await ensureBsc(wc);
      const cap = BigInt(Math.round(Number(capEth) * 1e18));
      const hash = await wc.writeContract({
        address: FACTORY as `0x${string}`,
        abi: factoryAbi,
        functionName: "createVault",
        args: [agent as `0x${string}`, cap],
      });
      await pub().waitForTransactionReceipt({ hash });
      const vault = (await pub().readContract({
        address: FACTORY as `0x${string}`,
        abi: factoryAbi,
        functionName: "vaultOf",
        args: [owner as `0x${string}`],
      })) as string;
      await setVaultAddressAction(vault); // server verifies vaultOf on-chain again
      setMsg(t("Vault dibuat ✓ — sekarang deposit BNB."));
      setTimeout(() => router.refresh(), 1500);
    } catch (e) {
      setMsg(`${t("Gagal:")} ${e instanceof Error ? e.message : t("batal")}`);
    } finally {
      setBusy(false);
    }
  };

  const deposit = async () => {
    if (!vaultAddress || Number(depEth) <= 0) return;
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) return setMsg(t("Wallet tidak terhubung."));
    setBusy(true);
    setMsg(null);
    try {
      const wc = await primaryWallet.getWalletClient();
      await ensureBsc(wc);
      await wc.sendTransaction({
        to: vaultAddress as `0x${string}`,
        value: BigInt(Math.round(Number(depEth) * 1e18)),
      });
      setMsg(t("Deposit ke vault terkirim ✓"));
      setDepEth("");
      setTimeout(() => router.refresh(), 1500);
    } catch (e) {
      setMsg(`${t("Gagal:")} ${e instanceof Error ? e.message : t("batal")}`);
    } finally {
      setBusy(false);
    }
  };

  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  return (
    <div className="rounded-2xl border border-line/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{t("Secure vault (BSC)")}</h3>
          <p className="mt-0.5 text-xs text-soft">
            {t("Dana di kontrak vault — bot cuma bisa LP,")} <b>{t("tak bisa kuras")}</b>. {t("Owner-only withdraw.")}
          </p>
        </div>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${vaultAddress ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
        >
          {vaultAddress ? t("aktif") : t("belum ada")}
        </span>
      </div>

      {vaultAddress ? (
        <div className="mt-4 space-y-3">
          <div className="text-xs text-soft">
            {t("Vault:")}{" "}
            <a
              className="font-mono text-ink hover:underline"
              href={`https://bscscan.com/address/${vaultAddress}`}
              target="_blank"
              rel="noreferrer"
            >
              {short(vaultAddress)}
            </a>
          </div>
          <div className="flex gap-2">
            <input
              inputMode="decimal"
              value={depEth}
              onChange={(e) => setDepEth(e.target.value)}
              placeholder="BNB"
              className="w-28 rounded-lg border border-line/60 px-2.5 py-1.5 text-sm"
            />
            <button
              onClick={deposit}
              disabled={busy}
              className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-60"
            >
              {busy ? "…" : t("Deposit ke vault")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-xs text-soft">
            {t("Cap notional per operasi (BNB) — batas dana per aksi bot")}
            <input
              inputMode="decimal"
              value={capEth}
              onChange={(e) => setCapEth(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line/60 px-2.5 py-1.5 text-sm"
            />
          </label>
          <button
            onClick={createVault}
            disabled={busy || !agent}
            className="w-full rounded-lg bg-ink px-3 py-2 text-sm font-medium text-bg disabled:opacity-60"
          >
            {busy ? t("Membuat vault…") : t("Buat vault")}
          </button>
          {agent && (
            <p className="text-xs text-soft">
              {t("Agent (bot):")} <span className="font-mono">{short(agent)}</span> {t("— bisa dicabut kapan saja.")}
            </p>
          )}
        </div>
      )}
      {msg && <p className="mt-3 text-xs text-soft">{msg}</p>}
    </div>
  );
}
