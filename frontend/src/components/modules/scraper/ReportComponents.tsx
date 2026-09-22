import React, { useState } from "react";
import {
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Globe,
  Quote,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  DollarSign,
  HelpCircle,
  FileCheck2,
  ShieldAlert,
  AlertCircle,
  Lightbulb,
  CheckCircle,
} from "lucide-react";

/* ─────────────────────────────────────────────────
   TYPES  (identical to original scraper logic)
───────────────────────────────────────────────── */
export interface ExtractedMetric {
  metric: string;
  value: string;
  trend?: "up" | "down" | "neutral" | "unknown";
  context?: string;
}

export interface DocumentInsight {
  source_name: string;
  source_type: "website" | "pdf" | "spreadsheet" | "image" | "text_doc" | "user_note" | string;
  document_purpose: string;
  key_findings: string[];
  extracted_metrics?: ExtractedMetric[];
  strengths_identified?: string[];
  risks_or_red_flags?: string[];
  verifiable_quotes?: string[];
}

export interface DiscrepancyAlert {
  issue: string;
  source_a: string;
  claim_a: string;
  source_b: string;
  claim_b: string;
  severity: "high" | "medium" | "low" | string;
  strategic_advice: string;
}

export interface FinancialHighlight {
  metric_name: string;
  value: string;
  trend?: "up" | "down" | "neutral" | "unknown" | string;
  benchmark_comparison?: string;
  source_reference?: string;
}

export interface ForecastTrend {
  period: string;
  baseline_index: number;
  optimized_index: number;
  key_driver: string;
}

export interface FunnelStage {
  stage: string;
  current_health: "optimal" | "underperforming" | "bottleneck" | "unknown" | string;
  observation: string;
  benchmark_advice: string;
}

export interface SWOTAnalysis {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

/* ─────────────────────────────────────────────────
   SHARED HELPERS
───────────────────────────────────────────────── */
function BrutPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`border border-ink bg-card ${className}`}>{children}</div>;
}

