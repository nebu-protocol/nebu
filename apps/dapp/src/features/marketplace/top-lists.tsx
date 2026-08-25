"use client";

import Link from "next/link";

import { CompanyAvatar, TrendText } from "@/components/icons";
import { fmtDate, fmtPct, fmtUsdc } from "@/lib/format";
import { daysToMaturity, type InvoiceBond, impliedApyPct } from "@/lib/mock";

// The template's explore top-lists verbatim, with the three columns keyed
// to invoice-bond semantics instead of market moves.

type SecondaryLine = (bond: InvoiceBond) => React.ReactNode;

const SECONDARY: Record<string, SecondaryLine> = {
  apy: (b) => (
    <TrendText trend="up" arrowSize={8} className="justify-end text-[11px]">
      {fmtPct(impliedApyPct(b))} APY
    </TrendText>
  ),
  maturity: (b) => (
    <span className="tabular text-xs whitespace-nowrap text-soft">
      {Math.max(daysToMaturity(b), 0)}d to maturity
    </span>
  ),
  newest: (b) => (
    <span className="tabular text-xs whitespace-nowrap text-soft">
      Issued {fmtDate(b.issueDate)}
    </span>
  ),
};

function Row({ bond, secondary }: Readonly<{ bond: InvoiceBond; secondary: SecondaryLine }>) {
  return (
    <Link href={`/invoices/${bond.id}`} className="flex items-center gap-3 py-4 hover:bg-shade/50">
      <CompanyAvatar name={bond.issuer} className="size-10 text-sm" />
      <div className="min-w-0">
        <div className="truncate text-[15px] font-medium">{bond.issuer}</div>
        <div className="truncate text-sm text-soft">Payor: {bond.payor}</div>
      </div>
      <div className="ml-auto text-right">
        <div className="tabular text-[15px] font-medium">{fmtUsdc(bond.faceValueUsdc)}</div>
        <div className="mt-0.5 flex justify-end">{secondary(bond)}</div>
      </div>
    </Link>
  );
}

const ROW_SLOTS = ["r1", "r2", "r3"];

/** Placeholder mirroring Row; phantom-ui shimmers it while data loads. */
function RowSkeleton() {
  return (
    <phantom-ui loading aria-hidden>
      <div className="flex items-center gap-3 py-4">
        <div className="size-10 shrink-0 rounded-full bg-shade" />
        <div>
          <div className="text-[15px] font-medium">Issuer Name Here</div>
          <div className="text-sm text-soft">Payor: Company ApS</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[15px] font-medium">$120,000</div>
          <div className="mt-0.5 text-xs">0.00%</div>
        </div>
      </div>
    </phantom-ui>
  );
}

function Column({
  title,
  badge,
  bonds,
  loading,
  secondary,
}: Readonly<{
  title: string;
  badge?: string;
  bonds: InvoiceBond[];
  loading: boolean;
  secondary: SecondaryLine;
}>) {
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <h2 className="text-2xl font-medium tracking-tight">{title}</h2>
        {badge && (
          <span className="rounded-md bg-shade px-1.5 py-0.5 text-[10px] font-medium text-soft">
            {badge}
          </span>
        )}
      </div>
      <div className="divide-y divide-line">
        {loading
          ? ROW_SLOTS.map((id) => <RowSkeleton key={id} />)
          : bonds.map((b) => <Row key={b.id} bond={b} secondary={secondary} />)}
      </div>
    </div>
  );
}

const notMatured = (b: InvoiceBond) => b.status === "open" || b.status === "funded";

export function TopLists({ bonds, loading }: Readonly<{ bonds: InvoiceBond[]; loading: boolean }>) {
  const byApy = [...bonds]
    .filter((b) => b.status === "open")
    .sort((a, b) => impliedApyPct(b) - impliedApyPct(a))
    .slice(0, 3);
  const byMaturity = bonds
    .filter(notMatured)
    .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate))
    .slice(0, 3);
  const byNewest = [...bonds].sort((a, b) => b.issueDate.localeCompare(a.issueDate)).slice(0, 3);

  return (
    <section className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3">
      <Column
        title="Top Yields"
        badge="APY"
        bonds={byApy}
        loading={loading}
        secondary={SECONDARY.apy}
      />
      <Column
        title="Maturing Soon"
        bonds={byMaturity}
        loading={loading}
        secondary={SECONDARY.maturity}
      />
      <Column
        title="Newly Issued"
        bonds={byNewest}
        loading={loading}
        secondary={SECONDARY.newest}
      />
    </section>
  );
}
