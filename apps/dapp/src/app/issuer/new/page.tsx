import type { Metadata } from "next";

import { SubmitInvoiceForm } from "@/features/issuer/submit-invoice-form";

export const metadata: Metadata = {
  title: "Tokenize an Invoice",
  description: "Submit an unpaid invoice for compliance review and bond issuance.",
};

export default function Page() {
  return <SubmitInvoiceForm />;
}
