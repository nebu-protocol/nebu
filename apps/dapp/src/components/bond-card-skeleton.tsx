"use client";

/** Invisible placeholder mirroring BondCard; phantom-ui measures it to
    draw the shimmer. Keep the structure in sync with bond-card.tsx. */
export function BondCardSkeleton() {
  return (
    <phantom-ui loading aria-hidden>
      <div className="overflow-hidden rounded-3xl border border-line bg-white">
        <div className="flex items-center gap-3 p-5 pb-0">
          <div className="size-10 shrink-0 rounded-full bg-shade" />
          <div>
            <div className="text-[15px] font-medium">Issuer Name Here</div>
            <div className="text-[13px] text-soft">Payor: Company ApS</div>
          </div>
        </div>
        <div className="px-5 pt-4">
          <div className="text-[28px] font-medium">$120,000</div>
          <div className="mt-1 text-xs">8.00% APY (60% funded) 30D</div>
        </div>
        <div className="mx-5 mt-2 mb-5 h-24 rounded-xl bg-shade" />
      </div>
    </phantom-ui>
  );
}
