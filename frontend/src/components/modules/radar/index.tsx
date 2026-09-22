import React, { useState, useEffect } from "react";
import {
  Radio,
  Search,
  Filter,
  Flame,
  PhoneCall,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  Globe,
  Mail,
  Building,
  ArrowUpRight,
  ShieldCheck,
  Zap,
  AlertCircle,
} from "lucide-react";

export interface Lead {
  id: string;
  name: string;
  title: string;
  company: string;
  industry: string;
  intentScore: number;
  dealSize: string;
  signals: string[];
  website: string;
  email: string;
  phone: string;
  status: "new" | "contacted" | "qualified" | "in_call";
}

interface LeadRadarModuleProps {
  analysis?: any;
  companyName?: string;
  industry?: string;
  onLaunchVoiceAgent?: (lead: Lead) => void;
}

export function LeadRadarModule({
  analysis,
  companyName = "",
  industry = "",
  onLaunchVoiceAgent,
}: LeadRadarModuleProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterIntent, setFilterIntent] = useState<"all" | "high" | "med">("all");
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null);

  // Derive real-time leads strictly from the Groq analysis
  const effectiveCompanyName = analysis?.company_name || companyName;
  const effectiveIndustry = analysis?.industry || industry;

  const targetCustomers = (analysis?.target_customers || []).map((c: any) =>
    typeof c === "string" ? { segment_name: c, description: c, estimated_deal_size: "Custom Enterprise", pain_points: [] } : c
  );

  const realLeads: Lead[] = targetCustomers.map((cust: any, idx: number) => {
    const oppScore = analysis?.opportunity_score || 85;
    const computedScore = Math.min(99, Math.max(65, oppScore - idx * 4 + 5));
    const domain = (cust.segment_name || "enterprise").toLowerCase().replace(/[^a-z0-9]/g, "") + ".io";

    const signalsList: string[] = [];
    if (cust.pain_points && Array.isArray(cust.pain_points) && cust.pain_points.length) {
      signalsList.push(...cust.pain_points.slice(0, 3));
    } else if (cust.description) {
      signalsList.push(cust.description);
    } else {
      signalsList.push(`Active ICP requirement for ${effectiveCompanyName || "commercial vendor"}`);
    }

    return {
      id: `icp-segment-${idx + 1}`,
      name: `${cust.segment_name} Buyers`,
      title: cust.description || `Commercial Buyer Segment (${cust.segment_name})`,
      company: `${cust.segment_name} Vertical`,
      industry: effectiveIndustry || "B2B Commercial",
      intentScore: computedScore,
      dealSize: cust.estimated_deal_size || "Custom ICP Tier",
      signals: signalsList,
      website: `${effectiveCompanyName} ICP Profile`,
      email: "Direct CRM / Outbound Target",
      phone: "",
      status: "new",
    };
  });

  const [leads, setLeads] = useState<Lead[]>(realLeads);

  useEffect(() => {
    setLeads(realLeads);
  }, [analysis]);

  // If no report analysis exists yet
  if (!analysis && realLeads.length === 0) {
    return (
      <div className="space-y-6">
        <div className="border border-ink/20 bg-secondary/30 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="label-mono text-violet font-bold">// Lead Discovery Radar</span>
            <h2 className="font-display text-2xl font-extrabold uppercase">
              Lead Radar — Qualified ICP Pipeline
            </h2>
            <p className="font-mono text-xs text-muted-foreground">
              Real-time buying signal discovery powered by Groq LLM synthesis.
            </p>
          </div>
        </div>

        <div className="border border-ink/20 bg-paper p-12 text-center space-y-4">
          <div className="border border-ink/20 bg-secondary p-4 inline-flex mx-auto">
            <Radio className="w-8 h-8 text-violet" />
          </div>
          <h3 className="font-display text-lg font-bold uppercase">No Active Report Analyzed Yet</h3>
          <p className="font-mono text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            Lead Radar discovers high-intent prospects dynamically from your analyzed company assets.
            Run an analysis in the <strong>Intelligence Suite</strong> to view real-time synthesized leads.
          </p>
        </div>
      </div>
    );
  }

  const filteredLeads = leads.filter((l) => {
    const matchesSearch =
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesIntent =
      filterIntent === "all"
        ? true
        : filterIntent === "high"
        ? l.intentScore >= 85
        : l.intentScore < 85;
    return matchesSearch && matchesIntent;
  });

  const toggleSelect = (id: string) => {
    setSelectedLeads((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleTriggerCall = (lead: Lead) => {
    setCallingLeadId(lead.id);
    setTimeout(() => {
      setCallingLeadId(null);
      setLeads((prev) =>
        prev.map((item) =>
          item.id === lead.id ? { ...item, status: "in_call" } : item
        )
      );
      if (onLaunchVoiceAgent) {
        onLaunchVoiceAgent(lead);
      }
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="border border-ink/20 bg-secondary/30 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="label-mono text-lime-700 dark:text-lime font-bold">
              [LIVE GROQ PROSPECTION RADAR]
            </span>
            <div className="h-2 w-2 rounded-full bg-lime animate-ping" />
          </div>
          <h2 className="font-display text-2xl font-extrabold uppercase">
            Lead Radar — Qualified ICP Pipeline
          </h2>
          <p className="font-mono text-xs text-muted-foreground">
            Signals generated for <span className="text-ink font-bold">{effectiveCompanyName}</span> ({effectiveIndustry}) from real-time analysis.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="border border-ink/20 bg-paper px-4 py-2 text-center">
            <span className="label-mono text-muted-foreground block text-[9px]">Matched ICPs</span>
            <span className="font-display text-lg font-black text-violet">{leads.length} Identified</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/20 pb-4">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search prospects or company domains..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-ink/20 bg-paper font-mono text-xs text-ink placeholder-muted-foreground focus:outline-none focus:border-violet"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="label-mono text-muted-foreground flex items-center gap-1 text-[10px]">
            <Filter className="w-3 h-3" /> Filter Intent:
          </span>
          {(["all", "high", "med"] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterIntent(lvl)}
              className={`label-mono px-2.5 py-1 text-[10px] border transition-all ${
                filterIntent === lvl
                  ? "border-violet bg-violet text-violet-foreground font-bold"
                  : "border-ink/20 bg-secondary text-muted-foreground hover:border-ink"
              }`}
            >
              {lvl === "all" ? "All Scores" : lvl === "high" ? "High (85+)" : "Moderate (<85)"}
            </button>
          ))}
        </div>
      </div>

      {/* Leads Table */}
      <div className="border border-ink/20 bg-paper divide-y divide-ink/10">
        {filteredLeads.map((lead) => {
          const isSelected = selectedLeads.includes(lead.id);
          const isCalling = callingLeadId === lead.id;
          return (
            <div
              key={lead.id}
              className={`p-4 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                isSelected ? "bg-violet/5" : "hover:bg-secondary/30"
              }`}
            >
              {/* Prospect Info */}
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(lead.id)}
                  className="mt-1 cursor-pointer accent-violet"
                />
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-extrabold uppercase">{lead.name}</span>
                    <span className="label-mono border border-ink/15 bg-secondary text-muted-foreground px-2 py-0.5 text-[9px]">
                      {lead.title}
                    </span>
                    <span className="label-mono border border-lime/30 bg-lime/10 text-lime-700 dark:text-lime px-2 py-0.5 text-[9px] font-bold">
                      {lead.dealSize}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 font-bold text-ink">
                      <Building className="w-3 h-3 text-violet" /> {lead.company}
                    </span>
                    <span className="flex items-center gap-1">
                      <Globe className="w-3 h-3" /> {lead.industry}
                    </span>
                    <span className="flex items-center gap-1 text-violet">
                      <Sparkles className="w-3 h-3" /> Groq AI Qualified ICP
                    </span>
                  </div>

                  {/* Intent Signals from Groq */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {lead.signals.map((sig, i) => (
                      <span
                        key={i}
                        className="label-mono border border-violet/25 bg-violet/5 text-violet px-2 py-0.5 text-[9px]"
                      >
                        ⚡ {sig}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Intent Score & Action */}
              <div className="flex items-center gap-4 shrink-0 lg:border-l lg:border-ink/10 lg:pl-4">
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <Flame className="w-4 h-4 text-danger animate-pulse" />
                    <span className="font-display text-lg font-black text-ink">
                      {lead.intentScore}%
                    </span>
                  </div>
                  <span className="label-mono text-muted-foreground text-[9px]">
                    Buyer Intent
                  </span>
                </div>

                <button
                  onClick={() => handleTriggerCall(lead)}
                  disabled={isCalling}
                  className={`border px-3.5 py-2 label-mono font-bold flex items-center gap-2 transition-all ${
                    lead.status === "in_call"
                      ? "border-lime bg-lime text-lime-foreground font-black animate-pulse"
                      : "border-ink bg-ink text-paper hover:bg-violet hover:border-violet"
                  }`}
                >
                  <PhoneCall className={`w-3.5 h-3.5 ${isCalling ? "animate-spin" : ""}`} />
                  {isCalling
                    ? "Dialing AI SDR..."
                    : lead.status === "in_call"
                    ? "In Live Call"
                    : "Deploy Voice SDR"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Launch Bar */}
      {selectedLeads.length > 0 && (
        <div className="fixed bottom-6 right-6 z-40 border border-ink bg-paper p-4 shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4">
          <div className="space-y-0.5">
            <span className="font-display text-xs font-black uppercase">
              {selectedLeads.length} Prospects Selected
            </span>
            <p className="font-mono text-[10px] text-muted-foreground">
              Ready for batch autonomous voice dispatch
            </p>
          </div>
          <button
            onClick={() => onLaunchVoiceAgent?.(leads[0]!)}
            className="border border-violet bg-violet text-violet-foreground px-4 py-2 label-mono font-bold hover:bg-violet/90 transition-all flex items-center gap-2"
          >
            <Zap className="w-3.5 h-3.5" /> Launch Voice Fleet Batch
          </button>
        </div>
      )}
    </div>
  );
}
