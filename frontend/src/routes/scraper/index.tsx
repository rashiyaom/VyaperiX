import { createFileRoute, redirect } from "@tanstack/react-router";

// /scraper redirects to the dashboard (Intelligence Suite module lives there)
export const Route = createFileRoute("/scraper/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
