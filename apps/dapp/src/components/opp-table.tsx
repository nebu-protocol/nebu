import { TokenIcon } from "@/components/token-icon";
import type { Opp } from "@/lib/opportunities";

/** Tabel opportunities generik — kolom/isi dari buildOpportunities per kategori agent. */
export function OppTable({ opp }: { opp: Opp }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line/60">
      <table className="w-full text-sm">
        <thead className="border-b border-line/60 text-soft">
          <tr>
            {opp.columns.map((c) => (
              <th key={c.label} className={`px-4 py-3 font-medium ${c.right ? "text-right" : "text-left"}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {opp.rows.map((r, i) => (
            <tr key={r.cells[0] + i} className="border-t border-line/60 hover:bg-shade/40">
              {r.cells.map((cell, j) => {
                const col = opp.columns[j];
                const cls = `px-4 py-3 ${col?.right ? "text-right" : ""} ${col?.accent ? "font-medium text-emerald-600" : ""}`;
                if (j === 0) {
                  const inner = (
                    <span className="inline-flex items-center gap-2">
                      {r.addr && <TokenIcon symbol={r.sym ?? (cell.split("/")[0] ?? "?")} address={r.addr} size={22} />}
                      <span className="font-medium">{cell}</span>
                    </span>
                  );
                  return (
                    <td key={j} className={cls}>
                      {r.href ? (
                        <a href={r.href} target="_blank" rel="noopener noreferrer" className="transition hover:opacity-70">
                          {inner}
                        </a>
                      ) : (
                        inner
                      )}
                    </td>
                  );
                }
                return (
                  <td key={j} className={cls}>
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
