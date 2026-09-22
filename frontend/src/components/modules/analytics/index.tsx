import React from "react";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Zap,
  Target,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Activity,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

interface AnalyticsModuleProps {
  analysis?: any;
  companyName?: string;
  opportunityScore?: number;
}

export function AnalyticsModule({
  analysis,
  companyName = "",
  opportunityScore,
}: AnalyticsModuleProps) {
  const effectiveCompanyName = analysis?.company_name || companyName;
  const effectiveScore = analysis?.opportunity_score ?? opportunityScore ?? 0;

  if (!analysis) {
    return (
      <div className="space-y-6">
        <div className="border border-ink/20 bg-secondary/30 p-6">
          <span className="label-mono text-violet font-bold">// Commercial Analytics</span>
          <h2 className="font-display text-2xl font-extrabold uppercase">
            Sales & Intelligence Analytics Console
          </h2>
          <p className="font-mono text-xs text-muted-foreground">
            Run an intelligence analysis in the <strong>Intelligence Suite</strong> to view real-time synthesized pipeline metrics.
          </p>
        </div>

        <div className="border border-ink/20 bg-paper p-12 text-center space-y-4">
          <div className="border border-ink/20 bg-secondary p-4 inline-flex mx-auto">
            <BarChart3 className="w-8 h-8 text-violet" />
          </div>
          <h3 className="font-display text-lg font-bold uppercase">No Real-Time Telemetry Available</h3>
          <p className="font-mono text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            All graphs and analytics are strictly computed in real-time from the Groq LLM synthesis of your company assets.
          </p>
        </div>
      </div>
    );
  }

  // Real growth forecast strictly from Groq analysis
  const rawForecast = analysis.growth_forecast || [];
  const growthForecastData = rawForecast.map((t: any) => ({
    period: t.period,
    optimizedIndex: t.optimized_index,
    baselineIndex: t.baseline_index,
    driver: t.key_driver,
  }));

  // Real marketing channels strictly from Groq analysis
  const rawChannels = analysis.current_marketing_channels || [];
  const channelData = rawChannels.map((c: any) => {
    const channelObj = typeof c === "string" ? { channel: c, strength: "moderate" } : c;
    const str = (channelObj.strength || "").toLowerCase();
    const score = str.includes("strong") || str.includes("high") ? 90 : str.includes("mod") ? 60 : 35;
    return {
      channel: channelObj.channel,
      strengthScore: score,
      strengthLabel: channelObj.strength || "Stated",
    };
  });

  // Real conversion funnel stages strictly from Groq analysis
  const rawFunnel = analysis.conversion_funnel || [];
  const funnelData = rawFunnel.map((s: any) => ({
    stage: s.stage,
    efficiency: s.current_health === "optimal" ? 95 : s.current_health === "underperforming" ? 55 : 30,
    health: s.current_health,
    observation: s.observation,
  }));

  // Financial highlights
  const financials = analysis.financial_highlights || [];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="border border-ink/20 bg-secondary/30 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="label-mono text-lime-700 dark:text-lime font-bold">
              [LIVE REAL-TIME LLM TELEMETRY]
            </span>
            <div className="h-2 w-2 rounded-full bg-lime animate-ping" />
          </div>
          <h2 className="font-display text-2xl font-extrabold uppercase">
            Sales & Intelligence Analytics Console
          </h2>
          <p className="font-mono text-xs text-muted-foreground">
            Synthesized commercial performance metrics for <span className="text-ink font-bold">{effectiveCompanyName}</span>.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="border border-ink/20 bg-paper px-4 py-2 text-center">
            <span className="label-mono text-muted-foreground block text-[9px]">Opportunity Score</span>
            <span className="font-display text-lg font-black text-violet">{effectiveScore}/100</span>
          </div>
          {analysis.confidence_score && (
            <div className="border border-ink/20 bg-paper px-4 py-2 text-center">
              <span className="label-mono text-muted-foreground block text-[9px]">LLM Confidence</span>
              <span className="font-display text-lg font-black text-lime-700 dark:text-lime">
                {analysis.confidence_score}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Real Financial Highlights if present in Groq analysis */}
      {financials.length > 0 && (
        <div className="border border-ink/20 bg-paper p-5 space-y-3">
          <span className="label-mono text-violet font-bold text-xs flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" /> Extracted Financial Metrics from Ingested Assets
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {financials.map((f: any, i: number) => (
              <div key={i} className="border border-ink/15 bg-secondary/20 p-3 space-y-1">
                <span className="label-mono text-muted-foreground text-[10px] truncate block">{f.metric_name}</span>
                <div className="font-display text-lg font-black text-ink">{f.value}</div>
                {f.benchmark_comparison && (
                  <p className="font-mono text-[9px] text-muted-foreground">{f.benchmark_comparison}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real Growth Forecast Graph if present */}
      {growthForecastData.length > 0 && (
        <div className="border border-ink/20 bg-paper p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/15 pb-3">
            <div>
              <h3 className="font-display text-base font-extrabold uppercase flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-violet" /> Real-Time Synthesized Growth Forecast
              </h3>
              <p className="font-mono text-xs text-muted-foreground">
                Optimized vs Baseline index trajectory generated by Groq LLM.
              </p>
            </div>
          </div>

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={growthForecastData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVyaperi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#7C3AED" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorBase" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#111111" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#111111" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="period" stroke="#666" tick={{ fontFamily: "monospace", fontSize: 11 }} />
                <YAxis stroke="#666" tick={{ fontFamily: "monospace", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0d0d0d",
                    borderColor: "#7C3AED",
                    color: "#f5f5f0",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    borderRadius: 0,
                  }}
                />
                <Legend wrapperStyle={{ fontFamily: "monospace", fontSize: "11px" }} />
                <Area
                  type="monotone"
                  dataKey="optimizedIndex"
                  name="Optimized AI Trajectory (Index)"
                  stroke="#7C3AED"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorVyaperi)"
                />
                <Area
                  type="monotone"
                  dataKey="baselineIndex"
                  name="Baseline Index"
                  stroke="#666666"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  fillOpacity={1}
                  fill="url(#colorBase)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Real Channel Health Bar Chart if present */}
      {channelData.length > 0 && (
        <div className="border border-ink/20 bg-paper p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-ink/15 pb-3">
            <h3 className="font-display text-base font-extrabold uppercase flex items-center gap-2">
              <Activity className="w-4 h-4 text-lime-700 dark:text-lime" /> Identified Channel Efficiency
            </h3>
            <span className="label-mono text-muted-foreground text-[10px]">
              Extracted from Web & Documents
            </span>
          </div>

          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="channel" stroke="#666" tick={{ fontFamily: "monospace", fontSize: 10 }} />
                <YAxis stroke="#666" tick={{ fontFamily: "monospace", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0d0d0d",
                    borderColor: "#A3E635",
                    color: "#f5f5f0",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    borderRadius: 0,
                  }}
                  formatter={(val: any, name: any, item: any) => [
                    `${item.payload.strengthLabel}`,
                    item.payload.channel,
                  ]}
                />
                <Bar dataKey="strengthScore" name="Channel Relative Score" fill="#7C3AED" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
