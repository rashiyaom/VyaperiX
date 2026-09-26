import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site/Chrome";
import { PricingView } from "@/components/site/PricingView";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing & Model Tiers — VYAPERI X Autonomous AI Sales" },
      {
        name: "description",
        content:
          "Transparent compute & platform model pricing for Vyaperi X: Free, Mini, Max, and Gujarati Boss Mode with real-time unit economics.",
      },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <div className="relative min-h-screen w-full bg-paper text-ink selection:bg-lime selection:text-neutral-950 flex flex-col justify-between">
      <SiteHeader />
      <main className="flex-1">
        <PricingView />
      </main>
      <SiteFooter />
    </div>
  );
}
