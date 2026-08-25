"use client";

import { ArrowLeft, FileUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { UsdcIcon } from "@/components/icons";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { useToast } from "@/components/toast";
import { DEMO_DATA, registerApiInvoice } from "@/lib/live/chain";
import {
  deriveAddressFromName,
  type IssuanceDraft,
  loadUnfinishedDraft,
  saveDraft,
} from "@/lib/live/issue";

import { IssuanceChecklist } from "./issuance-checklist";

// Template input idioms: text fields use the explore search pill, the
// amount uses the trade widget's AmountPanel with a USDC chip.
const inputClass =
  "h-11 w-full rounded-full border border-line bg-white px-4 text-sm outline-none placeholder:text-faint focus:border-ink";

const sanitizeAmount = (v: string) => v.replace(/[^0-9]/g, "");

/** Due dates are end-of-day UTC so a next-day invoice is still in the future. */
function maturityOf(dueDate: string): number {
  return Math.floor(Date.parse(`${dueDate}T23:59:59Z`) / 1000);
}

/**
 * Submit-invoice form. The document never leaves the browser: its SHA-256 is
 * computed client-side via Web Crypto, and that fingerprint is what gets
 * registered with the API (its duplicate-hash guard blocks double pledging)
 * and anchored to the bond's HCS topic.
 *
 * Live mode registers the invoice with the Go API, then hands off to the
 * issuance checklist that drives the on-chain sequence from the connected
 * wallet. An unfinished issuance resumes here after a refresh.
 */
export function SubmitInvoiceForm() {
  const [faceValue, setFaceValue] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [draft, setDraft] = useState<IssuanceDraft | null>(null);
  const [toast, showToast] = useToast();

  // Resume an unfinished issuance (localStorage, so client-only).
  useEffect(() => {
    if (!DEMO_DATA) {
      setDraft(loadUnfinishedDraft() ?? null);
    }
  }, []);

  const onFile = async (file: File | undefined) => {
    if (!file) {
      setFileName(null);
      setHash(null);
      return;
    }
    setFileName(file.name);
    setHash(null);
    setHashing(true);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      setHash([...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""));
    } finally {
      setHashing(false);
    }
  };

  async function submitLive(form: HTMLFormElement) {
    const payorName = String(new FormData(form).get("payor") ?? "").trim();
    const dueDate = String(new FormData(form).get("dueDate") ?? "");
    if (!(payorName && dueDate && faceValue && Number(faceValue) > 0 && hash)) {
      setSubmitError(
        hashing ? "Still hashing the document — try again in a second." : "Fill in every field.",
      );
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const maturity = maturityOf(dueDate);
    try {
      const invoice = await registerApiInvoice({
        // The API wants an EVM address; demo payors get a name-derived one.
        payor: deriveAddressFromName(payorName),
        faceValue: (BigInt(faceValue) * 1_000_000n).toString(),
        dueDate: new Date(maturity * 1000).toISOString(),
        docHash: hash,
      });
      const next: IssuanceDraft = {
        invoiceUuid: invoice.id,
        invoiceId: invoice.invoiceId,
        payorName,
        faceUsdc: Number(faceValue),
        maturity,
        docHash: hash,
        updatedAt: Date.now(),
      };
      saveDraft(next);
      setDraft(next);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Header />
      <main className="container-page pb-24">
        <div className="mx-auto w-full max-w-2xl py-10">
          <Link
            href="/issuer"
            className="flex w-fit items-center gap-1.5 text-sm text-soft hover:text-ink"
          >
            <ArrowLeft size={15} />
            Back to dashboard
          </Link>
          <h1 className="mt-4 text-2xl font-medium tracking-tight">Tokenize an Invoice</h1>
          <p className="mt-2 text-sm text-soft">
            {draft
              ? "Resume the issuance below — registration is done, only the on-chain steps remain."
              : "Submit an unpaid invoice, then issue it as a bond and list it on the marketplace."}
          </p>

          {draft ? (
            <IssuanceChecklist
              key={draft.invoiceId}
              draft={draft}
              onDiscard={() => setDraft(null)}
            />
          ) : (
            <form
              className="mt-8 flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (DEMO_DATA) {
                  showToast("Demo data — set NEXT_PUBLIC_DEMO_DATA=0 to tokenize invoices");
                  return;
                }
                void submitLive(e.currentTarget);
              }}
            >
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Payor
                <input
                  name="payor"
                  required
                  placeholder="Company that owes the invoice"
                  className={inputClass}
                />
              </label>

              <div className="grid grid-cols-1 items-end gap-5 sm:grid-cols-2">
                <div className="rounded-2xl bg-[#f6f6f4] p-4">
                  <div className="text-xs text-soft">Face value</div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <input
                      name="faceValue"
                      value={faceValue}
                      onChange={(e) => setFaceValue(sanitizeAmount(e.target.value))}
                      inputMode="numeric"
                      required
                      placeholder="120000"
                      aria-label="Face value (USDC)"
                      className="tabular w-full min-w-0 bg-transparent text-[28px] font-medium outline-none placeholder:text-faint"
                    />
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white py-1.5 pr-3 pl-1.5 text-sm font-medium">
                      <UsdcIcon size={22} />
                      USDC
                    </span>
                  </div>
                </div>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Due date
                  <input name="dueDate" type="date" required className={inputClass} />
                </label>
              </div>

              <div className="flex flex-col gap-1.5 text-sm font-medium">
                Invoice document
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-white p-8 text-center hover:border-faint">
                  <FileUp size={22} className="text-faint" strokeWidth={1.5} />
                  <span className="text-sm font-normal text-body">
                    {fileName ?? "Choose a PDF — hashed locally, never uploaded"}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    required
                    className="sr-only"
                    onChange={(e) => onFile(e.target.files?.[0])}
                  />
                </label>
                {hashing && <p className="text-xs font-normal text-soft">Computing SHA-256…</p>}
                {hash && (
                  <div className="rounded-xl bg-shade/60 px-4 py-3 font-mono text-xs font-normal break-all text-soft">
                    sha256:{hash}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 h-12 w-full rounded-xl bg-ink text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-60"
              >
                {submitting ? "Registering…" : "Submit for Review"}
              </button>
              {submitError && (
                <p className="text-xs text-neg" role="alert">
                  {submitError}
                </p>
              )}
              <p className="text-[11px] leading-relaxed text-faint">
                {DEMO_DATA
                  ? "Demo interface with mock data — nothing is uploaded or submitted. In production the document hash is anchored to a Hedera Consensus Service topic and the invoice enters compliance review."
                  : "Registering stores only the document hash with the compliance API. Issuing then runs about 13 transactions from your wallet on Hedera testnet (~11 HBAR in gas): bond deployment, compliance setup, minting, and the market listing."}
              </p>
            </form>
          )}
        </div>
      </main>
      {toast}
      <Footer />
    </>
  );
}
