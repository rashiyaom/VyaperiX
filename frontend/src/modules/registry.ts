/**
 * VYAPERI X — Module Registry
 *
 * Every module added to the dashboard must be registered here.
 * The dashboard reads this to build the sidebar navigation.
 *
 * HOW TO ADD A NEW MODULE:
 * 1. Create: src/components/modules/<module-id>/   — all your components
 * 2. Create: src/routes/modules/<module-id>.tsx    — the module's main page (optional)
 * 3. Add an entry below in MODULE_REGISTRY
 * 4. Wire the module into src/routes/dashboard.tsx under the activeNav switch
 */

import {
  Brain,
  Radio,
  Sparkles,
  Video,
  Calendar as CalendarIcon,
  MessageSquare,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface ModuleDefinition {
  /** Unique identifier — used for routing and nav state */
  id: string;
  /** Sidebar label */
  label: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Whether this module is currently enabled */
  enabled: boolean;
  /** Optional badge shown in sidebar (e.g. "New", "Beta") */
  badge?: string;
  /** Short description shown in locked placeholder state */
  description: string;
  /** Path inside src/components/modules/<id>/ */
  componentPath: string;
}

export const MODULE_REGISTRY: ModuleDefinition[] = [
  {
    id: "intelligence",
    label: "Intelligence Suite",
    icon: Brain,
    enabled: true,
    badge: "Active",
    description: "Multi-source commercial due diligence — web scraping, PDF/CSV analysis, AI reports.",
    componentPath: "modules/scraper",
  },
  {
    id: "lead-radar",
    label: "Lead Radar",
    icon: Radio,
    enabled: true,
    badge: "Live",
    description: "Discover and qualify high-intent prospects from 40+ signals before calling.",
    componentPath: "modules/radar",
  },
  {
    id: "voice-fleet",
    label: "Voice Fleet",
    icon: Sparkles,
    enabled: true,
    badge: "AI SDR",
    description: "Autonomous AI voice agents for outbound SDR and multilingual sales calls.",
    componentPath: "modules/voice",
  },
  {
    id: "video",
    label: "Video Agent",
    icon: Video,
    enabled: true,
    badge: "Mitra",
    description: "Autonomous AI video avatar sales agent powered by Tavus CVI for high-touch buyer meetings.",
    componentPath: "modules/video",
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: CalendarIcon,
    enabled: true,
    badge: "Meetings",
    description: "AI-scheduled meetings, Google Meet rooms, reminder alerts, and call follow-ups.",
    componentPath: "modules/calendar",
  },
  {
    id: "whatsapp",
    label: "WhatsApp Business",
    icon: MessageSquare,
    enabled: true,
    badge: "Zero-TaxID",
    description: "Zero-verification WhatsApp Business gateway for automated post-call meeting links and requirements recap messaging.",
    componentPath: "modules/whatsapp",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart3,
    enabled: true,
    badge: "Radar",
    description: "Cross-module performance dashboard — pipeline metrics, conversion funnels.",
    componentPath: "modules/analytics",
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    enabled: true,
    description: "Workspace configuration, API keys, team management.",
    componentPath: "modules/settings",
  },
];

/** Helper: get enabled modules only */
export const enabledModules = MODULE_REGISTRY.filter((m) => m.enabled);

/** Helper: find a module by id */
export const getModule = (id: string) => MODULE_REGISTRY.find((m) => m.id === id);
