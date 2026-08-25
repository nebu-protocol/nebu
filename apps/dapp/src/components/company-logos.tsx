// Curated, hand-designed logo marks for the market's (fictional) companies.
// Real-company logos are off the table — these are bespoke industry pictograms,
// registered by exact company name. Anything not in the registry falls back to
// the deterministic generated mark in icons.tsx.

type Logo = { bg: string; art: React.ReactNode };

const F = "#ffffff";

/** 40×40 viewBox pictograms; the wrapper span rounds and sizes them. */
export const CURATED_LOGOS: Record<string, Logo> = {
  "PT Andalan Tekstil Mandiri": {
    bg: "#2c3a8f",
    art: (
      <g stroke={F} strokeWidth="2.2" strokeLinecap="round" fill="none">
        <path d="M12 10v20M28 10v20" />
        <path d="M12 14c5 3 11-3 16 0M12 20c5 3 11-3 16 0M12 26c5 3 11-3 16 0" opacity="0.9" />
      </g>
    ),
  },
  "Nusantara Retail Group": {
    bg: "#b3372c",
    art: (
      <g fill="none" stroke={F} strokeWidth="2.2" strokeLinejoin="round">
        <path d="M11 15h18l-1.6 15H12.6z" />
        <path d="M15.5 15v-2.5a4.5 4.5 0 0 1 9 0V15" strokeLinecap="round" />
      </g>
    ),
  },
  "Adriatic Freight Solutions d.o.o.": {
    bg: "#123a5c",
    art: (
      <g fill={F}>
        <path d="M9 23h22l-2.5 6h-17z" />
        <rect x="13" y="18" width="6" height="4" rx="0.5" opacity="0.9" />
        <rect x="20" y="18" width="6" height="4" rx="0.5" opacity="0.7" />
        <rect x="17" y="13" width="6" height="4" rx="0.5" opacity="0.8" />
      </g>
    ),
  },
  "Bavaria Machinery Group": {
    bg: "#3d454d",
    art: (
      <g fill="none" stroke={F} strokeWidth="2.4">
        <circle cx="20" cy="20" r="5.5" />
        <path
          strokeLinecap="round"
          d="M20 9.5v3.5M20 27v3.5M9.5 20H13M27 20h3.5M12.6 12.6l2.5 2.5M24.9 24.9l2.5 2.5M27.4 12.6l-2.5 2.5M15.1 24.9l-2.5 2.5"
        />
      </g>
    ),
  },
  "Deccan Pharma Distributors": {
    bg: "#0e6f6a",
    art: (
      <g transform="rotate(-38 20 20)">
        <rect
          x="12"
          y="15.4"
          width="16"
          height="9.2"
          rx="4.6"
          fill="none"
          stroke={F}
          strokeWidth="2.2"
        />
        <path d="M20 15.4v9.2" stroke={F} strokeWidth="2.2" />
        <rect x="12" y="15.4" width="8" height="9.2" rx="4.6" fill={F} opacity="0.35" />
      </g>
    ),
  },
  "Crescent Hospitals Group": {
    bg: "#1c7a43",
    art: (
      <g fill={F}>
        <path d="M24.5 10a11 11 0 1 0 0 20 12.5 12.5 0 0 1 0-20z" opacity="0.95" />
        <path d="M25.4 17.6h2.8v2.8h2.8v2.8h-2.8V26h-2.8v-2.8h-2.8v-2.8h2.8z" />
      </g>
    ),
  },
  "Cafetales del Sur S.A.": {
    bg: "#5a3a24",
    art: (
      <g transform="rotate(-24 20 20)" fill="none" stroke={F} strokeWidth="2.2">
        <ellipse cx="20" cy="20" rx="7.5" ry="10" />
        <path d="M20 10c-3.5 3.5-3.5 16.5 0 20" strokeLinecap="round" />
      </g>
    ),
  },
  "Pacific Grain Traders Ltd": {
    bg: "#9a7716",
    art: (
      <g stroke={F} strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M20 31V12" />
        <path d="M20 15c0-3.5 3-6 6-6 0 3.5-3 6-6 6zM20 15c0-3.5-3-6-6-6 0 3.5 3 6 6 6zM20 21c0-3.5 3-6 6-6 0 3.5-3 6-6 6zM20 21c0-3.5-3-6-6-6 0 3.5 3 6 6 6zM20 27c0-3.5 3-6 6-6 0 3.5-3 6-6 6zM20 27c0-3.5-3-6-6-6 0 3.5 3 6 6 6z" />
      </g>
    ),
  },
  "Bosphorus Build Contracting": {
    bg: "#b4551d",
    art: (
      <g stroke={F} strokeWidth="2.2" strokeLinecap="round" fill="none">
        <path d="M13 31V11l16 6M13 17l16 0" opacity="0.95" />
        <path d="M29 17v5m0 0h-3m3 0h0" />
        <path d="M9 31h22" />
      </g>
    ),
  },
  "Anatolia Infrastructure Holding": {
    bg: "#6e6257",
    art: (
      <g fill={F}>
        <rect x="9" y="27" width="22" height="3" rx="1" />
        <path d="M11 27v-9a9 9 0 0 1 18 0v9h-4v-9a5 5 0 0 0-10 0v9z" />
      </g>
    ),
  },
  "Mekong Garment Works": {
    bg: "#6d3560",
    art: (
      <g fill="none" stroke={F} strokeWidth="2.2" strokeLinecap="round">
        <path d="M26 10 14 22" />
        <circle cx="27.2" cy="8.8" r="1.6" fill={F} stroke="none" />
        <path d="M14 22c-4 4-4 8 0 8s10-6 12-12" opacity="0.9" />
      </g>
    ),
  },
  "Northline Apparel Buyers Ltd": {
    bg: "#2b5d8c",
    art: (
      <g fill="none" stroke={F} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 13a2.5 2.5 0 1 1 2.5-2.5" />
        <path d="M20 13 9.5 22.5a2 2 0 0 0 1.3 3.5h18.4a2 2 0 0 0 1.3-3.5z" />
      </g>
    ),
  },
  "Meridian Staffing Partners": {
    bg: "#39538c",
    art: (
      <g fill={F}>
        <circle cx="14.5" cy="15" r="3.4" />
        <circle cx="25.5" cy="15" r="3.4" opacity="0.75" />
        <path d="M8.5 29c0-4 2.8-6.8 6-6.8s6 2.8 6 6.8z" />
        <path d="M19.5 29c0-4 2.8-6.8 6-6.8s6 2.8 6 6.8z" opacity="0.75" />
      </g>
    ),
  },
  "Atlas Logistics Corp": {
    bg: "#1f5c54",
    art: (
      <g fill="none" stroke={F} strokeWidth="2.2">
        <circle cx="20" cy="20" r="10.5" />
        <ellipse cx="20" cy="20" rx="4.5" ry="10.5" />
        <path d="M10 16.5h20M10 23.5h20" />
      </g>
    ),
  },
  "Coral Coast Seafoods Ltd": {
    bg: "#155e8a",
    art: (
      <g fill={F}>
        <path d="M9 20c4-6 11-6 15 0-4 6-11 6-15 0z" />
        <path d="M24 20l6-4.5v9z" opacity="0.85" />
        <circle cx="13.5" cy="19" r="1.3" fill="#155e8a" />
      </g>
    ),
  },
  "Tokyo Fresh Markets KK": {
    bg: "#a8332e",
    art: (
      <g fill={F}>
        <path d="M9 17h22l-2 4H11z" />
        <path d="M12 21h16v9h-4v-6h-8v6h-4z" opacity="0.9" />
      </g>
    ),
  },
  "Brightwave Circuits Co": {
    bg: "#33307e",
    art: (
      <g fill="none" stroke={F} strokeWidth="2">
        <rect x="13" y="13" width="14" height="14" rx="2" />
        <path
          strokeLinecap="round"
          d="M16 13V9M20 13V9M24 13V9M16 31v-4M20 31v-4M24 31v-4M13 16H9M13 20H9M13 24H9M31 16h-4M31 20h-4M31 24h-4"
        />
      </g>
    ),
  },
  "Nordic Retail Electronics AB": {
    bg: "#3f5364",
    art: <path d="M22.5 9 12 22h6l-1.5 9L27 18h-6z" fill={F} />,
  },
  "Rhein Auto Components GmbH": {
    bg: "#42434a",
    art: (
      <g fill="none" stroke={F} strokeWidth="2.2">
        <circle cx="20" cy="20" r="9.5" />
        <circle cx="20" cy="20" r="3" fill={F} stroke="none" />
        <path strokeLinecap="round" d="M20 10.5V15M20 25v4.5M10.5 20H15M25 20h4.5" />
      </g>
    ),
  },
  "Iberia Motor Assembly S.L.": {
    bg: "#8c2f2f",
    art: (
      <g fill={F}>
        <path d="M9 24c0-2 1.5-3.4 3.4-3.8L15 16.6A4 4 0 0 1 18.4 15h5.4a4 4 0 0 1 3.2 1.6l2.6 3.6c1.4.5 2.4 1.8 2.4 3.4V26H9z" />
        <circle cx="14.5" cy="26.5" r="2.6" stroke="#8c2f2f" strokeWidth="1.4" />
        <circle cx="25.5" cy="26.5" r="2.6" stroke="#8c2f2f" strokeWidth="1.4" />
      </g>
    ),
  },
  "Andean Medical Supplies S.A.C.": {
    bg: "#1d7a5a",
    art: (
      <g fill="none" stroke={F} strokeWidth="2.2" strokeLinejoin="round">
        <rect x="10" y="14" width="20" height="14" rx="2.5" />
        <path d="M16 14v-2.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2V14" />
        <path strokeLinecap="round" d="M20 18v6M17 21h6" />
      </g>
    ),
  },
  "Clinica del Valle Group": {
    bg: "#0f6b78",
    art: (
      <g fill="none" stroke={F} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 28.5S10.5 22.5 10.5 16.6A5.1 5.1 0 0 1 20 13.8a5.1 5.1 0 0 1 9.5 2.8c0 5.9-9.5 11.9-9.5 11.9z" />
        <path d="M13 20h4l1.6-3 2.8 5 1.6-2h4" />
      </g>
    ),
  },
  "Sahel Trans Logistics": {
    bg: "#9c6a1f",
    art: (
      <g fill={F}>
        <rect x="8.5" y="15" width="14" height="9" rx="1" />
        <path d="M22.5 18h5l3.5 4v2h-8.5z" opacity="0.9" />
        <circle cx="14" cy="26.5" r="2.4" />
        <circle cx="26" cy="26.5" r="2.4" />
      </g>
    ),
  },
  "Maghreb Cement Industries": {
    bg: "#5d5a52",
    art: (
      <g fill={F}>
        <rect x="9" y="21" width="9" height="5.5" rx="0.8" />
        <rect x="20" y="21" width="9" height="5.5" rx="0.8" opacity="0.85" />
        <rect x="14.5" y="14" width="9" height="5.5" rx="0.8" opacity="0.7" />
      </g>
    ),
  },
};

export function curatedLogoFor(name: string): Logo | undefined {
  return CURATED_LOGOS[name];
}
