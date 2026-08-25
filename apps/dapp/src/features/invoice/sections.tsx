"use client";

import {
  ArrowLeftRight,
  BadgeCheck,
  CalendarClock,
  CircleCheckBig,
  Coins,
  FileText,
  Fingerprint,
  Info,
  Landmark,
} from "lucide-react";

import { CompanyAvatar } from "@/components/icons";
import { Progress } from "@/components/progress";
import { fmtBps, fmtDate, fmtTimestamp, fmtUsdc, truncateHash } from "@/lib/format";
import { SECTOR_LABELS } from "@/lib/identity";
import { useAuditTrail } from "@/lib/live/hooks";
import {
  daysToMaturity,
  type HcsEventKind,
  type InvoiceBond,
  pricePerFace,
  targetUsdc,
  tenorDays,
} from "@/lib/mock";

/* -------- The template's asset-page section idioms (sections.tsx) -------- */

export function SectionTitle({
  children,
  sup,
}: Readonly<{ children: React.ReactNode; sup?: string }>) {
  return (
    <h2 className="text-xl font-medium tracking-tight">
      {children}
      {sup && <sup className="ml-0.5 text-xs text-soft">{sup}</sup>}
    </h2>
  );
}

function InfoTip({ text }: Readonly<{ text: string }>) {
  return (
    <span title={text} className="inline-flex align-middle text-faint">
      <Info size={13} />
    </span>
  );
}

export function KVRow({
  label,
  children,
  info,
}: Readonly<{
  label: React.ReactNode;
  children: React.ReactNode;
  info?: string;
}>) {
  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line py-2.5">
      <span className="flex shrink-0 items-center gap-1.5 text-sm text-soft">
        {label}
        {info && <InfoTip text={info} />}
      </span>
      <span className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-right text-sm font-medium">
        {children}
      </span>
    </div>
  );
}

/* ------------------------------ About / details ---------------------------- */

export function InvoiceDetailsSection({ bond }: Readonly<{ bond: InvoiceBond }>) {
  const days = daysToMaturity(bond);
  return (
    <section className="mt-12">
      <SectionTitle>About this Invoice</SectionTitle>
      <p className="mt-3 text-[15px] leading-relaxed text-body">
        An unpaid invoice from {bond.issuer} to {bond.payor}, tokenized as a compliant bond on
        Hedera. Investors fund it at a {fmtBps(bond.discountBps)} discount and holders receive{" "}
        {fmtUsdc(bond.faceValueUsdc)} in USDC when the payor settles at maturity.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-x-10 md:grid-cols-2">
        <KVRow label="Face Value">{fmtUsdc(bond.faceValueUsdc)}</KVRow>
        <KVRow label="Payor">
          <span className="flex items-center gap-2">
            <CompanyAvatar name={bond.payor} className="size-5 text-[9px]" />
            {bond.payor}
          </span>
        </KVRow>
        {bond.sector ? <KVRow label="Sector">{SECTOR_LABELS[bond.sector]}</KVRow> : null}
        <KVRow label="Issued">{fmtDate(bond.issueDate)}</KVRow>
        <KVRow label="Maturity">{fmtDate(bond.maturityDate)}</KVRow>
        <KVRow label="Tenor">{tenorDays(bond)} days</KVRow>
        <KVRow label="Time to Maturity">{days > 0 ? `${days} days` : "Matured"}</KVRow>
        <KVRow label="Issuance Discount">{fmtBps(bond.discountBps)}</KVRow>
        <KVRow label="Price per 1 USDC Face">${pricePerFace(bond).toFixed(4)}</KVRow>
        <KVRow
          label="Document SHA-256"
          info="The underlying invoice PDF stays private between issuer, payor, and compliance — only its SHA-256 fingerprint is anchored on-chain."
        >
          {bond.documentSha256 ? (
            <span title={bond.documentSha256} className="font-mono text-[13px]">
              {truncateHash(bond.documentSha256)}
            </span>
          ) : (
            "Not anchored yet"
          )}
        </KVRow>
        <KVRow label="HCS Topic">
          <span className="font-mono text-[13px]">{bond.hcsTopicId}</span>
        </KVRow>
      </div>
    </section>
  );
}

/* --------------------------------- Funding --------------------------------- */

export function FundingSection({ bond }: Readonly<{ bond: InvoiceBond }>) {
  const target = targetUsdc(bond);
  const raised = (target * bond.fundedPct) / 100;
  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle>Funding Progress</SectionTitle>
        <span className="tabular text-sm text-soft">
          {fmtUsdc(raised)} raised · {bond.fundedPct}% of target
        </span>
      </div>
      <Progress pct={bond.fundedPct} className="mt-4 h-2" />
      <div className="mt-2 flex justify-between text-xs text-soft">
        <span>
          Target <span className="tabular">{fmtUsdc(target)}</span> (face − discount)
        </span>
        <span>
          Repays <span className="tabular">{fmtUsdc(bond.faceValueUsdc)}</span> at maturity
        </span>
      </div>
    </section>
  );
}

/* ------------------------------- Audit trail ------------------------------- */

const KIND_META: Record<HcsEventKind, { label: string; icon: typeof FileText }> = {
  invoice_submitted: { label: "Invoice Submitted", icon: FileText },
  document_hashed: { label: "Document Hashed", icon: Fingerprint },
  compliance_verified: { label: "Compliance Verified", icon: BadgeCheck },
  bond_issued: { label: "Bond Issued", icon: Landmark },
  investment: { label: "Investment", icon: Coins },
  secondary_trade: { label: "Secondary Trade", icon: ArrowLeftRight },
  maturity_reached: { label: "Maturity Reached", icon: CalendarClock },
  settlement: { label: "Settlement", icon: CircleCheckBig },
};

/**
 * HCS audit trail: every lifecycle event of the bond as consensus messages
 * on its Hedera topic, newest last. Live bonds read real topic messages from
 * the mirror node; demo fixtures render their embedded events.
 */
export function AuditTrail({ bond }: Readonly<{ bond: InvoiceBond }>) {
  const live = useAuditTrail(bond);
  const events = bond.live ? (live.data ?? []) : bond.events;
  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle>HCS Audit Trail</SectionTitle>
        <span className="font-mono text-xs text-soft">Topic {bond.hcsTopicId}</span>
      </div>
      {bond.live && live.isLoading && (
        <p className="mt-4 text-sm text-soft">Loading consensus messages…</p>
      )}
      {bond.live && !live.isLoading && events.length === 0 && (
        <p className="mt-4 text-sm text-soft">
          {live.isError
            ? "Could not reach the Hedera mirror node."
            : "No attestations anchored for this invoice yet."}
        </p>
      )}
      <ol className="mt-6">
        {events.map((event, i) => {
          const meta = KIND_META[event.kind];
          const Icon = meta.icon;
          const last = i === events.length - 1;
          return (
            <li key={event.sequence} className="relative flex gap-4 pb-6 last:pb-0">
              {!last && (
                <span
                  aria-hidden
                  className="absolute top-9 left-[17px] h-[calc(100%-2.25rem)] w-px bg-line"
                />
              )}
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-white text-soft">
                <Icon size={16} strokeWidth={1.75} />
              </span>
              <div className="min-w-0 pt-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-medium">{meta.label}</span>
                  <span className="font-mono text-[11px] text-faint">#{event.sequence}</span>
                </div>
                <p className="mt-0.5 text-sm text-body">{event.detail}</p>
                <div className="tabular mt-0.5 text-xs text-soft">
                  {fmtTimestamp(event.timestamp)}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
