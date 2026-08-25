"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  BarChart3,
  CalendarDays,
  CircleCheckBig,
  Search,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { BondCard } from "@/components/bond-card";
import { BondCardSkeleton } from "@/components/bond-card-skeleton";
import {
  CHART_RANGES,
  type ChartRange,
  PriceChart,
  RangeTabs,
} from "@/components/charts/price-chart";
import { Dropdown } from "@/components/dropdown";
import { CompanyAvatar, UsdcIcon, WalletAvatar } from "@/components/icons";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { Progress } from "@/components/progress";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/toast";
import { useWallet } from "@/features/wallet/wallet-provider";
import { useChartNow, useNowLabel } from "@/hooks/use-now";
import { fmtDate, fmtPct, fmtUsdc, truncateAddress } from "@/lib/format";
import { humanizeTxError, txLink } from "@/lib/live/chain";
import { type LivePosition, useBonds } from "@/lib/live/hooks";
import { claimTx } from "@/lib/live/tx";
import { impliedApyPct } from "@/lib/mock";
import { portfolioValueSeries, type Row, usePortfolioRows } from "./use-rows";

type ClaimState = {
  id: string;
  stage: "working" | "done" | "error";
  label?: string;
  hash?: string;
  error?: string;
};

function EmptyState({
  icon: Icon,
  children,
}: Readonly<{ icon: typeof Wallet; children: React.ReactNode }>) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <Icon size={22} className="text-faint" strokeWidth={1.5} />
      <p className="max-w-xs text-sm text-soft">{children}</p>
    </div>
  );
}

