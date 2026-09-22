import { createFileRoute } from "@tanstack/react-router";
import { CinematicFrameHero } from "@/components/site/CinematicFrameHero";
import { MainPlatformLanding } from "@/components/site/MainPlatformLanding";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VYAPERI X — Autonomous AI Sales Intelligence" },
      {
        name: "description",
        content:
          "VYAPERI X discovers high-intent prospects, enriches profiles, and deploys multilingual AI voice agents for autonomous sales.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="relative w-full overflow-x-hidden bg-paper text-ink selection:bg-lime selection:text-neutral-950">
      {/* 🎬 1. Pure Fullscreen Video Hero with Instant Frame-Synchronized Light/Dark Toggle */}
      <CinematicFrameHero />

      {/* 🚀 2. Previous Original Hero Section & Complete Platform Overview */}
      <MainPlatformLanding />
    </div>
  );
}
