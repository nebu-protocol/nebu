"use client";

import { CalendarDays, FilePlus2, FileText, Landmark } from "lucide-react";
import Link from "next/link";

import { CompanyAvatar, UsdcIcon } from "@/components/icons";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { Progress } from "@/components/progress";
import { StatusBadge } from "@/components/status-badge";
import { useWallet } from "@/features/wallet/wallet-provider";
import { fmtDate, fmtUsdc, truncateAddress } from "@/lib/format";
import { DEMO_DATA } from "@/lib/live/chain";
import { useBonds } from "@/lib/live/hooks";
import { type InvoiceBond, listMyInvoices, MY_ISSUER } from "@/lib/mock";

function ConnectPrompt() {
  const { connect } = useWallet();
  return (
    <div className="flex flex-col items-center gap-4 py-32 text-center">
      <Landmark size={28} className="text-faint" strokeWidth={1.5} />
      <h1 className="text-2xl font-medium tracking-tight">Issuer dashboard</h1>
      <p className="max-w-sm text-sm text-soft">
        Connect the wallet of a verified issuer to manage your tokenized invoices.
      </p>
      <button
        type="button"
        onClick={connect}
        className="mt-2 rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-white hover:bg-black"
      >
        Connect Wallet
      </button>
    </div>
  );
}

/** Node-for-node copy of the connected layout below; phantom-ui measures
    it to draw the shimmer, so the swap causes zero layout shift. */
function IssuerSkeleton() {
  return (
    <phantom-ui loading aria-hidden>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4 py-8">
          <div className="flex items-center gap-3">
            <span className="size-9 rounded-full bg-shade" />
            <div>
              <div className="text-xl font-medium tracking-tight">Issuer Company Name</div>
              <p className="text-xs text-soft">Verified issuer · demo account</p>
            </div>
          </div>
          <span className="rounded-full bg-shade px-5 py-2.5 text-sm font-medium">
            Tokenize an Invoice
          </span>
        </div>
        <section className="rounded-2xl border border-line bg-white p-5">
          <div className="text-[15px] font-medium">My Invoices</div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="h-[74px] rounded-xl bg-shade" />
            <div className="h-[74px] rounded-xl bg-shade" />
            <div className="h-[74px] rounded-xl bg-shade" />
          </div>
          <div className="mt-4 h-64 rounded-xl bg-shade" />
        </section>
      </div>
    </phantom-ui>
  );
}

function StatTile({
  icon,
  name,
  value,
  tint,
}: Readonly<{ icon: React.ReactNode; name: string; value: string; tint: string }>) {
  return (
    <div className={`flex items-center gap-3 rounded-xl p-4 ${tint}`}>
      {icon}
      <div>
        <div className="text-xs font-medium text-soft">{name}</div>
        <div className="tabular text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

function EmptyState({ isError }: Readonly<{ isError: boolean }>) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <FileText size={22} className="text-faint" strokeWidth={1.5} />
      <p className="max-w-xs text-sm text-soft">
        {isError
          ? "Could not reach the Hedera mirror node — retrying shortly."
          : "No invoices issued by this wallet yet. Tokenize your first invoice to list it on the marketplace."}
      </p>
    </div>
  );
}

function InvoiceRow({ bond }: Readonly<{ bond: InvoiceBond }>) {
  return (
    <tr>
      <td className="py-3 pr-4">
        {bond.status === "pending" ? (
          <span className="font-mono text-xs text-soft">
            {bond.live ? truncateAddress(bond.id) : bond.id.toUpperCase()}
          </span>
        ) : (
          <Link href={`/invoices/${bond.id}`} className="font-mono text-xs hover:underline">
            {bond.live ? truncateAddress(bond.id) : bond.id.toUpperCase()}
          </Link>
        )}
      </td>
      <td className="py-3 pr-4">{bond.payor}</td>
      <td className="tabular py-3 pr-4">{fmtUsdc(bond.faceValueUsdc)}</td>
      <td className="tabular py-3 pr-4">{fmtDate(bond.maturityDate)}</td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <Progress pct={bond.fundedPct} className="w-20" />
          <span className="tabular text-xs text-soft">{bond.fundedPct}%</span>
        </div>
      </td>
      <td className="py-3">
        <StatusBadge status={bond.status} />
      </td>
    </tr>
  );
}

/** Live scope: bonds this wallet issued on-chain. Demo scope: the fixture issuer. */
function useMyInvoices(address: string | undefined) {
  const bonds = useBonds();
  if (DEMO_DATA) {
    return { invoices: listMyInvoices(), loading: false, isError: false };
  }
  const mine = (bonds.data ?? []).filter(
    (b) => b.live && b.live.issuerAddress.toLowerCase() === address?.toLowerCase(),
  );
  return { invoices: mine, loading: bonds.isLoading, isError: bonds.isError };
}

export function IssuerPage() {
  const { address, booting } = useWallet();
  const { invoices, loading, isError } = useMyInvoices(address);

  const outstanding = invoices
    .filter((b) => b.status === "open" || b.status === "funded" || b.status === "matured")
    .reduce((sum, b) => sum + b.faceValueUsdc, 0);
  const nextMaturity = invoices
    .filter((b) => Date.parse(b.maturityDate) > Date.now())
    .map((b) => b.maturityDate)
    .sort()[0];

  const issuerName = DEMO_DATA ? MY_ISSUER : truncateAddress(address ?? "");
  const issuerNote = DEMO_DATA
    ? "Verified issuer · demo account"
    : "Issuer wallet · Hedera testnet";

  return (
    <>
      <Header />
      <main className="container-page pb-24">
        {(booting || (Boolean(address) && loading)) && <IssuerSkeleton />}
        {!booting && !address && <ConnectPrompt />}
        {!booting && address && !loading && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4 py-8">
              <div className="flex items-center gap-3">
                <CompanyAvatar name={issuerName} className="size-9 text-xs" />
                <div>
                  <h1 className="text-xl font-medium tracking-tight">{issuerName}</h1>
                  <p className="text-xs text-soft">{issuerNote}</p>
                </div>
              </div>
              <Link
                href="/issuer/new"
                className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-black"
              >
                <FilePlus2 size={16} />
                Tokenize an Invoice
              </Link>
            </div>

            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="text-[15px] font-medium">My Invoices</h2>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatTile
                  icon={<FileText size={24} className="text-soft" strokeWidth={1.75} />}
                  name="Invoices submitted"
                  value={String(invoices.length)}
                  tint="bg-[#f6f6f4]"
                />
                <StatTile
                  icon={<UsdcIcon size={26} />}
                  name="Outstanding face value"
                  value={fmtUsdc(outstanding)}
                  tint="bg-[#e9f1fc]"
                />
                <StatTile
                  icon={<CalendarDays size={24} className="text-pos" strokeWidth={1.75} />}
                  name="Next maturity"
                  value={nextMaturity ? fmtDate(nextMaturity) : "—"}
                  tint="bg-[#e9f4ee]"
                />
              </div>

              {invoices.length === 0 && <EmptyState isError={isError} />}
              {invoices.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-xs text-soft">
                        <th className="py-2.5 pr-4 font-medium">Invoice</th>
                        <th className="py-2.5 pr-4 font-medium">Payor</th>
                        <th className="py-2.5 pr-4 font-medium">Face value</th>
                        <th className="py-2.5 pr-4 font-medium">Due</th>
                        <th className="py-2.5 pr-4 font-medium">Funded</th>
                        <th className="py-2.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {invoices.map((b) => (
                        <InvoiceRow key={b.id} bond={b} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
