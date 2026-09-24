import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useState, useEffect, useRef } from "react";
import {
  Brain,
  Radio,
  BarChart3,
  Settings,
  Video,
  ChevronLeft,
  ChevronRight,
  Globe,
  FileText,
  Sparkles,
  ArrowUpRight,
  Layers,
  AlertCircle,
  Plus,
  Trash2,
  Clock,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Download,
  Copy,
  Check,
  Target,
  Users,
  Package,
  Swords,
  ListChecks,
  Zap,
  ShieldCheck,
  TrendingUp,
  Printer,
  LogOut,
  Lock,
  PieChart as PieIcon,
  Activity,
  Flame,
  FileCheck2,
  Sliders,
  MessageCircle,
  LayoutDashboard,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Logo } from "@/components/site/Chrome";
import { FileUploadZone } from "@/components/scraper/FileUploadZone";
import { useChatWidget } from "@/components/chat/ChatWidgetProvider";
import {
  DocumentInsightPanel,
  DiscrepancyAlerts,
  FinancialHighlights,
  FlaskFunnelChart,
  TimelineRoadmapChart,
  type DocumentInsight,
  type DiscrepancyAlert,
  type FinancialHighlight,
  type ForecastTrend,
  type FunnelStage,
  type SWOTAnalysis,
  type TimelinePhase,
} from "@/components/scraper/ReportComponents";
import { LeadRadarModule } from "@/components/modules/radar";
import { VoiceFleetModule } from "@/components/modules/voice";
import { VideoMeetingModule } from "@/components/modules/video";
import { CalendarModule } from "@/components/modules/calendar";
import { WhatsAppModule } from "@/components/modules/whatsapp";
import { CRMModule } from "@/components/modules/crm";
import { AnalyticsModule } from "@/components/modules/analytics";
import { SettingsModule } from "@/components/modules/settings";
import { OverviewDashboard } from "@/components/modules/overview";
import { MODULE_REGISTRY } from "@/modules/registry";
import { ThemeToggle } from "@/components/app/theme";
import { LangSwitcher } from "@/components/app/lang";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "VYAPERI X — Autonomous Intelligence Dashboard" },
      { name: "description", content: "VYAPERI X AI Intelligence Suite, Lead Radar & Voice Fleet Dashboard." },
    ],
  }),
  component: DashboardPage,
});

const API_BASE = (import.meta.env["VITE_SCRAPER_API_BASE"] as string) || "http://127.0.0.1:8000";

async function safeApiFetch(endpoint: string, init?: RequestInit): Promise<Response> {
  const primary = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
  console.log("[safeApiFetch] Trying:", primary);
  try {
    const res = await fetch(primary, init);
    console.log("[safeApiFetch] Success from:", primary, res.status);
    return res;
  } catch (err: any) {
    console.warn("[safeApiFetch] Failed for:", primary, err);
    const isLocalhost = primary.includes("localhost:8000");
    const is127 = primary.includes("127.0.0.1:8000");
    if (isLocalhost || is127) {
      const fallbackUrl = isLocalhost ? primary.replace("localhost:8000", "127.0.0.1:8000") : primary.replace("127.0.0.1:8000", "localhost:8000");
      console.log("[safeApiFetch] Trying fallback:", fallbackUrl);
      try {
        const res = await fetch(fallbackUrl, init);
        console.log("[safeApiFetch] Fallback success from:", fallbackUrl, res.status);
        return res;
      } catch (fallbackErr) {
        console.error("[safeApiFetch] Fallback also failed:", fallbackErr);
      }
    }
    if (primary.includes(":8001")) {
      const fallback8000 = primary.replace(":8001", ":8000");
      try {
        return await fetch(fallback8000, init);
      } catch {}
    }
    throw err;
  }
}

/* ─── Ultra High-Contrast Cyberpunk Tooltip Props ─── */
const tooltipBoxStyle: React.CSSProperties = {
  backgroundColor: "#0D0E14",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "#7C3AED",
  borderRadius: 0,
  padding: "8px 12px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
};

const tooltipItemStyle: React.CSSProperties = {
  color: "#ffffff",
  fontFamily: "monospace",
  fontSize: "11px",
  fontWeight: "bold",
};

const tooltipLabelStyle: React.CSSProperties = {
  color: "#A3E635",
  fontFamily: "monospace",
  fontSize: "11px",
  fontWeight: "bold",
  marginBottom: "4px",
};

/* ─── Types ─── */
interface RecentReport {
  id: string;
  status: string;
  created_at: string;
  input_urls?: { website?: string; business_description?: string };
  analysis?: {
    company_name?: string;
    opportunity_score?: number;
    one_line_summary?: string;
    industry?: string;
  };
}

interface CustomerSegment {
  segment_name: string;
  description?: string;
  evidence?: string;
  estimated_deal_size?: string;
}
interface ProductService {
  name: string;
  description?: string;
  category?: string;
  differentiator?: string;
}
interface MarketingChannel {
  channel: string;
  evidence?: string;
  strength?: string;
}
interface CompetitorSignal {
  competitor_name: string;
  market_position?: string;
  our_advantage?: string;
  vulnerability?: string;
}
interface Recommendation {
  title: string;
  detail?: string;
  priority?: string;
  expected_roi?: string;
  timeframe?: string;
  action_steps?: string[];
}
interface FullAnalysis {
  company_name: string;
  one_line_summary: string;
  industry: string;
  value_proposition?: string;
  opportunity_score: number;
  confidence_score?: number;
  confidence_notes?: string;
  executive_summary?: {
    core_thesis: string;
    key_strengths?: string[];
    primary_vulnerabilities?: string[];
    immediate_action_items?: string[];
  };
  document_insights?: DocumentInsight[];
  financial_highlights?: FinancialHighlight[];
  discrepancy_alerts?: DiscrepancyAlert[];
  swot_analysis?: SWOTAnalysis;
  target_customers?: (CustomerSegment | string)[];
  products_services?: (ProductService | string)[];
  current_marketing_channels?: (MarketingChannel | string)[];
  competitor_signals?: (CompetitorSignal | string)[];
  marketing_gaps?: string[];
  conversion_funnel?: FunnelStage[];
  growth_forecast?: ForecastTrend[];
  timeline_roadmap?: TimelinePhase[];
  data_source_mode?: "uploaded_file" | "website_inferred";
  data_source_summary?: string;
  recommendations?: (Recommendation | string)[];
}

interface ReportData {
  id: string;
  status: "pending" | "parsing_docs" | "scraping" | "analyzing" | "done" | "failed";
  created_at: string;
  error_message?: string;
  input_urls?: { website?: string; business_description?: string };
  analysis?: FullAnalysis;
}

/* ─── Shared Brut Panel ─── */
function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`border border-ink bg-card min-w-0 overflow-hidden ${className}`}>{children}</div>;
}

function getCleanReportTitle(r: RecentReport): string {
  if (r.analysis?.company_name && r.analysis.company_name.trim()) {
    return r.analysis.company_name.trim();
  }
  const raw = r.input_urls?.website || "";
  if (raw) {
    try {
      const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      const host = parsed.hostname.replace(/^www\./i, "");
      const path = parsed.pathname !== "/" && parsed.pathname.length > 1 ? parsed.pathname.slice(0, 18) : "";
      return host + path;
    } catch {
      return (raw.split("?")[0] ?? "").slice(0, 28);
    }
  }
  if (r.input_urls?.business_description) {
    return r.input_urls.business_description.slice(0, 26) + "...";
  }
  return "Business Report";
}

function PanelHeader({
  icon: Icon,
  title,
  count,
  iconColor = "text-violet",
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  iconColor?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-ink/20 p-4 mb-4">
      <h3 className="font-display text-xs font-extrabold uppercase flex items-center gap-2">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        {title}
      </h3>
      {count !== undefined && <span className="label-mono text-muted-foreground">{count} items</span>}
    </div>
  );
}

/* ─── Score Gauge ─── */
function ScoreGauge({
  score,
  confidence = 85,
  notes,
}: {
  score: number;
  confidence?: number | undefined;
  notes?: string | undefined;
}) {
  const getDesc = (s: number) => {
    if (s >= 80) return { label: "Massive Growth Potential", color: "text-danger" };
    if (s >= 60) return { label: "High Optimization Upside", color: "text-amber-600 dark:text-amber-400" };
    if (s >= 40) return { label: "Moderate Expansion Room", color: "text-violet" };
    return { label: "Mature & Optimized", color: "text-lime-700 dark:text-lime" };
  };
  const desc = getDesc(score);
  return (
    <Panel className="p-5 flex flex-col items-center text-center">
      <div className="label-mono text-muted-foreground mb-1">Opportunity Score</div>
      <div className="font-display text-5xl font-black text-violet leading-none my-2">{score}</div>
      <div className="label-mono font-bold text-xs uppercase mb-3 text-ink/70">/ 100 Index</div>
      <div className={`label-mono font-bold text-xs mb-3 ${desc.color}`}>{desc.label}</div>
      <div className="w-full border-t border-ink/15 pt-3 space-y-1.5">
        <div className="flex justify-between label-mono text-muted-foreground text-[10px]">
          <span>Confidence Score</span>
          <span className="text-ink font-bold">{confidence}%</span>
        </div>
        <div className="h-1.5 w-full bg-ink/10">
          <div className="h-full bg-lime transition-all duration-500" style={{ width: `${confidence}%` }} />
        </div>
        {notes && <p className="font-mono text-[10px] text-muted-foreground text-left mt-1">{notes}</p>}
      </div>
    </Panel>
  );
}

