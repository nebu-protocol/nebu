import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { InvoicePage, LiveInvoicePage } from "@/features/invoice/invoice-page";
import { fmtPct, fmtUsdc } from "@/lib/format";
import { DEMO_DATA } from "@/lib/live/chain";
import { getBond, impliedApyPct } from "@/lib/mock";

type Params = Readonly<{ params: Promise<{ id: string }> }>;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const bond = DEMO_DATA ? getBond(id) : undefined;
  if (!bond) {
    // Live invoices resolve client-side from the mirror node.
    return { title: "Invoice bond", alternates: { canonical: `/invoices/${id}` } };
  }
  const title = `${bond.issuer} · ${fmtUsdc(bond.faceValueUsdc)} invoice bond`;
  const description =
    `Invoice bond ${bond.id.toUpperCase()} by ${bond.issuer}: ` +
    `${fmtPct(impliedApyPct(bond))} implied APY, repaid by ${bond.payor} at maturity. ` +
    `Compliant invoice financing on Hedera.`;
  return {
    title,
    description,
    alternates: { canonical: `/invoices/${bond.id}` },
    openGraph: { title, description },
  };
}

export default async function Page({ params }: Params) {
  const { id } = await params;
  if (!DEMO_DATA) {
    return <LiveInvoicePage id={id} />;
  }
  const bond = getBond(id);
  // Pending invoices are issuer-only and never listed publicly.
  if (!bond || bond.status === "pending") notFound();
  return <InvoicePage bond={bond} />;
}
