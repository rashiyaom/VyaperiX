/**
 * RegionalRankingTile.tsx — Overview Dashboard Widget for Regional Hotspots & Priority Triggers.
 *
 * Displays top regional urgent zones directly in the Command Center.
 * Dynamic: Only displays when a business/website is analyzed or searched.
 */

import { useEffect, useState } from "react";
import { Flame, Radio, ArrowRight, Sparkles, Brain } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { RegionData } from "./RegionalHeatMap";

interface RegionalRankingTileProps {
  industry?: string | undefined;
  onNavigate?: ((module: string) => void) | undefined;
}

export function RegionalRankingTile({
  industry = "",
  onNavigate,
}: RegionalRankingTileProps) {
  const [data, setData] = useState<{
    hot_regions_count: number;
    top_hotspot: RegionData | null;
    regions: RegionData[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const cleanIndustry = industry.trim();

  useEffect(() => {
    let isMounted = true;
    if (!cleanIndustry) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    async function load() {
      try {
        const res = await apiFetch(`/api/regional/rankings?industry=${encodeURIComponent(cleanIndustry)}`);
        if (isMounted && res.ok) {
          const json = await res.json();
          if (json?.data) {
            setData(json.data);
          }
        }
      } catch (e) {
        console.debug("Could not fetch regional tile data:", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [cleanIndustry]);

  const topRegions = (data?.regions || []).slice(0, 3);

  return (
    <div className="p-4 md:p-5 rounded-2xl bg-neutral-900/60 border border-ink/15 backdrop-blur-md shadow-xl flex flex-col justify-between space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-lime-400 uppercase tracking-wider font-bold flex items-center gap-1">
              <Radio className="w-3 h-3 text-lime-400 animate-pulse" />
              GEO-RADAR
            </span>
            {cleanIndustry && data && (
              <span className="px-2 py-0.2 rounded-full bg-red-500/20 text-red-400 font-mono text-[10px] font-bold border border-red-500/30 flex items-center gap-1">
                <Flame className="w-3 h-3 fill-red-400" />
                {data.hot_regions_count} Hotspots
              </span>
            )}
          </div>
          <h3 className="font-display font-bold text-base text-white">
            Regional Demand & Call Hooks
          </h3>
        </div>

        {onNavigate && (
          <button
            onClick={() => onNavigate("regional-ranking")}
            className="text-xs font-mono text-neutral-400 hover:text-lime-400 flex items-center gap-1 transition-colors"
          >
            <span>Full Map</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="space-y-2.5">
        {!cleanIndustry ? (
          <div className="py-4 px-3 rounded-xl bg-neutral-950/40 border border-ink/10 text-center space-y-2">
            <div className="w-8 h-8 rounded-lg bg-lime-400/10 text-lime-400 flex items-center justify-center mx-auto">
              <Brain className="w-4 h-4" />
            </div>
            <p className="font-mono text-xs text-neutral-300 font-bold">
              Awaiting Business Intelligence
            </p>
            <p className="text-[11px] text-neutral-400 leading-relaxed max-w-sm mx-auto">
              Analyze a company website or enter an industry in Regional Ranking to activate real-time Pan-India demand & weather hot zones.
            </p>
            {onNavigate && (
              <button
                onClick={() => onNavigate("regional-ranking")}
                className="mt-1 px-3 py-1.5 rounded-lg bg-lime-400/10 hover:bg-lime-400/20 text-lime-400 border border-lime-400/30 font-mono text-[11px] font-bold inline-flex items-center gap-1.5 transition-all"
              >
                <span>Open Regional Ranking</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        ) : loading ? (
          <div className="py-6 text-center text-xs font-mono text-neutral-500 animate-pulse">
            Scanning regional weather & civic alerts for "{cleanIndustry}"...
          </div>
        ) : topRegions.length > 0 ? (
          topRegions.map((reg) => {
            const isHot = reg.urgency_score >= 80;
            return (
              <div
                key={reg.id}
                onClick={() => onNavigate && onNavigate("regional-ranking")}
                className="p-2.5 rounded-xl bg-neutral-950/60 hover:bg-neutral-800/60 border border-ink/10 transition-all cursor-pointer flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`font-mono text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      isHot
                        ? "bg-red-500/20 text-red-400 border border-red-500/40"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                    }`}
                  >
                    #{reg.rank}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-white">{reg.city}</span>
                      {isHot && <Flame className="w-3 h-3 text-red-500 fill-red-500 shrink-0" />}
                    </div>
                    <div className="text-[10px] text-neutral-400 truncate max-w-[170px]">
                      {reg.weather.summary}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div
                    className={`font-mono text-xs font-bold ${
                      isHot ? "text-red-400" : "text-amber-400"
                    }`}
                  >
                    {reg.urgency_score}/100
                  </div>
                  <div className="text-[10px] font-mono text-lime-400">
                    {reg.lead_count} leads
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-xs text-neutral-500 text-center py-4">
            No regional data available
          </div>
        )}
      </div>

      {/* Footer Banner */}
      <div className="pt-2 border-t border-ink/10 flex items-center justify-between text-[11px] font-mono">
        <span className="text-neutral-400 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-lime-400" />
          {cleanIndustry ? `Target: ${cleanIndustry}` : "Dynamic Voice SDR Hooking"}
        </span>
        {onNavigate && (
          <button
            onClick={() => onNavigate("regional-ranking")}
            className="text-lime-400 hover:underline font-bold"
          >
            Deploy Regional Fleet ➔
          </button>
        )}
      </div>
    </div>
  );
}
