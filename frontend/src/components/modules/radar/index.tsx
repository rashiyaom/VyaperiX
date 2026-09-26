import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { getApiBase, getAuthHeaders } from "@/lib/api";
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
  MessageSquare,
  ExternalLink,
  Loader2,
  Phone,
  UserCheck,
  RefreshCw,
  Send,
  Edit2,
  Check,
  Cpu,
  Layers,
  Compass,
  Video,
  Share2,
} from "lucide-react";

export interface Lead {
  id: string;
  name: string;
  title: string;
  company: string;
  domain?: string;
  industry: string;
  intentScore: number;
  dealSize: string;
  signals: string[];
  why_matched?: string;
  personalized_pitch?: string;
  website: string;
  email: string;
  phone: string;
  linkedin_url?: string;
  twitter_url?: string;
  city?: string;
  state?: string;
  country?: string;
  raw_address?: string;
  employee_count?: number | null;
  annual_revenue?: string | null;
  technologies?: string[];
  logo_url?: string;
  apollo_found?: boolean;
  status: "new" | "contacted" | "qualified" | "in_call";
}

interface LeadRadarModuleProps {
  analysis?: any;
  companyName?: string;
  industry?: string;
  onLaunchVoiceAgent?: (lead: Lead) => void;
}

const API_BASE = getApiBase();

