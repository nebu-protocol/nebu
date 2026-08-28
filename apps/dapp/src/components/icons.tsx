import type { SVGProps } from "react";

import { curatedLogoFor } from "@/components/company-logos";
import { TREND_COLOR, type Trend } from "@/lib/format";
import { markFor } from "@/lib/identity";

type IconProps = Readonly<SVGProps<SVGSVGElement> & { size?: number }>;

/** Logo BNB Chain: koin emas Binance + mark resmi (2 chevron + 3 berlian). Vektor, tanpa aset biner. */
export function BnbIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="12" fill="#F0B90B" />
      {/* mark resmi Binance (0..24), diperkecil 0.62 & dipusatkan agar ada padding spt logo asli */}
      <g transform="translate(12 12) scale(0.62) translate(-12 -12)" fill="#181A1E">
        <path d="M16.624 13.9202l2.7175 2.7154-7.353 7.353-7.353-7.352 2.7175-2.7164 4.6355 4.6595 4.6356-4.6595zm4.6366-4.6366L24 12l-2.7218 2.7218-2.7218-2.7218 2.7218-2.7218zM12 4.6335l4.6356 4.6595L13.9209 12 12 10.0791 10.0791 12 7.3644 9.293 12 4.6335zM2.7218 9.2782L5.4436 12l-2.7218 2.7218L0 12l2.7218-2.7218zM12 0l7.353 7.353-2.7175 2.7164L12 5.4386 7.3644 10.0332 4.6469 7.3168 12 0z" />
      </g>
    </svg>
  );
}

export function UsdcIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" {...props}>
      <circle cx="16" cy="16" r="16" fill="#2775ca" />
      <path
        d="M13 25.2a10 10 0 0 1 0-18.4M19 6.8a10 10 0 0 1 0 18.4"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <text
        x="16"
        y="20.6"
        textAnchor="middle"
        fontSize="13"
        fontWeight="600"
        fill="#fff"
        fontFamily="system-ui, sans-serif"
      >
        $
      </text>
    </svg>
  );
}

export function XIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...props}>
      <path
        d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L2.8 2h6.4l4.4 5.9zm-1.1 18.2h1.7L7.1 3.7H5.3z"
        fill="currentColor"
      />
    </svg>
  );
}

export function GithubIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...props}>
      <path
        d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 2.9.8.1-.6.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7 0-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .6 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Rounded triangle price-change arrow, matching Ondo's chart cards. */
export function TrendArrow({
  dir,
  size = 10,
  ...props
}: IconProps & Readonly<{ dir: "up" | "down" }>) {
  return (
    <svg
      viewBox="0 0 9 8"
      width={size}
      height={size * 0.89}
      style={dir === "down" ? { transform: "rotate(180deg)" } : undefined}
      aria-hidden="true"
      {...props}
    >
      <path
        d="M3.557 1.034c.408-.579 1.278-.579 1.686 0l3.373 4.783c.471.669-.016 1.583-.844 1.583H1.028c-.828 0-1.315-.914-.844-1.583z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Trend-colored change row: arrow + tabular mono text, shared by cards,
    top lists, and the asset header. */
export function TrendText({
  trend,
  arrowSize = 10,
  className = "",
  children,
}: Readonly<{
  trend: Trend;
  arrowSize?: number;
  className?: string;
  children: React.ReactNode;
}>) {
  return (
    <div
      className={`tabular flex items-center gap-1.5 font-mono ${className}`}
      style={{ color: TREND_COLOR[trend] }}
    >
      {trend !== "flat" && <TrendArrow dir={trend} size={arrowSize} />}
      {children}
    </div>
  );
}

/** The connected-wallet identicon (blue radial orb); size via className. */
export function WalletAvatar({ className = "" }: { className?: string }) {
  return (
    <span
      className={`rounded-full bg-[radial-gradient(circle_at_30%_30%,#7fb2ff_0%,#2f6fed_45%,#1b2f6e_100%)] ${className}`}
    />
  );
}

/** Company mark: curated logo when one is registered, generated mark otherwise. */
export function CompanyAvatar({
  name,
  className = "size-10 text-sm",
}: Readonly<{ name: string; className?: string }>) {
  const curated = curatedLogoFor(name);
  if (curated) {
    return (
      <span aria-hidden className={`flex shrink-0 overflow-hidden rounded-full ${className}`}>
        <svg className="h-full w-full" role="presentation" viewBox="0 0 40 40">
          <rect width="40" height="40" fill={curated.bg} />
          {curated.art}
        </svg>
      </span>
    );
  }
  const mark = markFor(name);
  const gid = `g-${mark.key}`;
  return (
    <span aria-hidden className={`flex shrink-0 overflow-hidden rounded-full ${className}`}>
      <svg className="h-full w-full" role="presentation" viewBox="0 0 40 40">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={mark.paletteB} />
            <stop offset="100%" stopColor={mark.paletteA} />
          </linearGradient>
        </defs>
        <rect width="40" height="40" fill={`url(#${gid})`} />
        {mark.motif === 0 && <circle cx="30" cy="10" r="14" fill={mark.fg} opacity="0.16" />}
        {mark.motif === 1 && (
          <g fill={mark.fg} opacity="0.18">
            <rect x="6" y="24" width="6" height="12" rx="1.5" />
            <rect x="15" y="18" width="6" height="18" rx="1.5" />
            <rect x="24" y="12" width="6" height="24" rx="1.5" />
          </g>
        )}
        {mark.motif === 2 && <path d="M-4 30 20 14l24 16v14H-4z" fill={mark.fg} opacity="0.15" />}
        {mark.motif === 3 && (
          <g fill="none" stroke={mark.fg} opacity="0.22" strokeWidth="2">
            <circle cx="20" cy="20" r="15" />
            <circle cx="20" cy="20" r="9" />
          </g>
        )}
        {mark.motif === 4 && (
          <g fill={mark.fg} opacity="0.2">
            {[8, 20, 32].map((x) =>
              [8, 20, 32].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.4" />),
            )}
          </g>
        )}
        {mark.motif === 5 && <path d="M0 40 40 0v12L12 40H0z" fill={mark.fg} opacity="0.16" />}
        <text
          x="20"
          y="26.5"
          textAnchor="middle"
          fontFamily="var(--font-sans)"
          fontSize="18"
          fontWeight="600"
          fill={mark.fg}
        >
          {mark.letter}
        </text>
      </svg>
    </span>
  );
}