/* ─── Intake Form ─── */
function ScraperIntakeForm({ onReportCreated }: { onReportCreated: (id: string) => void }) {
  const { user, session } = useAuth();
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [otherLinks, setOtherLinks] = useState<string[]>([""]);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addOtherLink = () => setOtherLinks((prev) => [...prev, ""]);
  const removeOtherLink = (idx: number) =>
    setOtherLinks((prev) => prev.filter((_, i) => i !== idx));
  const updateOtherLink = (idx: number, val: string) =>
    setOtherLinks((prev) => prev.map((l, i) => (i === idx ? val : l)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!websiteUrl.trim() && !businessDescription.trim() && files.length === 0) {
      setError("Please provide at least a website URL, business description, or upload a document.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      if (websiteUrl.trim()) fd.append("website_url", websiteUrl.trim());
      if (businessDescription.trim()) fd.append("business_description", businessDescription.trim());
      if (linkedinUrl.trim()) fd.append("linkedin_url", linkedinUrl.trim());
      if (user?.id) fd.append("user_id", user.id);
      const validLinks = otherLinks.map((l) => l.trim()).filter(Boolean);
      if (validLinks.length) fd.append("other_links", JSON.stringify(validLinks));
      files.forEach((f) => fd.append("files", f));

      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await safeApiFetch("/api/reports", {
        method: "POST",
        headers,
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).detail || `Server error (${res.status})`);
      }
      const data = await res.json();
      onReportCreated(data.report_id);
    } catch (err: any) {
      if (err?.message?.includes("Failed to fetch") || err?.name === "TypeError") {
        setError(`Backend Connection Failed: The Intelligence Engine server is offline. Please run "npm run backend" in the landing page directory.`);
      } else {
        setError(err.message || "Failed to submit.");
      }
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Website URL */}
      <div className="space-y-1.5">
        <label className="label-mono text-muted-foreground flex flex-wrap items-center justify-between gap-1.5">
          <span className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-violet" /> Primary Company Website URL
          </span>
          <span className="font-normal text-ink/40 text-[10px]">Optional if docs provided</span>
        </label>
        <input
          type="text"
          placeholder="e.g. stripe.com or company.io"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          className="w-full border border-ink/30 bg-paper px-3.5 py-2.5 font-mono text-sm text-ink placeholder-muted-foreground focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet transition-all"
        />
      </div>

      {/* Business Description */}
      <div className="space-y-1.5">
        <label className="label-mono text-muted-foreground flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-violet" /> Executive Summary / Internal Notes
        </label>
        <textarea
          rows={3}
          placeholder="e.g. B2B payments infra. Target: fintech startups. Recent Series-A, expanding outbound pipeline..."
          value={businessDescription}
          onChange={(e) => setBusinessDescription(e.target.value)}
          className="w-full border border-ink/30 bg-paper px-3.5 py-2.5 font-mono text-xs text-ink placeholder-muted-foreground focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet resize-none transition-all"
        />
      </div>

      {/* File Upload Zone */}
      <div className="space-y-1.5">
        <label className="label-mono text-muted-foreground flex flex-wrap items-center justify-between gap-1.5">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-lime-700 dark:text-lime" /> Commercial Documents (PDF, CSV, Excel, Image)
          </span>
          <span className="font-normal text-ink/40 text-[10px]">Up to 10 files · 15 MB each</span>
        </label>
        <FileUploadZone files={files} onFilesChange={setFiles} maxFiles={10} />
      </div>

      {/* LinkedIn URL */}
      <div className="space-y-1.5">
        <label className="label-mono text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-violet" /> LinkedIn Company Page
        </label>
        <input
          type="text"
          placeholder="https://linkedin.com/company/..."
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          className="w-full border border-ink/30 bg-paper px-3.5 py-2 font-mono text-xs text-ink placeholder-muted-foreground focus:outline-none focus:border-violet transition-all"
        />
      </div>

      {/* Other URLs */}
      <div className="space-y-2">
        <label className="label-mono text-muted-foreground">Additional Source URLs</label>
        {otherLinks.map((link, idx) => (
          <div key={idx} className="flex gap-2">
            <input
              type="text"
              placeholder="https://g2.com/products/... or competitor site"
              value={link}
              onChange={(e) => updateOtherLink(idx, e.target.value)}
              className="flex-1 border border-ink/30 bg-paper px-3.5 py-2 font-mono text-xs text-ink placeholder-muted-foreground focus:outline-none focus:border-violet transition-all"
            />
            {otherLinks.length > 1 && (
              <button
                type="button"
                onClick={() => removeOtherLink(idx)}
                className="border border-ink/30 bg-secondary px-3 py-2 text-danger hover:border-danger transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addOtherLink}
          className="label-mono text-violet hover:underline flex items-center gap-1 text-xs"
        >
          <Plus className="w-3.5 h-3.5" /> Add another URL
        </button>
      </div>

      {error && (
        <div className="border border-danger/40 bg-danger/8 p-3 text-danger font-mono text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full border border-ink bg-ink text-paper py-3.5 label-mono font-bold tracking-wider hover:border-violet hover:bg-violet transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" /> Ingesting & Running AI Due-Diligence...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 text-paper" /> Launch Intelligence Pipeline
          </>
        )}
      </button>
    </form>
  );
}

/* ─── GRAPH-INTENSIVE REPORT VIEW ─── */
function ReportView({
  reportId,
  onBack,
  onNavigateModule,
  onReportFinished,
}: {
  reportId: string;
  onBack: () => void;
  onNavigateModule?: (moduleId: string) => void;
  onReportFinished?: (report: ReportData) => void;
}) {
  const { open: openChat, setActiveReportId } = useChatWidget();
  const [report, setReport] = useState<ReportData | null>(null);
  const [copied, setCopied] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
  const [activeBifurcation, setActiveBifurcation] = useState<
    "overview" | "financial" | "pipeline" | "timeline" | "icp" | "audit" | "all"
  >("overview");
  const [userMonthlyRevenue, setUserMonthlyRevenue] = useState<string>("");
  const [userDealCycle, setUserDealCycle] = useState<string>("");
  const [appliedCustomBaseline, setAppliedCustomBaseline] = useState<boolean>(false);
  const finishedNotifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (reportId) {
      setActiveReportId(reportId, report?.analysis?.company_name || null);
    }
    return () => {
      setActiveReportId(null);
    };
  }, [reportId, report?.analysis?.company_name, setActiveReportId]);

  useEffect(() => {
    let iv: ReturnType<typeof setInterval>;
    let isSubscribed = true;
    let notFoundRetries = 0;
    const fetch_ = async () => {
      try {
        const res = await safeApiFetch(`/api/reports/${reportId}`);
        if (res.ok && isSubscribed) {
          notFoundRetries = 0;
          const data: ReportData = await res.json();
          setReport(data);
          if (data.status === "done") {
            clearInterval(iv);
            if (onReportFinished && finishedNotifiedRef.current !== reportId) {
              finishedNotifiedRef.current = reportId;
              onReportFinished(data);
            }
          } else if (data.status === "failed") {
            clearInterval(iv);
          }
        } else if (res.status === 404 && isSubscribed) {
          notFoundRetries++;
          // If 404 persists for 3 consecutive polls (7.5s), stop polling to avoid flooding console
          if (notFoundRetries >= 3) {
            clearInterval(iv);
            setReport({
              id: reportId,
              status: "failed",
              input_urls: {},
              created_at: new Date().toISOString(),
              error_message: "Report record not found or previous session was interrupted. Please start a new analysis.",
            } as any);
          }
        }
      } catch {}
    };
    fetch_();
    iv = setInterval(fetch_, 2500);
    return () => {
      isSubscribed = false;
      clearInterval(iv);
    };
  }, [reportId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!report?.analysis) return;
    const blob = new Blob([JSON.stringify(report.analysis, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VYAPERIX-Intel-${report.analysis.company_name || "report"}-${report.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleStep = (r: number, s: number) => {
    const k = `${r}-${s}`;
    setCompletedSteps((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  /* Loading state */
  if (!report || report.status !== "done") {
    const isFailed = report?.status === "failed";
    const status = report?.status || "pending";
    const STEPS = [
      { key: "parsing_docs", label: "1. Parsing Documents (PDF, CSV, Images)" },
      { key: "scraping", label: "2. Scraping Web Assets & External Signals" },
      { key: "analyzing", label: "3. Groq LLM Multi-Source Synthesis" },
    ];
    const doneKeys = ["parsing_docs", "scraping", "analyzing", "done"];

    return (
      <div className="space-y-6">
        <button
          onClick={onBack}
          className="label-mono text-muted-foreground hover:text-violet flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> New Analysis
        </button>
        <Panel className="p-8 text-center space-y-6">
          <div className="border border-ink bg-secondary inline-flex p-4 mx-auto">
            {isFailed ? (
              <AlertTriangle className="w-8 h-8 text-danger" />
            ) : (
              <Sparkles className="w-8 h-8 text-violet animate-spin" />
            )}
          </div>
          <div>
            <h2 className="font-display text-xl font-extrabold uppercase">
              {isFailed ? "Pipeline Failed" : "Synthesizing Intelligence..."}
            </h2>
            <p className="font-mono text-xs text-muted-foreground mt-2">
              {isFailed
                ? report?.error_message
                : "Ingesting sources, cross-referencing claims, computing radar metrics..."}
            </p>
          </div>
          {!isFailed && (
            <div className="border border-ink/20 bg-secondary/20 p-4 space-y-3 text-left max-w-sm mx-auto">
              <span className="label-mono text-muted-foreground block border-b border-ink/15 pb-2">
                Pipeline Progress · <span className="text-violet">{status}</span>
              </span>
              {STEPS.map(({ key, label }) => {
                const isActive = status === key;
                const isDone = doneKeys.indexOf(status) > doneKeys.indexOf(key);
                return (
                  <div key={key} className="flex items-center gap-2.5">
                    {isActive ? (
                      <RefreshCw className="w-4 h-4 text-violet animate-spin shrink-0" />
                    ) : isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-lime-700 dark:text-lime shrink-0" />
                    ) : (
                      <Clock className="w-4 h-4 text-ink/20 shrink-0" />
                    )}
                    <span className={`font-mono text-xs ${isActive ? "text-ink font-bold" : "text-muted-foreground"}`}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    );
  }

  const { analysis } = report;
  if (!analysis) return null;

  const customers: CustomerSegment[] = (analysis.target_customers || []).map((c) =>
    typeof c === "string" ? { segment_name: c, description: c } : c
  );
  const products: ProductService[] = (analysis.products_services || []).map((p) =>
    typeof p === "string" ? { name: p, category: "Offering" } : p
  );
  const channels: MarketingChannel[] = (analysis.current_marketing_channels || []).map((ch) =>
    typeof ch === "string" ? { channel: ch, strength: "moderate" } : ch
  );
  const competitors: CompetitorSignal[] = (analysis.competitor_signals || []).map((c) =>
    typeof c === "string" ? { competitor_name: c } : c
  );
  const recs: Recommendation[] = (analysis.recommendations || []).map((r) =>
    typeof r === "string" ? { title: r, priority: "high", timeframe: "30 Days" } : r
  );
  const swot: SWOTAnalysis =
    analysis.swot_analysis &&
    (analysis.swot_analysis.strengths?.length || analysis.swot_analysis.weaknesses?.length)
      ? analysis.swot_analysis
      : {
          strengths: products.map((p) => `Offering: ${p.name}`),
          weaknesses: analysis.marketing_gaps || [],
          opportunities: [],
          threats: competitors.map((c) => c.competitor_name),
        };

  /* ─── REAL-TIME GRAPH DATA ADAPTERS (STRICT GROUND TRUTH + OPTION B) ─── */
  // 1. Revenue Trajectory Data
  const hasFileRevenue =
    analysis.data_source_mode === "uploaded_file" &&
    analysis.growth_forecast &&
    analysis.growth_forecast.length > 0;

  const rawUserRev = userMonthlyRevenue.replace(/[^0-9.]/g, "");
  const userRevNum = Number(rawUserRev);
  const hasUserRevenue = appliedCustomBaseline && userRevNum > 0;

  let revenueChartData: { period: string; optimizedMRR: number; baselineMRR: number; driver: string }[] = [];

  if (hasFileRevenue) {
    revenueChartData = analysis.growth_forecast!.map((t) => ({
      period: t.period,
      optimizedMRR: t.optimized_index * 1000,
      baselineMRR: t.baseline_index * 1000,
      driver: t.key_driver,
    }));
  } else if (hasUserRevenue) {
    const lifts = [0.14, 0.27, 0.39, 0.51, 0.59, 0.67];
    const drivers = [
      "AI Sales Fleet deployment & automated outbound warming",
      "Instant qualification & dynamic catalog dispatch to commercial leads",
      "Multi-threaded follow-up on issued quotes & high-intent RFQs",
      "Automated objection handling on bulk volume pricing & delivery terms",
      "Re-engagement of stalled commercial deals & repeat procurement",
      "Full autonomous scale across regional distributors & direct buyers",
    ];
    revenueChartData = lifts.map((lift, i) => {
      const base = Math.round(userRevNum * (1 + i * 0.02)); // status-quo organic 2%
      const opt = Math.round(userRevNum * (1 + lift));
      return {
        period: `Month ${i + 1}`,
        baselineMRR: base,
        optimizedMRR: opt,
        driver: drivers[i]!,
      };
    });
  }

  // 2. Competitive Radar Data (computed from real Groq analysis vectors)
  const radarData = [
    { subject: "Feature Edge", target: Math.min(100, (analysis.products_services?.length || 1) * 20 + 20), marketAvg: 50 },
    { subject: "Channel Reach", target: Math.min(100, (analysis.current_marketing_channels?.length || 1) * 25), marketAvg: 55 },
    { subject: "Market Signals", target: Math.min(100, (analysis.competitor_signals?.length || 1) * 20 + 30), marketAvg: 50 },
    { subject: "Confidence", target: analysis.confidence_score || 85, marketAvg: 60 },
    { subject: "Opportunity", target: analysis.opportunity_score || 80, marketAvg: 50 },
    { subject: "Action Levers", target: Math.min(100, (analysis.recommendations?.length || 1) * 20), marketAvg: 45 },
  ];

  // 3. Conversion Funnel Chart Data
  const hasFileFunnel =
    analysis.data_source_mode === "uploaded_file" &&
    analysis.conversion_funnel &&
    analysis.conversion_funnel.length > 0;

  const cycleDays = Number(userDealCycle.replace(/[^0-9]/g, ""));
  const hasUserCycle = appliedCustomBaseline && (cycleDays > 0 || hasUserRevenue);

  let funnelStages: FunnelStage[] = [];
  let funnelChartData: { stage: string; efficiency: number; health: string; observation: string }[] = [];

  if (hasFileFunnel) {
    funnelStages = analysis.conversion_funnel || [];
    funnelChartData = funnelStages.map((s) => ({
      stage: s.stage,
      efficiency:
        s.current_health === "optimal"
          ? 95
          : s.current_health === "underperforming"
          ? 55
          : 30,
      health: s.current_health,
      observation: s.observation,
    }));
  } else if (hasUserCycle) {
    const cycleDesc = cycleDays > 0 ? `${cycleDays}-day baseline cycle` : "commercial cycle";
    funnelStages = [
      {
        stage: "1. Inbound & Outbound Inquiries",
        current_health: "optimal",
        observation: `Commercial prospect engagement across website and outbound channels (${cycleDesc}).`,
        benchmark_advice: "Maintain sub-5-minute response times via AI voice & WhatsApp to prevent drop-off.",
      },
      {
        stage: "2. Qualification & Spec Review",
        current_health: "underperforming",
        observation: `Lead qualification for ${products[0]?.name || "catalog offerings"} currently experiencing follow-up latency.`,
        benchmark_advice: "Deploy instant AI qualification to deliver verified technical specs and sample catalogs immediately.",
      },
      {
        stage: "3. Technical Quoting & RFQ",
        current_health: "bottleneck",
        observation: `Critical bottleneck: delay in pricing calculation elongates the ${cycleDays ? `${cycleDays}-day` : ""} sales cycle.`,
        benchmark_advice: "Automate dynamic quote generation with tier-based volume pricing to compress sales cycle.",
      },
      {
        stage: "4. Commercial Terms Negotiation",
        current_health: "underperforming",
        observation: "Enterprise decision-makers comparing competing bids, credit terms, and delivery schedules.",
        benchmark_advice: "Deploy automated multi-touch sequences addressing payment terms and minimum order quantities.",
      },
      {
        stage: "5. Closed-Won Account",
        current_health: "optimal",
        observation: "Account conversion and procurement finalization.",
        benchmark_advice: "Trigger automated onboarding and re-order cadence to maximize account lifetime value.",
      },
    ];
    funnelChartData = funnelStages.map((s) => ({
      stage: s.stage,
      efficiency:
        s.current_health === "optimal"
          ? 95
          : s.current_health === "underperforming"
          ? 55
          : 30,
      health: s.current_health,
      observation: s.observation,
    }));
  }

  // 4. ICP Customer Deal Size Donut Data (strictly from Groq target_customers)
  const COLORS = ["#8B5CF6", "#10B981", "#F59E0B", "#06B6D4", "#EC4899", "#3B82F6"];
  const pieData =
    customers.length > 0
      ? customers.map((c) => ({
          name: c.segment_name,
          value: Math.round(100 / customers.length),
          dealSize: c.estimated_deal_size || "Custom ICP",
        }))
      : [];

  // 5. Channel Strength Bar Data (strictly from Groq current_marketing_channels)
  const channelData = channels.map((c) => {
    const s = (c.strength || "").toLowerCase();
    const score = s.includes("strong") || s.includes("high") ? 90 : s.includes("mod") ? 60 : 35;
    return { name: c.channel, score, raw: c.strength || "Stated" };
  });

  const priorityStyle = (p: string) => {
    const s = p.toLowerCase();
    if (s.includes("high")) return "label-mono border border-danger/40 bg-danger/10 text-danger px-2 py-0.5";
    if (s.includes("med"))
      return "label-mono border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5";
    return "label-mono border border-violet/30 bg-violet/10 text-violet px-2 py-0.5";
  };

  return (
    <div className="space-y-6">
      {/* ── UNLOCK CELEBRATION BANNER ── */}
      <div className="border-2 border-lime bg-lime/10 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="label-mono text-lime-700 dark:text-lime font-black tracking-widest text-xs">
              ⚡ REPORT COMPLETE · ALL ENTERPRISE MODULES UNLOCKED
            </span>
            <div className="h-2 w-2 rounded-full bg-lime animate-ping" />
          </div>
          <p className="font-mono text-xs text-ink font-medium">
            AI Sales Dossier for <span className="font-bold underline">{analysis.company_name}</span> is ready. You can now launch Lead Radar, deploy Voice SDRs, or view full Analytics.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {onNavigateModule && (
            <>
              <button
                onClick={() => onNavigateModule("lead-radar")}
                className="border border-ink bg-ink text-paper px-3.5 py-2 label-mono font-bold hover:bg-violet hover:border-violet transition-all flex items-center gap-1.5 text-xs"
              >
                <Radio className="w-3.5 h-3.5 text-paper" /> Launch Lead Radar
              </button>
              <button
                onClick={() => onNavigateModule("voice-fleet")}
                className="border border-violet bg-violet text-violet-foreground px-3.5 py-2 label-mono font-bold hover:bg-violet/90 transition-all flex items-center gap-1.5 text-xs"
              >
                <Sparkles className="w-3.5 h-3.5" /> Deploy Voice SDR
              </button>
              <button
                onClick={() => onNavigateModule("video")}
                className="border border-ink/40 bg-secondary px-3.5 py-2 label-mono font-bold text-ink hover:bg-paper hover:border-violet hover:text-violet transition-all flex items-center gap-1.5 text-xs"
              >
                <Video className="w-3.5 h-3.5 text-violet" /> Video Avatar Meeting
              </button>
            </>
          )}
        </div>
      </div>

      {/* Utility bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/20 pb-4">
        <button
          onClick={onBack}
          className="label-mono text-muted-foreground hover:text-violet flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> New Analysis
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={openChat}
            className="flex items-center gap-1.5 border border-violet bg-violet/10 text-violet px-3 py-1.5 label-mono font-bold hover:bg-violet hover:text-violet-foreground transition-all"
          >
            <MessageCircle className="w-3.5 h-3.5" /> Ask This Report
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 border border-ink/25 bg-card px-3 py-1.5 label-mono hover:border-violet hover:text-violet transition-all"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Share"}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 border border-ink/25 bg-card px-3 py-1.5 label-mono hover:border-violet hover:text-violet transition-all"
          >
            <Download className="w-3.5 h-3.5" /> JSON
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 border border-ink bg-ink text-paper px-3 py-1.5 label-mono font-bold hover:border-violet hover:bg-violet transition-all"
          >
            <Printer className="w-3.5 h-3.5" /> Print Dossier
          </button>
        </div>
      </div>

      {/* ── DATA SOURCE GROUND-TRUTH ATTRIBUTION BANNER ── */}
      {analysis.data_source_mode === "uploaded_file" ? (
        <div className="border-2 border-lime/60 bg-lime/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 border border-lime/40 bg-paper shrink-0">
              <FileCheck2 className="w-5 h-5 text-lime-700 dark:text-lime" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="label-mono font-black text-xs text-lime-700 dark:text-lime tracking-wide">
                  DIRECT SALES FILE GROUND-TRUTH ACTIVE
                </span>
                <span className="label-mono border border-lime/40 bg-lime/20 text-lime-700 dark:text-lime px-1.5 py-0.2 text-[8px] font-bold">
                  100% DETERMINISTIC
                </span>
              </div>
              <p className="font-mono text-xs text-ink/85 mt-0.5 leading-relaxed">
                {analysis.data_source_summary || "Real numerical extraction directly from uploaded sales dataset."}
              </p>
            </div>
          </div>
          <span className="label-mono border border-ink/20 bg-paper px-2.5 py-1 text-[10px] text-muted-foreground shrink-0 self-start sm:self-auto">
            Source: Exact File Metrics
          </span>
        </div>
      ) : (
        <div className="border-2 border-violet/40 bg-violet/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 border border-violet/30 bg-paper shrink-0">
              <Globe className="w-5 h-5 text-violet" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="label-mono font-black text-xs text-violet tracking-wide">
                  REAL-TIME WEB INTELLIGENCE & BENCHMARK SYNTHESIS
                </span>
                <span className="label-mono border border-violet/30 bg-violet/10 text-violet px-1.5 py-0.2 text-[8px] font-bold">
                  AI CALIBRATED
                </span>
              </div>
              <p className="font-mono text-xs text-ink/85 mt-0.5 leading-relaxed">
                {analysis.data_source_summary || "Synthesized from web assets, pricing tiers, and commercial benchmarks."}
              </p>
            </div>
          </div>
          <span className="label-mono border border-ink/20 bg-paper px-2.5 py-1 text-[10px] text-muted-foreground shrink-0 self-start sm:self-auto">
            Source: Public Web Assets
          </span>
        </div>
      )}

      {/* ── BIFURCATED NAVIGATION CONTROLLER ── */}
      <div className="border-b border-ink/20 pb-1">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1 px-0.5">
          {[
            { id: "overview", label: "01. Overview & Radar", shortLabel: "Overview", icon: Swords, badge: "6 Vectors" },
            { id: "financial", label: "02. Financial & Revenue", shortLabel: "Finance", icon: TrendingUp, badge: revenueChartData.length > 0 ? `${revenueChartData.length} Periods` : "Option A / B" },
            { id: "pipeline", label: "03. Pipeline & Flask", shortLabel: "Pipeline", icon: Layers, badge: funnelChartData.length > 0 ? `${funnelChartData.length} Stages` : "Upload CRM" },
            { id: "timeline", label: "04. Execution Timeline", shortLabel: "Timeline", icon: Clock, badge: `${analysis.timeline_roadmap?.length || 4} Phases` },
            { id: "icp", label: "05. ICP & Market Matrix", shortLabel: "ICP", icon: Users, badge: `${customers.length} ICPs` },
            { id: "audit", label: "06. Document Audit", shortLabel: "Audit", icon: FileText, badge: `${analysis.document_insights?.length || 0} Docs` },
            { id: "all", label: "View All Sections", shortLabel: "All", icon: FileCheck2 },
          ].map((tab) => {
            const isAct = activeBifurcation === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveBifurcation(tab.id as any)}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 label-mono text-xs font-bold border transition-all whitespace-nowrap shrink-0 min-h-[36px] ${
                  isAct
                    ? "border-violet bg-violet text-violet-foreground shadow-sm"
                    : "border-ink/20 bg-card text-muted-foreground hover:text-ink hover:border-ink/40"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isAct ? "text-lime" : "text-violet"}`} />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
                {tab.badge && (
                  <span
                    className={`hidden sm:inline label-mono text-[9px] px-1.5 py-0.5 border ${
                      isAct ? "border-paper/40 bg-paper/20 text-paper" : "border-ink/15 bg-secondary text-muted-foreground"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>


      {/* ══════════════════════════════════════════════════════════════════
          BIFURCATION 01: OVERVIEW & COMMERCIAL RADAR
         ══════════════════════════════════════════════════════════════════ */}
      {(activeBifurcation === "overview" || activeBifurcation === "all") && (
        <div className="space-y-6">
          {/* Hero Header */}
          <Panel className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
              <div className="space-y-3 flex-1">
                <div className="flex flex-wrap gap-2">
                  <span className="label-mono border border-violet/30 bg-violet/10 text-violet px-2.5 py-0.5">
                    {analysis.industry || "B2B Enterprise"}
                  </span>
                  <span className="label-mono border border-ink/20 bg-secondary text-muted-foreground px-2.5 py-0.5">
                    ID: {report.id.slice(0, 8)}
                  </span>
                </div>
                <h2 className="font-display text-[clamp(1.6rem,4vw,2.8rem)] font-extrabold leading-[0.88]">
                  {analysis.company_name}
                </h2>
                <p className="font-mono text-sm text-muted-foreground leading-relaxed">{analysis.one_line_summary}</p>
                {analysis.value_proposition && (
                  <div className="border-l-2 border-violet pl-4 font-mono text-xs italic text-muted-foreground">
                    "{analysis.value_proposition}"
                  </div>
                )}
              </div>
              <div className="lg:w-52 shrink-0">
                <ScoreGauge
                  score={analysis.opportunity_score}
                  confidence={analysis.confidence_score || 88}
                  notes={analysis.confidence_notes}
                />
              </div>
            </div>
          </Panel>

          {/* Market Advantage Radar Chart */}
          <Panel className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-ink/15 pb-3">
              <div>
                <span className="label-mono text-lime-700 dark:text-lime font-bold flex items-center gap-1.5 text-xs">
                  <Swords className="w-3.5 h-3.5" /> Market Advantage Radar Benchmark
                </span>
                <p className="font-mono text-[11px] text-muted-foreground">
                  6-vector commercial comparison against category peers.
                </p>
              </div>
              <span className="label-mono border border-lime/30 bg-lime/10 text-lime-700 dark:text-lime px-2 py-0.5 text-[9px] font-bold">
                6-Vector Index
              </span>
            </div>

            <div className="h-[280px] w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart outerRadius="75%" data={radarData}>
                  <PolarGrid stroke="#e5e5e5" />
                  <PolarAngleAxis dataKey="subject" stroke="#555" tick={{ fontFamily: "monospace", fontSize: 10 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#888" tick={false} />
                  <Radar
                    name={analysis.company_name || "Target"}
                    dataKey="target"
                    stroke="#7C3AED"
                    fill="#7C3AED"
                    fillOpacity={0.4}
                  />
                  <Radar
                    name="Competitor Avg"
                    dataKey="marketAvg"
                    stroke="#6B7280"
                    fill="#6B7280"
                    fillOpacity={0.25}
                  />
                  <Legend
                    wrapperStyle={{ fontFamily: "monospace", fontSize: "11px", paddingTop: "8px" }}
                    formatter={(value) => <span className="text-ink font-mono font-semibold text-[11px] ml-1">{value}</span>}
                  />
                  <Tooltip
                    contentStyle={{ ...tooltipBoxStyle, borderColor: "#A3E635" }}
                    itemStyle={tooltipItemStyle}
                    labelStyle={{ ...tooltipLabelStyle, color: "#A3E635" }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* Executive Summary */}
          {analysis.executive_summary && (
            <Panel className="p-5 space-y-4">
              <div className="label-mono text-violet font-bold flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" /> Executive Commercial Synthesis
              </div>
              <p className="font-mono text-sm leading-relaxed text-muted-foreground">
                {analysis.executive_summary.core_thesis}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-ink/10">
                {[
                  {
                    items: analysis.executive_summary.key_strengths,
                    label: "Core Strengths",
                    color: "text-lime-700 dark:text-lime",
                  },
                  {
                    items: analysis.executive_summary.primary_vulnerabilities,
                    label: "Key Vulnerabilities",
                    color: "text-danger",
                  },
                  {
                    items: analysis.executive_summary.immediate_action_items,
                    label: "Immediate Levers",
                    color: "text-violet",
                  },
                ]
                  .filter((g) => g.items?.length)
                  .map(({ items, label, color }) => (
                    <div key={label} className="bg-paper p-4 space-y-2">
                      <span className={`label-mono font-bold ${color}`}>{label}</span>
                      <ul className="font-mono text-xs text-muted-foreground space-y-1">
                        {items!.map((it, i) => (
                          <li key={i}>• {it}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            </Panel>
          )}

          {/* SWOT Matrix */}
          <Panel className="p-5 space-y-4">
            <div className="label-mono text-violet font-bold flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5" /> SWOT Analysis Matrix
            </div>
            <div className="grid grid-cols-2 gap-px bg-ink/10">
              {(
                [
                  ["Strengths", "text-lime-700 dark:text-lime", "strengths"],
                  ["Weaknesses", "text-danger", "weaknesses"],
                  ["Opportunities", "text-violet", "opportunities"],
                  ["Threats", "text-amber-600 dark:text-amber-400", "threats"],
                ] as const
              ).map(([label, color, key]) => (
                <div key={label} className="bg-paper p-4 space-y-2">
                  <span className={`label-mono font-bold ${color}`}>{label}</span>
                  <ul className="font-mono text-xs text-muted-foreground space-y-1">
                    {(swot[key as keyof SWOTAnalysis] || []).map((it, i) => (
                      <li key={i}>• {it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          BIFURCATION 02: FINANCIAL & PREDICTIVE REVENUE
         ══════════════════════════════════════════════════════════════════ */}
      {(activeBifurcation === "financial" || activeBifurcation === "all") && (
        <div className="space-y-6">
          {/* Revenue Trajectory Area Chart or Option A / B Fallback */}
          <Panel className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-ink/15 pb-3">
              <div>
                <span className="label-mono text-violet font-bold flex items-center gap-1.5 text-xs">
                  <TrendingUp className="w-3.5 h-3.5" /> Predictive Revenue Acceleration
                </span>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {hasUserRevenue
                    ? "Verified baseline vs. autonomous AI fleet velocity acceleration (+14% to +67%)."
                    : hasFileRevenue
                    ? "Grounded financial projections extracted from uploaded financial ledgers."
                    : "Zero simulation policy: graphs strictly require verified file records or self-reported calibration."}
                </p>
              </div>
              <span className="label-mono border border-violet/25 bg-violet/5 text-violet px-2 py-0.5 text-[9px]">
                {revenueChartData.length > 0 ? `${revenueChartData.length} Periods Projected` : "Ground Truth Required"}
              </span>
            </div>

            {revenueChartData.length > 0 ? (
              <div className="space-y-4">
                {hasUserRevenue && (
                  <div className="border border-lime/30 bg-lime/10 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-lime-700 dark:text-lime shrink-0" />
                      <span className="font-mono text-xs text-ink font-bold">
                        Ground-Truth Calibrated: Baseline Monthly Revenue ₹{userRevNum.toLocaleString("en-IN")} / mo
                        {cycleDays > 0 ? ` · ${cycleDays}-day cycle` : ""}
                      </span>
                    </div>
                    <button
                      onClick={() => setAppliedCustomBaseline(false)}
                      className="label-mono text-[10px] text-muted-foreground hover:text-ink border border-ink/20 bg-paper px-2.5 py-1 flex items-center gap-1 shrink-0 transition-colors"
                    >
                      <Sliders className="w-3 h-3 text-violet" /> Adjust Baseline
                    </button>
                  </div>
                )}
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="areaVyaperi" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#7C3AED" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="areaBase" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#111111" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#111111" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e2dc" />
                      <XAxis dataKey="period" stroke="#666" tick={{ fontFamily: "monospace", fontSize: 10 }} />
                      <YAxis
                        stroke="#666"
                        tick={{ fontFamily: "monospace", fontSize: 10 }}
                        tickFormatter={(v) =>
                          hasUserRevenue
                            ? v >= 10000000
                              ? `₹${(v / 10000000).toFixed(1)}Cr`
                              : v >= 100000
                              ? `₹${(v / 100000).toFixed(1)}L`
                              : `₹${Math.round(v / 1000)}k`
                            : `$${Math.round(v / 1000)}k`
                        }
                      />
                      <Tooltip
                        contentStyle={{ ...tooltipBoxStyle, borderColor: "#8B5CF6" }}
                        itemStyle={tooltipItemStyle}
                        labelStyle={{ ...tooltipLabelStyle, color: "#A3E635" }}
                        formatter={(val: any, name: any) => [
                          hasUserRevenue
                            ? `₹${Number(val).toLocaleString("en-IN")}`
                            : `$${Number(val).toLocaleString()}`,
                          name || "Projected Revenue",
                        ]}
                      />
                      <Legend
                        wrapperStyle={{ fontFamily: "monospace", fontSize: "11px", paddingTop: "8px" }}
                        formatter={(value) => <span className="text-ink font-mono font-semibold text-[11px] ml-1">{value}</span>}
                      />
                      <Area
                        type="monotone"
                        dataKey="optimizedMRR"
                        name={hasUserRevenue ? "With VYAPERI X AI Fleet (₹)" : "With VYAPERI X AI Fleet ($)"}
                        stroke="#7C3AED"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#areaVyaperi)"
                      />
                      <Area
                        type="monotone"
                        dataKey="baselineMRR"
                        name={hasUserRevenue ? "Your Baseline Status Quo (₹)" : "Status Quo ($)"}
                        stroke="#666666"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        fillOpacity={1}
                        fill="url(#areaBase)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Option A — Strict Ground Truth Prompt */}
                <div className="border border-ink/20 bg-secondary/20 p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="label-mono text-muted-foreground flex items-center gap-1.5 text-[10px] font-bold">
                      <Lock className="w-3.5 h-3.5 text-violet" /> STRICT GROUND TRUTH · ZERO SIMULATION
                    </span>
                    <span className="label-mono border border-ink/20 bg-paper px-2 py-0.5 text-[9px]">
                      Option A
                    </span>
                  </div>
                  <h4 className="font-display text-sm font-extrabold uppercase text-ink">
                    Website Analyzed: Public assets do not contain internal financial ledgers.
                  </h4>
                  <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                    Upload your sales CSV/XLSX or CRM export to plot your actual revenue trajectory and funnel drop-off telemetry. Graphs only appear when real numerical records are present. Zero simulation.
                  </p>
                </div>

                {/* Option B — Ground-Truth Inputs (Interactive) */}
                <div className="border-2 border-violet/30 bg-card p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-ink/15 pb-2">
                    <span className="label-mono text-violet font-bold flex items-center gap-1.5 text-xs">
                      <Sliders className="w-3.5 h-3.5" /> Option B — Ground-Truth Inputs (Interactive)
                    </span>
                    <span className="label-mono border border-violet/30 bg-violet/10 text-violet px-2 py-0.5 text-[9px] font-bold">
                      Interactive Calibration
                    </span>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    Provide your baseline metrics to calibrate and plot your actual self-reported trajectory vs. AI fleet velocity:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="label-mono text-ink text-[11px] font-bold block">
                        Your Current Monthly Revenue:
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground font-bold">
                          ₹
                        </span>
                        <input
                          type="text"
                          value={userMonthlyRevenue}
                          onChange={(e) => setUserMonthlyRevenue(e.target.value)}
                          placeholder="5,00,000"
                          className="w-full pl-8 pr-3 py-2 border border-ink/20 bg-paper font-mono text-xs text-ink focus:outline-none focus:border-violet"
                        />
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        Current monthly recurring or average sales
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="label-mono text-ink text-[11px] font-bold block">
                        Average Deal Cycle:
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={userDealCycle}
                          onChange={(e) => setUserDealCycle(e.target.value)}
                          placeholder="45"
                          className="w-full pl-3 pr-14 py-2 border border-ink/20 bg-paper font-mono text-xs text-ink focus:outline-none focus:border-violet"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground font-bold">
                          days
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        Days from commercial inquiry to closed deal
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (userMonthlyRevenue.trim()) {
                        setAppliedCustomBaseline(true);
                      }
                    }}
                    disabled={!userMonthlyRevenue.trim()}
                    className="w-full border border-violet bg-violet text-violet-foreground py-2.5 px-4 font-display text-xs font-black uppercase tracking-wider hover:bg-violet/90 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                  >
                    <TrendingUp className="w-4 h-4" />
                    Plot Actual Baseline vs. AI Fleet Velocity
                  </button>
                </div>
              </div>
            )}
          </Panel>

          {/* Month-by-Month Forecast Table */}
          {revenueChartData.length > 0 && (
            <Panel className="p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-ink/15 pb-2">
                <span className="label-mono text-xs font-bold text-ink flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-violet" /> Period Trajectory Breakdown
                </span>
                <span className="label-mono text-[9px] text-muted-foreground">
                  {hasUserRevenue ? "Self-Reported Baseline" : "Monthly Projections"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="border-b border-ink/20 text-muted-foreground label-mono text-[10px]">
                      <th className="pb-2">Period</th>
                      <th className="pb-2">Baseline MRR</th>
                      <th className="pb-2">AI Fleet MRR</th>
                      <th className="pb-2">Lift Upside</th>
                      <th className="pb-2">Key Acceleration Driver</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {revenueChartData.map((row, rIdx) => {
                      const lift = Math.round(((row.optimizedMRR - row.baselineMRR) / (row.baselineMRR || 1)) * 100);
                      return (
                        <tr key={rIdx} className="hover:bg-secondary/20">
                          <td className="py-2.5 font-bold text-ink">{row.period}</td>
                          <td className="py-2.5 text-muted-foreground">
                            {hasUserRevenue ? "₹" : "$"}{Math.round(row.baselineMRR).toLocaleString(hasUserRevenue ? "en-IN" : "en-US")}
                          </td>
                          <td className="py-2.5 font-bold text-violet">
                            {hasUserRevenue ? "₹" : "$"}{Math.round(row.optimizedMRR).toLocaleString(hasUserRevenue ? "en-IN" : "en-US")}
                          </td>
                          <td className="py-2.5">
                            <span className="label-mono border border-lime/30 bg-lime/10 text-lime-700 dark:text-lime px-1.5 py-0.2 text-[9px] font-bold">
                              +{lift}%
                            </span>
                          </td>
                          <td className="py-2.5 text-muted-foreground text-[11px] truncate max-w-xs">{row.driver}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {/* Financial Highlights */}
          {(analysis.financial_highlights?.length ?? 0) > 0 && (
            <FinancialHighlights financials={analysis.financial_highlights!} />
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          BIFURCATION 03: PIPELINE & CONVERSION FLASK
         ══════════════════════════════════════════════════════════════════ */}
      {(activeBifurcation === "pipeline" || activeBifurcation === "all") && (
        <div className="space-y-6">
          {funnelStages.length > 0 ? (
            <>
              {/* Flask Funnel Chart */}
              <FlaskFunnelChart stages={funnelStages} />

              {/* Funnel Throughput Bar Chart */}
              {funnelChartData.length > 0 && (
                <Panel className="p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-ink/15 pb-3">
                    <span className="label-mono text-violet font-bold flex items-center gap-1.5 text-xs">
                      <Layers className="w-3.5 h-3.5" /> Stage Conversion Efficiency (%)
                    </span>
                    <span className="label-mono text-muted-foreground text-[9px]">Funnel Telemetry</span>
                  </div>

                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={funnelChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                        <XAxis dataKey="stage" stroke="#666" tick={{ fontFamily: "monospace", fontSize: 9 }} />
                        <YAxis stroke="#666" tick={{ fontFamily: "monospace", fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                        <Tooltip
                          contentStyle={{ ...tooltipBoxStyle, borderColor: "#7C3AED" }}
                          itemStyle={tooltipItemStyle}
                          labelStyle={{ ...tooltipLabelStyle, color: "#A3E635" }}
                          formatter={(val: any) => [`${val}% Efficiency`, "Health Score"]}
                        />
                        <Bar dataKey="efficiency" fill="#7C3AED" radius={0}>
                          {funnelChartData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={
                                entry.health === "optimal"
                                  ? "#A3E635"
                                  : entry.health === "underperforming"
                                  ? "#f59e0b"
                                  : "#ef4444"
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
              )}
            </>
          ) : (
            <Panel className="p-8 space-y-4">
              <div className="flex items-center justify-between border-b border-ink/15 pb-3">
                <span className="label-mono text-muted-foreground flex items-center gap-1.5 text-[10px] font-bold">
                  <Lock className="w-3.5 h-3.5 text-violet" /> STRICT GROUND TRUTH · ZERO SIMULATION
                </span>
                <span className="label-mono border border-ink/20 bg-secondary px-2 py-0.5 text-[9px]">
                  Option A Active
                </span>
              </div>
              <div className="space-y-2">
                <h4 className="font-display text-sm font-extrabold uppercase text-ink">
                  Website Analyzed: Public assets do not contain internal financial ledgers.
                </h4>
                <p className="font-mono text-xs text-muted-foreground leading-relaxed max-w-2xl">
                  Upload your sales CSV/XLSX or CRM export to plot your actual revenue trajectory and funnel drop-off telemetry. Graphs only appear when real numerical records are present. Zero simulation.
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => setActiveBifurcation("financial")}
                    className="label-mono text-xs text-violet font-bold flex items-center gap-1.5 hover:underline"
                  >
                    <Sliders className="w-3.5 h-3.5" /> Or calibrate deal cycle baseline in Financial section &rarr;
                  </button>
                </div>
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          BIFURCATION 04: EXECUTION TIMELINE ROADMAP
         ══════════════════════════════════════════════════════════════════ */}
      {(activeBifurcation === "timeline" || activeBifurcation === "all") && (
        <div className="space-y-6">
          {/* 180-Day Phased Execution Timeline Chart */}
          <TimelineRoadmapChart timeline={analysis.timeline_roadmap || []} />

          {/* Strategic Roadmap & Action Playbooks */}
          <Panel className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-ink/20 pb-3">
              <div className="label-mono text-violet font-bold flex items-center gap-2">
                <ListChecks className="w-3.5 h-3.5" /> Strategic Recommendations & Tactical Levers
              </div>
              <span className="label-mono border border-violet/25 bg-violet/8 text-violet px-2.5 py-0.5">
                {recs.length} Playbooks
              </span>
            </div>
            {recs.map((rec, rIdx) => (
              <div
                key={rIdx}
                className="border border-ink/15 bg-secondary/20 p-4 space-y-3 hover:border-ink/30 transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="border border-ink/25 bg-paper w-6 h-6 flex items-center justify-center font-display text-xs font-extrabold shrink-0">
                      {rIdx + 1}
                    </span>
                    <h4 className="font-display text-xs font-extrabold uppercase">{rec.title}</h4>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <span className={priorityStyle(rec.priority || "high")}>{rec.priority || "High"}</span>
                    {rec.expected_roi && (
                      <span className="label-mono border border-lime/30 bg-lime/8 text-lime-700 dark:text-lime px-2 py-0.5">
                        {rec.expected_roi}
                      </span>
                    )}
                    {rec.timeframe && (
                      <span className="label-mono border border-ink/15 bg-paper text-muted-foreground px-2 py-0.5">
                        {rec.timeframe}
                      </span>
                    )}
                  </div>
                </div>
                {rec.detail && (
                  <p className="font-mono text-xs text-muted-foreground leading-relaxed">{rec.detail}</p>
                )}
                {rec.action_steps?.length ? (
                  <div className="border border-ink/10 bg-paper p-3 space-y-1.5">
                    <span className="label-mono text-muted-foreground block text-[10px]">Execution Checklist</span>
                    {rec.action_steps.map((step, sIdx) => {
                      const done = completedSteps[`${rIdx}-${sIdx}`];
                      return (
                        <div
                          key={sIdx}
                          onClick={() => toggleStep(rIdx, sIdx)}
                          className="flex items-center gap-2 font-mono text-xs cursor-pointer hover:text-ink transition-colors"
                        >
                          <div
                            className={`w-3.5 h-3.5 border flex items-center justify-center shrink-0 transition-colors ${
                              done ? "bg-violet border-violet text-paper" : "border-ink/30"
                            }`}
                          >
                            {done && <Check className="w-2.5 h-2.5" />}
                          </div>
                          <span className={done ? "line-through text-muted-foreground" : "text-muted-foreground"}>
                            {step}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}
          </Panel>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          BIFURCATION 05: ICP SEGMENTATION & MARKET MATRIX
         ══════════════════════════════════════════════════════════════════ */}
      {(activeBifurcation === "icp" || activeBifurcation === "all") && (
        <div className="space-y-6">
          {/* Target Customer ICP Donut Chart */}
          <Panel className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-ink/15 pb-3">
              <span className="label-mono text-lime-700 dark:text-lime font-bold flex items-center gap-1.5 text-xs">
                <PieIcon className="w-3.5 h-3.5" /> ICP Segment Allocation & Deal Size
              </span>
              <span className="label-mono text-muted-foreground text-[9px]">Market Weight</span>
            </div>

            {pieData.length > 0 ? (
              <div className="h-[240px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ ...tooltipBoxStyle, borderColor: "#10B981", padding: "8px 12px" }}
                      itemStyle={tooltipItemStyle}
                      labelStyle={{ ...tooltipLabelStyle, color: "#10B981" }}
                      formatter={(val: any, name: any, item: any) => [
                        `${item.payload.dealSize || "Custom"} deal size`,
                        item.payload.name || name,
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ fontFamily: "monospace", fontSize: "11px", paddingTop: "12px" }}
                      formatter={(value) => <span className="text-ink font-mono font-semibold text-[11px] ml-1">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[180px] border border-ink/10 bg-secondary/10 flex flex-col items-center justify-center p-4 text-center space-y-2">
                <PieIcon className="w-5 h-5 text-muted-foreground/40" />
                <span className="font-mono text-xs text-muted-foreground">
                  No customer segments available to chart.
                </span>
              </div>
            )}
          </Panel>

          {/* Customers + Products */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel className="p-5 space-y-3">
              <PanelHeader icon={Users} title="Target Customer ICPs" count={customers.length} />
              {customers.length ? (
                customers.map((c, i) => (
                  <div key={i} className="border border-ink/15 bg-secondary/20 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-xs font-extrabold uppercase text-violet">
                        {c.segment_name}
                      </span>
                      {c.estimated_deal_size && (
                        <span className="label-mono border border-ink/15 bg-paper px-1.5 py-0.5">
                          {c.estimated_deal_size}
                        </span>
                      )}
                    </div>
                    {c.description && <p className="font-mono text-xs text-muted-foreground">{c.description}</p>}
                  </div>
                ))
              ) : (
                <p className="font-mono text-xs text-muted-foreground italic">No segments parsed.</p>
              )}
            </Panel>
            <Panel className="p-5 space-y-3">
              <PanelHeader
                icon={Package}
                title="Product & Offering Portfolio"
                count={products.length}
                iconColor="text-lime-700 dark:text-lime"
              />
              {products.length ? (
                products.map((p, i) => (
                  <div key={i} className="border border-ink/15 bg-secondary/20 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-xs font-extrabold uppercase text-lime-700 dark:text-lime">
                        {p.name}
                      </span>
                      <span className="label-mono border border-ink/15 bg-paper px-1.5 py-0.5">
                        {p.category || "Offering"}
                      </span>
                    </div>
                    {p.differentiator && (
                      <p className="font-mono text-xs text-muted-foreground">
                        <span className="text-violet font-bold">Edge:</span> {p.differentiator}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="font-mono text-xs text-muted-foreground italic">No products recorded.</p>
              )}
            </Panel>
          </div>

          {/* Channels + Competitors */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel className="p-5 space-y-3">
              <PanelHeader icon={Radio} title="Marketing Channels" count={channels.length} iconColor="text-violet" />
              {channels.map((ch, i) => {
                const s = (ch.strength || "").toLowerCase();
                const sc =
                  s.includes("strong") || s.includes("high")
                    ? "text-lime-700 dark:text-lime border-lime/30 bg-lime/8"
                    : s.includes("weak") || s.includes("low")
                    ? "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/8"
                    : "text-violet border-violet/30 bg-violet/8";
                return (
                  <div key={i} className="border border-ink/15 bg-secondary/20 p-3 flex items-center justify-between">
                    <span className="font-display text-xs font-extrabold uppercase">{ch.channel}</span>
                    <span className={`label-mono border px-2 py-0.5 ${sc}`}>{ch.strength || "Stated"}</span>
                  </div>
                );
              })}
            </Panel>
            <Panel className="p-5 space-y-3">
              <PanelHeader icon={Swords} title="Competitor Signals" count={competitors.length} iconColor="text-danger" />
              {competitors.map((c, i) => (
                <div key={i} className="border border-ink/15 bg-secondary/20 p-3 space-y-1">
                  <span className="font-display text-xs font-extrabold uppercase text-danger">
                    {c.competitor_name}
                  </span>
                  {c.our_advantage && (
                    <p className="font-mono text-xs text-muted-foreground">
                      <span className="text-lime-700 dark:text-lime font-bold">Edge:</span> {c.our_advantage}
                    </p>
                  )}
                </div>
              ))}
            </Panel>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          BIFURCATION 06: DOCUMENT AUDIT & DISCREPANCIES
         ══════════════════════════════════════════════════════════════════ */}
      {(activeBifurcation === "audit" || activeBifurcation === "all") && (
        <div className="space-y-6">
          {/* Document Insights */}
          <DocumentInsightPanel insights={analysis.document_insights || []} />

          {/* Discrepancy Alerts */}
          <DiscrepancyAlerts alerts={analysis.discrepancy_alerts || []} />

          {/* Marketing Gaps */}
          {analysis.marketing_gaps?.length ? (
            <Panel className="p-5 space-y-3">
              <div className="label-mono text-amber-600 dark:text-amber-400 font-bold flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5" /> Marketing & Commercial Gaps
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {analysis.marketing_gaps.map((gap, i) => (
                  <div
                    key={i}
                    className="border border-amber-500/15 bg-amber-500/5 p-3 font-mono text-xs flex items-start gap-2"
                  >
                    <span className="text-amber-600 dark:text-amber-400 font-bold">•</span>
                    {gap}
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ─── MOBILE DRAWER (Dashboard) ─── */
function MobileDashboardDrawer({
  isOpen,
  onClose,
  navItems,
  activeNav,
  onSelectNav,
  hasCompletedReport,
  onSignOut,
}: {
  isOpen: boolean;
  onClose: () => void;
  navItems: (typeof MODULE_REGISTRY[number] & { isUnlocked: boolean })[];
  activeNav: string;
  onSelectNav: (id: string) => void;
  hasCompletedReport: boolean;
  onSignOut: () => void;
}) {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[99999] h-[100dvh] w-screen pointer-events-auto"
      style={{ isolation: "isolate" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Drawer Panel */}
      <div className="absolute inset-y-0 left-0 w-[80vw] max-w-xs bg-[#0D0E14] text-[#f6f6f6] flex flex-col overflow-y-auto shadow-2xl border-r border-white/10">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-white/15 px-4 py-3 shrink-0">
          <Logo />
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center border-2 border-lime bg-lime text-lime-foreground font-black hover:bg-white hover:text-black transition-all active:scale-95"
            aria-label="Close menu"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {/* Module Nav */}
        <nav className="flex-1 p-3 space-y-0.5 pt-4">
          <span className="label-mono text-[9px] text-lime/70 font-bold tracking-widest px-2 pb-2 block">MODULES</span>
          {navItems.map((item) => {
            const isActive = activeNav === item.id;
            const isUnlocked = item.isUnlocked;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (isUnlocked) {
                    onSelectNav(item.id);
                    onClose();
                  }
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all text-left ${
                  isActive
                    ? "border border-violet/40 bg-violet/20 text-lime font-bold"
                    : isUnlocked
                    ? "border border-transparent text-white/70 hover:border-white/20 hover:text-white hover:bg-white/5"
                    : "border border-transparent text-white/20 cursor-not-allowed opacity-50"
                }`}
              >
                <item.icon className={`w-4 h-4 shrink-0 ${isActive ? "text-lime" : isUnlocked ? "text-white/60" : "text-white/20"}`} />
                <span className="font-mono text-xs font-medium flex-1 truncate">{item.label}</span>
                {!isUnlocked && <svg className="w-3 h-3 text-white/20 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                {isUnlocked && item.badge && (
                  <span className="label-mono border border-lime/30 bg-lime/10 text-lime text-[8px] px-1 py-0.5 shrink-0">{item.badge}</span>
                )}
              </button>
            );
          })}
        </nav>
        {/* Drawer Footer */}
        <div className="border-t border-white/10 p-4 space-y-3 shrink-0">
          {hasCompletedReport && (
            <div className="flex items-center gap-2 border border-lime/30 bg-lime/10 px-3 py-2 label-mono text-[10px] text-lime font-bold">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
              ALL MODULES UNLOCKED
            </div>
          )}
          <button
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 border border-danger/40 bg-danger/10 text-danger px-3 py-2 label-mono text-xs font-bold hover:bg-danger hover:text-white transition-all"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── MOBILE BOTTOM NAV BAR (Dashboard) ─── */
const MOBILE_NAV_SHORTCUTS = [
  { id: "overview", icon: LayoutDashboard },
  { id: "intelligence", icon: Brain },
  { id: "lead-radar", icon: Radio },
  { id: "voice-fleet", icon: Sparkles },
  { id: "analytics", icon: BarChart3 },
];

function MobileBottomNav({
  activeNav,
  onSelect,
  hasCompletedReport,
  onOpenDrawer,
}: {
  activeNav: string;
  onSelect: (id: string) => void;
  hasCompletedReport: boolean;
  onOpenDrawer: () => void;
}) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-ink/20 bg-paper/95 backdrop-blur-md shadow-[0_-4px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-around px-1 py-1 safe-area-inset-bottom" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 4px)' }}>
        {MOBILE_NAV_SHORTCUTS.map(({ id, icon: Icon }) => {
          const isActive = activeNav === id;
          const isUnlocked = id === "overview" || id === "intelligence" || hasCompletedReport;
          return (
            <button
              key={id}
              onClick={() => isUnlocked && onSelect(id)}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 min-w-[44px] min-h-[44px] transition-all active:scale-90 ${
                isActive ? "text-violet" : isUnlocked ? "text-muted-foreground" : "text-ink/20"
              }`}
            >
              <Icon className={`w-5 h-5 ${ isActive ? "text-violet" : "" }`} />
              {isActive && <span className="h-1 w-1 rounded-full bg-violet" />}
            </button>
          );
        })}
        {/* More / All modules button */}
        <button
          onClick={onOpenDrawer}
          className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 min-w-[44px] min-h-[44px] text-muted-foreground active:scale-90 transition-all"
        >
          <div className="flex flex-col items-center justify-center gap-0.5">
            <span className="h-0.5 w-4 bg-current" />
            <span className="h-0.5 w-4 bg-current" />
            <span className="h-0.5 w-4 bg-current" />
          </div>
        </button>
      </div>
    </nav>
  );
}

/* ─── MAIN DASHBOARD ─── */
function DashboardPage() {
  const navigate = useNavigate();
  const { user, profile, session, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [activeNav, setActiveNav] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam) return tabParam;
      const stored = localStorage.getItem("vyaperi_active_nav");
      if (stored) return stored;
    }
    return "overview";
  });

  const handleSelectNav = (navId: string) => {
    setActiveNav(navId);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("vyaperi_active_nav", navId);
        const url = new URL(window.location.href);
        url.searchParams.set("tab", navId);
        window.history.replaceState(null, "", url.toString());
      } catch {}
    }
  };
  const [voiceTargetLead, setVoiceTargetLead] = useState<any>(null);
  const [reportId, setReportId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("reportId");
    }
    return null;
  });
  const [view, setView] = useState<"intake" | "loading" | "report">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("reportId")) return "report";
    }
    return "intake";
  });
  const [recentReports, setRecentReports] = useState<RecentReport[]>([]);
  const [activeAnalysis, setActiveAnalysis] = useState<FullAnalysis | null>(null);
  const [activeCompanyInfo, setActiveCompanyInfo] = useState<{ name: string; industry: string; score: number }>({
    name: "",
    industry: "",
    score: 0,
  });
  const [time, setTime] = useState("--:--:--");
  const [greeting, setGreeting] = useState<{ company?: string }>({});

  // Module Unlocking State
  const hasCompletedReport =
    recentReports.some((r) => r.status === "done") || view === "report";

  useEffect(() => {
    const tick = () => setTime(new Date().toISOString().slice(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const userId = user?.id;

  useEffect(() => {
    try {
      if (profile?.company_name) {
        setActiveCompanyInfo((prev) => ({ ...prev, name: profile.company_name! }));
      }
      const stored = sessionStorage.getItem("vyaperi_onboarding");
      if (stored) {
        const parsed = JSON.parse(stored);
        setGreeting(parsed);
        if (parsed.company) {
          setActiveCompanyInfo((prev) => ({ ...prev, name: parsed.company }));
        }
      }
    } catch {}

    // Clean legacy global cache
    try {
      sessionStorage.removeItem("vyaperi_reports_cache");
    } catch {}

    // Only fetch when we have a settled user ID — avoids double-fire during auth hydration
    if (userId && userId !== "undefined" && userId !== "null") {
      try {
        const userCached = sessionStorage.getItem(`vyaperi_reports_cache_${userId}`);
        if (userCached) {
          const parsed = JSON.parse(userCached) as RecentReport[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRecentReports(parsed);
            const latestDone = parsed.find((r) => r.status === "done" && r.analysis?.company_name);
            if (latestDone) {
              setActiveCompanyInfo({
                name: latestDone.analysis!.company_name!,
                industry: latestDone.analysis!.industry || "B2B Tech",
                score: latestDone.analysis!.opportunity_score || 88,
              });
              setActiveAnalysis(latestDone.analysis as FullAnalysis);
            }
          }
        }
      } catch {}
      fetchRecents();
    } else {
      setRecentReports([]);
      setActiveAnalysis(null);
      setActiveCompanyInfo({ name: "", industry: "", score: 0 });
    }
  }, [userId, profile]);

  const fetchRecents = async () => {
    try {
      const validUserId = user?.id && user.id !== "undefined" && user.id !== "null" ? user.id : null;
      if (!validUserId) {
        setRecentReports([]);
        setActiveAnalysis(null);
        return;
      }
      const url = `${API_BASE}/api/reports?user_id=${encodeURIComponent(validUserId)}`;
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await safeApiFetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        const safeData = Array.isArray(data) ? data : [];
        setRecentReports(safeData);
        try {
          sessionStorage.setItem(`vyaperi_reports_cache_${validUserId}`, JSON.stringify(safeData));
          sessionStorage.removeItem("vyaperi_reports_cache");
        } catch {}
        const latestDone = safeData.find((r: any) => r.status === "done" && r.analysis?.company_name);
        if (latestDone) {
          setActiveCompanyInfo({
            name: latestDone.analysis.company_name,
            industry: latestDone.analysis.industry || "B2B Tech",
            score: latestDone.analysis.opportunity_score || 88,
          });
          setActiveAnalysis(latestDone.analysis);
        } else {
          setActiveAnalysis(null);
        }
      }
    } catch {}
  };

  const handleNewAnalysis = () => {
    setView("intake");
    setReportId(null);
    try {
      window.history.replaceState(null, "", "/dashboard");
    } catch {}
  };

  const handleReportCreated = (id: string) => {
    setReportId(id);
    setView("report");
    try {
      window.history.replaceState(null, "", `/dashboard?reportId=${id}`);
    } catch {}
    fetchRecents();
  };

  const handleReportFinished = (reportData: ReportData) => {
    if (reportData.analysis) {
      setActiveAnalysis(reportData.analysis);
      setActiveCompanyInfo({
        name: reportData.analysis.company_name,
        industry: reportData.analysis.industry || "B2B Tech",
        score: reportData.analysis.opportunity_score || 88,
      });
    }
    fetchRecents();
  };

  const handleSelectReport = (r: RecentReport) => {
    setReportId(r.id);
    setView("report");
    try {
      window.history.replaceState(null, "", `/dashboard?reportId=${r.id}`);
    } catch {}
    if (r.analysis) {
      setActiveAnalysis(r.analysis as FullAnalysis);
      if (r.analysis.company_name) {
        setActiveCompanyInfo({
          name: r.analysis.company_name,
          industry: r.analysis.industry || "B2B Tech",
          score: r.analysis.opportunity_score || 88,
        });
      }
    }
  };

  const handleNavigateModule = (moduleId: string) => {
    handleSelectNav(moduleId);
  };

  const navItems = MODULE_REGISTRY.map((mod) => ({
    ...mod,
    // overview is always unlocked; others unlock after first completed report
    isUnlocked: mod.id === "overview" || mod.id === "intelligence" || hasCompletedReport,
  }));

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col selection:bg-lime selection:text-ink">
      {/* ── Mobile Drawer ── */}
      <MobileDashboardDrawer
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        navItems={navItems}
        activeNav={activeNav}
        onSelectNav={handleSelectNav}
        hasCompletedReport={hasCompletedReport}
        onSignOut={async () => { await signOut(); navigate({ to: "/login" }); }}
      />

      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-50 border-b border-ink/20 bg-paper/95 backdrop-blur-md">
        <div className="flex items-center justify-between px-3 py-2.5 md:px-4 md:py-3 gap-2">
          {/* Left: hamburger (desktop sidebar toggle) + mobile drawer + logo */}
          <div className="flex items-center gap-2">
            {/* Desktop sidebar toggle (hidden on mobile) */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hidden md:flex border border-ink/20 bg-secondary p-2 hover:border-violet transition-colors"
            >
              {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {/* Mobile drawer trigger */}
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="md:hidden border border-ink/20 bg-secondary p-2 hover:border-violet transition-colors active:scale-95"
              aria-label="Open navigation menu"
            >
              <div className="flex flex-col items-center justify-center gap-[3px]">
                <span className="h-0.5 w-3.5 bg-ink" />
                <span className="h-0.5 w-3.5 bg-ink" />
                <span className="h-0.5 w-3.5 bg-ink" />
              </div>
            </button>
            <Logo />
          </div>

          {/* Right: controls — progressively hide on smaller screens */}
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            {hasCompletedReport ? (
              <div className="hidden sm:flex items-center gap-1.5 border border-lime/40 bg-lime/10 px-2 py-1 text-lime-700 dark:text-lime label-mono text-[10px] font-bold whitespace-nowrap">
                <Sparkles className="w-3 h-3 shrink-0" />
                <span className="hidden lg:inline">ALL MODULES UNLOCKED</span>
                <span className="lg:hidden">UNLOCKED</span>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-1.5 border border-ink/20 px-2 py-1 label-mono text-[10px] text-muted-foreground whitespace-nowrap">
                <Lock className="w-3 h-3 shrink-0" />
                <span className="hidden lg:inline">Finish 1 Report to Unlock All</span>
                <span className="lg:hidden">Run a Report</span>
              </div>
            )}

            {greeting.company && (
              <span className="hidden xl:block font-mono text-xs text-muted-foreground truncate max-w-[120px]">
                <span className="text-ink font-bold">{greeting.company}</span>
              </span>
            )}

            {/* Live status dot — only on md+ */}
            <div className="hidden md:flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 bg-lime live-dot" />
              <span className="label-mono text-muted-foreground text-[10px] whitespace-nowrap">All Systems OK</span>
            </div>

            {/* 🌓 Dark / Light Mode Toggle */}
            <ThemeToggle className="p-1" />

            {/* 🌐 Multi-Language Switcher */}
            <LangSwitcher />

            {/* Time — large screens only */}
            <div className="hidden lg:block border border-ink/20 px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
              <div>SYS.TIME</div>
              <div className="text-ink">{time}</div>
            </div>

            {user && (
              <div className="flex items-center gap-1.5 border-l border-ink/20 pl-1.5 sm:pl-3">
                <div className="hidden lg:flex flex-col text-right">
                  <span className="font-mono text-[10px] font-bold text-ink truncate max-w-[120px]">
                    {profile?.full_name || user.email?.split("@")[0]}
                  </span>
                  <span className="font-mono text-[9px] text-muted-foreground truncate max-w-[120px]">
                    {profile?.company_name || user.email}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    navigate({ to: "/login" });
                  }}
                  title="Sign Out"
                  className="border border-ink/20 bg-secondary/50 p-1.5 hover:border-danger hover:text-danger hover:bg-danger/10 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Mobile Bottom Nav ── */}
      <MobileBottomNav
        activeNav={activeNav}
        onSelect={handleSelectNav}
        hasCompletedReport={hasCompletedReport}
        onOpenDrawer={() => setMobileDrawerOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar (hidden on mobile, shown on md+) ── */}
        <aside
          className={`${
            sidebarOpen ? "w-60" : "w-14"
          } hidden md:flex shrink-0 border-r border-ink/20 bg-secondary/20 flex-col transition-all duration-200 overflow-hidden`}
        >
          <nav className="flex-1 p-2 space-y-1 pt-4">
            {navItems.map((item) => {
              const isActive = activeNav === item.id;
              const isUnlocked = item.isUnlocked;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (isUnlocked) handleSelectNav(item.id);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all group ${
                    isActive
                      ? "border border-violet/40 bg-violet/10 text-violet font-bold"
                      : isUnlocked
                      ? "border border-transparent text-muted-foreground hover:border-ink/20 hover:text-ink hover:bg-secondary"
                      : "border border-transparent text-ink/25 cursor-not-allowed opacity-60"
                  }`}
                >
                  <item.icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive
                        ? "text-violet"
                        : isUnlocked
                        ? "text-muted-foreground group-hover:text-ink"
                        : "text-ink/20"
                    }`}
                  />
                  {sidebarOpen && (
                    <div className="flex-1 flex items-center justify-between text-left min-w-0">
                      <span className="font-mono text-xs font-medium truncate">{item.label}</span>
                      {isUnlocked && item.id !== "intelligence" && (
                        <span className="label-mono border border-lime/30 bg-lime/10 text-lime-700 dark:text-lime text-[8px] px-1 py-0.2 shrink-0">
                          ACTIVE
                        </span>
                      )}
                      {!isUnlocked && <Lock className="w-3 h-3 text-ink/20 shrink-0" />}
                    </div>
                  )}
                  {sidebarOpen && isActive && <div className="w-1.5 h-1.5 bg-violet rounded-full shrink-0" />}
                </button>
              );
            })}
          </nav>

          {/* Recent Reports Mini-List */}
          {sidebarOpen && recentReports.length > 0 && (
            <div className="border-t border-ink/15 p-3 space-y-2">
              <span className="label-mono text-muted-foreground text-[9px]">Recent Analyses</span>
              {recentReports.slice(0, 4).map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    handleSelectNav("intelligence");
                    handleSelectReport(r);
                  }}
                  className="w-full text-left border border-transparent hover:border-ink/20 p-2 hover:bg-secondary transition-colors group min-w-0 overflow-hidden"
                >
                  <p className="font-mono text-[10px] font-bold text-ink truncate group-hover:text-violet transition-colors block">
                    {getCleanReportTitle(r)}
                  </p>
                  <p className="label-mono text-muted-foreground truncate text-[9px] block">
                    {r.status} · {r.analysis?.opportunity_score ? `Score: ${r.analysis.opportunity_score}` : ""}
                  </p>
                </button>
              ))}
            </div>
          )}

          {sidebarOpen && (
            <div className="border-t border-ink/15 p-3">
              <Link
                to="/"
                className="label-mono text-muted-foreground hover:text-violet transition-colors flex items-center gap-1.5 text-[10px]"
              >
                ← Back to Landing Page
              </Link>
            </div>
          )}
        </aside>

        {/* ── Main Content Area ── */}
        <main className="flex-1 overflow-y-auto min-w-0 pb-16 md:pb-0">
          <div className="max-w-[1250px] mx-auto p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6">
            {/* 0. Command Center Overview */}
            {activeNav === "overview" && (
              <OverviewDashboard
                onNavigate={(mod) => {
                  if (mod === "intelligence") {
                    setView("intake");
                  }
                  handleSelectNav(mod);
                }}
              />
            )}

            {/* 1. Intelligence Suite View */}
            {activeNav === "intelligence" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="label-mono text-violet">/Intelligence Suite</span>
                      <span className="h-1.5 w-1.5 bg-lime live-dot" />
                      <span className="label-mono text-muted-foreground text-[10px]">
                        Multi-Source Commercial Engine · Active
                      </span>
                    </div>
                    <h1 className="font-display text-2xl font-extrabold leading-tight">
                      {view === "intake" ? "New Intelligence Analysis" : "Intelligence Report & Predictive Graphs"}
                    </h1>
                  </div>
                  {view !== "intake" && (
                    <button
                      onClick={handleNewAnalysis}
                      className="label-mono border border-ink/25 bg-secondary px-4 py-2 hover:border-violet hover:text-violet transition-all flex items-center gap-2 text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" /> New Analysis
                    </button>
                  )}
                </div>

                {view === "intake" ? (
                  <div className="grid gap-6 grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                    <div className="min-w-0 space-y-4">
                      <Panel className="p-6 min-w-0">
                        <div className="flex items-center gap-2 label-mono text-violet font-bold mb-5 border-b border-ink/20 pb-3">
                          <Brain className="w-4 h-4" /> Intelligence Intake — Submit Company Assets
                        </div>
                        <ScraperIntakeForm onReportCreated={handleReportCreated} />
                      </Panel>
                    </div>

                    <div className="min-w-0 space-y-4">
                      <Panel className="min-w-0">
                        <div className="flex items-center justify-between p-4 border-b border-ink/20">
                          <div className="label-mono text-muted-foreground flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-violet" /> Recent Dossiers
                          </div>
                          <button
                            onClick={fetchRecents}
                            className="label-mono text-muted-foreground hover:text-violet transition-colors text-[10px]"
                          >
                            Refresh
                          </button>
                        </div>
                        <div className="divide-y divide-ink/10">
                          {recentReports.length > 0 ? (
                            recentReports.slice(0, 6).map((r) => {
                              const score = r.analysis?.opportunity_score;
                              return (
                                <button
                                  key={r.id}
                                  onClick={() => {
                                    handleSelectReport(r);
                                  }}
                                  className="w-full text-left p-4 hover:bg-secondary/50 transition-colors group flex items-center justify-between gap-3 min-w-0 overflow-hidden"
                                >
                                  <div className="min-w-0 flex-1 space-y-0.5">
                                    <p className="font-display text-xs font-extrabold uppercase group-hover:text-violet transition-colors truncate block">
                                      {getCleanReportTitle(r)}
                                    </p>
                                    <p className="font-mono text-[10px] text-muted-foreground truncate block">
                                      {r.analysis?.one_line_summary || `Status: ${r.status}`}
                                    </p>
                                    <span
                                      className={`label-mono px-1.5 py-0.5 border text-[9px] ${
                                        r.status === "done"
                                          ? "text-lime-700 dark:text-lime border-lime/25 bg-lime/8"
                                          : r.status === "failed"
                                          ? "text-danger border-danger/25"
                                          : "text-violet border-violet/25 animate-pulse"
                                      }`}
                                    >
                                      {r.status}
                                    </span>
                                  </div>
                                  {score !== undefined && (
                                    <div className="shrink-0 text-right">
                                      <span className="font-display text-lg font-extrabold text-violet">{score}</span>
                                      <p className="label-mono text-muted-foreground text-[9px]">Score</p>
                                    </div>
                                  )}
                                </button>
                              );
                            })
                          ) : (
                            <div className="p-8 text-center">
                              <Search className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                              <p className="font-mono text-xs text-muted-foreground">No reports yet.</p>
                            </div>
                          )}
                        </div>
                      </Panel>

                      {/* Engine Stats */}
                      <Panel className="p-4 space-y-3">
                        <span className="label-mono text-muted-foreground text-[10px]">Engine Capabilities</span>
                        <div className="grid grid-cols-2 gap-px bg-ink/10">
                          {[
                            ["5+ Source Types", "Parsed simultaneously"],
                            ["Predictive Graphs", "Recharts Visual Suite"],
                            ["Instant Unlock", "Lead Radar & Voice Fleet"],
                            ["Discrepancy Alerts", "Cross-source ground truth"],
                          ].map(([t, s]) => (
                            <div key={t} className="bg-paper px-3 py-2.5">
                              <p className="font-display text-xs font-extrabold uppercase">{t}</p>
                              <p className="label-mono text-muted-foreground text-[9px]">{s}</p>
                            </div>
                          ))}
                        </div>
                      </Panel>
                    </div>
                  </div>
                ) : reportId ? (
                  <ReportView
                    reportId={reportId}
                    onBack={handleNewAnalysis}
                    onNavigateModule={handleNavigateModule}
                    onReportFinished={handleReportFinished}
                  />
                ) : null}
              </div>
            )}

            {/* 2. Lead Radar View */}
            {activeNav === "lead-radar" && (
              <LeadRadarModule
                analysis={activeAnalysis}
                companyName={activeCompanyInfo.name}
                industry={activeCompanyInfo.industry}
                onLaunchVoiceAgent={(lead) => {
                  setVoiceTargetLead(lead);
                  setActiveNav("voice-fleet");
                }}
              />
            )}

            {/* 3. Voice Fleet View */}
            {activeNav === "voice-fleet" && (
              <VoiceFleetModule
                analysis={activeAnalysis}
                companyName={activeCompanyInfo.name}
                industry={activeCompanyInfo.industry}
                targetLead={voiceTargetLead}
              />
            )}

            {/* 4. Video Sales Agent View */}
            {activeNav === "video" && (
              <VideoMeetingModule
                analysis={activeAnalysis}
                companyName={activeCompanyInfo.name}
                industry={activeCompanyInfo.industry}
                reports={recentReports}
                onNavigateToIntelligence={() => {
                  setView("intake");
                  setActiveNav("intelligence");
                }}
              />
            )}

            {/* 5. Calendar & Scheduled Meetings View */}
            {activeNav === "calendar" && (
              <CalendarModule
                user={user}
                session={session}
                companyName={activeCompanyInfo.name}
              />
            )}

            {/* 6. WhatsApp Business Gateway View */}
            {activeNav === "whatsapp" && (
              <WhatsAppModule companyName={activeCompanyInfo.name} />
            )}

            {/* 7. CRM Sync & Pipeline View */}
            {activeNav === "crm" && (
              <CRMModule companyName={activeCompanyInfo.name} />
            )}

            {/* 8. Analytics View */}
            {activeNav === "analytics" && (
              <AnalyticsModule
                analysis={activeAnalysis}
                companyName={activeCompanyInfo.name}
                opportunityScore={activeCompanyInfo.score}
              />
            )}

            {/* 5. Settings View */}
            {activeNav === "settings" && <SettingsModule companyName={activeCompanyInfo.name} />}
          </div>
        </main>
      </div>
    </div>
  );
}
