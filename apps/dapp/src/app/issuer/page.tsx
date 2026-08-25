import type { Metadata } from "next";

import { IssuerPage } from "@/features/issuer/issuer-page";

export const metadata: Metadata = {
  title: "Issuer Dashboard",
  description: "Manage your tokenized invoices and track their funding and settlement.",
};

export default function Page() {
  return <IssuerPage />;
}
