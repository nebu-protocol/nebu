import { Sparkline } from "@/components/sparkline";
import { TokenIcon } from "@/components/token-icon";
import type { PoolRow } from "@/lib/lpdata";

const kfmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${Math.round(n)}`);

/** Kartu pool ala launchpad: token art + pair + APR + volume + sparkline. */
export function PoolCard({ p }: { p: PoolRow }) {
  const up = (p.changePct ?? 0) >= 0;
  return (
    <div className="group rounded-xl border border-line/60 bg-white p-3 transition hover:-translate-y-0.5 hover:border-line hover:shadow-md">
      <div className="flex items-center gap-2.5">
        <TokenIcon symbol={p.sym1} address={p.address} size={38} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{p.pair}</div>
          <div className="text-[11px] text-faint">PancakeSwap</div>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-faint">APR</div>
          <div className="text-base font-semibold text-emerald-600">{p.apr20.toFixed(1)}%</div>
        </div>
        <div className="h-7 w-16">
          <Sparkline values={p.spark?.length ? p.spark : [1, 1.02]} trend={up ? "up" : "down"} animate={false} />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-line/60 pt-2 text-[11px] text-soft">
        <span>Vol {kfmt(p.volEth ?? 0)}</span>
        <span>{Math.round(p.swapsPerH)} sw/h</span>
      </div>
    </div>
  );
}
