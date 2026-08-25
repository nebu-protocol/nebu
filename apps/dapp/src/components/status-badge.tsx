import type { BondStatus } from "@/lib/mock";

export const STATUS_LABEL: Record<BondStatus, string> = {
  pending: "Pending review",
  open: "Funding",
  funded: "Funded",
  matured: "Matured",
  settled: "Settled",
};

/** Status badge in the template's badge idiom (asset-page StatusBadge):
    a size-1.5 dot + text-sm font-medium, pos when active, soft otherwise. */
export function StatusBadge({
  status,
  className = "",
}: Readonly<{ status: BondStatus; className?: string }>) {
  const active = status === "open";
  return (
    <span
      className={`flex items-center gap-1.5 text-sm font-medium ${
        active ? "text-pos" : "text-soft"
      } ${className}`}
    >
      <span className={`size-1.5 rounded-full ${active ? "bg-pos" : "bg-faint"}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}