function Card({
  children,
  className = "",
}: Readonly<{ children: React.ReactNode; className?: string }>) {
  return (
    <section className={`rounded-2xl border border-line bg-white p-5 ${className}`}>
      {children}
    </section>
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

/** Leaf component so the 1s clock tick re-renders only this span. */
function LiveClock() {
  const now = useNowLabel();
  return now ? <span className="tabular text-sm text-soft">{now}</span> : null;
}

function ConnectPrompt() {
  const { connect } = useWallet();
  return (
    <div className="flex flex-col items-center gap-4 py-32 text-center">
      <Wallet size={28} className="text-faint" strokeWidth={1.5} />
      <h1 className="text-2xl font-medium tracking-tight">Connect your wallet</h1>
      <p className="max-w-sm text-sm text-soft">
        Connect a wallet to view your invoice bond holdings, portfolio allocation, and claimable
        settlements in one place.
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

/** Invisible placeholder mirroring the connected layout while the wallet
    SDK restores a session or the mirror node loads; phantom-ui measures it
    to draw the shimmer. Node-for-node copy of the connected branch below
    (same classes, chart block = PriceChart's 380px) so the swap causes zero
    layout shift. */
function PortfolioSkeleton() {
  return (
    <phantom-ui loading aria-hidden>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 py-8">
          <div className="flex items-center gap-3">
            <span className="size-9 rounded-full bg-shade" />
            <div className="text-xl font-medium tracking-tight">Welcome, 0x0000...0000</div>
          </div>
          <span className="tabular text-sm">00:00:00 AM</span>
        </div>

        <section className="rounded-2xl border border-line bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="tabular text-4xl font-medium tracking-tight">$0.00</div>
            <div className="flex gap-1 rounded-lg bg-shade p-1">
              {CHART_RANGES.map((r) => (
                <span key={r} className="rounded-md px-2.5 py-1 font-mono text-xs">
                  {r}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-4 h-[380px] rounded-xl bg-shade" />
        </section>

        <section className="mt-6 rounded-2xl border border-line bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[15px] font-medium">My Holdings</div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-line px-3 py-1.5 text-xs font-medium">
                Status
              </span>
              <span className="h-8 w-36 rounded-full bg-shade" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="h-[74px] rounded-xl bg-shade" />
            <div className="h-[74px] rounded-xl bg-shade" />
          </div>
          <div className="flex flex-col items-center gap-3 py-16">
            <span className="size-5.5 rounded-md bg-shade" />
            <p className="max-w-xs text-sm">
              No holdings found. Fund an invoice from the marketplace to get started.
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-line bg-white p-5">
          <div className="text-[15px] font-medium">Portfolio Allocation</div>
          <div className="mt-3 flex gap-6 border-b border-line">
            {ALLOCATION_TABS.map((tab) => (
              <span key={tab.label} className="pb-2.5 text-sm">
                {tab.label}
              </span>
            ))}
          </div>
          <div className="flex flex-col items-center gap-3 py-16">
            <span className="size-5.5 rounded-md bg-shade" />
            <p className="max-w-xs text-sm">
              Portfolio insights will be available once your wallet has holdings.
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-line bg-white p-5">
          <div className="text-[15px] font-medium">Recent Transactions</div>
          <div className="flex flex-col items-center gap-3 py-16">
            <span className="size-5.5 rounded-md bg-shade" />
            <p className="max-w-xs text-sm">
              No transactions yet. Your activity will show up as you fund invoices.
            </p>
          </div>
        </section>
      </div>
    </phantom-ui>
  );
}

/* ----------------------------- Claimable settlements ---------------------- */

function ClaimableSettlements({
  claimable,
  positionsById,
}: Readonly<{ claimable: Row[]; positionsById: Map<string, LivePosition> }>) {
  const { getWalletClient } = useWallet();
  const queryClient = useQueryClient();
  const [toast, showToast] = useToast();
  const [claim, setClaim] = useState<ClaimState | null>(null);

  /** Approve the surrendered bond units, then claim(invoiceId). */
  async function claimLive(position: LivePosition) {
    const live = position.bond.live;
    const id = position.bond.id;
    if (!live) return;
    try {
      const hash = await claimTx({
        getWalletClient,
        refs: live,
        units: position.units,
        onStage: (label, txHash) =>
          setClaim((prev) => ({
            id,
            stage: "working",
            label,
            hash: txHash ?? (prev?.id === id ? prev.hash : undefined),
          })),
      });
      setClaim({ id, stage: "done", hash });
      await queryClient.invalidateQueries();
    } catch (err) {
      setClaim((prev) => ({
        id,
        stage: "error",
        hash: prev?.id === id ? prev.hash : undefined,
        error: humanizeTxError(err),
      }));
    }
  }

  return (
    <Card className="mt-6">
      <h2 className="text-[15px] font-medium">Claimable Settlements</h2>
      <div className="mt-3 flex flex-col gap-2">
        {claimable.map(({ bond, claimableUsdc: amount }) => {
          const position = positionsById.get(bond.id);
          const state = claim?.id === bond.id ? claim : null;
          return (
            <div key={bond.id} className="rounded-xl bg-pos/5 p-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <CompanyAvatar name={bond.issuer} className="size-8 text-[10px]" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{bond.issuer}</div>
                  <div className="text-xs text-soft">Matured {fmtDate(bond.maturityDate)}</div>
                </div>
                <div className="tabular ml-auto text-sm font-medium">{fmtUsdc(amount)}</div>
                <button
                  type="button"
                  disabled={state?.stage === "working"}
                  onClick={() =>
                    position
                      ? claimLive(position)
                      : showToast("Demo data — set NEXT_PUBLIC_DEMO_DATA=0 to claim")
                  }
                  className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-white hover:bg-black disabled:opacity-60"
                >
                  {state?.stage === "working" ? "Claiming…" : "Claim"}
                </button>
              </div>
              {state && (
                <div className="mt-2 text-xs" role="status">
                  {state.stage === "working" && <p className="text-soft">{state.label}</p>}
                  {state.stage === "done" && (
                    <p className="font-medium text-pos">Payout claimed.</p>
                  )}
                  {state.stage === "error" && (
                    <p className="text-neg" role="alert">
                      {state.error}
                    </p>
                  )}
                  {state.hash && (
                    <a
                      href={txLink(state.hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block underline hover:text-ink"
                    >
                      View transaction on HashScan
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {toast}
    </Card>
  );
}

/* --------------------------------- Holdings ------------------------------- */

const HOLDINGS_EMPTY =
  "No invoice bond holdings for this wallet yet — fund an invoice from the marketplace to get started.";

function HoldingsCard({ rows }: Readonly<{ rows: Row[] }>) {
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");

  const faceHeld = rows.reduce((sum, r) => sum + r.faceUsdc, 0);
  const claimable = rows.reduce((sum, r) => sum + r.claimableUsdc, 0);

  const query = q.trim().toLowerCase();
  const filtered = rows.filter(
    ({ bond }) =>
      (status === "all" || bond.status === status) &&
      (query === "" ||
        bond.issuer.toLowerCase().includes(query) ||
        bond.payor.toLowerCase().includes(query)),
  );

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-medium">My Holdings</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "Status" },
              { value: "open", label: "Funding" },
              { value: "funded", label: "Funded" },
              { value: "matured", label: "Matured" },
              { value: "settled", label: "Settled" },
            ]}
            buttonClassName="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-soft"
          />
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search bond"
              placeholder="Search bond"
              className="h-8 w-36 rounded-full border border-line bg-white pr-3 pl-8 text-xs outline-none placeholder:text-faint focus:border-ink"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatTile
          icon={<UsdcIcon size={26} />}
          name="Face value held"
          value={fmtUsdc(faceHeld)}
          tint="bg-[#e9f1fc]"
        />
        <StatTile
          icon={<CircleCheckBig size={24} className="text-pos" strokeWidth={1.75} />}
          name="Claimable now"
          value={fmtUsdc(claimable)}
          tint="bg-[#e9f4ee]"
        />
      </div>

      {rows.length === 0 && <EmptyState icon={Wallet}>{HOLDINGS_EMPTY}</EmptyState>}
      {rows.length > 0 && filtered.length === 0 && (
        <p className="py-16 text-center text-sm text-soft">
          No holdings match your search or filters.
        </p>
      )}
      {filtered.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-soft">
                <th className="py-2.5 pr-4 font-medium">Bond</th>
                <th className="py-2.5 pr-4 font-medium">Face held</th>
                <th className="py-2.5 pr-4 font-medium">Cost</th>
                <th className="py-2.5 pr-4 font-medium">Implied APY</th>
                <th className="py-2.5 pr-4 font-medium">Maturity</th>
                <th className="py-2.5 pr-4 font-medium">Status</th>
                <th className="py-2.5 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map(({ bond, faceUsdc, costUsdc }) => (
                <tr key={bond.id}>
                  <td className="py-3 pr-4">
                    <Link
                      href={`/invoices/${bond.id}`}
                      className="flex items-center gap-2.5 hover:underline"
                    >
                      <CompanyAvatar name={bond.issuer} className="size-7 text-[9px]" />
                      <span className="font-medium">{bond.issuer}</span>
                      <span className="font-mono text-xs text-soft">
                        {bond.live ? truncateAddress(bond.id) : bond.id.toUpperCase()}
                      </span>
                    </Link>
                  </td>
                  <td className="tabular py-3 pr-4">{fmtUsdc(faceUsdc)}</td>
                  <td className="tabular py-3 pr-4">{fmtUsdc(costUsdc)}</td>
                  <td className="tabular py-3 pr-4">{fmtPct(impliedApyPct(bond))}</td>
                  <td className="tabular py-3 pr-4">{fmtDate(bond.maturityDate)}</td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={bond.status} />
                  </td>
                  <td className="py-3 text-right">
                    {(bond.status === "open" || bond.status === "funded") && (
                      <Link
                        href={`/invoices/${bond.id}#market`}
                        className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-soft hover:text-ink"
                      >
                        Sell
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* -------------------------------- Allocation ------------------------------ */

const ALLOCATION_TABS = [
  { label: "All Bonds", statuses: null },
  { label: "Funding", statuses: ["open", "funded"] },
  { label: "Matured", statuses: ["matured", "settled"] },
] as const;

function AllocationCard({ rows }: Readonly<{ rows: Row[] }>) {
  const [tab, setTab] = useState<(typeof ALLOCATION_TABS)[number]>(ALLOCATION_TABS[0]);

  const filtered = rows.filter(
    (r) => !tab.statuses || (tab.statuses as readonly string[]).includes(r.bond.status),
  );
  const totalFace = filtered.reduce((sum, r) => sum + r.faceUsdc, 0);

  return (
    <Card className="mt-6">
      <h2 className="text-[15px] font-medium">Portfolio Allocation</h2>
      <div className="mt-3 flex gap-6 border-b border-line">
        {ALLOCATION_TABS.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 pb-2.5 text-sm ${
              tab.label === t.label
                ? "border-ink font-medium text-ink"
                : "border-transparent text-soft hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={BarChart3}>
          Portfolio insights will be available once your wallet has holdings.
        </EmptyState>
      ) : (
        <div className="divide-y divide-line">
          {filtered.map((r) => {
            const share = totalFace > 0 ? (r.faceUsdc / totalFace) * 100 : 0;
            return (
              <div key={r.bond.id} className="flex items-center gap-3 py-3.5">
                <CompanyAvatar name={r.bond.issuer} className="size-8 text-[10px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium">{r.bond.issuer}</span>
                    <span className="tabular text-sm">
                      {fmtUsdc(r.faceUsdc)}{" "}
                      <span className="text-xs text-soft">({share.toFixed(1)}%)</span>
                    </span>
                  </div>
                  <Progress pct={share} className="mt-2" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------- Transactions ----------------------------- */

function TransactionsCard({ rows }: Readonly<{ rows: Row[] }>) {
  const purchases = rows
    .filter((r) => r.acquiredDate)
    .sort((a, b) => (b.acquiredDate ?? "").localeCompare(a.acquiredDate ?? ""));

  return (
    <Card className="mt-6">
      <h2 className="text-[15px] font-medium">Recent Transactions</h2>
      {purchases.length === 0 ? (
        <EmptyState icon={ArrowLeftRight}>
          No transactions yet. Your activity will show up as you fund invoices.
        </EmptyState>
      ) : (
        <div className="mt-1 divide-y divide-line">
          {purchases.map((r) => (
            <div key={r.bond.id} className="flex items-center gap-3 py-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-white text-soft">
                <ArrowLeftRight size={16} strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  Primary purchase — {r.bond.issuer}
                </div>
                <div className="tabular text-xs text-soft">
                  {r.acquiredDate ? fmtDate(r.acquiredDate) : ""}
                </div>
              </div>
              <span className="tabular ml-auto text-sm font-medium">-{fmtUsdc(r.costUsdc)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------ Investors row ----------------------------- */

function InvestorsAlsoOwnRow({ held }: Readonly<{ held: Set<string> }>) {
  const { data, isLoading } = useBonds();
  const bonds = (data ?? []).filter((b) => b.status === "open" && !held.has(b.id)).slice(0, 4);
  if (!isLoading && bonds.length === 0) return null;
  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-medium">Investors Also Own</h2>
          <p className="mt-0.5 text-xs text-soft">
            Keep building your portfolio with the latest invoice bonds open for funding.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-full bg-shade px-4 py-2 text-xs font-medium hover:bg-line"
        >
          Explore Invoice Bonds
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? ["p1", "p2", "p3", "p4"].map((id) => <BondCardSkeleton key={id} />)
          : bonds.map((b) => <BondCard key={b.id} bond={b} />)}
      </div>
    </Card>
  );
}

/* ---------------------------------- Page ---------------------------------- */

export function PortfolioPage() {
  const { address, loading, isError, rows, positionsById } = usePortfolioRows();
  const [range, setRange] = useState<ChartRange>("ALL");

  const claimable = rows.filter((r) => r.claimableUsdc > 0);
  const chartNow = useChartNow();
  const series = useMemo(
    () => portfolioValueSeries(rows, range, chartNow),
    [rows, range, chartNow],
  );
  const value = series.at(-1)?.value ?? 0;
  const trend = value > (series[0]?.value ?? 0) ? "up" : "flat";

  return (
    <>
      <Header />
      <main className="container-page pb-24">
        <div className="mx-auto w-full max-w-6xl">
          {loading && <PortfolioSkeleton />}
          {!loading && !address && <ConnectPrompt />}
          {!loading && address && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 py-8">
                <div className="flex items-center gap-3">
                  <WalletAvatar className="size-9" />
                  <h1 className="text-xl font-medium tracking-tight">
                    Welcome, {truncateAddress(address)}
                  </h1>
                </div>
                <LiveClock />
              </div>

              {/* Portfolio value: Σ accreted holdings, anchored at purchase times. */}
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="tabular text-4xl font-medium tracking-tight">
                    {fmtUsdc(value)}
                  </div>
                  <RangeTabs value={range} onChange={setRange} className="hidden sm:flex" />
                  {/* Mobile: the range row collapses to a calendar picker. */}
                  <div className="sm:hidden">
                    <Dropdown
                      value={range}
                      onChange={(v) => setRange(v as ChartRange)}
                      options={CHART_RANGES.map((r) => ({ value: r, label: r }))}
                      buttonLabel={<CalendarDays size={16} />}
                      buttonClassName="rounded-full border border-line p-2 text-soft"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <PriceChart points={series} trend={trend} range={range} axis="left" plain />
                </div>
              </Card>

              {isError && (
                <p className="mt-6 text-sm text-soft">
                  Could not reach the Hedera mirror node — retrying shortly.
                </p>
              )}

              {claimable.length > 0 && (
                <ClaimableSettlements claimable={claimable} positionsById={positionsById} />
              )}
              <HoldingsCard rows={rows} />
              <AllocationCard rows={rows} />
              <TransactionsCard rows={rows} />
              <InvestorsAlsoOwnRow held={new Set(rows.map((r) => r.bond.id))} />
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
