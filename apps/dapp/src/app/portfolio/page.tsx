import type { Metadata } from "next";

import { PortfolioPage } from "@/features/portfolio/portfolio-page";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Your invoice bond holdings and claimable settlements in one place.",
};

export default function Page() {
  return <PortfolioPage />;
}
