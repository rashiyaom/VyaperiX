import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { getApiBase, getAuthHeaders as getApiAuthHeaders } from "@/lib/api";
import {
  Video,
  Play,
  Square,
  CheckSquare,
  Clock,
  Sparkles,
  Bot,
  User,
  RefreshCw,
  Search,
  X,
  Copy,
  Check,
  AlertTriangle,
  ArrowUpRight,
  ShieldCheck,
  ExternalLink,
  MessageSquare,
  Flame,
  FileText,
  Sliders,
  ChevronRight,
  PhoneOff,
} from "lucide-react";

export interface VideoCallRecord {
  id: string;
  user_id?: string;
  report_id?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  business_name: string;
  call_reason: string;
  status: "queued" | "active" | "analyzing" | "ended" | string;
  tavus_conversation_id?: string;
  tavus_persona_id?: string;
  conversation_url?: string;
  duration_seconds: number;
  conversational_context?: string;
  custom_greeting?: string;
  briefing?: any;
  transcript: Array<{
    speaker: "agent" | "customer";
    message: string;
    timestamp: string;
  }>;
  recording_url?: string;
  analysis?: {
    summary?: string;
    call_outcome?: string;
    sentiment?: "positive" | "neutral" | "negative" | string;
    intent_score?: number;
    lead_temperature?: "Hot" | "Warm" | "Cold" | string;
    key_points_discussed?: string[];
    customer_concerns?: string[];
    action_items?: string[];
    agent_performance_review?: string;
  };
  error_message?: string;
  started_at?: string;
  ended_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface ReportItem {
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

export interface VideoMeetingModuleProps {
  analysis?: any;
  companyName?: string;
  industry?: string;
  reports?: ReportItem[];
  onNavigateToIntelligence?: () => void;
}

const API_BASE = getApiBase();

export function VideoMeetingModule({
  analysis,
  companyName = "",
  industry = "",
  reports = [],
  onNavigateToIntelligence,
}: VideoMeetingModuleProps) {
  const { user, session } = useAuth();

  // Tab State: "start" (Start Meeting) | "history" (Meeting History)
  const [activeTab, setActiveTab] = useState<"start" | "history">("start");

  // Report Selection & Launch State
  const [selectedReportId, setSelectedReportId] = useState<string | null>(() => {
    const doneReports = (reports || []).filter((r) => r.status === "done");
    return doneReports.length > 0 ? (doneReports[0]?.id ?? null) : null;
  });
  const [fallbackReports, setFallbackReports] = useState<ReportItem[]>([]);
  const [startingMeeting, setStartingMeeting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Active Live Meeting State
  const [activeMeeting, setActiveMeeting] = useState<{
    id: string;
    conversation_url: string;
    company_name: string;
    report_id: string;
  } | null>(null);
  const [endingMeeting, setEndingMeeting] = useState(false);
  const [meetingEndNotice, setMeetingEndNotice] = useState<string | null>(null);

  // Meeting History State
  const [meetings, setMeetings] = useState<VideoCallRecord[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "analyzing" | "ended">("all");

  // Detail Modal State
  const [selectedMeeting, setSelectedMeeting] = useState<VideoCallRecord | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<"transcript" | "analysis">("analysis");
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [checkedActionItems, setCheckedActionItems] = useState<Record<string, boolean>>({});
  const [syncingMeeting, setSyncingMeeting] = useState(false);

  // Auth Header helper
  const getAuthHeaders = () => {
    return getApiAuthHeaders(session?.access_token);
  };

  // Combine reports from props or fallback query
  const effectiveReports = reports !== undefined ? reports : fallbackReports;
  const completedReports = effectiveReports.filter((r) => r.status === "done");

  // Fallback fetch ONLY if reports prop was completely omitted
  useEffect(() => {
    if (reports === undefined) {
      const validUserId = user?.id && user.id !== "undefined" && user.id !== "null" ? user.id : null;
      if (!validUserId) return;
      const fetchReports = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/reports?user_id=${encodeURIComponent(validUserId)}`, { headers: getAuthHeaders() });
          if (res.ok) {
            const data = await res.json();
            const safeData = Array.isArray(data) ? data : [];
            setFallbackReports(safeData);
            const done = safeData.filter((r: any) => r.status === "done");
            if (done.length > 0 && !selectedReportId) {
              setSelectedReportId(done[0].id);
            }
          }
        } catch {
          // Non-critical fallback
        }
      };
      fetchReports();
    }
  }, [reports, user?.id]);

  // Keep selectedReportId in sync when completed reports change
  useEffect(() => {
    if (completedReports.length === 0) {
      setSelectedReportId(null);
    } else if (!selectedReportId || !completedReports.some((r) => r.id === selectedReportId)) {
      setSelectedReportId(completedReports[0]?.id ?? null);
    }
  }, [completedReports, selectedReportId]);

  // Fetch Video Meetings list
  const fetchMeetings = async () => {
    setLoadingMeetings(true);
    try {
      const res = await fetch(`${API_BASE}/api/video/meetings?limit=100`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setMeetings(Array.isArray(data) ? data : []);
      }
    } catch {
      // Ignored
    } finally {
      setLoadingMeetings(false);
    }
  };

  // Fetch single fresh meeting details (for modal or updating a card)
  const fetchMeetingDetails = async (id: string, updateModalTab = false) => {
    try {
      const res = await fetch(`${API_BASE}/api/video/meetings/${id}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const freshCall = await res.json();
        setSelectedMeeting(freshCall);
        setMeetings((prev) => prev.map((m) => (m.id === freshCall.id ? freshCall : m)));
        if (updateModalTab && freshCall.analysis) {
          setActiveModalTab("analysis");
        }
        return freshCall;
      }
    } catch (err) {
      console.warn("Failed to fetch fresh call details", err);
    }
    return null;
  };

  // Open modal and immediately query backend for fresh transcript/analysis
  const handleOpenDetailModal = (call: VideoCallRecord) => {
    setSelectedMeeting(call);
    setActiveModalTab(call.analysis ? "analysis" : "transcript");
    fetchMeetingDetails(call.id, true);
  };

  // Force active sync from Tavus
  const handleSyncMeeting = async (id: string) => {
    setSyncingMeeting(true);
    try {
      const res = await fetch(`${API_BASE}/api/video/meetings/${id}/sync`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const freshCall = await res.json();
        setSelectedMeeting(freshCall);
        setMeetings((prev) => prev.map((m) => (m.id === freshCall.id ? freshCall : m)));
        if (freshCall.analysis) {
          setActiveModalTab("analysis");
        }
      }
    } catch (err) {
      console.warn("Sync failed", err);
    } finally {
      setSyncingMeeting(false);
    }
  };

  // Auto-fetch on tab change or mount
  useEffect(() => {
    fetchMeetings();
  }, [activeTab]);

  // Auto-refresh list when any meeting is in 'analyzing' status to track Groq completion
  useEffect(() => {
    const hasAnalyzing = meetings.some((m) => m.status === "analyzing");
    if (!hasAnalyzing) return;

    const interval = setInterval(() => {
      fetchMeetings();
    }, 4000);

    return () => clearInterval(interval);
  }, [meetings]);

  // Auto-poll when modal is open and meeting is analyzing or missing transcript
  useEffect(() => {
    if (!selectedMeeting) return;
    const needsPolling =
      selectedMeeting.status === "analyzing" ||
      (selectedMeeting.status === "ended" &&
        (!selectedMeeting.transcript || selectedMeeting.transcript.length === 0 || !selectedMeeting.analysis));

    if (!needsPolling) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/video/meetings/${selectedMeeting.id}`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const updated = await res.json();
          setSelectedMeeting(updated);
          setMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }
      } catch {
        // Ignore
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedMeeting?.id, selectedMeeting?.status, selectedMeeting?.transcript?.length, selectedMeeting?.analysis]);

  // Format Duration helper
  const formatDuration = (secs?: number) => {
    if (!secs || secs <= 0) return "0s";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  // ── Action: Start Meeting ─────────────────────────────────────────────
  const handleStartMeeting = async () => {
    if (!selectedReportId) {
      setStartError("Please select a completed company dossier first.");
      return;
    }

    setStartError(null);
    setMeetingEndNotice(null);
    setStartingMeeting(true);

    try {
      const res = await fetch(`${API_BASE}/api/video/meetings/start`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ report_id: selectedReportId }),
      });

      const data = await res.json().catch(() => ({
        detail: `Server responded with status ${res.status}: ${res.statusText}`,
      }));

      if (!res.ok) {
        const errorMsg =
          data.detail ||
          data.message ||
          "Failed to start video meeting. Please check server configuration or Tavus API credentials.";
        setStartError(errorMsg);
        setStartingMeeting(false);
        return;
      }

      const selectedReport = completedReports.find((r) => r.id === selectedReportId);
      const repCompany =
        selectedReport?.analysis?.company_name ||
        selectedReport?.input_urls?.business_description ||
        "Enterprise Prospect";

      setActiveMeeting({
        id: data.video_call_id,
        conversation_url: data.conversation_url,
        company_name: repCompany,
        report_id: selectedReportId,
      });

      // Refresh meetings list in background
      fetchMeetings();
    } catch (err: any) {
      setStartError(
        err.message ||
          "Network error while contacting video agent service. Please ensure the backend server is reachable."
      );
    } finally {
      setStartingMeeting(false);
    }
  };

  // ── Action: End Meeting ───────────────────────────────────────────────
  const handleEndMeeting = async () => {
    if (!activeMeeting) return;

    setEndingMeeting(true);
    try {
      await fetch(`${API_BASE}/api/video/meetings/${activeMeeting.id}/end`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
    } catch {
      // Non-fatal: even on error, clear active meeting and return to picker
    } finally {
      setActiveMeeting(null);
      setEndingMeeting(false);
      setMeetingEndNotice(
        "Meeting concluded successfully. Mitra's post-call transcript and Groq AI review are now processing in Meeting History."
      );
      fetchMeetings();
    }
  };

  // Filtered meetings list for history view
  const filteredMeetings = meetings.filter((m) => {
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.business_name?.toLowerCase().includes(q) ||
      m.customer_name?.toLowerCase().includes(q) ||
      m.call_reason?.toLowerCase().includes(q) ||
      m.id?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* ── TOP NAV BAR & STATS HEADER ─────────────────────────────── */}
      <div className="border-2 border-ink bg-paper p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 border border-violet/40 bg-violet/10 text-violet px-2 py-0.5 label-mono text-[10px] font-bold">
              <Video className="w-3.5 h-3.5" /> TAVUS CVI v2
            </span>
            <span className="label-mono text-muted-foreground text-[10px]">
              AI VIDEO SALES AVATAR · MITRA
            </span>
          </div>
          <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">
            Video Sales Agent
          </h2>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">
            Real-time interactive buyer discovery meetings powered by Tavus avatar intelligence and Groq analysis.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2 border border-ink/20 bg-secondary/30 p-1 font-mono text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("start")}
            className={`px-4 py-2 font-bold uppercase transition-all flex items-center gap-2 ${
              activeTab === "start"
                ? "border border-ink bg-paper text-ink shadow-sm"
                : "text-muted-foreground hover:text-ink"
            }`}
          >
            <Video className="w-3.5 h-3.5 text-violet" />
            Start Meeting
            {activeMeeting && (
              <span className="w-2 h-2 rounded-full bg-lime animate-ping inline-block" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 font-bold uppercase transition-all flex items-center gap-2 ${
              activeTab === "history"
                ? "border border-ink bg-paper text-ink shadow-sm"
                : "text-muted-foreground hover:text-ink"
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-violet" />
            Meeting History
            {meetings.length > 0 && (
              <span className="border border-ink/20 bg-secondary px-1.5 py-0.2 text-[10px] font-bold text-ink">
                {meetings.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* VIEW 1: START MEETING                                         */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === "start" && (
        <div className="space-y-6">
          {/* Active Live Video Session View */}
          {activeMeeting ? (
            <div className="border-2 border-ink bg-paper flex flex-col">
              {/* Meeting Header Bar */}
              <div className="border-b-2 border-ink bg-secondary/40 p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 border border-lime/50 bg-lime/10 text-lime-700 dark:text-lime px-2.5 py-0.5 label-mono text-[10px] font-bold">
                      <span className="w-2 h-2 rounded-full bg-lime animate-pulse inline-block" />
                      LIVE ROOM ACTIVE
                    </span>
                    <span className="label-mono text-muted-foreground text-[10px]">
                      CALL ID: {activeMeeting.id.slice(0, 8)}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-bold uppercase text-ink">
                    Sales Meeting with Mitra · {activeMeeting.company_name}
                  </h3>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href={activeMeeting.conversation_url}
                    target="_blank"
                    rel="noreferrer"
                    className="border border-ink/20 bg-paper px-3 py-2 label-mono text-xs font-bold text-ink hover:bg-secondary flex items-center gap-1.5 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open in New Tab
                  </a>
                  <button
                    type="button"
                    onClick={handleEndMeeting}
                    disabled={endingMeeting}
                    className="border border-danger bg-danger text-paper hover:bg-danger/90 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all disabled:opacity-50 shadow-sm"
                  >
                    {endingMeeting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <PhoneOff className="w-3.5 h-3.5" />
                    )}
                    {endingMeeting ? "Ending Meeting..." : "End Meeting"}
                  </button>
                </div>
              </div>

              {/* Full-size Embedded Video Frame */}
              <div className="w-full h-[72vh] min-h-[580px] bg-black relative">
                <iframe
                  src={activeMeeting.conversation_url}
                  allow="camera; microphone; display-capture; autoplay; encrypted-media"
                  className="w-full h-full border-0"
                  title="Tavus AI Video Sales Meeting Room"
                />
              </div>
            </div>
          ) : (
            /* Report Picker & Meeting Setup View */
            <div className="space-y-6">
              {/* Notice Banner when a previous call just ended */}
              {meetingEndNotice && (
                <div className="border border-lime/40 bg-lime/10 text-lime-700 dark:text-lime p-4 font-mono text-xs flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0 text-lime-700 dark:text-lime" />
                    <span>{meetingEndNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("history")}
                    className="border border-lime/40 bg-paper px-3 py-1 font-bold text-ink hover:bg-secondary transition-all"
                  >
                    View in Meeting History &rarr;
                  </button>
                </div>
              )}

              {/* Inline Error Banner if Start Meeting Fails */}
              {startError && (
                <div className="border border-danger bg-danger/10 text-danger p-4 font-mono text-xs flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block uppercase mb-0.5">
                        Unable to start video meeting
                      </span>
                      <p className="leading-relaxed">{startError}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStartError(null)}
                    className="border border-danger/30 p-1 hover:bg-danger/20 text-danger transition-colors shrink-0"
                    title="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Dossier Selection Panel */}
              <div className="border-2 border-ink bg-paper p-6 space-y-5">
                <div className="border-b border-ink/15 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="label-mono text-violet text-[10px] font-bold block uppercase">
                      STEP 1 · SELECT COMMERCIAL DOSSIER
                    </span>
                    <h3 className="font-display text-xl font-bold uppercase text-ink">
                      Brief Mitra with Intelligence
                    </h3>
                  </div>
                  <span className="label-mono text-muted-foreground text-xs">
                    {completedReports.length} Completed Dossier{completedReports.length === 1 ? "" : "s"} Available
                  </span>
                </div>

                {completedReports.length === 0 ? (
                  <div className="border border-ink/20 bg-secondary/20 p-8 text-center space-y-4">
                    <FileText className="w-8 h-8 text-muted-foreground mx-auto" />
                    <div className="space-y-1">
                      <p className="font-display text-base font-bold uppercase text-ink">
                        No Completed Intelligence Dossiers Found
                      </p>
                      <p className="font-mono text-xs text-muted-foreground max-w-md mx-auto">
                        Mitra requires a completed commercial report (status "done") to construct customized conversational context, buyer pain points, and personalized greetings.
                      </p>
                    </div>
                    {onNavigateToIntelligence && (
                      <button
                        type="button"
                        onClick={onNavigateToIntelligence}
                        className="border border-ink bg-paper px-4 py-2 font-mono text-xs font-bold text-ink hover:bg-secondary transition-all inline-flex items-center gap-2"
                      >
                        Launch Intelligence Suite &rarr;
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {completedReports.map((rep) => {
                      const isSelected = selectedReportId === rep.id;
                      const repCompanyName =
                        rep.analysis?.company_name ||
                        rep.input_urls?.business_description ||
                        "Enterprise Prospect";
                      const repIndustry = rep.analysis?.industry || "Commercial B2B";
                      const repScore = rep.analysis?.opportunity_score;
                      const repSummary =
                        rep.analysis?.one_line_summary ||
                        rep.input_urls?.website ||
                        "Ready for AI discovery call briefing.";

                      return (
                        <div
                          key={rep.id}
                          onClick={() => setSelectedReportId(rep.id)}
                          className={`cursor-pointer p-4 border transition-all space-y-2.5 relative ${
                            isSelected
                              ? "border-2 border-violet bg-violet/5 shadow-sm"
                              : "border border-ink/20 bg-paper hover:border-ink/50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-0.5">
                              <span className="label-mono text-[9px] text-muted-foreground block">
                                ID: {rep.id.slice(0, 8)} · {new Date(rep.created_at).toLocaleDateString()}
                              </span>
                              <h4 className="font-display text-base font-bold uppercase text-ink">
                                {repCompanyName}
                              </h4>
                            </div>

                            <div className="flex items-center gap-2">
                              {repScore !== undefined && (
                                <span className="border border-lime/40 bg-lime/10 text-lime-700 dark:text-lime px-2 py-0.5 label-mono text-[9px] font-bold">
                                  Score: {repScore}%
                                </span>
                              )}
                              <div
                                className={`w-4 h-4 border flex items-center justify-center ${
                                  isSelected
                                    ? "border-violet bg-violet text-violet-foreground"
                                    : "border-ink/30 bg-paper"
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3" />}
                              </div>
                            </div>
                          </div>

                          <span className="label-mono border border-ink/15 bg-secondary/30 px-2 py-0.5 text-[9px] text-ink inline-block">
                            {repIndustry}
                          </span>

                          <p className="font-mono text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {repSummary}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Step 2: Start Meeting Action Bar */}
                <div className="border-t border-ink/15 pt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="label-mono text-muted-foreground text-[10px] block">
                      CAMERA & MICROPHONE GRANTED PERMISSIONS REQUIRED (allow="camera; microphone")
                    </span>
                    <p className="font-mono text-xs text-ink font-medium">
                      Mitra will greet you directly using briefing insights derived from the selected dossier.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleStartMeeting}
                    disabled={!selectedReportId || startingMeeting || completedReports.length === 0}
                    className="border-2 border-violet bg-violet text-violet-foreground hover:bg-violet/90 px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shrink-0"
                  >
                    {startingMeeting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Initializing Mitra Avatar...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        Start Video Meeting
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* VIEW 2: MEETING HISTORY                                       */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === "history" && (
        <div className="space-y-4">
          {/* Filter & Search Bar */}
          <div className="border-2 border-ink bg-paper p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Search meetings by company or reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-0 font-mono text-xs text-ink placeholder:text-muted-foreground focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap font-mono text-xs">
              <span className="label-mono text-muted-foreground text-[10px]">Filter:</span>
              {(["all", "active", "analyzing", "ended"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-[10px] font-bold uppercase border transition-all ${
                    statusFilter === st
                      ? "border-violet bg-violet text-violet-foreground"
                      : "border-ink/20 bg-paper text-muted-foreground hover:text-ink"
                  }`}
                >
                  {st}
                </button>
              ))}

              <button
                type="button"
                onClick={fetchMeetings}
                disabled={loadingMeetings}
                className="border border-ink/20 bg-secondary/30 hover:bg-secondary px-2.5 py-1 text-[10px] font-bold text-ink flex items-center gap-1 transition-all ml-2"
                title="Refresh meeting logs"
              >
                <RefreshCw className={`w-3 h-3 ${loadingMeetings ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Meeting Logs List */}
          {filteredMeetings.length === 0 ? (
            <div className="border-2 border-ink bg-paper p-12 text-center space-y-3">
              <Video className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="font-display text-base font-bold uppercase text-ink">
                No Video Meetings Found
              </p>
              <p className="font-mono text-xs text-muted-foreground max-w-sm mx-auto">
                {searchQuery || statusFilter !== "all"
                  ? "No video meetings match the current filter or search criteria."
                  : "Launch a video sales meeting from the 'Start Meeting' tab to see entries here."}
              </p>
            </div>
          ) : (
            <div className="border-2 border-ink bg-paper divide-y divide-ink/15">
              {filteredMeetings.map((call) => {
                const isAnalyzing = call.status === "analyzing";
                const isActive = call.status === "active";
                const isEnded = call.status === "ended";

                return (
                  <div
                    key={call.id}
                    className="p-4 hover:bg-secondary/15 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Distinct Visual Status Treatment */}
                        {isAnalyzing ? (
                          <span className="inline-flex items-center gap-1.5 border border-violet/50 bg-violet/10 text-violet px-2.5 py-0.5 text-[9px] font-bold label-mono animate-pulse">
                            <Sparkles className="w-3 h-3 text-violet animate-spin" />
                            ANALYZING (AI REVIEW IN PROGRESS)
                          </span>
                        ) : isActive ? (
                          <span className="inline-flex items-center gap-1.5 border border-lime/50 bg-lime/10 text-lime-700 dark:text-lime px-2 py-0.5 text-[9px] font-bold label-mono">
                            <span className="w-2 h-2 rounded-full bg-lime animate-ping inline-block" />
                            LIVE ROOM
                          </span>
                        ) : isEnded ? (
                          <span className="inline-flex items-center gap-1 border border-ink/20 bg-secondary/30 text-ink/70 px-2 py-0.5 text-[9px] font-bold label-mono">
                            <Check className="w-3 h-3 text-muted-foreground" />
                            ENDED
                          </span>
                        ) : (
                          <span className="border border-ink/20 bg-paper text-muted-foreground px-2 py-0.5 text-[9px] font-bold label-mono uppercase">
                            {call.status}
                          </span>
                        )}

                        <span className="label-mono text-muted-foreground text-[10px]">
                          ID: {call.id.slice(0, 8)}
                        </span>

                        <span className="label-mono text-muted-foreground text-[10px]">
                          {new Date(call.created_at).toLocaleString()}
                        </span>
                      </div>

                      <h4 className="font-display text-base font-bold uppercase text-ink truncate">
                        {call.business_name || "Enterprise Consultation"}
                      </h4>

                      <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground flex-wrap">
                        <span>Duration: {formatDuration(call.duration_seconds)}</span>
                        <span>·</span>
                        <span>{call.transcript?.length || 0} transcript turns</span>
                        {call.analysis?.sentiment && (
                          <>
                            <span>·</span>
                            <span
                              className={`font-bold uppercase ${
                                call.analysis.sentiment === "positive"
                                  ? "text-lime-700 dark:text-lime"
                                  : call.analysis.sentiment === "negative"
                                  ? "text-danger"
                                  : "text-ink"
                              }`}
                            >
                              Sentiment: {call.analysis.sentiment}
                            </span>
                          </>
                        )}
                        {call.analysis?.intent_score !== undefined && (
                          <>
                            <span>·</span>
                            <span className="text-violet font-bold">
                              Intent: {call.analysis.intent_score}%
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenDetailModal(call)}
                        className="border border-ink/20 bg-paper hover:border-violet hover:text-violet px-3.5 py-1.5 font-mono text-xs font-bold text-ink transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        View Analysis & Transcript
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* CALL ANALYSIS MODAL (MATCHING MODULES/VOICE)                  */}
      {/* ───────────────────────────────────────────────────────────── */}
      {selectedMeeting && (
        <div className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="border-2 border-ink bg-paper w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="border-b border-ink/20 p-5 bg-secondary/30 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 border border-violet/40 bg-violet/10 text-violet px-2 py-0.5 text-[9px] font-bold label-mono">
                    <Video className="w-3 h-3" /> TAVUS AVATAR (MITRA)
                  </span>
                  {selectedMeeting.status === "analyzing" ? (
                    <span className="border border-violet/50 bg-violet/10 text-violet px-2 py-0.5 text-[9px] font-bold label-mono animate-pulse">
                      ANALYZING...
                    </span>
                  ) : (
                    <span className="border border-ink/20 bg-paper text-ink px-2 py-0.5 text-[9px] font-bold label-mono uppercase">
                      STATUS: {selectedMeeting.status}
                    </span>
                  )}
                  <span className="label-mono text-muted-foreground text-[10px]">
                    ID: {selectedMeeting.id.slice(0, 8)}
                  </span>
                </div>
                <h3 className="font-display text-xl font-bold uppercase text-ink">
                  {selectedMeeting.business_name}
                </h3>
                <p className="font-mono text-xs text-muted-foreground">
                  Reason: {selectedMeeting.call_reason || "Commercial Video Discovery"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSyncMeeting(selectedMeeting.id)}
                  disabled={syncingMeeting}
                  className="border border-ink/20 bg-paper hover:border-violet hover:text-violet px-3 py-1.5 font-mono text-xs font-bold text-ink transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  title="Fetch latest transcript turns and AI review from Tavus"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingMeeting ? "animate-spin text-violet" : ""}`} />
                  {syncingMeeting ? "Syncing..." : "Sync with Tavus"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMeeting(null)}
                  className="border border-ink/20 p-1.5 hover:bg-danger hover:text-paper transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-ink/20 bg-secondary/10 px-5 gap-4 font-mono text-xs">
              <button
                type="button"
                onClick={() => setActiveModalTab("transcript")}
                className={`py-3 font-bold uppercase border-b-2 transition-all flex items-center gap-1.5 ${
                  activeModalTab === "transcript"
                    ? "border-violet text-violet"
                    : "border-transparent text-muted-foreground hover:text-ink"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" /> Timely Transcript ({selectedMeeting.transcript?.length || 0} turns)
              </button>
              <button
                type="button"
                onClick={() => setActiveModalTab("analysis")}
                className={`py-3 font-bold uppercase border-b-2 transition-all flex items-center gap-1.5 ${
                  activeModalTab === "analysis"
                    ? "border-violet text-violet"
                    : "border-transparent text-muted-foreground hover:text-ink"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-violet" /> Groq AI Call Review & Analysis
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 font-mono text-xs">
              {/* TAB 1: Timely Transcript */}
              {activeModalTab === "transcript" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-ink/10 pb-2">
                    <span className="text-muted-foreground text-[10px] uppercase font-bold">
                      Call Duration: {formatDuration(selectedMeeting.duration_seconds)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const fullText = (selectedMeeting.transcript || [])
                          .map((t) => `[${t.timestamp}] ${t.speaker.toUpperCase()}: ${t.message}`)
                          .join("\n");
                        navigator.clipboard.writeText(fullText);
                        setCopiedTranscript(true);
                        setTimeout(() => setCopiedTranscript(false), 2000);
                      }}
                      className="border border-ink/20 px-2.5 py-1 text-[10px] font-bold flex items-center gap-1 hover:bg-secondary transition-all text-ink"
                    >
                      {copiedTranscript ? <Check className="w-3 h-3 text-lime-700 dark:text-lime" /> : <Copy className="w-3 h-3" />}
                      {copiedTranscript ? "Copied!" : "Copy Full Transcript"}
                    </button>
                  </div>

                  {(!selectedMeeting.transcript || selectedMeeting.transcript.length === 0) ? (
                    <div className="border border-ink/15 bg-secondary/10 p-6 text-center text-muted-foreground">
                      No transcript turns recorded yet. Transcript will be populated once processed by Tavus transcription.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedMeeting.transcript.map((turn, i) => (
                        <div
                          key={i}
                          className={`p-3.5 space-y-1.5 border ${
                            turn.speaker === "agent"
                              ? "border-violet/30 bg-violet/5 text-ink ml-6"
                              : "border-ink/15 bg-paper mr-6 text-ink"
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span className="font-bold flex items-center gap-1.5">
                              {turn.speaker === "agent" ? (
                                <>
                                  <Bot className="w-3.5 h-3.5 text-violet" /> Mitra AI Video Avatar (Tavus PAL)
                                </>
                              ) : (
                                <>
                                  <User className="w-3.5 h-3.5 text-muted-foreground" /> Prospect ({selectedMeeting.customer_name || "Customer"})
                                </>
                              )}
                            </span>
                            <span className="border border-ink/15 bg-paper px-1.5 py-0.2 text-[9px]">
                              {turn.timestamp}
                            </span>
                          </div>
                          <p className="leading-relaxed text-xs">{turn.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Groq AI Call Review */}
              {activeModalTab === "analysis" && (
                <div className="space-y-5">
                  {selectedMeeting.status === "analyzing" && (
                    <div className="border border-violet/40 bg-violet/10 p-5 space-y-2 text-violet">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 animate-spin" />
                        <span className="font-bold uppercase text-xs">AI Synthesis In Progress</span>
                      </div>
                      <p className="font-mono text-xs text-ink/80 leading-relaxed">
                        Groq LLM is currently synthesizing the dialogue turns into an executive summary, evaluating buyer qualification, and identifying key action items. This usually takes 5-10 seconds.
                      </p>
                    </div>
                  )}

                  {selectedMeeting.analysis ? (
                    <>
                      {/* Top Metric Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="border border-ink/15 bg-secondary/20 p-4 space-y-1">
                          <span className="label-mono text-muted-foreground text-[9px] block">Call Disposition</span>
                          <span className="font-display text-base font-bold text-ink">
                            {selectedMeeting.analysis.call_outcome || "Meeting Completed"}
                          </span>
                        </div>

                        <div className="border border-ink/15 bg-secondary/20 p-4 space-y-1">
                          <span className="label-mono text-muted-foreground text-[9px] block">Intent Qualification</span>
                          <div className="flex items-center gap-2">
                            <span className="font-display text-xl font-black text-violet">
                              {selectedMeeting.analysis.intent_score !== undefined
                                ? `${selectedMeeting.analysis.intent_score}%`
                                : "—"}
                            </span>
                            <span
                              className={`label-mono px-2 py-0.5 text-[9px] font-bold ${
                                selectedMeeting.analysis.lead_temperature === "Hot"
                                  ? "border border-danger/40 bg-danger/10 text-danger"
                                  : "border border-amber-500/40 bg-amber-500/10 text-amber-600"
                              }`}
                            >
                              {selectedMeeting.analysis.lead_temperature || "Warm"}
                            </span>
                          </div>
                        </div>

                        <div className="border border-ink/15 bg-secondary/20 p-4 space-y-1">
                          <span className="label-mono text-muted-foreground text-[9px] block">Sentiment</span>
                          <span
                            className={`font-display text-base font-bold uppercase ${
                              selectedMeeting.analysis.sentiment === "positive"
                                ? "text-lime-700 dark:text-lime"
                                : selectedMeeting.analysis.sentiment === "negative"
                                ? "text-danger"
                                : "text-ink"
                            }`}
                          >
                            {selectedMeeting.analysis.sentiment || "Neutral"}
                          </span>
                        </div>
                      </div>

                      {/* Executive Summary */}
                      {selectedMeeting.analysis.summary && (
                        <div className="border border-ink/15 bg-paper p-4 space-y-2">
                          <span className="label-mono text-violet text-[10px] font-bold block uppercase">
                            Executive Conversation Summary
                          </span>
                          <p className="text-xs text-ink leading-relaxed">
                            {selectedMeeting.analysis.summary}
                          </p>
                        </div>
                      )}

                      {/* Key Discussion Points */}
                      {selectedMeeting.analysis.key_points_discussed && selectedMeeting.analysis.key_points_discussed.length > 0 && (
                        <div className="border border-ink/15 bg-paper p-4 space-y-2">
                          <span className="label-mono text-muted-foreground text-[10px] font-bold block uppercase">
                            Key Factual Points Discussed
                          </span>
                          <ul className="space-y-1 text-xs text-ink list-disc list-inside">
                            {selectedMeeting.analysis.key_points_discussed.map((pt, idx) => (
                              <li key={idx}>{pt}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Customer Objections or Concerns */}
                      {selectedMeeting.analysis.customer_concerns && selectedMeeting.analysis.customer_concerns.length > 0 && (
                        <div className="border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
                          <span className="label-mono text-amber-700 dark:text-amber-400 text-[10px] font-bold block uppercase">
                            Customer Objections & Hesitations Raised
                          </span>
                          <ul className="space-y-1 text-xs text-ink list-disc list-inside">
                            {selectedMeeting.analysis.customer_concerns.map((ob, idx) => (
                              <li key={idx}>{ob}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Action Items Checklist */}
                      {selectedMeeting.analysis.action_items && selectedMeeting.analysis.action_items.length > 0 && (
                        <div className="border border-lime/30 bg-lime/5 p-4 space-y-2">
                          <span className="label-mono text-lime-700 dark:text-lime text-[10px] font-bold block uppercase">
                            Recommended Action Items & Next Steps
                          </span>
                          <div className="space-y-1.5 pt-1">
                            {selectedMeeting.analysis.action_items.map((action, idx) => {
                              const key = `${selectedMeeting.id}-act-${idx}`;
                              const isChecked = checkedActionItems[key] || false;
                              return (
                                <div
                                  key={idx}
                                  onClick={() =>
                                    setCheckedActionItems((prev) => ({
                                      ...prev,
                                      [key]: !isChecked,
                                    }))
                                  }
                                  className="flex items-center gap-2 cursor-pointer hover:text-violet transition-colors"
                                >
                                  {isChecked ? (
                                    <CheckSquare className="w-4 h-4 text-lime-700 dark:text-lime shrink-0" />
                                  ) : (
                                    <Square className="w-4 h-4 text-muted-foreground shrink-0" />
                                  )}
                                  <span className={isChecked ? "line-through text-muted-foreground" : "text-ink"}>
                                    {action}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Recording URL if present */}
                      {selectedMeeting.recording_url && (
                        <div className="border border-ink/15 bg-secondary/20 p-4 flex items-center justify-between gap-3">
                          <div>
                            <span className="label-mono text-muted-foreground text-[10px] block uppercase">
                              Video Call Recording
                            </span>
                            <span className="font-mono text-xs text-ink font-bold">
                              Archived in Tavus Cloud Storage
                            </span>
                          </div>
                          <a
                            href={selectedMeeting.recording_url}
                            target="_blank"
                            rel="noreferrer"
                            className="border border-ink/20 bg-paper px-3 py-1.5 text-xs font-bold text-ink hover:bg-secondary flex items-center gap-1 transition-all"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Watch Recording
                          </a>
                        </div>
                      )}
                    </>
                  ) : (
                    selectedMeeting.status !== "analyzing" && (
                      <div className="border border-ink/15 bg-secondary/10 p-6 text-center text-muted-foreground space-y-2">
                        <p>No structured Groq analysis recorded for this meeting.</p>
                        <button
                          type="button"
                          onClick={fetchMeetings}
                          className="border border-ink/20 bg-paper px-3 py-1 text-xs font-bold text-ink hover:bg-secondary transition-all"
                        >
                          Check for Analysis Updates
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-ink/20 p-4 bg-secondary/20 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedMeeting(null)}
                className="border border-ink px-4 py-2 font-mono text-xs font-bold uppercase hover:bg-secondary transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
