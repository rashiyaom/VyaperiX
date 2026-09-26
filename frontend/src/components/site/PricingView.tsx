/**
 * PricingView.tsx — Transparent Compute & Platform Model Tiers for Vyaperi X.
 *
 * Features:
 * - 4 Interactive Tiers: Free, Mini, Max, and Gujarati 🕶️ (Boss Mode).
 * - Dynamic Telemetry Status Ticker that updates on tap.
 * - Comprehensive Model Fleet Matrix showing models used across all website features.
 * - Accurate Unit Cost Telemetry: Cost per call, video minute, research dossier, and total.
 * - Interactive Volume & ROI Estimator.
 * - Consistent Neo-Brutalist / Cyber-Industrial Aesthetic (Lime, Violet, Ink, Paper).
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Check,
  Sparkles,
  Zap,
  Flame,
  ShieldCheck,
  Cpu,
  PhoneCall,
  Video,
  Globe,
  Radio,
  ArrowUpRight,
  Sliders,
  HelpCircle,
  Brain,
  MessageSquare,
  FileText,
  BarChart3,
  TrendingUp,
} from "lucide-react";

export type PricingTierId = "free" | "mini" | "max" | "gujarati";

interface ModelFeature {
  module: string;
  icon: any;
  freeModel: string;
  miniModel: string;
  maxModel: string;
  gujaratiModel: string;
  description: string;
}

const MODEL_MATRIX: ModelFeature[] = [
  {
    module: "Commercial Brain & LLM",
    icon: Brain,
    freeModel: "openai/gpt-oss-20b (Groq Free Tier)",
    miniModel: "openai/gpt-oss-120b (Deep Reasoning)",
    maxModel: "gpt-oss-120b + DeepSeek R1 Hybrid",
    gujaratiModel: "gpt-oss-120b + DeepSeek R1 + Claude 3.5 Sonnet Ensemble",
    description: "Powers customer segmentation, SWOT analysis, and objection playbooks.",
  },
  {
    module: "Voice SDR Engine (Calling)",
    icon: PhoneCall,
    freeModel: "Web Speech Native Synthesizer (Local Browser)",
    miniModel: "Sarvam AI Bulbul TTS + Groq Whisper STT",
    maxModel: "Sarvam Ultra-Low Latency Bulbul v2 (Dialect Aware)",
    gujaratiModel: "Sarvam Bulbul v2.5 + Native Kathiawari/Surati Voice Cloned Twin",
    description: "Autonomous phone conversations in Hindi, Gujarati, English, and regional dialects.",
  },
  {
    module: "Video Sales AE (Avatar)",
    icon: Video,
    freeModel: "Tavus Interactive Sandbox (720p Demo Twin)",
    miniModel: "Tavus Replica v2 (1080p Standard Twin)",
    maxModel: "Tavus Phoenix-3 Real-Time Conversational Human",
    gujaratiModel: "Tavus Phoenix-3 Ultra 4K Real-Time Interactive Twin (Vernacular)",
    description: "Live 1-on-1 video product demonstrations with real-time facial sync.",
  },
  {
    module: "Regional Geo-Radar & News",
    icon: Radio,
    freeModel: "Google News RSS + Open-Meteo (Deterministic Heuristic)",
    miniModel: "Groq Pan-India Curation (Cached 6h)",
    maxModel: "Real-Time Groq AI Radar + Municipal Tender Correlation",
    gujaratiModel: "Live Pan-India Commercial Radar + GIDC/Industrial Cluster Dispatch",
    description: "Detects breaking regional events, infrastructure notices, and triggers outbound calls.",
  },
  {
    module: "Web Intelligence & Scraper",
    icon: Globe,
    freeModel: "Trafilatura Open-Source Web Parser",
    miniModel: "Headless Chromium Cluster + PDF Extraction",
    maxModel: "Multi-Source Radar (MCA Registry, Zauba, LinkedIn)",
    gujaratiModel: "Full-Spectrum Corporate Due Diligence Swarm + Supply Chain Maps",
    description: "Scrapes target prospect websites, financial docs, and product catalogs.",
  },
  {
    module: "WhatsApp Outbound Fleet",
    icon: MessageSquare,
    freeModel: "Local QR-Linked Web Session",
    miniModel: "Automated Follow-Up Queue + AI Objection Resolver",
    maxModel: "Official Meta Business Cloud API (High-Throughput)",
    gujaratiModel: "Autonomous Multi-Agent WhatsApp Closer with Instant UPI Payment Links",
    description: "Sends post-call summaries, meeting confirmations, and digital catalogs.",
  },
];

interface TierDetails {
  id: PricingTierId;
  name: string;
  tabLabel: string;
  badge: string;
  priceMonthly: string;
  priceSubtext: string;
  headline: string;
  systemMessage: {
    statusText: string;
    description: string;
    gujaratiQuote?: string;
  };
  unitCosts: {
    voiceCall: string;
    videoMinute: string;
    intelligenceReport: string;
    whatsappMsg: string;
    telephonyIncluded: string;
  };
  highlights: string[];
  ctaText: string;
  accentColor: "neutral" | "lime" | "violet" | "gold";
}

const TIERS: Record<PricingTierId, TierDetails> = {
  free: {
    id: "free",
    name: "Free Starter",
    tabLabel: "Free",
    badge: "100% Free Forever",
    priceMonthly: "₹0",
    priceSubtext: "Zero credit card or API keys required",
    headline: "Zero-Cost Sandbox for Curious Explorers",
    systemMessage: {
      statusText: "⚡ SYSTEM SWITCHED TO FREE TIER",
      description:
        "Running on open-weight and zero-cost local browser models. Perfect for testing scrapers, running regional radar, and exploring Vyaperi X without burning any credits.",
    },
    unitCosts: {
      voiceCall: "₹0.00 / call",
      videoMinute: "₹0.00 / min",
      intelligenceReport: "₹0.00 / report",
      whatsappMsg: "₹0.00 / msg",
      telephonyIncluded: "Browser Web Speech Only",
    },
    highlights: [
      "Open-weight LLM inference (openai/gpt-oss-20b)",
      "Web Speech native voice simulation in browser",
      "Interactive 720p Tavus Sandbox video avatar",
      "Unlimited Open-Meteo & Google News RSS geo-radar",
      "Trafilatura web scraper for basic domain audits",
      "Community support & self-serve documentation",
    ],
    ctaText: "Start with Free Sandbox",
    accentColor: "neutral",
  },
  mini: {
    id: "mini",
    name: "Mini Fleet Pro",
    tabLabel: "Mini",
    badge: "Most Popular for SMEs",
    priceMonthly: "₹2,499",
    priceSubtext: "+ taxes / month ($29 USD)",
    headline: "High-Efficiency Outbound for Regional Sales Teams",
    systemMessage: {
      statusText: "🚀 SYSTEM SWITCHED TO MINI TIER",
      description:
        "Powered by Groq's high-speed reasoning models and Sarvam AI telephony. Ideal for growing regional sales teams needing real telephone outbound at sub-rupee unit economics.",
    },
    unitCosts: {
      voiceCall: "₹0.85 / call (approx 2 min)",
      videoMinute: "₹2.50 / min",
      intelligenceReport: "₹0.50 / dossier",
      whatsappMsg: "₹0.35 / msg",
      telephonyIncluded: "₹1,000 calling credit included",
    },
    highlights: [
      "Deep commercial reasoning (openai/gpt-oss-120b)",
      "Sarvam AI Indic Bulbul TTS + Groq Whisper STT",
      "Real outbound phone calls with custom caller ID",
      "Tavus Replica v2 1080p customized digital AE",
      "Headless Chromium scraper with PDF & Excel analysis",
      "6-hour cached Pan-India Groq regional radar",
      "Up to 5 concurrent autonomous voice agents",
    ],
    ctaText: "Deploy Mini Fleet",
    accentColor: "lime",
  },
  max: {
    id: "max",
    name: "Max Autonomous Enterprise",
    tabLabel: "Max",
    badge: "Enterprise Grade",
    priceMonthly: "₹7,999",
    priceSubtext: "+ taxes / month ($95 USD)",
    headline: "End-to-End Autonomous Multi-Agent Revenue Engine",
    systemMessage: {
      statusText: "🔥 SYSTEM SWITCHED TO MAX TIER",
      description:
        "Unlocked deep multi-agent commercial synthesis, Tavus conversational video humans, and multi-channel WhatsApp outreach for serious mid-market enterprises.",
    },
    unitCosts: {
      voiceCall: "₹1.40 / call (ultra-low latency)",
      videoMinute: "₹4.80 / min",
      intelligenceReport: "₹1.20 / dossier",
      whatsappMsg: "₹0.40 / msg",
      telephonyIncluded: "₹4,000 calling credit included",
    },
    highlights: [
      "Hybrid LLM Swarm (gpt-oss-120b + DeepSeek R1)",
      "Sarvam Ultra-Low Latency Bulbul v2 with Emotion Cadence",
      "Tavus Phoenix-3 Real-Time Conversational Video Human",
      "Multi-source corporate radar (MCA Registry, Zauba, LinkedIn)",
      "50 concurrent outbound lines with auto SIP failover",
      "Official Meta Business Cloud WhatsApp integration",
      "Dedicated account onboarding & custom prompt tuning",
    ],
    ctaText: "Deploy Max Swarm",
    accentColor: "violet",
  },
  gujarati: {
    id: "gujarati",
    name: "વ્યાપારી Boss Mode 🕶️⚡",
    tabLabel: "Gujarati 🕶️",
    badge: "Maxed Out VIP Swarm 🕶️",
    priceMonthly: "₹14,999",
    priceSubtext: "+ taxes / month (All Maxed Out Models)",
    headline: "ધંધો વધારો, નફો બમણો કરો — પૂરેપૂરી AI સેના તમારા કમાન્ડ પર!",
    systemMessage: {
      statusText: "🕶️ વ્યાપારી BOSS MODE ACTIVATED 🚀",
      description:
        "બધા જ Maxed-Out AI મૉડેલ ફૂલ પાવર સાથે ઍક્ટિવ છે. કાઠિયાવાડી, સુરતી અને અમદાવાદી બોલીમાં દેશ-વિદેશના ગ્રાહકો સાથે સોદા કરો! ધંધામાં કોઈ બાંધછોડ નહીં!",
      gujaratiQuote:
        "\"જેનો વેપાર મોટો, એનો નફો બમણો! પૂરેપૂરી AI સેના હવે તમારા હાથમાં છે. ધંધામાં ક્યારેય પીછેહઠ નહીં!\" 🕶️⚡",
    },
    unitCosts: {
      voiceCall: "₹1.95 / call (with custom Voice Clone)",
      videoMinute: "₹6.00 / min (Ultra 4K Interactive Twin)",
      intelligenceReport: "₹1.80 / dossier",
      whatsappMsg: "₹0.45 / msg (Auto UPI Payment Link)",
      telephonyIncluded: "₹8,000 calling credit + VIP Engineer",
    },
    highlights: [
      "Ensemble LLM (gpt-oss-120b + DeepSeek R1 + Claude 3.5 Sonnet)",
      "Sarvam Bulbul v2.5 + Native Kathiawari/Surati Voice Cloned Twin",
      "Tavus Phoenix-3 Ultra 4K Real-Time Interactive Twin (Vernacular)",
      "100 concurrent outbound phone lines with instant retry",
      "Live Pan-India GIDC & Industrial Cluster dispatch radar",
      "WhatsApp Autonomous Closer with Instant UPI Payment Links",
      "Dedicated 24/7 VIP Account Engineer via Private WhatsApp Group",
    ],
    ctaText: "🕶️ ચાલુ કરો Boss Mode",
    accentColor: "gold",
  },
};

export function PricingView() {
  const [selectedTier, setSelectedTier] = useState<PricingTierId>("mini");
  const [callVolume, setCallVolume] = useState<number>(2000);
  const [avgDealValue, setAvgDealValue] = useState<number>(35000);

  const activeTier = TIERS[selectedTier];

  // Unit calculations
  const perCallRates: Record<PricingTierId, number> = {
    free: 0.0,
    mini: 0.85,
    max: 1.4,
    gujarati: 1.95,
  };
  const baseMonthlyFees: Record<PricingTierId, number> = {
    free: 0,
    mini: 2499,
    max: 7999,
    gujarati: 14999,
  };

  const callingCost = callVolume * perCallRates[selectedTier];
  const totalCost = baseMonthlyFees[selectedTier] + callingCost;
  // Estimated conversions (3.5% conservative B2B connect-to-deal rate)
  const estimatedDeals = Math.max(1, Math.round(callVolume * 0.035));
  const estimatedRevenue = estimatedDeals * avgDealValue;
  const estimatedNetProfit = estimatedRevenue - totalCost;
  const roiMultiple = totalCost > 0 ? (estimatedRevenue / totalCost).toFixed(1) : "Infinite";

  return (
    <div className="min-h-screen bg-paper text-ink transition-colors selection:bg-lime selection:text-neutral-950 pb-20">
      {/* ── Top Header & Hero ── */}
      <div className="relative border-b border-ink/20 bg-card/60 backdrop-blur-md pt-12 pb-14 sm:pt-16 sm:pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(212,245,60,0.06),transparent_50%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(139,92,246,0.08),transparent_50%)] pointer-events-none" />

        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-ink/20 bg-ink/5 dark:bg-white/5 font-mono text-[11px] font-bold uppercase tracking-wider text-violet">
            <Cpu className="w-3.5 h-3.5 text-violet animate-pulse" />
            <span>Compute & Platform Model Tiers</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold font-display tracking-tight text-ink uppercase">
            Honest, Real-Time Pricing For B2B Revenue Engines
          </h1>

          <p className="font-mono text-xs sm:text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Zero hidden markups. Tap each tier below to inspect every underlying AI model, accurate unit costs, and simulated ROI across your entire sales operations.
          </p>

          {/* ── 4 Dedicated Interactive Buttons (Free, Mini, Max, Gujarati 🕶️) ── */}
          <div className="pt-6 flex justify-center">
            <div className="inline-flex p-1.5 rounded-2xl border border-ink/20 bg-neutral-900/90 shadow-2xl backdrop-blur-xl gap-1.5 sm:gap-2 flex-wrap justify-center">
              {(["free", "mini", "max", "gujarati"] as PricingTierId[]).map((tierId) => {
                const isSelected = selectedTier === tierId;
                const tier = TIERS[tierId];

                let buttonStyles = "text-neutral-400 hover:text-white hover:bg-neutral-800/60";
                if (isSelected) {
                  if (tierId === "free") {
                    buttonStyles = "bg-neutral-800 text-white border border-neutral-600 shadow-md font-black";
                  } else if (tierId === "mini") {
                    buttonStyles = "bg-lime-400 text-neutral-950 font-black shadow-[0_0_20px_rgba(212,245,60,0.35)]";
                  } else if (tierId === "max") {
                    buttonStyles = "bg-violet-600 text-white font-black shadow-[0_0_20px_rgba(139,92,246,0.4)]";
                  } else if (tierId === "gujarati") {
                    buttonStyles = "bg-gradient-to-r from-amber-400 via-yellow-400 to-lime-400 text-neutral-950 font-black shadow-[0_0_25px_rgba(250,204,21,0.45)] border border-amber-300";
                  }
                }

                return (
                  <button
                    key={tierId}
                    type="button"
                    onClick={() => setSelectedTier(tierId)}
                    className={`px-4 sm:px-6 py-2.5 rounded-xl font-mono text-xs sm:text-sm transition-all duration-200 flex items-center gap-2 cursor-pointer ${buttonStyles}`}
                  >
                    {tierId === "free" && <Zap className="w-3.5 h-3.5" />}
                    {tierId === "mini" && <Sparkles className="w-3.5 h-3.5" />}
                    {tierId === "max" && <Flame className="w-3.5 h-3.5" />}
                    {tierId === "gujarati" && <span className="text-base leading-none">🕶️</span>}
                    <span>{tier.tabLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Active Switched Telemetry Readout & Banner ── */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 -mt-6 relative z-10">
        <div
          className={`p-4 sm:p-5 rounded-2xl border backdrop-blur-xl shadow-xl transition-all duration-300 ${
            selectedTier === "free"
              ? "bg-neutral-900/90 border-neutral-700 text-neutral-200"
              : selectedTier === "mini"
              ? "bg-neutral-950/95 border-lime-400/40 text-neutral-100 shadow-[0_0_25px_rgba(212,245,60,0.15)]"
              : selectedTier === "max"
              ? "bg-neutral-950/95 border-violet-500/40 text-neutral-100 shadow-[0_0_25px_rgba(139,92,246,0.18)]"
              : "bg-neutral-950/95 border-amber-400/50 text-neutral-100 shadow-[0_0_30px_rgba(250,204,21,0.2)]"
          }`}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full animate-ping ${
                    selectedTier === "free"
                      ? "bg-neutral-400"
                      : selectedTier === "mini"
                      ? "bg-lime-400"
                      : selectedTier === "max"
                      ? "bg-violet-400"
                      : "bg-amber-400"
                  }`}
                />
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-lime-400">
                  {activeTier.systemMessage.statusText}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-neutral-300">
                  {activeTier.badge}
                </span>
              </div>

              {activeTier.systemMessage.gujaratiQuote && (
                <div className="p-3 my-1 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-300 font-display font-bold text-sm sm:text-base leading-relaxed tracking-wide">
                  {activeTier.systemMessage.gujaratiQuote}
                </div>
              )}

              <p className="font-sans text-xs sm:text-sm text-neutral-300 leading-relaxed">
                {activeTier.systemMessage.description}
              </p>
            </div>

            <div className="shrink-0 text-left sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10 w-full sm:w-auto">
              <div className="font-display font-extrabold text-2xl sm:text-3xl text-white">
                {activeTier.priceMonthly}
              </div>
              <div className="font-mono text-[10px] text-neutral-400">
                {activeTier.priceSubtext}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Layout: Current Tier Deep Dive + Unit Telemetry ── */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 mt-10 space-y-10">
        {/* 1. Unit Cost Telemetry Breakdown */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-violet" />
              <h2 className="font-display text-lg font-bold text-ink uppercase">
                Accurate Unit Cost Telemetry ({activeTier.name})
              </h2>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              Dynamic Rates for Active Tier
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 rounded-xl border border-ink/20 bg-card/60 backdrop-blur-sm space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[11px]">
                <PhoneCall className="w-3.5 h-3.5 text-lime" />
                <span>Voice Call</span>
              </div>
              <div className="font-mono text-base sm:text-lg font-bold text-ink">
                {activeTier.unitCosts.voiceCall}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">Per completed consult</div>
            </div>

            <div className="p-4 rounded-xl border border-ink/20 bg-card/60 backdrop-blur-sm space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[11px]">
                <Video className="w-3.5 h-3.5 text-violet" />
                <span>Video AE Meeting</span>
              </div>
              <div className="font-mono text-base sm:text-lg font-bold text-ink">
                {activeTier.unitCosts.videoMinute}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">Real-time stream</div>
            </div>

            <div className="p-4 rounded-xl border border-ink/20 bg-card/60 backdrop-blur-sm space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[11px]">
                <FileText className="w-3.5 h-3.5 text-cyan-500" />
                <span>Deep Research</span>
              </div>
              <div className="font-mono text-base sm:text-lg font-bold text-ink">
                {activeTier.unitCosts.intelligenceReport}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">Per full SWOT dossier</div>
            </div>

            <div className="p-4 rounded-xl border border-ink/20 bg-card/60 backdrop-blur-sm space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[11px]">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                <span>WhatsApp Outreach</span>
              </div>
              <div className="font-mono text-base sm:text-lg font-bold text-ink">
                {activeTier.unitCosts.whatsappMsg}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">Per enriched message</div>
            </div>
          </div>
        </div>

        {/* 2. Model Fleet Matrix (What Model Runs On Each Feature) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-violet" />
              <h2 className="font-display text-lg font-bold text-ink uppercase">
                Active Website Feature & AI Model Architecture
              </h2>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              Feature-by-Feature Model Deployment
            </span>
          </div>

          <div className="border border-ink/20 rounded-2xl overflow-hidden bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-ink/20 bg-neutral-900 text-neutral-200">
                    <th className="py-3 px-4 font-bold uppercase tracking-wider">Vyaperi X Module</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider">
                      Deployed AI Model for "{activeTier.tabLabel}"
                    </th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider hidden sm:table-cell">
                      Operational Function
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/15">
                  {MODEL_MATRIX.map((item, idx) => {
                    const Icon = item.icon;
                    let deployedModel = item.miniModel;
                    if (selectedTier === "free") deployedModel = item.freeModel;
                    else if (selectedTier === "max") deployedModel = item.maxModel;
                    else if (selectedTier === "gujarati") deployedModel = item.gujaratiModel;

                    return (
                      <tr key={idx} className="hover:bg-neutral-800/20 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-ink flex items-center gap-2">
                          <Icon className="w-4 h-4 text-violet shrink-0" />
                          <span className="font-display text-xs sm:text-sm font-bold">{item.module}</span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-lime-600 dark:text-lime-400">
                          {deployedModel}
                        </td>
                        <td className="py-3.5 px-4 text-muted-foreground hidden sm:table-cell">
                          {item.description}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 3. Interactive ROI & Volume Simulator */}
        <div className="p-6 sm:p-8 rounded-2xl border border-ink/20 bg-neutral-950 text-white shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
            <div>
              <div className="font-mono text-xs text-lime-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-lime-400" />
                Live Operational Expenditure & Revenue Calculator
              </div>
              <h3 className="font-display font-extrabold text-xl sm:text-2xl text-white mt-1">
                Simulate Your Monthly Fleet Cost & Returns
              </h3>
            </div>
            <div className="px-3 py-1 rounded-lg bg-lime-400/10 border border-lime-400/20 text-lime-400 font-mono text-xs font-bold">
              Active Tier: {activeTier.name}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Sliders */}
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-neutral-400">Target Monthly Outbound Calls:</span>
                  <span className="font-bold text-lime-400">{callVolume.toLocaleString()} calls</span>
                </div>
                <input
                  type="range"
                  min="200"
                  max="20000"
                  step="200"
                  value={callVolume}
                  onChange={(e) => setCallVolume(Number(e.target.value))}
                  className="w-full accent-lime-400 cursor-pointer h-2 bg-neutral-800 rounded-lg"
                />
                <div className="flex justify-between text-[10px] font-mono text-neutral-500">
                  <span>200 calls</span>
                  <span>5,000 calls</span>
                  <span>20,000 calls</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-neutral-400">Average Commercial Deal Value (₹):</span>
                  <span className="font-bold text-violet-400">₹{avgDealValue.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min="5000"
                  max="200000"
                  step="5000"
                  value={avgDealValue}
                  onChange={(e) => setAvgDealValue(Number(e.target.value))}
                  className="w-full accent-violet-500 cursor-pointer h-2 bg-neutral-800 rounded-lg"
                />
                <div className="flex justify-between text-[10px] font-mono text-neutral-500">
                  <span>₹5,000</span>
                  <span>₹1,00,000</span>
                  <span>₹2,00,000</span>
                </div>
              </div>
            </div>

            {/* Simulated Return Box */}
            <div className="p-5 rounded-xl bg-neutral-900/90 border border-neutral-800 space-y-4">
              <div className="grid grid-cols-2 gap-3 pb-3 border-b border-neutral-800 text-xs font-mono">
                <div>
                  <div className="text-neutral-400 text-[11px]">Total Operating Cost</div>
                  <div className="text-lg font-bold text-white mt-0.5">
                    ₹{Math.round(totalCost).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    Includes {activeTier.name} base
                  </div>
                </div>

                <div>
                  <div className="text-neutral-400 text-[11px]">Projected Conversions</div>
                  <div className="text-lg font-bold text-lime-400 mt-0.5">
                    {estimatedDeals} deals closed
                  </div>
                  <div className="text-[10px] text-neutral-500">~3.5% consultative win rate</div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-neutral-400">Projected Pipeline Revenue:</span>
                  <span className="font-bold text-emerald-400">₹{estimatedRevenue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-neutral-400">Net Operational Profit:</span>
                  <span className="font-bold text-white">₹{estimatedNetProfit.toLocaleString()}</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-lime-400/10 border border-lime-400/30 flex items-center justify-between font-mono text-xs">
                <span className="text-neutral-300 font-bold flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-lime-400" />
                  Estimated Fleet ROI:
                </span>
                <span className="text-lime-400 font-extrabold text-sm">
                  {roiMultiple}x Return
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Active Tier Highlights & Direct Launch Button */}
        <div className="p-6 sm:p-8 rounded-2xl border border-ink/20 bg-card shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-lime" />
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-bold">
                Included in {activeTier.name}
              </span>
            </div>
            <h3 className="font-display font-extrabold text-xl sm:text-2xl text-ink">
              {activeTier.headline}
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono text-muted-foreground pt-1">
              {activeTier.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-lime shrink-0 mt-0.5" />
                  <span className="text-ink">{h}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="w-full md:w-auto shrink-0 flex flex-col items-center gap-2">
            <Link
              to="/login"
              search={{ tab: "Signup" }}
              className={`w-full md:w-auto px-8 py-3.5 rounded-xl font-mono text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl transition-all active:scale-[0.98] ${
                selectedTier === "free"
                  ? "bg-ink text-paper hover:bg-neutral-800"
                  : selectedTier === "mini"
                  ? "bg-lime text-neutral-950 hover:bg-lime/90 font-black shadow-[0_0_20px_rgba(212,245,60,0.3)]"
                  : selectedTier === "max"
                  ? "bg-violet text-white hover:bg-violet/90 shadow-[0_0_20px_rgba(139,92,246,0.35)]"
                  : "bg-gradient-to-r from-amber-400 via-yellow-400 to-lime-400 text-neutral-950 font-black shadow-[0_0_25px_rgba(250,204,21,0.4)]"
              }`}
            >
              <span>{activeTier.ctaText}</span>
              <ArrowUpRight className="w-4 h-4" />
            </Link>
            <span className="text-[10px] font-mono text-muted-foreground">
              Instant workspace activation · Cancel anytime
            </span>
          </div>
        </div>

        {/* 5. Frequently Asked Questions */}
        <div className="space-y-4 pt-6 border-t border-ink/15">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-violet" />
            <h2 className="font-display text-lg font-bold text-ink uppercase">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-4 rounded-xl border border-ink/15 bg-card/60 space-y-1.5">
              <div className="font-bold text-ink">Do I need my own Groq or Tavus API keys?</div>
              <p className="text-muted-foreground leading-relaxed">
                No. Vyaperi X manages all enterprise API quotas, rate-limiting queues, and model execution directly. You simply fund call credits as needed.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-ink/15 bg-card/60 space-y-1.5">
              <div className="font-bold text-ink">How accurate is the Gujarati dialect voice?</div>
              <p className="text-muted-foreground leading-relaxed">
                Tuned specifically for native Kathiawari, Surati, and Amdavadi trade cadences using Sarvam AI Indic Bulbul models, delivering genuine business conversations.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-ink/15 bg-card/60 space-y-1.5">
              <div className="font-bold text-ink">Can I test with the Free Tier before upgrading?</div>
              <p className="text-muted-foreground leading-relaxed">
                Yes! The Free Tier runs open-weight models in sandbox mode with zero API charges, allowing you to test lead scoring, scraping, and regional heatmaps freely.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-ink/15 bg-card/60 space-y-1.5">
              <div className="font-bold text-ink">Can I bring our own Twilio or Exotel SIP Trunk?</div>
              <p className="text-muted-foreground leading-relaxed">
                Yes. Max and Gujarati Boss Mode tiers support custom SIP interconnects and caller ID mapping for domestic and international regulatory compliance.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