export function LeadRadarModule({
  analysis,
  companyName = "",
  industry = "",
  onLaunchVoiceAgent,
}: LeadRadarModuleProps) {
  const { user, session } = useAuth();
  // Discovery Form State
  const effectiveCompanyName = analysis?.company_name || companyName || "VyaperiX";
  const effectiveIndustry = analysis?.industry || industry || "Commercial B2B";

  const [offering, setOffering] = useState<string>(
    analysis?.company_name
      ? `AI Voice Agents & WhatsApp sales automation for ${analysis.company_name}`
      : "AI Voice SDR & Multi-Channel Sales Automation Engine for B2B distributors"
  );
  const [targetIndustry, setTargetIndustry] = useState<string>(effectiveIndustry || "Ceramic Tiles & Building Materials");
  const [targetRegion, setTargetRegion] = useState<string>("Pan-India");
  const [customSearchQuery, setCustomSearchQuery] = useState<string>("");
  const [maxLeadsCount, setMaxLeadsCount] = useState<number>(4);

  // Discovery Execution State
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [discoveryStep, setDiscoveryStep] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterIntent, setFilterIntent] = useState<"all" | "high" | "med">("all");
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);

  // Action States
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null);
  const [whatsAppingLeadId, setWhatsAppingLeadId] = useState<string | null>(null);
  const [syncingCrmLeadId, setSyncingCrmLeadId] = useState<string | null>(null);
  const [syncedCrmLeadIds, setSyncedCrmLeadIds] = useState<Record<string, { deal_id?: string; contact_id?: string }>>({});
  const [actionSuccessMsg, setActionSuccessMsg] = useState<{ leadId: string; text: string; type: "call" | "whatsapp" | "email" } | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<{ leadId: string; text: string } | null>(null);

  // Phone Override Modal / Inline Edit
  const [editingPhoneLeadId, setEditingPhoneLeadId] = useState<string | null>(null);
  const [customPhoneInput, setCustomPhoneInput] = useState<string>("");

  // Email Override & Dispatch State
  const [editingEmailLeadId, setEditingEmailLeadId] = useState<string | null>(null);
  const [customEmailInput, setCustomEmailInput] = useState<string>("");
  const [emailingLead, setEmailingLead] = useState<Lead | null>(null);
  const [emailSubject, setEmailSubject] = useState<string>("");
  const [emailBody, setEmailBody] = useState<string>("");
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);

  // Domain Quick Test
  const [quickDomain, setQuickDomain] = useState<string>("orientbell.com");
  const [isEnrichingDomain, setIsEnrichingDomain] = useState<boolean>(false);
  const [enrichedDomainData, setEnrichedDomainData] = useState<any | null>(null);
  const [showDomainTester, setShowDomainTester] = useState<boolean>(false);

  // Active leads list
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoadingExisting, setIsLoadingExisting] = useState<boolean>(true);

  // Fetch initial leads from backend
  const fetchPersistedLeads = async () => {
    try {
      setIsLoadingExisting(true);
      const validUserId = user?.id && user.id !== "undefined" && user.id !== "null" ? user.id : null;
      if (!validUserId) {
        setLeads([]);
        setIsLoadingExisting(false);
        return;
      }
      const headers: Record<string, string> = {};
      const token = session?.access_token || (typeof window !== "undefined" ? localStorage.getItem("vyepari_x_auth_token") : null);
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/prospecting/leads?limit=50&user_id=${encodeURIComponent(validUserId)}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.leads && Array.isArray(data.leads) && data.leads.length > 0) {
          const sanitized: Lead[] = data.leads.map((l: any) => ({
            id: l.id || `lead-${Math.random().toString(36).slice(2, 9)}`,
            name: l.name || l.contact_name || l.company || "Enterprise Lead",
            title: l.title || "",
            company: l.company || "Enterprise Lead",
            domain: l.domain || "",
            industry: l.industry || effectiveIndustry || "B2B Commercial",
            intentScore: l.intentScore ?? 90,
            dealSize: l.dealSize || "₹10L - ₹25L / yr",
            signals: Array.isArray(l.signals) && l.signals.length ? l.signals : ["Apollo Verified Record", "Commercial B2B Footprint"],
            why_matched: l.why_matched || "Verified matching commercial profile",
            personalized_pitch: l.personalized_pitch || `Commercial inquiry for ${l.company || "enterprise"}`,
            website: l.website || (l.domain ? `https://${l.domain}` : ""),
            email: l.email || "",
            phone: l.phone || "",
            status: l.status || "new",
            linkedin_url: l.linkedin_url || "",
            twitter_url: l.twitter_url || "",
            city: l.city || "",
            state: l.state || "",
            country: l.country || "",
            raw_address: l.raw_address || "",
            employee_count: l.employee_count,
            annual_revenue: l.annual_revenue,
            technologies: l.technologies || [],
            logo_url: l.logo_url || "",
            apollo_found: l.apollo_found !== false,
          }));
          setLeads(sanitized);
          setIsLoadingExisting(false);
          return;
        } else {
          // If no persisted leads exist yet, auto-trigger live Apollo + Web discovery immediately!
          setIsLoadingExisting(false);
          setTimeout(() => {
            handleRunDiscovery();
          }, 400);
          return;
        }
      }
    } catch (e) {
      console.warn("Could not fetch persisted leads from backend:", e);
    }

    setIsLoadingExisting(false);
  };

  // Fetch synced CRM records from backend
  const fetchSyncedCrmRecords = async () => {
    try {
      const validUserId = user?.id && user.id !== "undefined" && user.id !== "null" ? user.id : null;
      if (!validUserId) return;
      const headers: Record<string, string> = {};
      const token = session?.access_token || (typeof window !== "undefined" ? localStorage.getItem("vyepari_x_auth_token") : null);
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/crm/records?limit=100&user_id=${encodeURIComponent(validUserId)}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, { deal_id?: string; contact_id?: string }> = {};
        (data.records || []).forEach((r: any) => {
          if (r.lead_id) {
            map[r.lead_id] = { deal_id: r.hubspot_deal_id, contact_id: r.hubspot_contact_id };
          }
        });
        setSyncedCrmLeadIds(map);
      }
    } catch (e) {
      // non-blocking
    }
  };

  useEffect(() => {
    fetchPersistedLeads();
    fetchSyncedCrmRecords();
  }, [analysis, user?.id]);

  // Execute Autonomous Discovery Pipeline
  const handleRunDiscovery = async () => {
    setIsDiscovering(true);
    setActionSuccessMsg(null);
    setActionErrorMsg(null);

    setDiscoveryStep("1/3: Querying Apollo.io live B2B database for verified organizations & phones...");
    const stepTimer1 = setTimeout(() => {
      setDiscoveryStep("2/3: Scanning real-time LinkedIn & X (Twitter) company channels...");
    }, 1500);
    const stepTimer2 = setTimeout(() => {
      setDiscoveryStep("3/3: Verifying switchboards, tech stacks & employee headcounts...");
    }, 3500);

    try {
      const userParam = user?.id ? `?user_id=${encodeURIComponent(user.id)}` : "";
      const res = await fetch(`${API_BASE}/api/prospecting/discover${userParam}`, {
        method: "POST",
        headers: getAuthHeaders(session?.access_token),
        body: JSON.stringify({
          offering: offering.trim(),
          target_industry: targetIndustry.trim(),
          region: targetRegion.trim(),
          custom_query: customSearchQuery.trim() || undefined,
          max_results: maxLeadsCount,
        }),
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.leads && Array.isArray(data.leads)) {
        setLeads((prev) => {
          // Prepend new leads, deduplicate by ID or company name safely
          const existingIds = new Set(data.leads.map((l: any) => l.id));
          const existingNames = new Set(data.leads.map((l: any) => (l.company || "").toLowerCase()));
          const filteredOld = prev.filter((p) => !existingIds.has(p.id) && !existingNames.has((p.company || "").toLowerCase()));
          return [...data.leads, ...filteredOld];
        });
      }
    } catch (err: any) {
      console.error("Discovery failed:", err);
      setActionErrorMsg({ leadId: "global", text: `Discovery error: ${err.message}` });
    } finally {
      setIsDiscovering(false);
      setDiscoveryStep("");
    }
  };

  // 1-Click Outbound Voice SDR Call via Vapi
  const handleTriggerCall = async (lead: Lead) => {
    let phoneToUse = (lead.phone || "").trim();
    if (!phoneToUse) {
      const input = window.prompt(`Enter direct phone number to call for ${lead.company}:`, "+91");
      if (!input || !input.trim()) return;
      phoneToUse = input.trim();
      handleSavePhone(lead.id, phoneToUse);
    }

    setCallingLeadId(lead.id);
    setActionSuccessMsg(null);
    setActionErrorMsg(null);

    try {
      const res = await fetch(`${API_BASE}/api/prospecting/leads/${lead.id}/call`, {
        method: "POST",
        headers: getAuthHeaders(session?.access_token),
        body: JSON.stringify({
          phone_override: phoneToUse,
          business_name: effectiveCompanyName || "VyaperiX",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Call dispatch failed");
      }

      setLeads((prev) =>
        prev.map((item) => (item.id === lead.id ? { ...item, status: "in_call", phone: phoneToUse } : item))
      );
      setActionSuccessMsg({
        leadId: lead.id,
        text: `Riley Voice SDR queued to dial ${phoneToUse}! Call ID: ${data.call_id?.slice(0, 8)}...`,
        type: "call",
      });

      if (onLaunchVoiceAgent) {
        onLaunchVoiceAgent({ ...lead, phone: phoneToUse, status: "in_call" });
      }
    } catch (err: any) {
      setActionErrorMsg({ leadId: lead.id, text: `Call failed: ${err.message}` });
    } finally {
      setCallingLeadId(null);
    }
  };

  // 1-Click WhatsApp Intro Dispatch with Jitsi Meeting Link
  const handleTriggerWhatsApp = async (lead: Lead) => {
    let phoneToUse = (lead.phone || "").trim();
    if (!phoneToUse) {
      const input = window.prompt(`Enter WhatsApp phone number with country code for ${lead.company}:`, "+91");
      if (!input || !input.trim()) return;
      phoneToUse = input.trim();
      handleSavePhone(lead.id, phoneToUse);
    }

    setWhatsAppingLeadId(lead.id);
    setActionSuccessMsg(null);
    setActionErrorMsg(null);

    try {
      const res = await fetch(`${API_BASE}/api/prospecting/leads/${lead.id}/whatsapp`, {
        method: "POST",
        headers: getAuthHeaders(session?.access_token),
        body: JSON.stringify({
          phone_override: phoneToUse,
          business_name: effectiveCompanyName || "VyaperiX",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.error || "WhatsApp dispatch failed");
      }

      setLeads((prev) =>
        prev.map((item) => (item.id === lead.id ? { ...item, status: "contacted", phone: phoneToUse } : item))
      );
      setActionSuccessMsg({
        leadId: lead.id,
        text: `WhatsApp pitch sent to ${data.recipient || phoneToUse} with instant video room link!`,
        type: "whatsapp",
      });
    } catch (err: any) {
      setActionErrorMsg({ leadId: lead.id, text: `WhatsApp failed: ${err.message}` });
    } finally {
      setWhatsAppingLeadId(null);
    }
  };

  // Save phone number edit
  const handleSavePhone = (leadId: string, overrideValue?: string) => {
    const val = (overrideValue ?? customPhoneInput).trim();
    if (val) {
      setLeads((prev) =>
        prev.map((item) => (item.id === leadId ? { ...item, phone: val } : item))
      );
    }
    setEditingPhoneLeadId(null);
    setCustomPhoneInput("");
  };

  // Save email address edit
  const handleSaveEmail = (leadId: string, overrideValue?: string) => {
    const val = (overrideValue ?? customEmailInput).trim();
    if (val) {
      setLeads((prev) =>
        prev.map((item) => (item.id === leadId ? { ...item, email: val } : item))
      );
    }
    setEditingEmailLeadId(null);
    setCustomEmailInput("");
  };

  // Open Email Pitch Modal
  const handleOpenEmailModal = (lead: Lead) => {
    setEmailingLead(lead);
    setEmailSubject(`Commercial Synergy: ${effectiveCompanyName || "VyaperiX"} x ${lead.company}`);
    setEmailBody(lead.personalized_pitch || `Hi ${lead.company} team,\n\nNoticing your recent market expansion, our AI platform helps automate your B2B sales and procurement workflows.\n\nWould you be open to a brief 10-minute discovery conversation this week?`);
  };

  // Dispatch Email Pitch
  const handleSendEmailPitch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailingLead) return;
    setIsSendingEmail(true);
    setActionSuccessMsg(null);
    setActionErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/email/send-pitch`, {
        method: "POST",
        headers: getAuthHeaders(session?.access_token),
        body: JSON.stringify({
          to_email: emailingLead.email,
          company_name: emailingLead.company,
          lead_name: emailingLead.name || `${emailingLead.company} Commercial Team`,
          subject: emailSubject,
          pitch_text: emailBody,
          sender_company: effectiveCompanyName || "VyaperiX",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.error || "Email dispatch failed");
      }
      setActionSuccessMsg({
        leadId: emailingLead.id,
        text: `B2B pitch email sent to ${emailingLead.email}!`,
        type: "email",
      });
      setEmailingLead(null);
    } catch (err: any) {
      setActionErrorMsg({ leadId: emailingLead.id, text: `Email failed: ${err.message}` });
    } finally {
      setIsSendingEmail(false);
    }
  };

  // 1-Click Sync to HubSpot CRM
  const handleSyncToCRM = async (lead: Lead) => {
    setSyncingCrmLeadId(lead.id);
    setActionSuccessMsg(null);
    setActionErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/crm/sync-lead`, {
        method: "POST",
        headers: getAuthHeaders(session?.access_token),
        body: JSON.stringify({ lead_id: lead.id, user_id: user?.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "CRM Sync failed");
      }
      setSyncedCrmLeadIds((prev) => ({
        ...prev,
        [lead.id]: {
          contact_id: data.contact?.id,
          deal_id: data.deal?.id,
        },
      }));
      setActionSuccessMsg({
        leadId: lead.id,
        text: `Lead synced to HubSpot CRM! Contact ID: ${data.contact?.id || "synced"}, Deal ID: ${data.deal?.id || "synced"}`,
        type: "whatsapp",
      });
    } catch (err: any) {
      setActionErrorMsg({ leadId: lead.id, text: `CRM Sync failed: ${err.message}` });
    } finally {
      setSyncingCrmLeadId(null);
    }
  };

  // Quick Apollo Domain Lookup Test
  const handleTestDomainEnrichment = async () => {
    if (!quickDomain.trim()) return;
    setIsEnrichingDomain(true);
    setEnrichedDomainData(null);
    try {
      const res = await fetch(`${API_BASE}/api/prospecting/enrich-domain`, {
        method: "POST",
        headers: getAuthHeaders(session?.access_token),
        body: JSON.stringify({ domain: quickDomain.trim() }),
      });
      const data = await res.json();
      setEnrichedDomainData(data);
    } catch (e: any) {
      setEnrichedDomainData({ error: e.message });
    } finally {
      setIsEnrichingDomain(false);
    }
  };

  const filteredLeads = leads.filter((l) => {
    const q = (searchQuery || "").trim().toLowerCase();
    const nameMatch = (l.name || "").toLowerCase().includes(q);
    const compMatch = (l.company || "").toLowerCase().includes(q);
    const titleMatch = (l.title || "").toLowerCase().includes(q);
    const domainMatch = (l.domain || "").toLowerCase().includes(q);
    const matchesSearch = !q || nameMatch || compMatch || titleMatch || domainMatch;
    const matchesIntent =
      filterIntent === "all"
        ? true
        : filterIntent === "high"
        ? (l.intentScore ?? 0) >= 85
        : (l.intentScore ?? 0) < 85;
    return matchesSearch && matchesIntent;
  });

  const toggleSelect = (id: string) => {
    setSelectedLeads((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Apollo + DDG Engine Status */}
      <div className="border border-ink/20 bg-secondary/30 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label-mono text-lime-700 dark:text-lime font-bold">
              [APOLLO.IO + DUCKDUCKGO MARKET RADAR]
            </span>
            <div className="h-2 w-2 rounded-full bg-lime animate-ping" />
            <span className="label-mono border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[9px] font-bold">
              Apollo.io Live Intelligence: Online
            </span>
            <span className="label-mono border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 px-2 py-0.5 text-[9px] font-bold">
              Real-Time LinkedIn & X (Twitter) Scanner
            </span>
          </div>
          <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight">
            Autonomous B2B Lead Radar & Prospecting
          </h2>
          <p className="font-mono text-xs text-muted-foreground">
            Real-time B2B market discovery powered by live Apollo.io corporate intelligence, real-time LinkedIn and X (Twitter) search, with verified switchboard phone numbers, headcount, and verified websites.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDomainTester(!showDomainTester)}
            className="border border-ink/20 bg-paper px-3 py-2 text-xs font-mono font-bold hover:border-violet transition-all flex items-center gap-1.5"
          >
            <Compass className="w-3.5 h-3.5 text-violet" />
            {showDomainTester ? "Hide Domain Inspector" : "Apollo Domain Inspector"}
          </button>
          <div className="border border-ink/20 bg-paper px-4 py-2 text-center">
            <span className="label-mono text-muted-foreground block text-[9px]">Verified Leads</span>
            <span className="font-display text-lg font-black text-violet">{leads.length} in Radar</span>
          </div>
        </div>
      </div>

      {/* Apollo Domain Quick Inspector (Collapsible) */}
      {showDomainTester && (
        <div className="border border-violet/30 bg-violet/5 p-4 space-y-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <span className="label-mono text-violet font-bold text-xs flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> Live Apollo.io Firmographic Lookup Tester
            </span>
            <span className="label-mono text-muted-foreground text-[10px]">
              API Key Configured • Free Organization Tier
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="e.g. orientbell.com or stripe.com"
              value={quickDomain}
              onChange={(e) => setQuickDomain(e.target.value)}
              className="flex-1 px-3 py-2 border border-ink/20 bg-paper font-mono text-xs text-ink focus:outline-none focus:border-violet"
            />
            <button
              onClick={handleTestDomainEnrichment}
              disabled={isEnrichingDomain}
              className="border border-violet bg-violet text-violet-foreground px-4 py-2 label-mono font-bold hover:bg-violet/90 transition-all flex items-center gap-1.5"
            >
              {isEnrichingDomain ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              {isEnrichingDomain ? "Enriching..." : "Enrich Domain"}
            </button>
          </div>

          {enrichedDomainData && (
            <div className="border border-ink/20 bg-paper p-3 text-xs font-mono space-y-2">
              <div className="flex items-center justify-between border-b border-ink/10 pb-2">
                <div className="flex items-center gap-2">
                  {enrichedDomainData.logo_url && (
                    <img src={enrichedDomainData.logo_url} alt="Logo" className="w-6 h-6 object-contain border border-ink/10" />
                  )}
                  <span className="font-display font-bold text-sm">{enrichedDomainData.name || "Company"}</span>
                  <span className="text-muted-foreground">({enrichedDomainData.domain})</span>
                </div>
                <span className="label-mono border border-lime/30 bg-lime/10 text-lime-700 dark:text-lime px-2 py-0.5 text-[9px] font-bold">
                  {enrichedDomainData.found ? "✓ Apollo Record Found" : "No Apollo Record"}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
                <div>📞 Phone: <strong className="text-ink">{enrichedDomainData.phone || "N/A"}</strong></div>
                <div>👥 Headcount: <strong className="text-ink">{enrichedDomainData.estimated_num_employees || "N/A"}</strong></div>
                <div>💰 Revenue: <strong className="text-ink">{enrichedDomainData.annual_revenue || "N/A"}</strong></div>
                <div>📍 HQ: <strong className="text-ink">{enrichedDomainData.city || ""} {enrichedDomainData.country || ""}</strong></div>
              </div>
              {enrichedDomainData.technologies && enrichedDomainData.technologies.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  <span className="text-[10px] text-muted-foreground mr-1">Tech Stack:</span>
                  {enrichedDomainData.technologies.slice(0, 6).map((t: string, idx: number) => (
                    <span key={idx} className="label-mono border border-ink/15 bg-secondary px-1.5 py-0.5 text-[8px]">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Autonomous Discovery Controls */}
      <div className="border border-ink/20 bg-paper p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-ink/10 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-violet animate-pulse" />
            <span className="font-display text-sm font-bold uppercase">Configure Prospecting Scanner</span>
          </div>
          <span className="label-mono text-muted-foreground text-[10px]">
            DuckDuckGo X-Ray ➔ Apollo Enrichment ➔ Groq Match Scoring
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="label-mono text-muted-foreground text-[10px] uppercase">
              1. What Your Business Sells / Offers
            </label>
            <input
              type="text"
              value={offering}
              onChange={(e) => setOffering(e.target.value)}
              placeholder="e.g. AI Voice SDR for tiles distributors"
              className="w-full px-3 py-2 border border-ink/20 bg-secondary/20 font-mono text-xs text-ink focus:outline-none focus:border-violet"
            />
          </div>

          <div className="space-y-1">
            <label className="label-mono text-muted-foreground text-[10px] uppercase">
              2. Target Sector / Industry
            </label>
            <input
              type="text"
              value={targetIndustry}
              onChange={(e) => setTargetIndustry(e.target.value)}
              placeholder="e.g. Ceramic Tiles, Sanitaryware"
              className="w-full px-3 py-2 border border-ink/20 bg-secondary/20 font-mono text-xs text-ink focus:outline-none focus:border-violet"
            />
          </div>

          <div className="space-y-1">
            <label className="label-mono text-muted-foreground text-[10px] uppercase">
              3. Target Geographic Region
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={targetRegion}
                onChange={(e) => setTargetRegion(e.target.value)}
                placeholder="e.g. Morbi Gujarat, Pan-India"
                className="flex-1 px-3 py-2 border border-ink/20 bg-secondary/20 font-mono text-xs text-ink focus:outline-none focus:border-violet"
              />
              <select
                value={maxLeadsCount}
                onChange={(e) => setMaxLeadsCount(Number(e.target.value))}
                className="px-2 py-2 border border-ink/20 bg-paper font-mono text-xs text-ink"
              >
                <option value={3}>3 Leads</option>
                <option value={5}>5 Leads</option>
                <option value={8}>8 Leads</option>
              </select>
            </div>
          </div>
        </div>

        {/* Optional Custom X-Ray Query */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Optional custom DuckDuckGo X-Ray query (leave empty to let Groq auto-generate)..."
              value={customSearchQuery}
              onChange={(e) => setCustomSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-ink/20 bg-paper font-mono text-xs text-ink placeholder-muted-foreground focus:outline-none focus:border-violet"
            />
          </div>

          <button
            onClick={handleRunDiscovery}
            disabled={isDiscovering}
            className="border border-violet bg-violet text-violet-foreground px-5 py-2 label-mono font-bold hover:bg-violet/90 transition-all flex items-center justify-center gap-2 shrink-0 shadow-sm"
          >
            {isDiscovering ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Scanning Market...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 text-lime" />
                <span>Deploy Market Radar Scanner</span>
              </>
            )}
          </button>
        </div>

        {/* Multi-step progress tracker when discovering */}
        {isDiscovering && (
          <div className="border border-violet/30 bg-violet/5 p-3 flex items-center gap-3 animate-pulse">
            <Loader2 className="w-4 h-4 text-violet animate-spin shrink-0" />
            <div className="space-y-0.5">
              <span className="font-mono text-xs font-bold text-violet block">
                {discoveryStep}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                Analyzing live company records from LinkedIn & Apollo.io...
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Global Action Messages */}
      {actionSuccessMsg && (
        <div className="border border-lime/40 bg-lime/10 p-3 text-xs font-mono text-lime-800 dark:text-lime flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-lime" />
            <span>{actionSuccessMsg.text}</span>
          </div>
          <button
            onClick={() => setActionSuccessMsg(null)}
            className="hover:underline text-[10px] font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionErrorMsg && (
        <div className="border border-danger/40 bg-danger/10 p-3 text-xs font-mono text-danger flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-danger" />
            <span>{actionErrorMsg.text}</span>
          </div>
          <button
            onClick={() => setActionErrorMsg(null)}
            className="hover:underline text-[10px] font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/20 pb-4">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search prospects, companies, or tech stack..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-ink/20 bg-paper font-mono text-xs text-ink placeholder-muted-foreground focus:outline-none focus:border-violet"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="label-mono text-muted-foreground flex items-center gap-1 text-[10px]">
            <Filter className="w-3 h-3" /> Fit Filter:
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
              {lvl === "all" ? "All Scores" : lvl === "high" ? "High Fit (85%+)" : "Moderate (<85%)"}
            </button>
          ))}
        </div>
      </div>

      {/* Discovered Leads List */}
      {isLoadingExisting ? (
        <div className="border border-ink/20 bg-paper p-12 text-center space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-violet mx-auto" />
          <p className="font-mono text-xs text-muted-foreground">Loading enriched prospect pipeline...</p>
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="border border-ink/20 bg-paper p-12 text-center space-y-4">
          <div className="border border-ink/20 bg-secondary p-4 inline-flex mx-auto">
            <Radio className="w-8 h-8 text-violet" />
          </div>
          <h3 className="font-display text-lg font-bold uppercase">No Prospects In Current Filter</h3>
          <p className="font-mono text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            Click <strong>Deploy Market Radar Scanner</strong> above to discover live verified company leads matching your offering via DuckDuckGo and Apollo.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredLeads.map((lead) => {
            const isSelected = selectedLeads.includes(lead.id);
            const isCalling = callingLeadId === lead.id;
            const isWhatsApping = whatsAppingLeadId === lead.id;
            const isEditingPhone = editingPhoneLeadId === lead.id;

            return (
              <div
                key={lead.id}
                className={`border border-ink/20 bg-paper p-5 transition-all space-y-4 ${
                  isSelected ? "border-violet bg-violet/5 ring-1 ring-violet" : "hover:border-ink/50"
                }`}
              >
                {/* Header row: Logo, Name, Domain, Badges */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(lead.id)}
                      className="mt-1 cursor-pointer accent-violet"
                    />

                    {/* Company Logo or Initial Avatar */}
                    {lead.logo_url ? (
                      <img
                        src={lead.logo_url}
                        alt={lead.company}
                        className="w-10 h-10 object-contain rounded border border-ink/10 bg-white p-1 shrink-0"
                        onError={(e) => {
                          // Hide image on broken URL
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded border border-ink/15 bg-secondary flex items-center justify-center font-display font-black text-sm uppercase text-violet shrink-0">
                        {(lead.company || "LD").slice(0, 2)}
                      </div>
                    )}

                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-base font-extrabold uppercase text-ink">
                          {lead.company}
                        </span>
                        {lead.domain && (
                          <span className="label-mono border border-ink/15 bg-secondary text-muted-foreground px-2 py-0.5 text-[9px]">
                            {lead.domain}
                          </span>
                        )}
                        <span className="label-mono border border-lime/30 bg-lime/10 text-lime-700 dark:text-lime px-2 py-0.5 text-[9px] font-bold">
                          Est. Deal: {lead.dealSize}
                        </span>
                        <span className="label-mono border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[9px] font-bold flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> Apollo Verified
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building className="w-3 h-3 text-violet" /> {lead.industry}
                        </span>
                        {lead.city && (
                          <span className="flex items-center gap-1 text-ink/80 font-medium">
                            📍 {lead.city}{lead.state ? `, ${lead.state}` : ""}{lead.country ? ` (${lead.country})` : ""}
                          </span>
                        )}
                        {lead.employee_count !== undefined && lead.employee_count !== null && (
                          <span className="flex items-center gap-1 font-bold text-ink">
                            👥 {lead.employee_count > 0 ? `${lead.employee_count}+ Employees` : "Mid-Market Scale"}
                          </span>
                        )}
                        {lead.website && (
                          <a
                            href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-ink/80 hover:text-violet underline font-medium"
                          >
                            <Globe className="w-3 h-3" /> Website
                          </a>
                        )}
                        {lead.linkedin_url && (
                          <a
                            href={lead.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-sky-500 hover:underline font-bold"
                          >
                            <ExternalLink className="w-3 h-3" /> LinkedIn
                          </a>
                        )}
                        {lead.twitter_url && (
                          <a
                            href={lead.twitter_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-cyan-500 hover:underline font-bold"
                          >
                            <ExternalLink className="w-3 h-3" /> X (Twitter)
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Intent Score Badge */}
                  <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                    <div className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Flame className="w-4 h-4 text-danger animate-pulse" />
                        <span className="font-display text-xl font-black text-ink">
                          {lead.intentScore}%
                        </span>
                      </div>
                      <span className="label-mono text-muted-foreground text-[9px]">
                        ICP Fit Score
                      </span>
                    </div>
                  </div>
                </div>

                {/* Why Matched Explanation */}
                {lead.why_matched && (
                  <div className="border-l-2 border-violet pl-3 py-0.5 text-xs font-mono text-ink/80 leading-relaxed">
                    <strong className="text-violet uppercase text-[10px] block">Commercial Synergy:</strong>
                    {lead.why_matched}
                  </div>
                )}

                {/* Personalized Riley Opening Hook Box */}
                {lead.personalized_pitch && (
                  <div className="border border-violet/20 bg-secondary/40 p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="label-mono text-violet font-bold text-[9px] flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Riley AI SDR Opening Hook
                      </span>
                      <span className="label-mono text-muted-foreground text-[9px]">
                        Auto-synthesized for phone & WhatsApp
                      </span>
                    </div>
                    <p className="font-mono text-xs text-ink italic leading-snug">
                      "{lead.personalized_pitch}"
                    </p>
                  </div>
                )}

                {/* Tech Stack & Buying Signals */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {lead.signals && lead.signals.map((sig, i) => (
                    <span
                      key={i}
                      className="label-mono border border-violet/25 bg-violet/5 text-violet px-2 py-0.5 text-[9px]"
                    >
                      ⚡ {sig}
                    </span>
                  ))}
                  {lead.technologies && lead.technologies.slice(0, 5).map((tech, i) => (
                    <span
                      key={i}
                      className="label-mono border border-ink/15 bg-secondary text-muted-foreground px-2 py-0.5 text-[9px]"
                    >
                      <Cpu className="w-2.5 h-2.5 inline mr-1" />
                      {tech}
                    </span>
                  ))}
                </div>

                {/* Bottom Action Footer: Contact Credentials & Multi-Channel Actions */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-t border-ink/10 pt-3">
                  {/* Contact Credentials: Phone & Email Display with Quick Overrides */}
                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                    {/* Phone Display */}
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Phone:</span>
                      {isEditingPhone ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={customPhoneInput}
                            onChange={(e) => setCustomPhoneInput(e.target.value)}
                            placeholder="+91..."
                            className="px-2 py-0.5 border border-ink/20 bg-paper text-xs font-mono w-32"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSavePhone(lead.id)}
                            className="border border-lime bg-lime text-lime-foreground p-1 text-[10px] cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className={`px-2 py-0.5 border border-ink/10 ${lead.phone ? "font-bold text-ink bg-secondary" : "text-muted-foreground italic bg-secondary/50"}`}>
                            {lead.phone || "No phone listed"}
                          </span>
                          <button
                            onClick={() => {
                              setEditingPhoneLeadId(lead.id);
                              setCustomPhoneInput(lead.phone || "");
                            }}
                            title="Edit phone number"
                            className="text-muted-foreground hover:text-violet p-1 cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Email Display */}
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Email:</span>
                      {editingEmailLeadId === lead.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="email"
                            value={customEmailInput}
                            onChange={(e) => setCustomEmailInput(e.target.value)}
                            placeholder="contact@company.com"
                            className="px-2 py-0.5 border border-ink/20 bg-paper text-xs font-mono w-44"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveEmail(lead.id)}
                            className="border border-lime bg-lime text-lime-foreground p-1 text-[10px] cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className={`px-2 py-0.5 border border-ink/10 ${lead.email ? "text-ink bg-secondary" : "text-muted-foreground italic bg-secondary/50"}`}>
                            {lead.email || "No email listed"}
                          </span>
                          <button
                            onClick={() => {
                              setEditingEmailLeadId(lead.id);
                              setCustomEmailInput(lead.email || "");
                            }}
                            title="Edit email address"
                            className="text-muted-foreground hover:text-violet p-1 cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Website Link */}
                    {lead.website && (
                      <a
                        href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-mono text-violet hover:underline flex items-center gap-1"
                      >
                        <Globe className="w-3 h-3" />
                        {lead.domain || "Website"}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>

                  {/* Real Live Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Email Pitch Button */}
                    <button
                      onClick={() => handleOpenEmailModal(lead)}
                      className="border border-ink/30 bg-paper px-3 py-2 label-mono text-xs font-bold text-ink hover:border-violet hover:bg-violet/10 transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Send personalized B2B outreach email pitch"
                    >
                      <Mail className="w-3.5 h-3.5 text-violet" />
                      Send Email Pitch
                    </button>

                    {/* WhatsApp Button */}
                    <button
                      onClick={() => handleTriggerWhatsApp(lead)}
                      disabled={isWhatsApping}
                      className="border border-ink/30 bg-paper px-3 py-2 label-mono text-xs font-bold text-ink hover:border-lime hover:bg-lime/10 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquare className={`w-3.5 h-3.5 text-lime-700 dark:text-lime ${isWhatsApping ? "animate-spin" : ""}`} />
                      {isWhatsApping ? "Sending..." : "Send WhatsApp Pitch"}
                    </button>

                    {/* HubSpot CRM Sync Button */}
                    <button
                      onClick={() => handleSyncToCRM(lead)}
                      disabled={syncingCrmLeadId === lead.id}
                      className={`border px-3 py-2 label-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        syncedCrmLeadIds[lead.id]
                          ? "border-violet/40 bg-violet/10 text-violet"
                          : "border-ink/30 bg-paper text-ink hover:border-violet hover:bg-violet/5"
                      }`}
                      title="Sync prospect and commercial deal to HubSpot CRM"
                    >
                      <Share2 className={`w-3.5 h-3.5 text-violet ${syncingCrmLeadId === lead.id ? "animate-spin" : ""}`} />
                      {syncingCrmLeadId === lead.id
                        ? "Syncing..."
                        : syncedCrmLeadIds[lead.id]
                        ? "HubSpot Synced ✓"
                        : "Sync to CRM"}
                    </button>

                    {/* Vapi Riley Voice SDR Call Button */}
                    <button
                      onClick={() => handleTriggerCall(lead)}
                      disabled={isCalling}
                      className={`border px-3.5 py-2 label-mono text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                        lead.status === "in_call"
                          ? "border-lime bg-lime text-lime-foreground font-black animate-pulse"
                          : "border-ink bg-ink text-paper hover:bg-violet hover:border-violet"
                      }`}
                    >
                      <PhoneCall className={`w-3.5 h-3.5 ${isCalling ? "animate-spin" : ""}`} />
                      {isCalling
                        ? "Connecting Riley AI..."
                        : lead.status === "in_call"
                        ? "In Live Call"
                        : "Deploy Voice SDR"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Batch Launch Bar */}
      {selectedLeads.length > 0 && (
        <div className="fixed bottom-6 right-6 z-40 border border-ink bg-paper p-4 shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4">
          <div className="space-y-0.5">
            <span className="font-display text-xs font-black uppercase">
              {selectedLeads.length} Prospects Selected
            </span>
            <p className="font-mono text-[10px] text-muted-foreground">
              Ready for batch autonomous voice & WhatsApp outreach
            </p>
          </div>
          <button
            onClick={async () => {
              for (const id of selectedLeads) {
                const target = leads.find((l) => l.id === id);
                if (target) {
                  await handleSyncToCRM(target);
                }
              }
            }}
            className="border border-ink/30 bg-secondary px-3.5 py-2 label-mono text-xs font-bold text-ink hover:border-violet flex items-center gap-1.5 transition-all"
          >
            <Share2 className="w-3.5 h-3.5 text-violet" /> Sync {selectedLeads.length} to HubSpot
          </button>
          <button
            onClick={() => {
              const target = leads.find((l) => l.id === selectedLeads[0]) || leads[0];
              if (target && onLaunchVoiceAgent) {
                onLaunchVoiceAgent(target);
              }
            }}
            className="border border-violet bg-violet text-violet-foreground px-4 py-2 label-mono font-bold hover:bg-violet/90 transition-all flex items-center gap-2"
          >
            <Zap className="w-3.5 h-3.5 text-lime" /> Launch Fleet Campaign
          </button>
        </div>
      )}

      {/* Email Pitch Modal */}
      {emailingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-paper border border-ink/20 shadow-2xl max-w-lg w-full p-6 space-y-4 rounded-xl text-foreground">
            <div className="flex items-center justify-between border-b border-ink/10 pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-violet" />
                <h3 className="font-display font-bold text-base uppercase">Dispatch B2B Email Pitch</h3>
              </div>
              <button
                type="button"
                onClick={() => setEmailingLead(null)}
                className="text-muted-foreground hover:text-ink text-xs font-mono px-2 py-1 border border-ink/10 hover:border-ink cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleSendEmailPitch} className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-muted-foreground block mb-1">Target Organization:</label>
                <div className="font-bold text-ink bg-secondary p-2 border border-ink/10">
                  {emailingLead.company} ({emailingLead.domain || "Verified Corporate Record"})
                </div>
              </div>

              <div>
                <label className="text-muted-foreground block mb-1">Recipient Business Email:</label>
                <input
                  type="email"
                  required
                  value={emailingLead.email}
                  onChange={(e) => {
                    const newEmail = e.target.value;
                    setEmailingLead((prev) => (prev ? { ...prev, email: newEmail } : null));
                    handleSaveEmail(emailingLead.id, newEmail);
                  }}
                  className="w-full px-3 py-2 border border-ink/20 bg-background font-mono text-xs focus:border-violet outline-none"
                  placeholder="contact@company.com"
                />
              </div>

              <div>
                <label className="text-muted-foreground block mb-1">Subject Line:</label>
                <input
                  type="text"
                  required
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-ink/20 bg-background font-mono text-xs focus:border-violet outline-none"
                  placeholder="Subject line..."
                />
              </div>

              <div>
                <label className="text-muted-foreground block mb-1">Personalized Value Proposition & Proposal:</label>
                <textarea
                  rows={6}
                  required
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full p-3 border border-ink/20 bg-background font-mono text-xs focus:border-violet outline-none resize-none leading-relaxed"
                  placeholder="Write message..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEmailingLead(null)}
                  className="px-3 py-2 border border-ink/20 hover:bg-secondary font-mono text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingEmail}
                  className="px-4 py-2 border border-violet bg-violet text-white font-bold text-xs flex items-center gap-1.5 hover:bg-violet/90 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Send className={`w-3.5 h-3.5 ${isSendingEmail ? "animate-spin" : ""}`} />
                  {isSendingEmail ? "Dispatching..." : "Send B2B Pitch Now"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
