import { redirect } from "next/navigation";

// Marketplace di-merge ke homepage (/). Redirect biar link lama tetap jalan.
export default function MarketplaceIndex() {
  redirect("/");
}
