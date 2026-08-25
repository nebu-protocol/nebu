"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Circle, CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { useWallet } from "@/features/wallet/wallet-provider";
import { fmtDate, fmtUsdc, truncateAddress, truncateHash } from "@/lib/format";
import { humanizeTxError, txLink } from "@/lib/live/chain";
import {
  clearDraft,
  draftDoneSteps,
  ISSUANCE_STEPS,
  type IssuanceDraft,
  type IssuanceStepId,
  runIssuance,
} from "@/lib/live/issue";

type StepState = { status: "idle" | "working" | "done" | "error"; label?: string; hash?: string };

type StepMap = Record<IssuanceStepId, StepState>;

function initialSteps(draft: IssuanceDraft): StepMap {
  const done = draftDoneSteps(draft);
  return Object.fromEntries(
    ISSUANCE_STEPS.map((s) => [s.id, { status: done.has(s.id) ? "done" : "idle" }]),
  ) as StepMap;
}

function StepIcon({ status }: Readonly<{ status: StepState["status"] }>) {
  switch (status) {
    case "done":
      return <CircleCheck size={18} className="shrink-0 text-pos" strokeWidth={2} />;
    case "working":
      return <LoaderCircle size={18} className="shrink-0 animate-spin text-soft" strokeWidth={2} />;
    case "error":
      return <CircleX size={18} className="shrink-0 text-neg" strokeWidth={2} />;
    default:
      return <Circle size={18} className="shrink-0 text-faint" strokeWidth={1.5} />;
  }
}

function StepRow({
  title,
  state,
  error,
}: Readonly<{ title: string; state: StepState; error?: string }>) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5">
        <StepIcon status={state.status} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-sm ${state.status === "idle" ? "text-soft" : "font-medium"}`}>
          {title}
        </div>
        {state.status === "working" && state.label && (
          <p className="mt-0.5 text-xs text-soft">{state.label}</p>
        )}
        {state.status === "error" && error && (
          <p className="mt-0.5 text-xs text-neg" role="alert">
            {error}
          </p>
        )}
        {state.hash && (
          <a
            href={txLink(state.hash)}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-block text-xs text-soft underline hover:text-ink"
          >
            View transaction on HashScan
          </a>
        )}
      </div>
    </li>
  );
}

/** Summary strip above the checklist: what is being issued. */
function DraftSummary({ draft }: Readonly<{ draft: IssuanceDraft }>) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-shade/60 p-4 text-sm sm:grid-cols-4">
      <div>
        <dt className="text-xs text-soft">Payor</dt>
        <dd className="mt-0.5 truncate font-medium">{draft.payorName}</dd>
      </div>
      <div>
        <dt className="text-xs text-soft">Face value</dt>
        <dd className="tabular mt-0.5 font-medium">{fmtUsdc(draft.faceUsdc)}</dd>
      </div>
      <div>
        <dt className="text-xs text-soft">Due</dt>
        <dd className="tabular mt-0.5 font-medium">
          {fmtDate(new Date(draft.maturity * 1000).toISOString())}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-soft">Invoice id</dt>
        <dd className="mt-0.5 font-mono text-xs">{truncateHash(draft.invoiceId)}</dd>
      </div>
    </dl>
  );
}

/** Success banner once the listing lands. */
function ListedBanner({ invoiceId }: Readonly<{ invoiceId: string }>) {
  return (
    <div className="mt-2 rounded-xl bg-[#e9f4ee] p-4 text-sm">
      <div className="font-medium">Invoice listed on the marketplace.</div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs">
        <Link
          href={`/invoices/${invoiceId}`}
          className="flex items-center gap-1 font-medium underline hover:text-ink"
        >
          View the listing <ArrowRight size={13} />
        </Link>
        <Link href="/issuer" className="underline hover:text-ink">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

/** Connect / start / resume button with the SDK-booting shimmer. */
function StartButton({
  booting,
  address,
  running,
  label,
  connect,
  onStart,
}: Readonly<{
  booting: boolean;
  address?: string;
  running: boolean;
  label: string;
  connect: () => void;
  onStart: () => void;
}>) {
  if (booting) {
    return <div aria-hidden className="mt-2 h-12 w-full animate-pulse rounded-xl bg-shade" />;
  }
  return (
    <button
      type="button"
      disabled={running}
      onClick={address ? onStart : connect}
      className="mt-2 h-12 w-full rounded-xl bg-ink text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-60"
    >
      {address ? (running ? "Working…" : label) : "Connect Wallet"}
    </button>
  );
}

/**
 * Drives the on-chain issuance sequence step by step from the connected
 * wallet. Progress persists to localStorage after every transaction, so a
 * refresh resumes here and already-confirmed steps are skipped (the chain is
 * re-checked before anything is re-sent).
 */
export function IssuanceChecklist({
  draft: initialDraft,
  onDiscard,
}: Readonly<{ draft: IssuanceDraft; onDiscard: () => void }>) {
  const { address, booting, connect, getWalletClient } = useWallet();
  const queryClient = useQueryClient();
  const draftRef = useRef(initialDraft);
  const [steps, setSteps] = useState<StepMap>(() => initialSteps(initialDraft));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ step: IssuanceStepId; message: string } | null>(null);
  const lastStep = useRef<IssuanceStepId>("deploy");

  const complete = steps.list.status === "done";
  const started = ISSUANCE_STEPS.some((s) => steps[s.id].status !== "idle");

  async function start() {
    setRunning(true);
    setError(null);
    try {
      await runIssuance({
        getWalletClient,
        draft: draftRef.current,
        onStep: (step, update) => {
          lastStep.current = step;
          setSteps((prev) => ({
            ...prev,
            [step]: {
              status: update.status,
              label: update.label,
              hash: update.hash ?? prev[step].hash,
            },
          }));
        },
      });
      clearDraft(draftRef.current);
      await queryClient.invalidateQueries();
    } catch (err) {
      const step = lastStep.current;
      setError({ step, message: humanizeTxError(err) });
      setSteps((prev) => ({ ...prev, [step]: { ...prev[step], status: "error" } }));
    } finally {
      setRunning(false);
    }
  }

  const buttonLabel = error ? "Retry" : started ? "Resume issuance" : "Start issuance";

  return (
    <section className="mt-8 rounded-2xl border border-line bg-white p-5">
      <h2 className="text-[15px] font-medium">Issue and list on-chain</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-soft">
        Invoice registered with the compliance API. The steps below run from your wallet
        {address ? ` (${truncateAddress(address)})` : ""} on Hedera testnet — about 13 transactions
        costing roughly 11 HBAR in gas. Safe to leave and come back: progress is saved and completed
        steps are skipped.
      </p>

      <div className="mt-4">
        <DraftSummary draft={draftRef.current} />
      </div>

      <ol className="mt-2 divide-y divide-line">
        {ISSUANCE_STEPS.map((s) => (
          <StepRow
            key={s.id}
            title={s.title}
            state={steps[s.id]}
            error={error?.step === s.id ? error.message : undefined}
          />
        ))}
      </ol>

      {complete ? (
        <ListedBanner invoiceId={draftRef.current.invoiceId} />
      ) : (
        <StartButton
          booting={booting}
          address={address}
          running={running}
          label={buttonLabel}
          connect={connect}
          onStart={start}
        />
      )}

      {!complete && !running && (
        <button
          type="button"
          onClick={() => {
            clearDraft(draftRef.current);
            onDiscard();
          }}
          className="mt-3 w-full text-center text-xs text-soft underline hover:text-ink"
        >
          Discard this draft and start over
        </button>
      )}
    </section>
  );
}
