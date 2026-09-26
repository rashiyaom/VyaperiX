/**
 * RegionalRankingView.tsx — Pan-India Regional Event Intelligence & Priority Dispatch.
 *
 * Configures outbound regional targeting based on analyzed website or custom business search.
 * Features:
 * - NO hardcoded "Plumbing" fallback.
 * - Shows awaiting / intake guide until a website is analyzed or user enters their business.
 * - Continuous live dot-jumping map animation runs 24/7 across 15 Indian cities.
 * - Custom business search triggers live Pan-India ranking and AI SDR script generation.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Flame,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  PhoneCall,
  Volume2,
  VolumeX,
  ExternalLink,
  ChevronRight,
  CloudRain,
  Thermometer,
  Layers,
  ArrowRight,
  Brain,
} from "lucide-react";
import { toast } from "sonner";
import { RegionalHeatMap } from "./RegionalHeatMap";
import { apiFetch } from "@/lib/api";

export interface RegionData {
  id: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
  std_code?: string;
  lang?: string;
  lang_name?: string;
  greeting?: string;
  urgency_score: number;
  priority: "CRITICAL" | "HIGH" | "MODERATE" | "STABLE";
  priority_label: string;
  priority_badge: string;
  ranking_reason?: string;
  commercial_driver?: string;
  hub_profile?: string;
  weather: {
    temperature: number;
    humidity: number;
    rain_mm: number;
    summary: string;
  };
  news: {
    headline: string;
    source: string;
    link?: string;
  };
  voice_hook: string;
  recommended_service?: string;
  target_offer?: string;
  lead_count: number;
  rank?: number;
}

interface RegionalRankingViewProps {
  initialIndustry?: string | undefined;
  userId?: string | undefined;
  onNavigateToVoiceFleet?: (() => void) | undefined;
  onNavigateToIntelligence?: (() => void) | undefined;
}

export function RegionalRankingView({
  initialIndustry = "",
  userId,
  onNavigateToVoiceFleet,
  onNavigateToIntelligence,
}: RegionalRankingViewProps) {
  // Only set industry if an actual business/website was analyzed or provided
  const [industry, setIndustry] = useState<string>(initialIndustry || "");
  const [searchInput, setSearchInput] = useState<string>(initialIndustry || "");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<{
    total_regions: number;
    hot_regions_count: number;
    elevated_regions_count: number;
    total_leads_available: number;
    top_hotspot: RegionData | null;
    regions: RegionData[];
    scanned_at: string;
  } | null>(null);

  const [selectedRegion, setSelectedRegion] = useState<RegionData | null>(null);
  const [filterPriority, setFilterPriority] = useState<"ALL" | "HOT" | "ELEVATED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  // Sync if initialIndustry changes (e.g. user analyzes a website in another tab)
  useEffect(() => {
    if (initialIndustry && initialIndustry.trim() && initialIndustry !== industry) {
      setIndustry(initialIndustry.trim());
      setSearchInput(initialIndustry.trim());
    }
  }, [initialIndustry]);

  // Fetch rankings from API only if an active industry is present
  const fetchRankings = useCallback(
    async (force = false, targetIndustry?: string) => {
      const activeQuery = (targetIndustry ?? industry).trim();
      if (!activeQuery) {
        setData(null);
        return;
      }

      if (force) setRefreshing(true);
      else setLoading(true);

      try {
        const queryParams = new URLSearchParams({
          industry: activeQuery,
          force_refresh: force ? "true" : "false",
        });
        if (userId) queryParams.set("user_id", userId);

        const res = await apiFetch(`/api/regional/rankings?${queryParams.toString()}`);
        if (res.ok) {
          const json = await res.json();
          if (json && json.data) {
            setData(json.data);
            if (json.data.regions && json.data.regions.length > 0) {
              setSelectedRegion((prev) => {
                if (!prev) return json.data.regions[0];
                const stillExists = json.data.regions.find((r: RegionData) => r.id === prev.id);
                return stillExists || json.data.regions[0];
              });
            }
            if (force) {
              toast.success("Pan-India Live Scan Complete!", {
                description: `Harvested breaking news and weather for "${activeQuery}" across ${json.data.total_regions} regions.`,
              });
            }
          }
        }
      } catch (err: any) {
        console.error("Failed to load regional rankings:", err);
        toast.error("Failed to retrieve live regional rankings", {
          description: err.message || "Please check backend connection.",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [industry, userId]
  );

  useEffect(() => {
    if (industry && industry.trim()) {
      fetchRankings(false);
    }
  }, [industry, fetchRankings]);

  // Handle submitting custom business search
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    setIndustry(searchInput.trim());
    fetchRankings(true, searchInput.trim());
  };

  // Audio Speech Preview of AI Voice SDR Call Opening
  const handleToggleVoicePreview = () => {
    if (!selectedRegion) return;

    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      return;
    }

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(selectedRegion.voice_hook);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const indianVoice = voices.find(
        (v) => v.lang.includes("en-IN") || v.name.includes("India") || v.lang.includes("hi-IN")
      );
      if (indianVoice) utterance.voice = indianVoice;

      utterance.onstart = () => setIsPlayingAudio(true);
      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = () => setIsPlayingAudio(false);

      window.speechSynthesis.speak(utterance);
    } else {
      toast.info("Browser speech synthesis not supported in this browser.");
    }
  };

  // Launch Regional Campaign Dispatch
  const handleLaunchCampaign = async () => {
    if (!selectedRegion) return;
    setDispatching(true);

    try {
      const res = await apiFetch("/api/regional/trigger-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region_id: selectedRegion.id,
          region_name: selectedRegion.city,
          industry: industry,
          lead_count: selectedRegion.lead_count,
          voice_hook: selectedRegion.voice_hook,
          recommended_service: selectedRegion.recommended_service,
          target_offer: selectedRegion.target_offer,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json && json.status === "success") {
          toast.success(`Voice Fleet Deployed to ${selectedRegion.city}!`, {
            description: `Dispatched campaign for ${selectedRegion.lead_count} high-intent leads using the ${selectedRegion.city} contextual script.`,
          });
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "Server returned " + res.status);
      }
    } catch (e: any) {
      toast.error("Campaign dispatch failed: " + (e.message || "Unknown error"));
    } finally {
      setDispatching(false);
    }
  };

  // Filtered regions
  const filteredRegions = (data?.regions || []).filter((reg) => {
    if (filterPriority === "HOT" && reg.urgency_score < 80) return false;
    if (filterPriority === "ELEVATED" && (reg.urgency_score < 60 || reg.urgency_score >= 80)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        reg.city.toLowerCase().includes(q) ||
        reg.state.toLowerCase().includes(q) ||
        reg.weather.summary.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const hasActiveAnalysis = Boolean(industry && industry.trim() && data?.regions?.length);

  return (
    <div className="space-y-6">
      {/* ── Top Hero Bar with Custom Business Search Input ── */}
      <div className="p-5 md:p-6 rounded-2xl bg-neutral-900/60 border border-ink/15 backdrop-blur-md shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-wider text-lime-400 font-bold flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-lime-400 animate-pulse" />
                Regional Intelligence & Outbound Dispatch
              </span>
              {hasActiveAnalysis && (
                <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-mono text-[10px] font-bold border border-red-500/30 flex items-center gap-1">
                  <Flame className="w-3 h-3 fill-red-400" />
                  {data?.hot_regions_count || 0} HOT ZONES
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white font-display">
              Pan-India Demand Ranking & Call Context Engine
            </h1>
            <p className="text-sm text-neutral-400 max-w-3xl leading-relaxed">
              Discovers breaking municipal events, civic notices, and environmental weather triggers tailored to your business across 15+ major Indian hubs.
            </p>
          </div>

          {hasActiveAnalysis && (
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => fetchRankings(true)}
                disabled={refreshing}
                className="px-4 py-2.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-800 text-neutral-200 border border-ink/20 text-xs font-mono flex items-center gap-2 transition-all hover:border-lime-400 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-lime-400" : ""}`} />
                <span>{refreshing ? "Scanning India..." : "Live Radar Rescan"}</span>
              </button>
            </div>
          )}
        </div>

        {/* ── Custom Business Search Bar (NO PRESET BUTTONS) ── */}
        <div className="pt-2 border-t border-ink/10">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-center gap-2.5">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-lime-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Enter your website domain or business category (e.g. Solar EPC, Ceramic Tiles, Commercial HVAC, Healthcare)..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-950 border border-ink/20 focus:border-lime-400 text-xs font-mono text-white placeholder:text-neutral-500 outline-none transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={refreshing || !searchInput.trim()}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-neutral-950 font-bold text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(212,245,60,0.25)] transition-all shrink-0 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-neutral-950" />
              <span>{refreshing ? "Scanning..." : "Scan Pan-India"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Active Business Query Pill if analyzed */}
          {industry && (
            <div className="mt-2.5 flex items-center gap-2 text-xs font-mono text-neutral-400">
              <Layers className="w-3.5 h-3.5 text-lime-400" />
              <span>Active Business Intelligence:</span>
              <span className="font-bold text-white bg-neutral-800/80 px-2.5 py-0.5 rounded border border-ink/20 text-lime-400">
                "{industry}"
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Main Layout: Map (Left) + Detail & Rankings (Right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive Bharat Signal Map (7 cols on large) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Signal Map with Location-to-Location Jumps & Greeting Bubbles (Always Live) */}
          <RegionalHeatMap
            regions={data?.regions || []}
            selectedRegionId={selectedRegion?.id || null}
            onSelectRegion={(reg) => setSelectedRegion(reg)}
            activeBusinessQuery={industry}
          />

          {/* Bottom Telemetry Metrics Bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-ink/15 backdrop-blur-sm">
              <div className="text-[11px] font-mono text-neutral-400 uppercase">Top Hotspot</div>
              <div className="text-base font-bold text-white flex items-center gap-1.5 mt-0.5">
                {data?.top_hotspot ? (
                  <>
                    <Flame className="w-4 h-4 text-red-500 fill-red-500 animate-pulse" />
                    {data.top_hotspot.city}
                    <span className="text-xs font-mono text-red-400">
                      ({data.top_hotspot.urgency_score}/100)
                    </span>
                  </>
                ) : (
                  <span className="text-xs font-mono text-neutral-400">Awaiting Search</span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-ink/15 backdrop-blur-sm">
              <div className="text-[11px] font-mono text-neutral-400 uppercase">Total Leads Matched</div>
              <div className="text-base font-bold text-lime-400 flex items-center gap-1.5 mt-0.5">
                <PhoneCall className="w-3.5 h-3.5 text-lime-400" />
                {data?.total_leads_available ?? 0}
                <span className="text-[11px] font-mono text-neutral-400 font-normal">Active Ready</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-ink/15 backdrop-blur-sm">
              <div className="text-[11px] font-mono text-neutral-400 uppercase">Sensing Layer</div>
              <div className="text-xs font-mono text-neutral-300 mt-1 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Live RSS + Open-Meteo
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Selected Region Deep Dive + Ranked Leaderboard (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {!hasActiveAnalysis ? (
            /* Awaiting Website Analysis / Search State */
            <div className="p-8 rounded-2xl bg-neutral-900/60 border border-ink/15 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center mx-auto text-lime-400">
                <Brain className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display font-extrabold text-lg text-white">
                  Awaiting Website Analysis or Custom Business Search
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed max-w-sm mx-auto">
                  No company website has been scraped or searched yet. Enter your business niche or website domain in the search bar above, or run an analysis in the Intelligence Suite to trigger hyper-local regional demand rankings and AI Voice SDR call hooks.
                </p>
              </div>

              {onNavigateToIntelligence && (
                <button
                  onClick={onNavigateToIntelligence}
                  className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-mono text-xs font-bold transition-all shadow-[0_0_15px_rgba(139,92,246,0.3)] inline-flex items-center gap-2"
                >
                  <Brain className="w-4 h-4" />
                  <span>Analyze Website in Intelligence Suite</span>
                </button>
              )}
            </div>
          ) : selectedRegion ? (
            /* Selected Region Action Card */
            <div className="p-5 rounded-2xl bg-neutral-900/80 border border-ink/20 backdrop-blur-md shadow-2xl space-y-4 relative overflow-hidden">
              <div
                className={`absolute top-0 left-0 right-0 h-1.5 ${
                  selectedRegion.urgency_score >= 80
                    ? "bg-gradient-to-r from-red-500 via-orange-500 to-amber-500"
                    : selectedRegion.urgency_score >= 60
                    ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                    : "bg-gradient-to-r from-cyan-500 to-emerald-400"
                }`}
              />

              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-lime-400 font-bold">
                      RANK #{selectedRegion.rank || 1} IN INDIA
                    </span>
                    <span className="text-neutral-500 font-mono text-xs">·</span>
                    <span className="text-xs font-mono text-neutral-400">{selectedRegion.state}</span>
                  </div>
                  <h2 className="text-2xl font-black text-white font-display flex items-center gap-2 mt-0.5">
                    {selectedRegion.city}
                    {selectedRegion.urgency_score >= 80 && (
                      <Flame className="w-5 h-5 text-red-500 fill-red-500 animate-pulse" />
                    )}
                  </h2>
                </div>

                <div className="text-right">
                  <div
                    className={`font-mono text-lg font-black ${
                      selectedRegion.urgency_score >= 80
                        ? "text-red-400"
                        : selectedRegion.urgency_score >= 60
                        ? "text-amber-400"
                        : "text-cyan-400"
                    }`}
                  >
                    {selectedRegion.urgency_score}
                    <span className="text-xs text-neutral-500 font-normal">/100</span>
                  </div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                    {selectedRegion.priority} URGENCY
                  </div>
                </div>
              </div>

              {/* Commercial Ranking Rationale (Groq Curated) */}
              <div className="p-3.5 rounded-xl bg-neutral-950/90 border border-lime-400/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-lime-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5 text-lime-400" />
                    Commercial Ranking Rationale
                  </span>
                  {selectedRegion.commercial_driver && (
                    <span className="text-[10px] font-mono text-lime-300 bg-lime-400/10 px-2.5 py-0.5 rounded border border-lime-400/20 truncate max-w-[220px] font-bold">
                      {selectedRegion.commercial_driver}
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-200 leading-relaxed font-sans">
                  {selectedRegion.ranking_reason || `${selectedRegion.city} ranks with high commercial priority based on its industrial hub profile and local market readiness.`}
                </p>
              </div>

              {/* Weather & News Telemetry Box */}
              <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-ink/15 space-y-2.5">
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5 text-neutral-300">
                    <Thermometer className="w-4 h-4 text-amber-400" />
                    <span className="font-mono font-bold">{selectedRegion.weather.temperature.toFixed(1)}°C</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-neutral-300">
                    <CloudRain className="w-4 h-4 text-cyan-400" />
                    <span className="font-mono font-bold">{selectedRegion.weather.rain_mm.toFixed(1)} mm</span>
                  </div>
                  <div className="ml-auto font-mono text-[11px] text-lime-400 bg-lime-400/10 px-2 py-0.5 rounded border border-lime-400/20">
                    {selectedRegion.lead_count} Regional Leads
                  </div>
                </div>

                <div className="text-xs text-neutral-300 flex items-start gap-2 pt-1 border-t border-ink/10">
                  <span className="text-neutral-400 font-mono text-[11px] shrink-0 font-bold">OPERATIONAL CLIMATE:</span>
                  <span className="italic leading-relaxed">{selectedRegion.weather.summary}</span>
                </div>

                {selectedRegion.news.headline && (
                  <div className="text-[11px] text-neutral-400 flex items-center gap-2 pt-1 border-t border-ink/10">
                    <span className="text-neutral-500 font-mono text-[10px] shrink-0">NEWS WIRE:</span>
                    <span className="truncate">{selectedRegion.news.headline}</span>
                    {selectedRegion.news.link && (
                      <a
                        href={selectedRegion.news.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-neutral-400 hover:text-lime-400 ml-auto shrink-0"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* AI Voice Call Dynamic Script Hook */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-lime-400 flex items-center gap-1.5 font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-lime-400" />
                    Custom AI SDR Hook for "{industry}"
                  </span>
                  <button
                    onClick={handleToggleVoicePreview}
                    className="text-[11px] font-mono text-neutral-300 hover:text-lime-400 flex items-center gap-1 transition-colors px-2 py-0.5 rounded bg-neutral-800"
                  >
                    {isPlayingAudio ? (
                      <>
                        <VolumeX className="w-3 h-3 text-red-400" /> Stop Audio
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3 h-3 text-lime-400" /> Listen Voice Preview
                      </>
                    )}
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-neutral-950/90 border border-lime-400/20 text-xs text-neutral-200 leading-relaxed font-sans italic relative">
                  {selectedRegion.voice_hook}
                </div>
              </div>

              {/* Target Service & Offer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-neutral-950/50 border border-ink/10">
                  <div className="text-[10px] font-mono text-neutral-500 uppercase">Target Service</div>
                  <div className="font-semibold text-neutral-200 truncate mt-0.5">
                    {selectedRegion.recommended_service || "Priority Service"}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-neutral-950/50 border border-ink/10">
                  <div className="text-[10px] font-mono text-neutral-500 uppercase">Recommended Hook</div>
                  <div className="font-semibold text-neutral-200 truncate mt-0.5">
                    {selectedRegion.target_offer || "Free On-Site Inspection"}
                  </div>
                </div>
              </div>

              {/* Launch Campaign Action Button */}
              <button
                onClick={handleLaunchCampaign}
                disabled={dispatching}
                className="w-full py-3 px-4 rounded-xl bg-lime-400 hover:bg-lime-300 text-neutral-950 font-bold text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(212,245,60,0.3)] transition-all active:scale-[0.99] disabled:opacity-50"
              >
                <PhoneCall className={`w-4 h-4 ${dispatching ? "animate-bounce" : ""}`} />
                {dispatching
                  ? `Dispatching to ${selectedRegion.city}...`
                  : `Launch Voice Fleet to ${selectedRegion.city} (${selectedRegion.lead_count} Leads)`}
              </button>
            </div>
          ) : null}

          {/* Regional Priority Leaderboard (Only when active analysis is present) */}
          {hasActiveAnalysis && (
            <div className="p-4 rounded-2xl bg-neutral-900/60 border border-ink/15 backdrop-blur-md space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-mono uppercase tracking-wider text-neutral-400 font-bold">
                  National Priority Leaderboard
                </div>

                {/* Filters */}
                <div className="flex items-center gap-1">
                  {(["ALL", "HOT", "ELEVATED"] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setFilterPriority(filter)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                        filterPriority === filter
                          ? "bg-neutral-200 text-neutral-950"
                          : "text-neutral-400 hover:text-neutral-200 bg-neutral-800/40"
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search Input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search city, state, or weather trigger..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-neutral-950/80 border border-ink/15 rounded-lg text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-lime-400/50 font-mono"
                />
              </div>

              {/* List of Regions */}
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {filteredRegions.map((reg) => {
                  const isSelected = selectedRegion?.id === reg.id;
                  const isHot = reg.urgency_score >= 80;

                  return (
                    <div
                      key={reg.id}
                      onClick={() => setSelectedRegion(reg)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? "bg-neutral-800/90 border-lime-400/60 shadow-[0_0_12px_rgba(212,245,60,0.15)]"
                          : "bg-neutral-950/50 hover:bg-neutral-800/50 border-ink/10"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`font-mono text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                            isHot
                              ? "bg-red-500/20 text-red-400 border border-red-500/40"
                              : reg.urgency_score >= 60
                              ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                              : "bg-neutral-800 text-neutral-400"
                          }`}
                        >
                          {reg.rank}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-white truncate">{reg.city}</span>
                            {isHot && <Flame className="w-3 h-3 text-red-500 fill-red-500 shrink-0" />}
                            <span className="text-[10px] font-mono text-neutral-500 truncate">
                              {reg.state.split("/")[0]}
                            </span>
                          </div>
                          <div className="text-[11px] text-neutral-300 truncate max-w-[210px]">
                            {reg.commercial_driver || reg.ranking_reason || reg.weather.summary}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span
                            className={`font-mono text-xs font-bold ${
                              isHot ? "text-red-400" : reg.urgency_score >= 60 ? "text-amber-400" : "text-cyan-400"
                            }`}
                          >
                            {reg.urgency_score}
                          </span>
                          <div className="text-[10px] font-mono text-neutral-500">{reg.lead_count} Leads</div>
                        </div>
                        <ChevronRight className={`w-4 h-4 ${isSelected ? "text-lime-400" : "text-neutral-600"}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