function PHead({ title, subtitle, badge }: { title: string; subtitle?: string; badge?: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-ink/20 p-5">
      <div>
        <h3 className="font-display text-sm font-extrabold uppercase">{title}</h3>
        {subtitle && <p className="font-mono text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {badge && <span className="label-mono border border-ink/20 bg-secondary px-2.5 py-0.5 shrink-0">{badge}</span>}
    </div>
  );
}

/* ─────────────────────────────────────────────────
   DOCUMENT INSIGHT PANEL  (original logic preserved)
───────────────────────────────────────────────── */
export function DocumentInsightPanel({ insights }: { insights: DocumentInsight[] }) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  if (!insights || insights.length === 0) {
    return (
      <BrutPanel className="p-6 text-center">
        <Layers className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="font-mono text-sm text-muted-foreground">No individual document insights extracted.</p>
      </BrutPanel>
    );
  }

  if (!insights || !insights.length) return null;
  const active = insights[selectedIdx] ?? insights[0]!;
  if (!active) return null;

  const getIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "pdf": return <FileText className="w-4 h-4 text-danger" />;
      case "spreadsheet": return <FileSpreadsheet className="w-4 h-4 text-lime-700 dark:text-lime" />;
      case "image": return <ImageIcon className="w-4 h-4 text-violet" />;
      case "website": return <Globe className="w-4 h-4 text-violet" />;
      default: return <FileText className="w-4 h-4 text-amber-500" />;
    }
  };

  const getTrendIcon = (trend?: string) => {
    if (trend === "up") return <TrendingUp className="w-3.5 h-3.5 text-lime-700 dark:text-lime" />;
    if (trend === "down") return <TrendingDown className="w-3.5 h-3.5 text-danger" />;
    return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  return (
    <BrutPanel>
      <PHead
        title="Multi-Source Intelligence Hub"
        subtitle="Isolated, per-document deep-dive and ground-truth verification"
        badge={`${insights.length} Source${insights.length > 1 ? "s" : ""} Analyzed`}
      />

      {/* Source Tabs */}
      <div className="flex overflow-x-auto border-b border-ink/15 bg-secondary/20 p-2 gap-2">
        {insights.map((doc, idx) => (
          <button
            key={`${doc.source_name}-${idx}`}
            onClick={() => setSelectedIdx(idx)}
            className={`flex items-center gap-2 px-3 py-2 font-mono text-xs font-medium transition-all shrink-0 border ${
              idx === selectedIdx
                ? "border-violet/40 bg-violet/10 text-violet"
                : "border-transparent text-muted-foreground hover:text-ink hover:bg-secondary"
            }`}
          >
            {getIcon(doc.source_type)}
            <span className="truncate max-w-[140px]">{doc.source_name}</span>
          </button>
        ))}
      </div>

      <div className="p-6 space-y-6">
        {/* Doc meta */}
        <div className="border border-ink/20 bg-secondary/30 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="label-mono text-violet block mb-1">Source Target · {active.source_type}</span>
            <h4 className="font-display text-lg font-extrabold uppercase">{active.source_name}</h4>
          </div>
          <div className="text-left md:text-right">
            <span className="label-mono text-muted-foreground block">Document Purpose</span>
            <span className="label-mono border border-ink/20 bg-paper px-2.5 py-0.5 inline-block mt-1">
              {active.document_purpose || "Business Intelligence Asset"}
            </span>
          </div>
        </div>

        {/* Key Findings + Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h5 className="label-mono text-muted-foreground flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-violet" /> Key Findings
            </h5>
            {active.key_findings?.length ? (
              active.key_findings.map((f, i) => (
                <div key={i} className="border border-ink/15 bg-secondary/30 p-3 font-mono text-xs text-muted-foreground flex items-start gap-2 leading-relaxed">
                  <span className="w-1.5 h-1.5 bg-violet mt-1.5 shrink-0" />
                  {f}
                </div>
              ))
            ) : (
              <p className="font-mono text-xs text-muted-foreground italic">No bullet findings noted.</p>
            )}
          </div>

          <div className="space-y-3">
            <h5 className="label-mono text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-lime-700 dark:text-lime" /> Extracted Metrics
            </h5>
            {active.extracted_metrics?.length ? (
              <div className="border border-ink/20 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-secondary label-mono text-muted-foreground border-b border-ink/15">
                    <tr>
                      <th className="p-2.5">Metric</th>
                      <th className="p-2.5">Value</th>
                      <th className="p-2.5">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {active.extracted_metrics.map((m, i) => (
                      <tr key={i} className="hover:bg-secondary/30 transition-colors">
                        <td className="p-2.5 font-mono text-ink">{m.metric}</td>
                        <td className="p-2.5 font-display font-bold text-lime-700 dark:text-lime">{m.value}</td>
                        <td className="p-2.5 flex items-center gap-1.5 text-muted-foreground">
                          {getTrendIcon(m.trend)}
                          <span className="truncate max-w-[120px]">{m.context || "Direct quote"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="border border-ink/15 p-4 font-mono text-xs text-muted-foreground text-center">
                No quantitative KPIs detected in this source.
              </div>
            )}
          </div>
        </div>

        {/* Strengths vs Risks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-lime/20 bg-lime/5 p-4 space-y-2">
            <h6 className="label-mono text-lime-700 dark:text-lime flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Strengths in Source
            </h6>
            <ul className="font-mono text-xs text-muted-foreground space-y-1">
              {active.strengths_identified?.length
                ? active.strengths_identified.map((s, i) => <li key={i} className="flex gap-2"><span className="text-lime-700 dark:text-lime">•</span>{s}</li>)
                : <li className="italic">None highlighted.</li>}
            </ul>
          </div>
          <div className="border border-danger/20 bg-danger/5 p-4 space-y-2">
            <h6 className="label-mono text-danger flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Risks & Gaps
            </h6>
            <ul className="font-mono text-xs text-muted-foreground space-y-1">
              {active.risks_or_red_flags?.length
                ? active.risks_or_red_flags.map((r, i) => <li key={i} className="flex gap-2"><span className="text-danger">•</span>{r}</li>)
                : <li className="italic">No critical risks flagged.</li>}
            </ul>
          </div>
        </div>

        {/* Verifiable Quotes */}
        {active.verifiable_quotes?.length ? (
          <div className="space-y-2">
            <h5 className="label-mono text-muted-foreground flex items-center gap-2">
              <Quote className="w-3.5 h-3.5 text-violet" /> Grounded Evidence & Citations
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {active.verifiable_quotes.map((q, i) => (
                <div key={i} className="border border-ink/15 bg-secondary/20 p-3 font-mono text-xs italic text-muted-foreground relative pl-7">
                  <Quote className="w-3.5 h-3.5 text-ink/20 absolute left-2.5 top-3" />"{q}"
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </BrutPanel>
  );
}

/* ─────────────────────────────────────────────────
   DISCREPANCY ALERTS  (original logic preserved)
───────────────────────────────────────────────── */
export function DiscrepancyAlerts({ alerts }: { alerts: DiscrepancyAlert[] }) {
  if (!alerts || alerts.length === 0) {
    return (
      <BrutPanel className="p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="border border-lime/30 bg-lime/10 p-2">
            <CheckCircle className="w-5 h-5 text-lime-700 dark:text-lime" />
          </div>
          <div>
            <h4 className="font-display text-sm font-extrabold uppercase">Cross-Source Consistency Verified</h4>
            <p className="font-mono text-xs text-muted-foreground">No material contradictions detected across sources.</p>
          </div>
        </div>
        <span className="label-mono border border-lime/30 bg-lime/10 text-lime-700 dark:text-lime px-2.5 py-0.5 shrink-0">Consistent 100%</span>
      </BrutPanel>
    );
  }

  const getSeverityStyle = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "high": return "label-mono border border-danger/40 bg-danger/10 text-danger px-2.5 py-0.5 flex items-center gap-1";
      case "medium": return "label-mono border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-0.5";
      default: return "label-mono border border-violet/30 bg-violet/10 text-violet px-2.5 py-0.5";
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "high": return <><span className="w-1.5 h-1.5 bg-danger rounded-full live-dot" />High Severity</>;
      case "medium": return <>Medium Discrepancy</>;
      default: return <>Minor Variation</>;
    }
  };

  return (
    <BrutPanel>
      <PHead
        title="Cross-Source Discrepancy & Conflict Alerts"
        subtitle="Identified inconsistencies between internal files and public-facing claims"
        badge={`${alerts.length} Inconsistenc${alerts.length > 1 ? "ies" : "y"} Flagged`}
      />
      <div className="p-6 space-y-4">
        {alerts.map((alert, idx) => (
          <div key={idx} className="border border-ink/20 bg-secondary/20 p-5 space-y-4 hover:border-ink/40 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <h4 className="font-display text-sm font-extrabold uppercase flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />{alert.issue}
              </h4>
              <span className={getSeverityStyle(alert.severity)}>{getSeverityLabel(alert.severity)}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border border-violet/20 bg-violet/5 p-3.5 space-y-1.5">
                <span className="label-mono text-violet flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-violet" />Source A: {alert.source_a}
                </span>
                <p className="font-mono text-xs text-ink leading-relaxed">"{alert.claim_a}"</p>
              </div>
              <div className="border border-danger/20 bg-danger/5 p-3.5 space-y-1.5">
                <span className="label-mono text-danger flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-danger" />Source B: {alert.source_b}
                </span>
                <p className="font-mono text-xs text-ink leading-relaxed">"{alert.claim_b}"</p>
              </div>
            </div>
            {alert.strategic_advice && (
              <div className="border border-violet/20 bg-violet/5 p-3 flex items-start gap-2.5 font-mono text-xs">
                <Lightbulb className="w-4 h-4 text-violet shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-violet">Strategic Resolution: </span>
                  <span className="text-muted-foreground">{alert.strategic_advice}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </BrutPanel>
  );
}

/* ─────────────────────────────────────────────────
   FINANCIAL HIGHLIGHTS  (original logic preserved)
───────────────────────────────────────────────── */
export function FinancialHighlights({ financials }: { financials: FinancialHighlight[] }) {
  if (!financials || financials.length === 0) {
    return (
      <BrutPanel className="p-6 text-center">
        <DollarSign className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="font-mono text-sm text-muted-foreground">No financial figures disclosed in analyzed sources.</p>
      </BrutPanel>
    );
  }

  const getTrendPill = (trend?: string) => {
    switch (trend?.toLowerCase()) {
      case "up": return <span className="label-mono border border-lime/30 bg-lime/10 text-lime-700 dark:text-lime px-2 py-0.5 flex items-center gap-1"><TrendingUp className="w-3 h-3" />Growing</span>;
      case "down": return <span className="label-mono border border-danger/30 bg-danger/10 text-danger px-2 py-0.5 flex items-center gap-1"><TrendingDown className="w-3 h-3" />Declining</span>;
      case "neutral": return <span className="label-mono border border-ink/20 bg-secondary text-muted-foreground px-2 py-0.5 flex items-center gap-1"><Minus className="w-3 h-3" />Stable</span>;
      default: return <span className="label-mono border border-ink/20 bg-secondary text-muted-foreground px-2 py-0.5 flex items-center gap-1"><HelpCircle className="w-3 h-3" />Stated</span>;
    }
  };

  return (
    <BrutPanel>
      <PHead
        title="Financial Highlights & Unit Economics"
        subtitle="Grounded metrics extracted directly from attached sheets and pitch decks"
        badge={`${financials.length} Metrics`}
      />
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {financials.map((item, idx) => (
          <div key={idx} className="border border-ink/20 bg-secondary/30 p-4 space-y-3 hover:border-ink/40 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <span className="label-mono text-muted-foreground">{item.metric_name}</span>
              {getTrendPill(item.trend)}
            </div>
            <div>
              <div className="font-display text-2xl font-extrabold tabular-nums">{item.value}</div>
              {item.benchmark_comparison && (
                <p className="font-mono text-xs text-muted-foreground mt-1 leading-relaxed">{item.benchmark_comparison}</p>
              )}
            </div>
            {item.source_reference && (
              <div className="border-t border-ink/10 pt-2 flex items-center gap-1.5 label-mono text-violet">
                <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Source: {item.source_reference}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </BrutPanel>
  );
}
