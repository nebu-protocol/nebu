"use client";

import { useState, useTransition } from "react";

import { RISK_PRESETS, type RiskCustom } from "@/lib/risk";
import { setRiskProfileAction } from "@/server/wallet-actions";

type ProfileKey = "safe" | "aggressive" | "custom";

const PROFILES: { key: ProfileKey; label: string; desc: string }[] = [
  { key: "safe", label: "Safe", desc: "Potong rugi cepat, kunci untung awal" },
  { key: "aggressive", label: "Aggressive", desc: "Beri ruang, ride pemenang lebih jauh" },
  { key: "custom", label: "Custom", desc: "Atur ambang sendiri" },
];

/** Ringkasan ambang (chip) dari sebuah cfg risk. */
function Thresholds({ cfg }: { cfg: RiskCustom }) {
  const items = [
    { k: "Stop-loss", v: `${cfg.stopLoss}%` },
    { k: "Price-stop", v: `-${cfg.priceStop}%` },
    { k: "TP arm", v: `+${cfg.tpArm}%` },
    { k: "TP trail", v: `${cfg.tpTrail}pp` },
  ];
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((i) => (
        <div key={i.k} className="rounded-lg bg-shade px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-soft">{i.k}</div>
          <div className="text-sm font-medium">{i.v}</div>
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="text-xs text-soft">
      {label}
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-line/60 px-2.5 py-2 text-sm text-ink"
      />
    </label>
  );
}

/**
 * Risk manager card: user pilih Safe (default) / Aggressive / Custom. Menentukan
 * ambang exit bot (stop-loss, price-stop, trailing take-profit) untuk agent wallet.
 */
export function RiskCard({
  profile,
  stopLoss,
  priceStop,
  tpArm,
  tpTrail,
}: {
  profile: string | null;
  stopLoss: number | null;
  priceStop: number | null;
  tpArm: number | null;
  tpTrail: number | null;
}) {
  const initial = (profile === "aggressive" || profile === "custom" ? profile : "safe") as ProfileKey;
  const [sel, setSel] = useState<ProfileKey>(initial);
  const [custom, setCustom] = useState<RiskCustom>({
    stopLoss: stopLoss ?? RISK_PRESETS.safe.stopLoss,
    priceStop: priceStop ?? RISK_PRESETS.safe.priceStop,
    tpArm: tpArm ?? RISK_PRESETS.safe.tpArm,
    tpTrail: tpTrail ?? RISK_PRESETS.safe.tpTrail,
  });
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const pick = (key: ProfileKey) => {
    setSel(key);
    if (key !== "custom")
      start(async () => {
        await setRiskProfileAction(key);
        flash();
      });
  };

  const saveCustom = () =>
    start(async () => {
      await setRiskProfileAction("custom", custom);
      flash();
    });

  return (
    <div className="rounded-2xl border border-line/60 p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Risk manager</h3>
        {saved && <span className="text-xs text-emerald-600">Tersimpan ✓</span>}
      </div>
      <p className="mt-0.5 text-xs text-soft">Seberapa agresif bot potong rugi & ambil untung untuk agent-mu.</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {PROFILES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => pick(p.key)}
            disabled={pending}
            className={`rounded-xl border p-3 text-left transition disabled:opacity-60 ${
              sel === p.key ? "border-ink bg-shade" : "border-line/60 hover:bg-shade"
            }`}
          >
            <div className="text-sm font-medium">{p.label}</div>
            <div className="mt-0.5 text-xs text-soft">{p.desc}</div>
          </button>
        ))}
      </div>

      {sel === "safe" && <Thresholds cfg={RISK_PRESETS.safe} />}
      {sel === "aggressive" && <Thresholds cfg={RISK_PRESETS.aggressive} />}
      {sel === "custom" && (
        <div className="mt-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stop-loss % (net vs HODL)" value={custom.stopLoss} onChange={(v) => setCustom((c) => ({ ...c, stopLoss: v }))} />
            <Field label="Price-stop % (drop token)" value={custom.priceStop} onChange={(v) => setCustom((c) => ({ ...c, priceStop: v }))} />
            <Field label="Take-profit arm % (net)" value={custom.tpArm} onChange={(v) => setCustom((c) => ({ ...c, tpArm: v }))} />
            <Field label="Take-profit trail (pp)" value={custom.tpTrail} onChange={(v) => setCustom((c) => ({ ...c, tpTrail: v }))} />
          </div>
          <button
            type="button"
            onClick={saveCustom}
            disabled={pending}
            className="mt-3 w-full rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Menyimpan…" : "Simpan custom"}
          </button>
        </div>
      )}
      <p className="mt-3 text-[11px] text-soft">
        Stop-loss = keluar saat rugi net. Price-stop = fail-safe dari harga token. TP trail = jarak retrace
        dari puncak sebelum kunci untung. Default <span className="font-medium">Safe</span>.
      </p>
    </div>
  );
}
