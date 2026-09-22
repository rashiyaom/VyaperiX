import { createFileRoute, redirect } from "@tanstack/react-router";

// /scraper/report/$id redirects to /dashboard
// The dashboard handles report viewing via its internal state.
// Deep-linking a specific report: user lands on dashboard and can click from recent list.
export const Route = createFileRoute("/scraper/report/$id")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
