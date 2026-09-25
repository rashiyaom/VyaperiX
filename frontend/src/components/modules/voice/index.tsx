import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { getApiBase, getAuthHeaders as getApiAuthHeaders } from "@/lib/api";
import {
  Sparkles,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneOff,
  Mic,
  Volume2,
  Bot,
  User,
  Clock,
  CheckCircle2,
  Flame,
  Radio,
  UploadCloud,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Search,
  Sliders,
  Key,
  X,
  Check,
  Copy,
  Trash2,
  AlertTriangle,
  Plus,
  ArrowUpRight,
  Activity,
  MessageSquare,
  CheckSquare,
  Square,
  ChevronRight,
  ShieldCheck,
  Delete,
  Ban,
} from "lucide-react";

interface VoiceFleetModuleProps {
  analysis?: any;
  companyName?: string;
  industry?: string;
  targetLead?: any;
}

interface TranscriptTurn {
  speaker: "agent" | "customer";
  message: string;
  timestamp: string;
}

interface CallAnalysis {
  summary?: string;
  call_outcome?: string;
  sentiment?: "positive" | "neutral" | "negative" | "hostile_or_abusive" | string;
  abuse_detected?: boolean;
  abuse_details?: string;
  meeting_booked?: boolean;
  meeting_details?: {
    date_time_requested?: string;
    attendee_name?: string;
    attendee_email?: string;
    topics?: string;
  };
  intent_score?: number;
  lead_temperature?: "Hot" | "Warm" | "Cold";
  key_points_discussed?: string[];
  customer_concerns?: string[];
  action_items?: string[];
  agent_performance_review?: string;
}

interface VoiceCallRecord {
  id: string;
  campaign_id?: string;
  direction: "outbound" | "inbound";
  customer_name: string;
  customer_phone: string;
  business_name: string;
  call_reason: string;
  status: "queued" | "ringing" | "in-progress" | "forwarding" | "completed" | "ended" | "failed" | "no-answer" | "busy" | "canceled" | string;
  vapi_call_id?: string;
  duration_seconds: number;
  started_at: string;
  ended_at?: string;
  transcript: TranscriptTurn[];
  recording_url?: string;
  analysis?: CallAnalysis;
  abuse_detected?: boolean;
  flagged?: string;
  call_outcome?: string;
  sentiment?: string;
  error_message?: string;
  created_at: string;
}

interface ParsedContact {
  id: string;
  customer_name: string;
  customer_phone: string;
  business_name: string;
  call_reason: string;
  selected: boolean;
  status?: "pending" | "calling" | "completed" | "failed";
}

const API_BASE = getApiBase();

export function VoiceFleetModule({
  analysis,
  companyName = "",
  industry = "",
  targetLead,
}: VoiceFleetModuleProps) {
  const { user, session } = useAuth();
  const effectiveCompanyName = analysis?.company_name || companyName || "Vyaperi Enterprise";
  const effectiveIndustry = analysis?.industry || industry || "B2B Technology";

  const extraContext = analysis
    ? {
        company_name: effectiveCompanyName,
        user_id: user?.id,
        report_id: (analysis as any)?.id || (analysis as any)?._id || (analysis as any)?.report_id,
        summary: analysis.one_line_summary || (typeof analysis.executive_summary === "string" ? analysis.executive_summary : analysis.executive_summary?.core_thesis) || "",
        value_propositions: analysis.value_propositions || [],
        products_services: analysis.products_services || [],
        pain_points_solved: analysis.pain_points_solved || [],
        target_personas: analysis.target_buyer_personas || [],
      }
    : (user?.id ? { user_id: user?.id, company_name: effectiveCompanyName } : undefined);

  const getAuthHeaders = () => {
    return getApiAuthHeaders(session?.access_token);
  };

  // Tab State: "logs" | "csv" | "live" | "inbound" | "settings"
  const [activeTab, setActiveTab] = useState<"logs" | "csv" | "live" | "inbound" | "settings">("logs");

  // Call Logs & Stats
  const [calls, setCalls] = useState<VoiceCallRecord[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [directionFilter, setDirectionFilter] = useState<"all" | "outbound" | "inbound">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "in-progress" | "hot">("all");
  const [stats, setStats] = useState({
    total_calls: 0,
    outbound_calls: 0,
    inbound_calls: 0,
    completed_calls: 0,
    in_progress_calls: 0,
    avg_duration_seconds: 0,
    hot_leads: 0,
    positive_sentiment: 0,
  });

  // Call Details Modal
  const [selectedCall, setSelectedCall] = useState<VoiceCallRecord | null>(null);

  const handleSelectCall = async (callRecord: VoiceCallRecord) => {
    setSelectedCall(callRecord);
    try {
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`${API_BASE}/api/voice/calls/${callRecord.id}`, { headers });
      if (res.ok) {
        const fullCall = await res.json();
        setSelectedCall(fullCall);
      }
    } catch (e) {
      console.error("Error auto-loading call details:", e);
    }
  };
  const [activeDetailTab, setActiveDetailTab] = useState<"transcript" | "analysis">("transcript");
  const [reanalyzing, setReanalyzing] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [checkedItems, setCheckedItems] = useState<{ [key: string]: boolean }>({});

  // CSV Outreach State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [isDraggingCsv, setIsDraggingCsv] = useState(false);
  const [csvParsingError, setCsvParsingError] = useState<string | null>(null);
  const [isLaunchingBatch, setIsLaunchingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live Single Call State
  const [liveCallMode, setLiveCallMode] = useState<"real" | "demo">("real");
  const [liveCallLanguage, setLiveCallLanguage] = useState<"auto" | "hi" | "gu" | "en">("auto");
  const [liveCallStatusMessage, setLiveCallStatusMessage] = useState<string>("");
  const [liveCallError, setLiveCallError] = useState<string | null>(null);
  const liveCallPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const [liveCallForm, setLiveCallForm] = useState({
    customer_name: "",
    customer_phone: "",
    business_name: effectiveCompanyName,
    call_reason: "",
  });
  const [liveCallActive, setLiveCallActive] = useState(false);
  const [liveCallDuration, setLiveCallDuration] = useState(0);
  const [liveCallTurns, setLiveCallTurns] = useState<TranscriptTurn[]>([]);
  const [liveCallRecord, setLiveCallRecord] = useState<VoiceCallRecord | null>(null);
  const [showDialpad, setShowDialpad] = useState(true);

  // Synthesize authentic DTMF dual-frequency telephone tones on digit presses
  const playDtmfTone = (digit: string) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const dtmfFrequencies: Record<string, [number, number]> = {
        "1": [697, 1209], "2": [697, 1336], "3": [697, 1477],
        "4": [770, 1209], "5": [770, 1336], "6": [770, 1477],
        "7": [852, 1209], "8": [852, 1336], "9": [852, 1477],
        "*": [941, 1209], "0": [941, 1336], "#": [941, 1477],
        "+": [941, 1336],
      };
      const freqs = dtmfFrequencies[digit];
      if (!freqs) return;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.frequency.value = freqs[0];
      osc2.frequency.value = freqs[1];

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.12);
    } catch {
      // AudioContext unavailable
    }
  };

  const handleDialpadPress = (val: string) => {
    playDtmfTone(val);
    setLiveCallForm((prev) => ({
      ...prev,
      customer_phone: (prev.customer_phone || "") + val,
    }));
  };

  const handleDialpadBackspace = () => {
    setLiveCallForm((prev) => ({
      ...prev,
      customer_phone: (prev.customer_phone || "").slice(0, -1),
    }));
  };

  const handleDialpadClear = () => {
    setLiveCallForm((prev) => ({
      ...prev,
      customer_phone: "",
    }));
  };

  const handleSetCountryCode = (code: string) => {
    setLiveCallForm((prev) => {
      const current = (prev.customer_phone || "").trim();
      const cleaned = current.replace(/^\+\d+\s*/, "");
      return {
        ...prev,
        customer_phone: `${code} ${cleaned}`.trim(),
      };
    });
  };

  // Inbound Simulation State
  const [inboundForm, setInboundForm] = useState({
    customer_name: "",
    customer_phone: "",
    business_name: effectiveCompanyName,
    caller_inquiry: "",
  });
  const [inboundSubmitting, setInboundSubmitting] = useState(false);

  // Helper to detect if a call record is demonstration sample data
  const isSampleCall = (record: { customer_name?: string; call_reason?: string; business_name?: string }) => {
    const text = `${record.customer_name || ""} ${record.call_reason || ""} ${record.business_name || ""}`.toLowerCase();
    return text.includes("sample");
  };

  // Settings State
  const [settings, setSettings] = useState({
    vapi_api_key: "",
    vapi_public_key: "",
    vapi_phone_number_id: "",
    twilio_account_sid: "",
    twilio_auth_token: "",
    twilio_phone_number: "",
    sarvam_api_key: "",
    sarvam_speaker: "priya",
    public_webhook_url: "",
    voice_provider: "sarvam",
    voice_id: "priya",
    sms_alerts_enabled: true,
    alert_phone_number: "",
    calendly_api_token: "",
    calendly_event_url: "",
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedMessage, setSettingsSavedMessage] = useState(false);

  // Sarvam AI Audio Playback State
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState<string | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const playSarvamAudio = async (text: string, lang: string = "hi", id?: string) => {
    try {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      if (id) setPlayingAudioId(id);
      else setPreviewPlaying(lang);

      let targetLang = lang;
      if (/[\u0A80-\u0AFF]/.test(text)) {
        targetLang = "gu";
      } else if (/[\u0900-\u097F]/.test(text)) {
        targetLang = "hi";
      }

      const res = await fetch(`${API_BASE}/api/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          language: targetLang,
          speaker: settings.sarvam_speaker || "priya",
        }),
      });

      if (!res.ok) {
        if ("speechSynthesis" in window) {
          const synth = window.speechSynthesis;
          synth.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = targetLang === "gu" ? "gu-IN" : "hi-IN";
          utterance.onend = () => {
            setPlayingAudioId(null);
            setPreviewPlaying(null);
          };
          utterance.onerror = () => {
            setPlayingAudioId(null);
            setPreviewPlaying(null);
          };
          synth.speak(utterance);
          return;
        }
        throw new Error("TTS generation failed");
      }

      const data = await res.json();
      if (data.audio_b64) {
        const audio = new Audio(`data:audio/wav;base64,${data.audio_b64}`);
        activeAudioRef.current = audio;
        audio.onended = () => {
          setPlayingAudioId(null);
          setPreviewPlaying(null);
        };
        audio.onerror = () => {
          setPlayingAudioId(null);
          setPreviewPlaying(null);
        };
        await audio.play();
      }
    } catch (e) {
      console.error("Failed to synthesize or play Sarvam speech:", e);
      setPlayingAudioId(null);
      setPreviewPlaying(null);
    }
  };

  // Load Calls & Stats
  const userId = user?.id;
  const userEmail = user?.email;

  const fetchCallsAndStats = async () => {
    try {
      setLoadingCalls(true);
      const validUserId = user?.id && user.id !== "undefined" && user.id !== "null" ? user.id : null;
      const validUserEmail = user?.email && user.email.includes("@") ? user.email : null;

      const params = new URLSearchParams();
      params.append("limit", "100");
      if (validUserId) params.append("user_id", validUserId);
      if (validUserEmail) params.append("user_email", validUserEmail);

      const statsParams = new URLSearchParams();
      if (validUserId) statsParams.append("user_id", validUserId);
      if (validUserEmail) statsParams.append("user_email", validUserEmail);

      const headers = getAuthHeaders();
      const [callsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/api/voice/calls?${params.toString()}`, { headers }),
        fetch(`${API_BASE}/api/voice/stats?${statsParams.toString()}`, { headers }),
      ]);

      if (callsRes.ok) {
        const callsData = await callsRes.json();
        if (Array.isArray(callsData)) {
          setCalls(callsData);
          const cacheKey = validUserId ? `vyaperi_voice_calls_${validUserId}` : "vyaperi_voice_calls_default";
          try {
            localStorage.setItem(cacheKey, JSON.stringify(callsData));
          } catch (e) {}
        }
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      console.error("Failed to fetch voice calls or stats:", err);
    } finally {
      setLoadingCalls(false);
    }
  };

  useEffect(() => {
    // Initial local cache hydration
    const cacheKey = userId ? `vyaperi_voice_calls_${userId}` : "vyaperi_voice_calls_default";
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCalls(parsed);
        }
      }
    } catch (e) {}

    fetchCallsAndStats();
    const interval = setInterval(() => {
      fetchCallsAndStats();
    }, 8000);
    return () => clearInterval(interval);
  }, [userId, userEmail]);

  // Update business name if companyName changes
  useEffect(() => {
    if (effectiveCompanyName) {
      setLiveCallForm((prev) => ({ ...prev, business_name: effectiveCompanyName }));
      setInboundForm((prev) => ({ ...prev, business_name: effectiveCompanyName }));
    }
  }, [effectiveCompanyName]);

  // If a lead was dispatched from Lead Radar, populate the live form and switch to live call tab
  useEffect(() => {
    if (targetLead) {
      setActiveTab("live");
      setLiveCallForm({
        customer_name: targetLead.name || "",
        customer_phone: targetLead.phone || "",
        business_name: effectiveCompanyName,
        call_reason:
          targetLead.signals && targetLead.signals.length > 0
            ? `Follow-up on buyer intent signal: ${targetLead.signals[0]}`
            : `Commercial discussion regarding ${targetLead.company || "enterprise solution"}`,
      });
    }
  }, [targetLead, effectiveCompanyName]);

  // Timer for active call simulation
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (liveCallActive) {
      timer = setInterval(() => {
        setLiveCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [liveCallActive]);

  // Load Settings
  const fetchSettings = async () => {
    try {
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`${API_BASE}/api/voice/config`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSettings((prev) => ({
          ...prev,
          vapi_public_key: data.vapi_public_key || (import.meta.env["VITE_VAPI_PUBLIC_KEY"] as string) || "",
          vapi_phone_number_id: data.vapi_phone_number_id || "",
          twilio_phone_number: data.twilio_phone_number || "",
          sarvam_api_key: data.sarvam_key_masked || (import.meta.env["VITE_SARVAM_API_KEY"] as string) || "",
          sarvam_speaker: data.sarvam_speaker || "priya",
          public_webhook_url: data.public_webhook_url || "",
          voice_provider: data.voice_provider || "sarvam",
          voice_id: data.voice_id || "priya",
          sms_alerts_enabled: data.sms_alerts_enabled !== undefined ? Boolean(data.sms_alerts_enabled) : true,
          alert_phone_number: data.alert_phone_number || "",
          calendly_api_token: data.calendly_token_masked || "",
          calendly_event_url: data.calendly_event_url || "",
        }));
      }
    } catch (err) {
      console.error("Failed to fetch voice settings:", err);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [userId]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch(`${API_BASE}/api/voice/config`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...settings,
          user_id: user?.id,
        }),
      });
      if (res.ok) {
        setSettingsSavedMessage(true);
        setTimeout(() => setSettingsSavedMessage(false), 2500);
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSavingSettings(false);
    }
  };

  // ─────────────────────────── CSV Parsing & Sample ────────────────────

  // RFC-4180 compliant CSV tokenizer respecting quotes, embedded commas and whitespace
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const handleDownloadSampleCsv = () => {
    // Exactly ONE sample lead row, clearly labeled as (Sample Lead)
    const csvContent =
      "Customer Name,Phone Number,Reason Why Called,Business Name\n" +
      `"Alex Mercer (Sample Lead)",+15552345678,"[Sample] Follow-up on enterprise CRM integration proposal sent Tuesday","${effectiveCompanyName}"\n`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `sample_lead_${effectiveCompanyName.replace(/\s+/g, "_").toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const parseCsvText = (text: string) => {
    setCsvParsingError(null);
    // Strip UTF-8 Byte Order Mark (BOM) if present from Excel
    const cleanedText = text.replace(/^\uFEFF/, "");
    const lines = cleanedText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      setCsvParsingError("The CSV file must contain a header row and at least one contact row.");
      return;
    }

    const headerTokens = parseCsvLine(lines[0] ?? "");
    const headers = headerTokens.map((h) => h.toLowerCase().replace(/['"]/g, ""));

    // Find column indexes flexibly
    let nameIdx = headers.findIndex((h) =>
      h.includes("name") || h.includes("customer") || h.includes("client") || h.includes("contact") || h.includes("lead")
    );
    let phoneIdx = headers.findIndex((h) =>
      h.includes("phone") || h.includes("mobile") || h.includes("tel") || h.includes("number")
    );
    let reasonIdx = headers.findIndex((h) =>
      h.includes("reason") || h.includes("why") || h.includes("purpose") || h.includes("notes") || h.includes("topic")
    );
    let bizIdx = headers.findIndex((h) =>
      h.includes("business") || h.includes("company") || h.includes("org") || h.includes("account")
    );

    if (nameIdx === -1) nameIdx = 0;
    if (phoneIdx === -1) phoneIdx = 1;
    if (reasonIdx === -1) reasonIdx = 2;

    const contacts: ParsedContact[] = [];

    for (let i = 1; i < lines.length; i++) {
      const lineStr = lines[i] ?? "";
      const cleanRow = parseCsvLine(lineStr);

      const cName = cleanRow[nameIdx] || `Contact ${i}`;
      const cPhone = cleanRow[phoneIdx] || "";
      const cReason = cleanRow[reasonIdx] || "Commercial Follow-up";
      const cBiz = bizIdx !== -1 && cleanRow[bizIdx] ? cleanRow[bizIdx] : effectiveCompanyName;

      if (cName || cPhone) {
        contacts.push({
          id: `csv-row-${i}`,
          customer_name: cName,
          customer_phone: cPhone,
          business_name: cBiz,
          call_reason: cReason,
          selected: true,
          status: "pending",
        });
      }
    }

    if (contacts.length === 0) {
      setCsvParsingError("No valid rows could be extracted from the CSV file.");
      return;
    }

    setParsedContacts(contacts);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingCsv(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!file.name.endsWith(".csv")) {
        setCsvParsingError("Please upload a valid .csv file.");
        return;
      }
      setCsvFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          parseCsvText(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCsvFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          parseCsvText(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  // Batch Launch
  const handleLaunchBatchCampaign = async () => {
    const selected = parsedContacts.filter((c) => c.selected);
    if (selected.length === 0) return;

    setIsLaunchingBatch(true);
    setBatchProgress({ current: 0, total: selected.length });

    try {
      const payload = {
        campaign_name: csvFile ? csvFile.name.replace(".csv", "") : "CSV Outreach Fleet",
        user_id: user?.id,
        user_email: user?.email,
        calls: selected.map((c) => ({
          customer_name: c.customer_name,
          customer_phone: c.customer_phone,
          business_name: c.business_name,
          call_reason: c.call_reason,
          direction: "outbound",
          user_id: user?.id,
          user_email: user?.email,
          extra_context: extraContext,
        })),
        force_simulate: false,
      };

      const res = await fetch(`${API_BASE}/api/voice/calls/batch`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        // Mark rows completed in UI
        setParsedContacts((prev) =>
          prev.map((c) => (c.selected ? { ...c, status: "completed" } : c))
        );
        setTimeout(() => {
          fetchCallsAndStats();
          setActiveTab("logs");
        }, 1200);
      }
    } catch (err) {
      console.error("Batch dispatch error:", err);
    } finally {
      setIsLaunchingBatch(false);
    }
  };

  // Launch Single Call from CSV table
  const handleCallSingleCsvContact = async (contact: ParsedContact) => {
    setParsedContacts((prev) =>
      prev.map((c) => (c.id === contact.id ? { ...c, status: "calling" } : c))
    );

    try {
      const res = await fetch(`${API_BASE}/api/voice/calls`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          customer_name: contact.customer_name,
          customer_phone: contact.customer_phone,
          business_name: contact.business_name,
          call_reason: contact.call_reason,
          direction: "outbound",
          force_simulate: false,
          user_id: user?.id,
          user_email: user?.email,
          extra_context: extraContext,
        }),
      });

      if (res.ok) {
        setParsedContacts((prev) =>
          prev.map((c) => (c.id === contact.id ? { ...c, status: "completed" } : c))
        );
        fetchCallsAndStats();
      } else {
        setParsedContacts((prev) =>
          prev.map((c) => (c.id === contact.id ? { ...c, status: "failed" } : c))
        );
      }
    } catch (err) {
      setParsedContacts((prev) =>
        prev.map((c) => (c.id === contact.id ? { ...c, status: "failed" } : c))
      );
    }
  };

  // ─────────────────────────── Live Single Call (Real / Demo) ──────────

  const handleStopLiveCallMonitoring = async () => {
    if (liveCallPollRef.current) {
      clearInterval(liveCallPollRef.current);
      liveCallPollRef.current = null;
    }
    const callIdToHangup = activeCallIdRef.current || liveCallRecord?.id;
    activeCallIdRef.current = null;
    setLiveCallActive(false);
    setLiveCallStatusMessage("Disconnecting carrier line...");

    if (callIdToHangup) {
      try {
        const res = await fetch(`${API_BASE}/api/voice/calls/${callIdToHangup}/hangup`, {
          method: "POST",
        });
        if (res.ok) {
          const updated: VoiceCallRecord = await res.json();
          setLiveCallRecord(updated);
          if (updated.transcript && updated.transcript.length > 0) {
            setLiveCallTurns(updated.transcript);
          }
          setLiveCallStatusMessage("✓ Call terminated & carrier line disconnected. Groq AI review ready.");
        } else {
          setLiveCallStatusMessage("Call stopped.");
        }
      } catch {
        setLiveCallStatusMessage("Call stopped.");
      }
    } else {
      setLiveCallStatusMessage("Call monitor closed.");
    }
    fetchCallsAndStats();
  };

  const handleStartLiveCall = async () => {
    setLiveCallError(null);
    const isRealCall = liveCallMode === "real";

    const custName = liveCallForm.customer_name.trim();
    const custPhone = liveCallForm.customer_phone.trim();
    const bizName = liveCallForm.business_name.trim() || effectiveCompanyName;
    const callReason = liveCallForm.call_reason.trim();

    if (isRealCall) {
      const cleanDigits = custPhone.replace(/[^\d]/g, "");
      if (custPhone.startsWith("+91") || (cleanDigits.startsWith("91") && cleanDigits.length > 10)) {
        const subDigits = custPhone.startsWith("+91") ? cleanDigits.slice(2) : cleanDigits.slice(2);
        if (subDigits.length !== 10) {
          setLiveCallError(`Invalid Indian phone number: entered ${subDigits.length} digits. Indian mobile numbers must have exactly 10 digits after +91 (e.g. +91 98765 43210).`);
          return;
        }
      } else if (!custPhone || cleanDigits.length < 10) {
        setLiveCallError("Please provide a valid 10-digit mobile number with country code (e.g. +91 98765 43210 or +1 555 123 4567).");
        return;
      }
      if (!custName) {
        setLiveCallError("Please specify the contact or lead name.");
        return;
      }
      if (!callReason) {
        setLiveCallError("Please specify why the AI SDR is making this call.");
        return;
      }
    }

    const finalName = custName || "Alex Mercer (Sample Lead)";
    const finalPhone = custPhone || "+1 (555) 019-2834";
    const finalReason = callReason || "[Sample] Follow-up on enterprise voice fleet demonstration";

    setLiveCallActive(true);
    setLiveCallDuration(0);
    setLiveCallTurns([]);
    setLiveCallRecord(null);
    setLiveCallStatusMessage(
      isRealCall
        ? "Connecting carrier trunk & dispatching live Vapi outbound call..."
        : "Initializing interactive simulation demo..."
    );

    // Initial greeting preview
    let initialGreetingText = `Hello ${finalName}, this is Sarah calling from ${bizName} regarding ${finalReason}. Do you have a brief moment to connect?`;
    if (liveCallLanguage === "hi") {
      initialGreetingText = `नमस्ते ${finalName}, मैं ${bizName} से बात कर रही हूँ ${finalReason} के बारे में। क्या आपके पास दो मिनट का समय है?`;
    } else if (liveCallLanguage === "gu") {
      initialGreetingText = `નમસ્તે ${finalName}, હું ${bizName} તરફથી વાત કરું છું ${finalReason} અંગે. શું તમારી પાસે બે મિનિટ વાત કરવાનો સમય છે?`;
    }

    // For demo simulation mode, set initial greeting preview; for real calls, start with clean empty transcript
    if (!isRealCall) {
      const greeting: TranscriptTurn = {
        speaker: "agent",
        message: initialGreetingText,
        timestamp: "00:04",
      };
      setLiveCallTurns([greeting]);
      playSarvamAudio(initialGreetingText, liveCallLanguage, "live-0");
    } else {
      setLiveCallTurns([]);
    }

    try {
      const res = await fetch(`${API_BASE}/api/voice/calls`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          customer_name: finalName,
          customer_phone: finalPhone,
          business_name: bizName,
          call_reason: finalReason,
          direction: "outbound",
          force_simulate: !isRealCall,
          language: liveCallLanguage,
          user_id: user?.id,
          user_email: user?.email,
          extra_context: extraContext,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const callId = data.call_id;
        activeCallIdRef.current = callId;

        let attempts = 0;
        const maxAttempts = isRealCall ? 90 : 15;
        const pollIntervalMs = isRealCall ? 750 : 800;

        if (liveCallPollRef.current) clearInterval(liveCallPollRef.current);

        liveCallPollRef.current = setInterval(async () => {
          attempts++;
          try {
            const detailRes = await fetch(`${API_BASE}/api/voice/calls/${callId}`, {
              headers: getAuthHeaders(),
            });
            if (detailRes.ok) {
              const detailData: VoiceCallRecord = await detailRes.json();

              // Update live status message
              if (detailData.status === "ringing" || detailData.status === "queued") {
                setLiveCallStatusMessage("📞 Ringing recipient phone... (If Twilio Trial, press 1 on dialpad to connect AI)");
              } else if (detailData.status === "in-progress" || detailData.status === "forwarding") {
                setLiveCallStatusMessage(
                  isRealCall
                    ? "🟢 Live call connected! AI Voice Agent speaking with lead..."
                    : "Simulated conversation in progress..."
                );
              }

              if (detailData.transcript && detailData.transcript.length > 0) {
                setLiveCallTurns(detailData.transcript);
              }
              setLiveCallRecord(detailData);

              // Check if call finished
              const isFinished = ["completed", "ended", "failed", "no-answer", "busy", "canceled"].includes(
                detailData.status
              );

              if (isFinished || attempts >= maxAttempts) {
                if (liveCallPollRef.current) {
                  clearInterval(liveCallPollRef.current);
                  liveCallPollRef.current = null;
                }
                activeCallIdRef.current = null;
                setLiveCallActive(false);

                if (detailData.status === "completed" || detailData.status === "ended") {
                  setLiveCallStatusMessage("✓ Live call finished successfully! AI Call Intelligence Analysis ready.");
                } else if (detailData.status === "failed") {
                  setLiveCallStatusMessage(`Call ended with status: ${detailData.status}. ${detailData.error_message || ""}`);
                } else {
                  setLiveCallStatusMessage(`Call ended (${detailData.status}).`);
                }
                fetchCallsAndStats();
              }
            }
          } catch (pollErr) {
            console.error("Polling live call error:", pollErr);
            if (attempts >= maxAttempts) {
              if (liveCallPollRef.current) {
                clearInterval(liveCallPollRef.current);
                liveCallPollRef.current = null;
              }
              activeCallIdRef.current = null;
              setLiveCallActive(false);
            }
          }
        }, pollIntervalMs);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setLiveCallError(errJson.detail || "Failed to initiate call. Please check credentials or phone format.");
        setLiveCallActive(false);
      }
    } catch (err: any) {
      console.error("Failed to start live call:", err);
      setLiveCallError(err?.message || "Failed to connect to backend voice engine.");
      setLiveCallActive(false);
    }
  };

  // ─────────────────────────── Inbound Simulator ──────────────────────

  const handleSimulateInbound = async (e: React.FormEvent) => {
    e.preventDefault();
    setInboundSubmitting(true);
    const custName = inboundForm.customer_name.trim() || "Priya Sharma (Sample Lead)";
    const custPhone = inboundForm.customer_phone.trim() || "+1 (555) 892-4110";
    const bizName = inboundForm.business_name.trim() || effectiveCompanyName;
    const callerInquiry = inboundForm.caller_inquiry.trim() || "[Sample] Inbound pricing inquiry for 50 commercial sales seats";

    try {
      const res = await fetch(`${API_BASE}/api/voice/simulate-inbound`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          customer_name: custName,
          customer_phone: custPhone,
          business_name: bizName,
          caller_inquiry: callerInquiry,
          user_id: user?.id,
          user_email: user?.email,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTimeout(async () => {
          const detailRes = await fetch(`${API_BASE}/api/voice/calls/${data.call_id}`, {
            headers: getAuthHeaders(),
          });
          if (detailRes.ok) {
            const callObj = await detailRes.json();
            setSelectedCall(callObj);
            fetchCallsAndStats();
            setActiveTab("logs");
          }
        }, 2000);
      }
    } catch (err) {
      console.error("Inbound simulation failed:", err);
    } finally {
      setInboundSubmitting(false);
    }
  };

  // ─────────────────────────── Re-Analyze Call with Groq ──────────────

  const handleReanalyzeCall = async (callId: string) => {
    setReanalyzing(true);
    try {
      const res = await fetch(`${API_BASE}/api/voice/calls/${callId}/analyze`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (selectedCall && selectedCall.id === callId) {
          setSelectedCall((prev) => (prev ? { ...prev, analysis: data.analysis } : null));
        }
        fetchCallsAndStats();
      }
    } catch (err) {
      console.error("Re-analyze call error:", err);
    } finally {
      setReanalyzing(false);
    }
  };

  const handleDeleteCall = async (callId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm("Are you sure you want to delete this call log?")) return;

    try {
      const res = await fetch(`${API_BASE}/api/voice/calls/${callId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setCalls((prev) => prev.filter((c) => c.id !== callId));
        if (selectedCall?.id === callId) setSelectedCall(null);
        fetchCallsAndStats();
      }
    } catch (err) {
      console.error("Delete call failed:", err);
    }
  };

  // Filtered Calls list
  const filteredCalls = calls.filter((c) => {
    if (directionFilter !== "all" && c.direction !== directionFilter) return false;
    if (statusFilter === "completed" && c.status !== "completed") return false;
    if (statusFilter === "in-progress" && c.status !== "in-progress" && c.status !== "queued") return false;
    if (statusFilter === "hot") {
      const temp = c.analysis?.lead_temperature;
      const score = c.analysis?.intent_score || 0;
      if (temp !== "Hot" && score < 75) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        c.customer_name.toLowerCase().includes(q) ||
        c.customer_phone.toLowerCase().includes(q) ||
        c.business_name.toLowerCase().includes(q) ||
        c.call_reason.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  };

  const formatTimeAgo = (iso: string) => {
    try {
      const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
      if (diff < 60) return `${diff}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    } catch {
      return "recently";
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Top Industrial Header Banner ─────────────────────────── */}
      <div className="border border-ink/20 bg-secondary/30 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="label-mono text-lime-700 dark:text-lime font-bold">
              [AUTONOMOUS VOICE FLEET · TWILIO + VAPI AI]
            </span>
            <div className="h-2 w-2 rounded-full bg-lime animate-ping" />
          </div>
          <h2 className="font-display text-2xl font-extrabold uppercase">
            Voice Fleet — Inbound & Outbound Calling Engine
          </h2>
          <p className="font-mono text-xs text-muted-foreground">
            Dynamic context injection for <span className="text-ink font-bold">{effectiveCompanyName}</span> ({effectiveIndustry}) · Timely transcripts · Groq AI post-call audits.
          </p>
        </div>

        {/* Quick Top Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab("csv")}
            className={`border px-3.5 py-2 label-mono text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === "csv"
                ? "border-violet bg-violet text-violet-foreground"
                : "border-ink/30 bg-paper text-ink hover:border-violet"
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" /> Upload CSV
          </button>
          <button
            onClick={() => setActiveTab("live")}
            className={`border px-3.5 py-2 label-mono text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === "live"
                ? "border-lime bg-lime text-lime-foreground font-black"
                : "border-ink/30 bg-paper text-ink hover:border-lime"
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5" /> Single Call
          </button>
          <button
            onClick={() => setActiveTab("inbound")}
            className={`border px-3.5 py-2 label-mono text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === "inbound"
                ? "border-ink bg-ink text-paper"
                : "border-ink/30 bg-paper text-ink hover:bg-secondary"
            }`}
          >
            <PhoneIncoming className="w-3.5 h-3.5 text-lime-700 dark:text-lime" /> Inbound Sim
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`border px-3.5 py-2 label-mono text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === "settings"
                ? "border-ink bg-ink text-paper"
                : "border-ink/30 bg-paper text-ink hover:bg-secondary"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-lime-700 dark:text-lime" /> System Status
          </button>
        </div>
      </div>

      {/* ── KPI Metric Strip ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="border border-ink/20 bg-paper p-4 space-y-1">
          <span className="label-mono text-muted-foreground text-[9px] block">Total Processed Calls</span>
          <span className="font-display text-xl font-black text-ink">{stats.total_calls}</span>
          <span className="label-mono text-[9px] text-muted-foreground block">Lifetime records</span>
        </div>

        <div className="border border-ink/20 bg-paper p-4 space-y-1">
          <span className="label-mono text-violet text-[9px] block flex items-center gap-1">
            <PhoneOutgoing className="w-3 h-3" /> Outbound SDR
          </span>
          <span className="font-display text-xl font-black text-violet">{stats.outbound_calls}</span>
          <span className="label-mono text-[9px] text-muted-foreground block">CSV & Fleet Dispatches</span>
        </div>

        <div className="border border-ink/20 bg-paper p-4 space-y-1">
          <span className="label-mono text-lime-700 dark:text-lime text-[9px] block flex items-center gap-1">
            <PhoneIncoming className="w-3 h-3" /> Inbound Agents
          </span>
          <span className="font-display text-xl font-black text-lime-700 dark:text-lime">
            {stats.inbound_calls}
          </span>
          <span className="label-mono text-[9px] text-muted-foreground block">Twilio Received & Logged</span>
        </div>

        <div className="border border-ink/20 bg-paper p-4 space-y-1">
          <span className="label-mono text-muted-foreground text-[9px] block flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-lime-700 dark:text-lime" /> Completed Calls
          </span>
          <span className="font-display text-xl font-black text-ink">{stats.completed_calls}</span>
          <span className="label-mono text-[9px] text-muted-foreground block">With timely transcripts</span>
        </div>

        <div className="border border-ink/20 bg-paper p-4 space-y-1">
          <span className="label-mono text-muted-foreground text-[9px] block flex items-center gap-1">
            <Clock className="w-3 h-3" /> Avg Call Length
          </span>
          <span className="font-display text-xl font-black text-ink">
            {stats.avg_duration_seconds > 0 ? formatDuration(stats.avg_duration_seconds) : "0s"}
          </span>
          <span className="label-mono text-[9px] text-muted-foreground block">Spoken conversation</span>
        </div>

        <div className="border border-danger/40 bg-danger/5 p-4 space-y-1">
          <span className="label-mono text-danger text-[9px] block flex items-center gap-1">
            <Flame className="w-3 h-3 text-danger" /> Hot Leads Audited
          </span>
          <span className="font-display text-xl font-black text-danger">{stats.hot_leads}</span>
          <span className="label-mono text-[9px] text-muted-foreground block">Intent score ≥ 75%</span>
        </div>
      </div>

      {/* ── Sub-Navigation Tabs ───────────────────────────────────── */}
      <div className="flex border-b border-ink/20 gap-1 font-mono text-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab("logs")}
          className={`px-4 py-2.5 font-bold uppercase transition-all flex items-center gap-2 border-b-2 ${
            activeTab === "logs"
              ? "border-ink text-ink bg-paper"
              : "border-transparent text-muted-foreground hover:text-ink"
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-violet" /> Call Logs & Transcripts ({calls.length})
        </button>

        <button
          onClick={() => setActiveTab("csv")}
          className={`px-4 py-2.5 font-bold uppercase transition-all flex items-center gap-2 border-b-2 ${
            activeTab === "csv"
              ? "border-violet text-violet bg-paper"
              : "border-transparent text-muted-foreground hover:text-ink"
          }`}
        >
          <UploadCloud className="w-3.5 h-3.5 text-violet" /> CSV Outreach Campaign
          {parsedContacts.length > 0 && (
            <span className="border border-violet/40 bg-violet/10 text-violet px-1.5 py-0.2 text-[9px]">
              {parsedContacts.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("live")}
          className={`px-4 py-2.5 font-bold uppercase transition-all flex items-center gap-2 border-b-2 ${
            activeTab === "live"
              ? "border-lime text-ink bg-paper"
              : "border-transparent text-muted-foreground hover:text-ink"
          }`}
        >
          <PhoneCall className="w-3.5 h-3.5 text-lime-700 dark:text-lime" /> Single Outbound Call
        </button>

        <button
          onClick={() => setActiveTab("inbound")}
          className={`px-4 py-2.5 font-bold uppercase transition-all flex items-center gap-2 border-b-2 ${
            activeTab === "inbound"
              ? "border-ink text-ink bg-paper"
              : "border-transparent text-muted-foreground hover:text-ink"
          }`}
        >
          <PhoneIncoming className="w-3.5 h-3.5 text-lime-700 dark:text-lime" /> Inbound Voice Receptionist
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={`px-4 py-2.5 font-bold uppercase transition-all flex items-center gap-2 border-b-2 ${
            activeTab === "settings"
              ? "border-ink text-ink bg-paper"
              : "border-transparent text-muted-foreground hover:text-ink"
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-lime-700 dark:text-lime" /> Platform Telephony Status
        </button>
      </div>

      {/* ── TAB 1: CALL LOGS & TRANSCRIPTS EXPLORER ──────────────── */}
      {activeTab === "logs" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="border border-ink/20 bg-paper p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2 border border-ink/20 bg-secondary/20 px-3 py-1.5 max-w-md">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by customer name, phone, business, or reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent font-mono text-xs text-ink placeholder:text-muted-foreground focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-muted-foreground hover:text-ink">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
              <span className="text-muted-foreground text-[10px]">Filter:</span>
              <div className="inline-flex border border-ink/20 bg-secondary/30 p-0.5">
                {(["all", "outbound", "inbound"] as const).map((dir) => (
                  <button
                    key={dir}
                    onClick={() => setDirectionFilter(dir)}
                    className={`px-2.5 py-1 text-[10px] uppercase font-bold transition-all ${
                      directionFilter === dir ? "bg-ink text-paper" : "text-muted-foreground hover:text-ink"
                    }`}
                  >
                    {dir}
                  </button>
                ))}
              </div>

              <div className="inline-flex border border-ink/20 bg-secondary/30 p-0.5">
                {(["all", "completed", "hot"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 text-[10px] uppercase font-bold transition-all ${
                      statusFilter === st ? "bg-violet text-violet-foreground" : "text-muted-foreground hover:text-ink"
                    }`}
                  >
                    {st === "hot" ? "🔥 Hot Leads" : st}
                  </button>
                ))}
              </div>

              <button
                onClick={fetchCallsAndStats}
                className="border border-ink/20 bg-paper p-1.5 hover:bg-secondary text-muted-foreground hover:text-ink transition-all"
                title="Refresh call logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingCalls ? "animate-spin text-violet" : ""}`} />
              </button>
            </div>
          </div>

          {/* Calls Table */}
          <div className="border border-ink/20 bg-paper overflow-x-auto">
            {filteredCalls.length === 0 ? (
              <div className="p-12 text-center space-y-3 font-mono">
                <div className="border border-ink/20 bg-secondary p-3 inline-flex mx-auto">
                  <MessageSquare className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-display text-sm font-bold uppercase">No Recorded Calls Found</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Launch a single test call or upload a CSV lead list to initiate automated Vapi AI calls.
                </p>
                <div className="flex justify-center gap-2 pt-2 flex-wrap">
                  <button
                    onClick={() => setActiveTab("csv")}
                    className="border border-violet bg-violet text-violet-foreground px-3 py-1.5 label-mono text-xs font-bold hover:bg-violet/90"
                  >
                    Upload CSV
                  </button>
                  <button
                    onClick={() => setActiveTab("live")}
                    className="border border-lime bg-lime text-lime-foreground px-3 py-1.5 label-mono text-xs font-black hover:bg-lime/90"
                  >
                    Test Live Call
                  </button>
                </div>
              </div>
            ) : (
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-ink/20 bg-secondary/40 text-[10px] text-muted-foreground uppercase">
                    <th className="p-3">Direction</th>
                    <th className="p-3">Customer / Phone</th>
                    <th className="p-3">Represented Business</th>
                    <th className="p-3">Reason Why Called</th>
                    <th className="p-3">Duration</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Groq AI Review</th>
                    <th className="p-3">Recorded</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {filteredCalls.map((call) => {
                    const hasAnalysis = Boolean(call.analysis);
                    const leadTemp = call.analysis?.lead_temperature;
                    const intentScore = call.analysis?.intent_score;

                    return (
                      <tr
                        key={call.id}
                        onClick={() => handleSelectCall(call)}
                        className="hover:bg-secondary/30 cursor-pointer transition-colors"
                      >
                        {/* Direction */}
                        <td className="p-3 whitespace-nowrap">
                          {call.direction === "inbound" ? (
                            <span className="inline-flex items-center gap-1 border border-lime/40 bg-lime/10 text-lime-700 dark:text-lime px-2 py-0.5 text-[9px] font-bold">
                              <PhoneIncoming className="w-2.5 h-2.5" /> INBOUND
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 border border-violet/40 bg-violet/10 text-violet px-2 py-0.5 text-[9px] font-bold">
                              <PhoneOutgoing className="w-2.5 h-2.5" /> OUTBOUND
                            </span>
                          )}
                        </td>

                        {/* Customer */}
                        <td className="p-3">
                          <div className="font-bold text-ink flex items-center gap-1.5 flex-wrap">
                            {call.customer_name}
                            {isSampleCall(call) && (
                              <span className="border border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.2 text-[9px] font-bold rounded">
                                SAMPLE
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground">{call.customer_phone || "No phone specified"}</div>
                        </td>

                        {/* Business */}
                        <td className="p-3 text-ink font-bold">{call.business_name}</td>

                        {/* Reason */}
                        <td className="p-3 max-w-xs truncate text-muted-foreground" title={call.call_reason}>
                          {call.call_reason}
                        </td>

                        {/* Duration */}
                        <td className="p-3 whitespace-nowrap text-muted-foreground">
                          {call.duration_seconds > 0 ? formatDuration(call.duration_seconds) : "0m 00s"}
                        </td>

                        {/* Status */}
                        <td className="p-3 whitespace-nowrap">
                          {call.status === "completed" && (
                            <span className="label-mono text-lime-700 dark:text-lime font-bold">✓ COMPLETED</span>
                          )}
                          {call.status === "in-progress" && (
                            <span className="label-mono text-danger font-bold animate-pulse">● LIVE CALL</span>
                          )}
                          {call.status === "queued" && (
                            <span className="label-mono text-muted-foreground font-bold">QUEUED</span>
                          )}
                          {call.status === "failed" && (
                            <span className="label-mono text-danger font-bold">FAILED</span>
                          )}
                        </td>

                        {/* Groq AI Review */}
                        <td className="p-3 whitespace-nowrap">
                          {hasAnalysis ? (
                            <div className="flex items-center gap-1.5">
                              {leadTemp === "Hot" && (
                                <span className="border border-danger/40 bg-danger/10 text-danger px-1.5 py-0.5 text-[9px] font-bold flex items-center gap-0.5">
                                  <Flame className="w-2.5 h-2.5" /> HOT ({intentScore}%)
                                </span>
                              )}
                              {leadTemp === "Warm" && (
                                <span className="border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 text-[9px] font-bold">
                                  WARM ({intentScore}%)
                                </span>
                              )}
                              {leadTemp === "Cold" && (
                                <span className="border border-ink/20 bg-secondary text-muted-foreground px-1.5 py-0.5 text-[9px] font-bold">
                                  COLD ({intentScore}%)
                                </span>
                              )}
                              {(call.abuse_detected || call.analysis?.abuse_detected || call.flagged) && (
                                <span className="border border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5 text-[9px] font-bold">
                                  ⚠️ FLAGGED
                                </span>
                              )}
                              {(call.analysis?.meeting_booked || call.call_outcome === "Meeting Booked" || call.analysis?.call_outcome === "Meeting Booked") && (
                                <span className="border border-lime/50 bg-lime/10 text-lime-700 dark:text-lime px-1.5 py-0.5 text-[9px] font-bold">
                                  📅 MEETING
                                </span>
                              )}
                              <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                                {call.analysis?.call_outcome || "Audited"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">Pending Review</span>
                          )}
                        </td>

                        {/* Recorded */}
                        <td className="p-3 whitespace-nowrap text-muted-foreground text-[10px]">
                          {formatTimeAgo(call.created_at)}
                        </td>

                        {/* Actions */}
                        <td className="p-3 whitespace-nowrap text-right space-x-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCall(call);
                            }}
                            className="border border-ink/30 px-2 py-1 text-[10px] font-bold hover:bg-violet hover:border-violet hover:text-paper transition-all"
                          >
                            Inspect
                          </button>
                          <button
                            onClick={(e) => handleDeleteCall(call.id, e)}
                            className="border border-ink/20 text-muted-foreground px-1.5 py-1 hover:text-danger hover:border-danger transition-all"
                            title="Delete log"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: CSV OUTREACH CAMPAIGN ─────────────────────────── */}
      {activeTab === "csv" && (
        <div className="space-y-6">
          <div className="border border-ink/20 bg-paper p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-ink/15 pb-4">
              <div>
                <span className="label-mono text-violet font-bold">// Mass Outbound Engine</span>
                <h3 className="font-display text-lg font-bold uppercase">Upload Lead List for AI Calling</h3>
                <p className="font-mono text-xs text-muted-foreground">
                  Each call dynamically receives the customer name, phone number, and specific reason why they need to be called.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadSampleCsv}
                  className="border border-ink/30 bg-secondary/40 px-3.5 py-2 label-mono text-xs font-bold hover:bg-secondary flex items-center gap-1.5 transition-all"
                >
                  <Download className="w-3.5 h-3.5 text-violet" /> Download Sample CSV
                </button>
              </div>
            </div>

            {/* Drag and Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingCsv(true);
              }}
              onDragLeave={() => setIsDraggingCsv(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
                isDraggingCsv
                  ? "border-violet bg-violet/5"
                  : "border-ink/20 hover:border-violet/60 bg-secondary/10"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileInputChange}
                className="hidden"
              />

              <div className="space-y-2">
                <div className="border border-ink/20 bg-paper p-3 inline-flex mx-auto">
                  <FileSpreadsheet className="w-8 h-8 text-lime-700 dark:text-lime" />
                </div>
                <div className="font-display text-sm font-bold uppercase text-ink">
                  {csvFile ? csvFile.name : "Drag & Drop Leads CSV, or Browse"}
                </div>
                <p className="font-mono text-xs text-muted-foreground max-w-md mx-auto">
                  Expected headers: <span className="text-ink font-bold">Customer Name, Phone Number, Reason Why Called, Business Name</span>.
                </p>
              </div>
            </div>

            {csvParsingError && (
              <div className="border border-danger/40 bg-danger/10 p-3 font-mono text-xs text-danger flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{csvParsingError}</span>
              </div>
            )}
          </div>

          {/* Parsed Contacts Preview Table */}
          {parsedContacts.length > 0 && (
            <div className="border border-ink/20 bg-paper p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-ink/15 pb-3">
                <div className="flex items-center gap-3">
                  <span className="font-display text-sm font-bold uppercase">
                    Preview Parsed Leads ({parsedContacts.length} total)
                  </span>
                  <span className="label-mono border border-violet/30 bg-violet/10 text-violet px-2 py-0.5 text-[9px] font-bold">
                    {parsedContacts.filter((c) => c.selected).length} Selected for Dispatch
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setParsedContacts((prev) => {
                        const allSelected = prev.every((c) => c.selected);
                        return prev.map((c) => ({ ...c, selected: !allSelected }));
                      })
                    }
                    className="border border-ink/20 bg-secondary/40 px-2.5 py-1.5 label-mono text-xs font-bold hover:bg-secondary"
                  >
                    Toggle All
                  </button>
                  <button
                    onClick={handleLaunchBatchCampaign}
                    disabled={isLaunchingBatch || parsedContacts.filter((c) => c.selected).length === 0}
                    className="border border-lime bg-lime text-lime-foreground px-4 py-1.5 label-mono text-xs font-black hover:bg-lime/90 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isLaunchingBatch ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Dispatching Calls...
                      </>
                    ) : (
                      <>
                        <PhoneCall className="w-3.5 h-3.5" /> Start Bulk Fleet Dispatch (
                        {parsedContacts.filter((c) => c.selected).length})
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="sticky top-0 bg-secondary/90 backdrop-blur border-b border-ink/20 text-[10px] text-muted-foreground uppercase">
                    <tr>
                      <th className="p-2.5 w-10">Select</th>
                      <th className="p-2.5">Customer Name</th>
                      <th className="p-2.5">Phone Number</th>
                      <th className="p-2.5">Business Name</th>
                      <th className="p-2.5">Reason Why Called</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {parsedContacts.map((contact) => (
                      <tr key={contact.id} className="hover:bg-secondary/20">
                        <td className="p-2.5">
                          <input
                            type="checkbox"
                            checked={contact.selected}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setParsedContacts((prev) =>
                                prev.map((c) => (c.id === contact.id ? { ...c, selected: checked } : c))
                              );
                            }}
                            className="cursor-pointer accent-violet"
                          />
                        </td>
                        <td className="p-2.5 font-bold text-ink">{contact.customer_name}</td>
                        <td className="p-2.5 text-muted-foreground">{contact.customer_phone}</td>
                        <td className="p-2.5 text-ink">{contact.business_name}</td>
                        <td className="p-2.5 max-w-sm text-muted-foreground truncate" title={contact.call_reason}>
                          {contact.call_reason}
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          {contact.status === "pending" && (
                            <span className="label-mono text-muted-foreground text-[9px]">PENDING</span>
                          )}
                          {contact.status === "calling" && (
                            <span className="label-mono text-danger font-bold text-[9px] animate-pulse">CALLING</span>
                          )}
                          {contact.status === "completed" && (
                            <span className="label-mono text-lime-700 dark:text-lime font-bold text-[9px]">✓ DISPATCHED</span>
                          )}
                          {contact.status === "failed" && (
                            <span className="label-mono text-danger font-bold text-[9px]">FAILED</span>
                          )}
                        </td>
                        <td className="p-2.5 text-right">
                          <button
                            onClick={() => handleCallSingleCsvContact(contact)}
                            disabled={contact.status === "calling"}
                            className="border border-ink/20 px-2 py-1 text-[10px] font-bold hover:border-lime hover:bg-lime hover:text-ink transition-all disabled:opacity-50"
                          >
                            Call Now
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: LIVE SINGLE OUTBOUND CALL (REAL & DEMO) ──────── */}
      {activeTab === "live" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          {/* Left: Call Parameters & Mode Selection */}
          <div className="border border-ink/20 bg-paper p-6 space-y-4">
            <div className="border-b border-ink/15 pb-3">
              <span className="label-mono text-violet font-bold">// Single Outbound Dispatch</span>
              <h3 className="font-display text-lg font-bold uppercase">Single Voice Agent Call</h3>
              <p className="font-mono text-xs text-muted-foreground">
                Dial real phone numbers directly via Vapi AI & Twilio, or test using the interactive demo simulator.
              </p>
            </div>

            {/* Mode Switcher: Real Call vs Demo Simulator */}
            <div className="space-y-1.5 font-mono text-xs">
              <span className="text-muted-foreground text-[10px] uppercase font-bold block">
                Select Dispatch Mode:
              </span>
              <div className="grid grid-cols-2 border border-ink/20 bg-secondary/30 p-1 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setLiveCallMode("real");
                    setLiveCallError(null);
                  }}
                  className={`py-2 px-3 text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    liveCallMode === "real"
                      ? "bg-lime text-lime-foreground border border-lime shadow-sm font-black"
                      : "text-muted-foreground hover:text-ink"
                  }`}
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  Real Phone Call
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLiveCallMode("demo");
                    setLiveCallError(null);
                  }}
                  className={`py-2 px-3 text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    liveCallMode === "demo"
                      ? "bg-violet text-violet-foreground border border-violet shadow-sm"
                      : "text-muted-foreground hover:text-ink"
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  Demo Simulator
                </button>
              </div>

              {liveCallMode === "real" ? (
                <div className="border border-lime/40 bg-lime/10 p-2.5 text-[11px] text-ink space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold flex items-center gap-1 text-lime-700 dark:text-lime">
                      <CheckCircle2 className="w-3 h-3" /> Live Carrier Trunking Active (+1 571 543 8851)
                    </span>
                  </div>
                  <p className="text-muted-foreground text-[10px]">
                    The AI SDR will dial your phone via Twilio carrier trunks and conduct a live voice conversation.
                  </p>
                  <div className="pt-1.5 border-t border-ink/10 text-[10px] text-amber-700 dark:text-amber-400 font-mono">
                    ⚠️ <strong>Twilio Trial Notice:</strong> If your Twilio number is on a free trial, Twilio will say: <em>"You are using a trial account. Press any key to continue"</em>. <strong>Press 1 on your phone dialpad</strong> as soon as you hear this to immediately connect to the Vapi AI Agent! (Upgrading Twilio with $10 removes this prompt permanently).
                  </div>
                </div>
              ) : (
                <div className="border border-violet/40 bg-violet/10 p-2.5 text-[11px] text-ink space-y-0.5">
                  <span className="font-bold flex items-center gap-1 text-violet">
                    <Sparkles className="w-3 h-3" /> Safe Sandbox Simulation
                  </span>
                  <p className="text-muted-foreground text-[10px]">
                    Preview an instant simulated multi-turn conversation and post-call Groq intelligence without carrier charges.
                  </p>
                </div>
              )}
            </div>

            {/* Error Alert */}
            {liveCallError && (
              <div className="border border-danger/40 bg-danger/10 p-3 font-mono text-xs text-danger flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold block">Validation Error</span>
                  <span>{liveCallError}</span>
                </div>
              </div>
            )}

            <div className="space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between pb-1">
                <span className="text-muted-foreground text-[10px] uppercase font-bold">Call Configuration</span>
              </div>

              {/* Language Selection */}
              <div className="space-y-1">
                <label className="text-muted-foreground text-[10px] uppercase font-bold flex items-center justify-between">
                  <span>Language / Speech Engine</span>
                  <span className="text-lime-700 dark:text-lime font-bold">Auto-Switching Ready</span>
                </label>
                <select
                  value={liveCallLanguage}
                  onChange={(e) => setLiveCallLanguage(e.target.value as any)}
                  className="w-full border border-ink/30 bg-paper px-3 py-2 text-ink focus:outline-none focus:border-violet"
                >
                  <option value="auto">🌐 Auto-Detect (Hindi + Gujarati + English Auto-Switch)</option>
                  <option value="hi">🇮🇳 Hindi (हिन्दी — Direct Native Mode)</option>
                  <option value="gu">🇮🇳 Gujarati (ગુજરાતી — Direct Native Mode)</option>
                  <option value="en">🇬🇧 / 🇺🇸 English (Global Commercial SDR)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-muted-foreground text-[10px] uppercase font-bold">
                  Customer / Lead Name {liveCallMode === "real" && <span className="text-danger">*</span>}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Contact or Buyer Name"
                  value={liveCallForm.customer_name}
                  onChange={(e) => setLiveCallForm({ ...liveCallForm, customer_name: e.target.value })}
                  className="w-full border border-ink/30 bg-paper px-3 py-2 text-ink placeholder:text-muted-foreground/60 focus:outline-none focus:border-violet"
                />
              </div>

              {/* Destination Phone with Interactive Audio Keypad */}
              <div className="space-y-2 border border-ink/20 bg-secondary/15 p-3">
                <div className="flex items-center justify-between">
                  <label className="text-muted-foreground text-[10px] uppercase font-bold flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5 text-lime-700 dark:text-lime" />
                    <span>Destination Phone {liveCallMode === "real" && <span className="text-danger">*</span>}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowDialpad(!showDialpad)}
                    className="label-mono text-[10px] text-violet hover:underline font-bold flex items-center gap-1"
                  >
                    {showDialpad ? "⌨️ Hide Keypad" : "🔢 Open Dial Pad"}
                  </button>
                </div>

                {/* Big Phone Screen Display */}
                <div className="relative flex items-center border border-ink/40 bg-paper focus-within:border-violet focus-within:ring-1 focus-within:ring-violet">
                  <input
                    type="text"
                    placeholder="+91 98765 43210"
                    value={liveCallForm.customer_phone}
                    onChange={(e) => setLiveCallForm({ ...liveCallForm, customer_phone: e.target.value })}
                    className="w-full bg-transparent px-3 py-2.5 font-mono text-base tracking-wider font-bold text-ink placeholder:text-muted-foreground/40 placeholder:font-normal focus:outline-none"
                  />
                  <div className="flex items-center gap-1 pr-2 shrink-0">
                    {liveCallForm.customer_phone && (
                      <button
                        type="button"
                        onClick={handleDialpadBackspace}
                        className="p-1 text-muted-foreground hover:text-danger transition-colors cursor-pointer"
                        title="Delete last digit"
                      >
                        <Delete className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Country Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[9px] uppercase font-bold text-muted-foreground">Preset:</span>
                  {[
                    { label: "India", flag: "🇮🇳", code: "+91" },
                    { label: "USA/CA", flag: "🇺🇸", code: "+1" },
                    { label: "UK", flag: "🇬🇧", code: "+44" },
                    { label: "UAE", flag: "🇦🇪", code: "+971" },
                  ].map((p) => {
                    const isSelected = liveCallForm.customer_phone?.trim().startsWith(p.code);
                    return (
                      <button
                        key={p.code}
                        type="button"
                        onClick={() => handleSetCountryCode(p.code)}
                        className={`px-2 py-0.5 text-[10px] font-mono border transition-all flex items-center gap-1 cursor-pointer ${
                          isSelected
                            ? "border-violet bg-violet text-violet-foreground font-bold shadow-xs"
                            : "border-ink/20 bg-paper hover:bg-ink/5 text-ink"
                        }`}
                      >
                        <span>{p.flag}</span>
                        <span>{p.code}</span>
                      </button>
                    );
                  })}
                </div>

                {/* 3x4 Tactile Telephone Keypad with DTMF audio */}
                {showDialpad && (
                  <div className="pt-2 border-t border-ink/15 space-y-2">
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { key: "1", sub: "" },
                        { key: "2", sub: "ABC" },
                        { key: "3", sub: "DEF" },
                        { key: "4", sub: "GHI" },
                        { key: "5", sub: "JKL" },
                        { key: "6", sub: "MNO" },
                        { key: "7", sub: "PQRS" },
                        { key: "8", sub: "TUV" },
                        { key: "9", sub: "WXYZ" },
                        { key: "+", sub: "PREFIX" },
                        { key: "0", sub: "+" },
                        { key: "#", sub: "HASH" },
                      ].map((btn) => (
                        <button
                          key={btn.key}
                          type="button"
                          onClick={() => handleDialpadPress(btn.key)}
                          className="flex flex-col items-center justify-center py-2.5 px-1 border border-ink/20 bg-paper hover:bg-ink/5 active:bg-ink active:text-paper active:scale-95 transition-all shadow-xs cursor-pointer group select-none"
                        >
                          <span className="font-mono text-base font-bold text-ink group-active:text-paper leading-none">
                            {btn.key}
                          </span>
                          {btn.sub && (
                            <span className="text-[8px] font-mono tracking-widest text-muted-foreground group-active:text-paper/80 uppercase mt-0.5">
                              {btn.sub}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground font-mono px-0.5">
                      <span className="flex items-center gap-1">
                        <Volume2 className="w-3 h-3 text-violet" /> Realistic DTMF Audio Feedback
                      </span>
                      {liveCallForm.customer_phone && (
                        <button
                          type="button"
                          onClick={handleDialpadClear}
                          className="text-danger hover:underline font-bold cursor-pointer"
                        >
                          Clear All
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-muted-foreground text-[10px] uppercase font-bold">
                  Represented Business Name
                </label>
                <input
                  type="text"
                  placeholder={effectiveCompanyName}
                  value={liveCallForm.business_name}
                  onChange={(e) => setLiveCallForm({ ...liveCallForm, business_name: e.target.value })}
                  className="w-full border border-ink/30 bg-paper px-3 py-2 text-ink placeholder:text-muted-foreground/60 focus:outline-none focus:border-violet"
                />
              </div>

              <div className="space-y-1">
                <label className="text-muted-foreground text-[10px] uppercase font-bold">
                  Reason Why They Need to Be Called {liveCallMode === "real" && <span className="text-danger">*</span>}
                </label>
                <textarea
                  rows={3}
                  placeholder={
                    liveCallMode === "real"
                      ? "e.g. Follow-up regarding wholesale distribution pricing and onboarding assistance"
                      : "e.g. Quarterly commercial review & AI SDR solution expansion"
                  }
                  value={liveCallForm.call_reason}
                  onChange={(e) => setLiveCallForm({ ...liveCallForm, call_reason: e.target.value })}
                  className="w-full border border-ink/30 bg-paper p-3 text-ink placeholder:text-muted-foreground/60 focus:outline-none focus:border-violet resize-none"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={liveCallActive ? handleStopLiveCallMonitoring : handleStartLiveCall}
                className={`w-full py-3 label-mono text-xs font-bold uppercase transition-all flex items-center justify-center gap-2 ${
                  liveCallActive
                    ? "border border-danger bg-danger text-destructive-foreground hover:bg-danger/90 cursor-pointer shadow-lg animate-pulse"
                    : liveCallMode === "real"
                    ? "border border-lime bg-lime text-lime-foreground hover:bg-lime/90 shadow-sm cursor-pointer font-black"
                    : "border border-violet bg-violet text-violet-foreground hover:bg-violet/90 shadow-sm cursor-pointer"
                }`}
              >
                {liveCallActive ? (
                  <>
                    <PhoneOff className="w-4 h-4" /> End Call Now / Disconnect ({formatDuration(liveCallDuration)})
                  </>
                ) : liveCallMode === "real" ? (
                  <>
                    <PhoneCall className="w-4 h-4" /> Dial Real Phone Call (Vapi AI + Carrier)
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Run Demo Simulation
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right: Real-Time Audio Console & Timely Transcripts */}
          <div className="border border-ink/20 bg-paper p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-ink/15 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet" />
                <span className="label-mono font-bold text-ink">Live Audio Monitor & Transcript Stream</span>
              </div>
              <div className="flex items-center gap-2">
                {liveCallActive && (
                  <>
                    <span className="label-mono border border-danger/40 bg-danger/10 text-danger px-2 py-0.5 text-[9px] font-bold animate-pulse">
                      ACTIVE · {formatDuration(liveCallDuration)}
                    </span>
                    <button
                      onClick={handleStopLiveCallMonitoring}
                      className="border border-ink/20 bg-secondary/40 hover:bg-danger hover:text-paper hover:border-danger px-2 py-0.5 text-[9px] font-mono font-bold transition-colors"
                      title="End Call Monitoring"
                    >
                      Stop
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Live Status Banner */}
            {liveCallStatusMessage && (
              <div className="border border-ink/15 bg-secondary/30 px-3.5 py-2 font-mono text-xs flex items-center justify-between gap-2">
                <span className="text-ink font-bold">{liveCallStatusMessage}</span>
                {liveCallActive && (
                  <RefreshCw className="w-3 h-3 text-violet animate-spin shrink-0" />
                )}
              </div>
            )}

            {/* Audio Waveform Console - Hardware Terminal Style (always dark for glowing phosphor aesthetic) */}
            <div className="border border-neutral-800 bg-neutral-950 text-neutral-100 dark:bg-black p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-lime" />
                  <span className="font-mono text-xs font-bold text-lime">
                    {liveCallForm.business_name || effectiveCompanyName} AI SDR → {liveCallForm.customer_name || "Lead"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="label-mono text-[9px] text-neutral-400 uppercase">
                    {liveCallMode === "real" ? "REAL CALL" : "DEMO"}
                  </span>
                  <Volume2 className="w-4 h-4 text-neutral-400" />
                </div>
              </div>

              {/* Audio Waveform visualization */}
              <div className="h-12 flex items-center justify-center gap-1">
                {[40, 75, 30, 90, 60, 45, 80, 95, 35, 70, 85, 50, 65, 90, 40, 80, 55, 70, 30, 95, 60, 40, 85, 50, 70].map(
                  (h, idx) => (
                    <div
                      key={idx}
                      className={`w-1 bg-lime transition-all duration-150 ${
                        liveCallActive ? "opacity-100" : "opacity-30"
                      }`}
                      style={{
                        height: liveCallActive ? `${Math.max(15, (h * ((idx % 3) + 1)) % 100)}%` : "20%",
                      }}
                    />
                  )
                )}
              </div>
            </div>

            {/* Turn-by-Turn Streaming Transcript */}
            <div className="space-y-2">
              <span className="label-mono text-muted-foreground text-[10px] block">
                Timely Turn-by-Turn Audio Transcript
              </span>
              <div className="border border-ink/15 bg-secondary/20 p-4 space-y-3 max-h-[280px] overflow-y-auto font-mono text-xs">
                {liveCallTurns.length === 0 ? (
                  <div className="text-center p-6 text-muted-foreground text-xs italic">
                    Select &quot;Real Phone Call&quot; or &quot;Demo Simulator&quot; and click start to begin the conversation stream.
                  </div>
                ) : (
                  liveCallTurns.map((turn, i) => (
                    <div
                      key={i}
                      className={`p-3 space-y-1 border ${
                        turn.speaker === "agent"
                          ? "border-violet/30 bg-violet/5 text-ink ml-4"
                          : "border-ink/15 bg-paper mr-4 text-ink"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span className="font-bold flex items-center gap-1">
                          {turn.speaker === "agent" ? (
                            <>
                              <Bot className="w-3 h-3 text-violet" /> AI Voice SDR
                            </>
                          ) : (
                            <>
                              <User className="w-3 h-3 text-muted-foreground" /> {liveCallForm.customer_name || "Customer"}
                            </>
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => playSarvamAudio(turn.message, liveCallLanguage, `live-${i}`)}
                            className="border border-ink/20 px-1.5 py-0.5 text-[9px] hover:bg-lime/20 flex items-center gap-1 text-ink transition-colors font-mono font-bold"
                            title="Listen in Native Indic Voice (Sarvam AI)"
                          >
                            {playingAudioId === `live-${i}` ? (
                              <RefreshCw className="w-2.5 h-2.5 animate-spin text-lime-700 dark:text-lime" />
                            ) : (
                              <Volume2 className="w-2.5 h-2.5 text-lime-700 dark:text-lime" />
                            )}
                            Hear Voice
                          </button>
                          <span className="font-mono text-muted-foreground text-[9px]">{turn.timestamp}</span>
                        </div>
                      </div>
                      <p className="leading-relaxed">{turn.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* If Call Finished, show Inspection Card */}
            {liveCallRecord?.analysis && (
              <div className="border border-lime/40 bg-lime/10 p-4 space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="label-mono text-lime-700 dark:text-lime font-bold">
                    ✓ Call Completed · Groq AI Review Generated
                  </span>
                  <button
                    onClick={() => liveCallRecord && handleSelectCall(liveCallRecord)}
                    className="border border-ink/20 bg-paper px-2.5 py-1 text-[10px] font-bold hover:border-violet"
                  >
                    Open Deep-Dive Inspection →
                  </button>
                </div>
                <p className="text-muted-foreground text-[11px] line-clamp-2">
                  {liveCallRecord.analysis.summary}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 4: INBOUND VOICE RECEPTIONIST ────────────────────── */}
      {activeTab === "inbound" && (
        <div className="border border-ink/20 bg-paper p-6 space-y-6 max-w-2xl mx-auto">
          <div className="border-b border-ink/15 pb-4 space-y-1">
            <span className="label-mono text-lime-700 dark:text-lime font-bold">
              // Inbound Telephony Receptionist
            </span>
            <h3 className="font-display text-lg font-bold uppercase">Simulate Customer Inbound Call</h3>
            <p className="font-mono text-xs text-muted-foreground">
              When a prospect calls your Twilio number, Vapi answers with the persona of {effectiveCompanyName}, captures the transcript, and executes Groq post-call review.
            </p>
          </div>

          <form onSubmit={handleSimulateInbound} className="space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between pb-1 border-b border-ink/10">
              <span className="text-muted-foreground text-[10px] uppercase font-bold">Inbound Caller Profile</span>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[10px] uppercase font-bold">
                Caller / Prospect Name
              </label>
              <input
                type="text"
                placeholder="e.g. Priya Sharma"
                value={inboundForm.customer_name}
                onChange={(e) => setInboundForm({ ...inboundForm, customer_name: e.target.value })}
                className="w-full border border-ink/30 bg-paper px-3 py-2 text-ink placeholder:text-muted-foreground/60 focus:outline-none focus:border-violet"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[10px] uppercase font-bold">
                Caller Phone Number
              </label>
              <input
                type="text"
                placeholder="e.g. +1 (555) 892-4110"
                value={inboundForm.customer_phone}
                onChange={(e) => setInboundForm({ ...inboundForm, customer_phone: e.target.value })}
                className="w-full border border-ink/30 bg-paper px-3 py-2 text-ink placeholder:text-muted-foreground/60 focus:outline-none focus:border-violet"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[10px] uppercase font-bold">
                Target Business Being Called
              </label>
              <input
                type="text"
                placeholder={effectiveCompanyName}
                value={inboundForm.business_name}
                onChange={(e) => setInboundForm({ ...inboundForm, business_name: e.target.value })}
                className="w-full border border-ink/30 bg-paper px-3 py-2 text-ink placeholder:text-muted-foreground/60 focus:outline-none focus:border-violet"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[10px] uppercase font-bold">
                Customer Inquiry / Why They Are Calling In
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Interested in pricing and SLA guarantees for sales seats"
                value={inboundForm.caller_inquiry}
                onChange={(e) => setInboundForm({ ...inboundForm, caller_inquiry: e.target.value })}
                className="w-full border border-ink/30 bg-paper p-3 text-ink placeholder:text-muted-foreground/60 focus:outline-none focus:border-violet resize-none"
                required
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={inboundSubmitting}
                className="w-full border border-ink bg-ink text-paper py-3 label-mono text-xs font-bold uppercase hover:bg-violet hover:border-violet transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {inboundSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Simulating Inbound Call Stream...
                  </>
                ) : (
                  <>
                    <PhoneIncoming className="w-4 h-4 text-paper" /> Connect Inbound Call & Ingest
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── TAB 5: MANAGED TELEPHONY PLATFORM STATUS ──────────────── */}
      {activeTab === "settings" && (
        <div className="border border-ink/20 bg-paper p-6 space-y-6 max-w-2xl mx-auto font-mono text-xs">
          <div className="border-b border-ink/15 pb-4 space-y-1">
            <span className="label-mono text-violet font-bold">// Platform Infrastructure Status</span>
            <h3 className="font-display text-lg font-bold uppercase">Twilio Carrier & Vapi AI Engine Status</h3>
            <p className="text-muted-foreground">
              All telephony trunks, AI speech engines, and LLM reviewers are fully managed by the platform.
            </p>
          </div>

          <div className="space-y-3">
            <div className="border border-lime/40 bg-lime/10 p-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="font-bold text-ink flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-lime-700 dark:text-lime" /> Twilio Carrier Telephony Trunks
                </span>
                <span className="text-[10px] text-muted-foreground block">SIP Trunking & E.164 Global Caller ID Routing</span>
              </div>
              <span className="label-mono border border-lime/40 bg-lime/20 text-lime-700 dark:text-lime px-2 py-0.5 text-[9px] font-bold">
                OPERATIONAL
              </span>
            </div>

            <div className="border border-lime/40 bg-lime/10 p-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="font-bold text-ink flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-lime-700 dark:text-lime" /> Vapi AI Speech Agent Orchestrator
                </span>
                <span className="text-[10px] text-muted-foreground block">Speech-to-Speech Turn-Taking Engine</span>
              </div>
              <span className="label-mono border border-lime/40 bg-lime/20 text-lime-700 dark:text-lime px-2 py-0.5 text-[9px] font-bold">
                CONNECTED
              </span>
            </div>

            <div className="border border-lime/40 bg-lime/10 p-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="font-bold text-ink flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-lime-700 dark:text-lime" /> Sarvam AI Indic Speech Engine (Bulbul v3)
                </span>
                <span className="text-[10px] text-muted-foreground block">
                  Native Indic Pronunciation: Hindi (hi-IN) & Gujarati (gu-IN) Accents
                </span>
              </div>
              <span className="label-mono border border-lime/40 bg-lime/20 text-lime-700 dark:text-lime px-2 py-0.5 text-[9px] font-bold">
                ACTIVE & CONNECTED
              </span>
            </div>

            <div className="border border-lime/40 bg-lime/10 p-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="font-bold text-ink flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-lime-700 dark:text-lime" /> Groq Llama 3.3 Post-Call Intelligence
                </span>
                <span className="text-[10px] text-muted-foreground block">Automated Call Review, Sentiment & Action Checklist</span>
              </div>
              <span className="label-mono border border-lime/40 bg-lime/20 text-lime-700 dark:text-lime px-2 py-0.5 text-[9px] font-bold">
                ONLINE
              </span>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-5 pt-2">
            <div className="space-y-2">
              <label className="text-muted-foreground text-[10px] uppercase font-bold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-lime-700 dark:text-lime" /> Voice Synthesis Engine Selector & Comparison
                </span>
                <span className="text-[9px] text-lime-700 dark:text-lime font-mono font-bold">
                  Click any model to set as active engine
                </span>
              </label>

              {/* 2x2 Interactive Model Comparison Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                {[
                  {
                    id: "sarvam",
                    name: "Sarvam AI (Bulbul v3)",
                    tag: "100% Native Indic (Hindi & Gujarati)",
                    pros: "Authentic Indian accents, zero foreign tone, highest realism for Indian buyers.",
                    cons: "Specialized primarily for Indic regional languages.",
                    recommended: true,
                  },
                  {
                    id: "11labs",
                    name: "ElevenLabs Multilingual",
                    tag: "Global Multilingual (English & Europe)",
                    pros: "High conversational fluency for English and 30+ European languages.",
                    cons: "Heavy American/robotic accent when pronouncing Hindi or Gujarati.",
                    recommended: false,
                  },
                  {
                    id: "cartesia",
                    name: "Cartesia Sonic",
                    tag: "Ultra-Low Latency (<100ms Engine)",
                    pros: "Lightning-fast first byte response (<100ms) for quick English turns.",
                    cons: "Lacks native Indic phoneme tuning for regional Indian dialects.",
                    recommended: false,
                  },
                  {
                    id: "deepgram",
                    name: "Deepgram Aura V2",
                    tag: "Streaming Conversational Engine",
                    pros: "Single-pipeline integration with Deepgram speech-to-text stream.",
                    cons: "Flat prosody and accent distortion on non-English speech.",
                    recommended: false,
                  },
                ].map((m) => {
                  const isSelected = settings.voice_provider === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => setSettings({ ...settings, voice_provider: m.id })}
                      className={`p-4 border cursor-pointer transition-all space-y-2.5 relative ${
                        isSelected
                          ? "border-lime/60 bg-lime/10 shadow-md ring-1 ring-lime/40"
                          : "border-ink/20 bg-paper hover:border-ink/50 hover:bg-secondary/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-ink text-xs">{m.name}</span>
                            {m.recommended && (
                              <span className="bg-lime/20 text-lime-700 dark:text-lime text-[8px] font-bold px-1.5 py-0.2 border border-lime/40 label-mono">
                                PRIMARY RECOMMENDATION
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground block font-mono">{m.tag}</span>
                        </div>
                        {isSelected ? (
                          <CheckCircle2 className="w-4.5 h-4.5 text-lime-700 dark:text-lime shrink-0" />
                        ) : (
                          <div className="w-4 h-4 border border-ink/30 rounded-full shrink-0" />
                        )}
                      </div>

                      {/* Pros & Cons */}
                      <div className="space-y-1 pt-1 font-mono text-[10px] border-t border-ink/10">
                        <div className="flex items-start gap-1 text-lime-800 dark:text-lime">
                          <span className="font-bold shrink-0 text-[9px] bg-lime/20 px-1 py-0.2">ADV</span>
                          <span className="leading-snug">{m.pros}</span>
                        </div>
                        <div className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
                          <span className="font-bold shrink-0 text-[9px] bg-amber-500/20 px-1 py-0.2">DISADV</span>
                          <span className="leading-snug">{m.cons}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {settings.voice_provider === "sarvam" && (
              <div className="space-y-4 border border-ink/15 bg-secondary/10 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground text-[10px] uppercase font-bold flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-lime-700 dark:text-lime" /> Sarvam Speaker Persona
                    </label>
                    <select
                      value={settings.sarvam_speaker}
                      onChange={(e) =>
                        setSettings({ ...settings, sarvam_speaker: e.target.value, voice_id: e.target.value })
                      }
                      className="w-full border border-ink/30 bg-paper px-3 py-2 text-ink focus:outline-none focus:border-violet"
                    >
                      <option value="priya">Priya (Female — Clear, Authentic Hindi & Gujarati)</option>
                      <option value="aditya">Aditya (Male — Professional & Articulate Indic Tone)</option>
                      <option value="pooja">Pooja (Female — Warm & Consultative)</option>
                      <option value="shubh">Shubh (Male — Smooth & Engaging)</option>
                      <option value="ritu">Ritu (Female — Expressive & Dynamic)</option>
                      <option value="rohan">Rohan (Male — Energetic)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-muted-foreground text-[10px] uppercase font-bold flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-lime-700 dark:text-lime" /> Sarvam API Subscription Key
                    </label>
                    <input
                      type="text"
                      value={settings.sarvam_api_key}
                      onChange={(e) => setSettings({ ...settings, sarvam_api_key: e.target.value })}
                      placeholder="sk_..."
                      className="w-full border border-ink/30 bg-paper px-3 py-2 text-ink font-mono text-xs focus:outline-none focus:border-violet"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-muted-foreground text-[10px] uppercase font-bold flex items-center gap-1.5">
                    <UploadCloud className="w-3.5 h-3.5 text-lime-700 dark:text-lime" /> Public Webhook URL (Required for Live Calls with Sarvam AI Voice)
                  </label>
                  <input
                    type="text"
                    value={settings.public_webhook_url}
                    onChange={(e) => setSettings({ ...settings, public_webhook_url: e.target.value })}
                    placeholder="https://your-ngrok-subdomain.ngrok-free.app"
                    className="w-full border border-ink/30 bg-paper px-3 py-2 text-ink font-mono text-xs focus:outline-none focus:border-violet"
                  />
                  <span className="text-[10px] text-muted-foreground block leading-tight">
                    💡 <strong>For Live Phone Calls with Sarvam Voice:</strong> Vapi cloud servers require a public HTTPS URL (e.g. run <code className="bg-muted px-1 py-0.5 font-mono text-ink">ngrok http 8000</code> in your terminal and paste the URL here). If left blank/localhost, Vapi uses cloud fallback voice to prevent call disconnects.
                  </span>
                </div>

                {/* Voice Audition Previewer */}
                <div className="border border-ink/15 bg-paper p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-lime-700 dark:text-lime" /> Live Voice Audition (Sarvam Bulbul v3)
                    </span>
                    <span className="text-[9px] font-mono text-lime-700 dark:text-lime font-bold">
                      Zero Foreign Accent · Native Dialect
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={previewPlaying !== null}
                      onClick={() =>
                        playSarvamAudio(
                          "नमस्ते! मैं व्यपारी एआई सेल्स एजेंट हूँ। आज मैं आपके व्यापार को बढ़ाने में कैसे मदद कर सकती हूँ?",
                          "hi"
                        )
                      }
                      className="border border-ink/30 bg-secondary/30 hover:bg-lime/20 hover:border-lime px-3 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 transition-all text-ink"
                    >
                      {previewPlaying === "hi" ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-lime-700 dark:text-lime" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5 text-lime-700 dark:text-lime" />
                      )}
                      Audition Hindi (हिन्दी)
                    </button>

                    <button
                      type="button"
                      disabled={previewPlaying !== null}
                      onClick={() =>
                        playSarvamAudio(
                          "નમસ્તે! હું વ્યપારી એઆઈ સેલ્સ એજન્ટ છું. આજે હું તમારા વ્યવસાયના વેચાણ વધારવામાં કેવી રીતે મદદ કરી શકું?",
                          "gu"
                        )
                      }
                      className="border border-ink/30 bg-secondary/30 hover:bg-lime/20 hover:border-lime px-3 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 transition-all text-ink"
                    >
                      {previewPlaying === "gu" ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-lime-700 dark:text-lime" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5 text-lime-700 dark:text-lime" />
                      )}
                      Audition Gujarati (ગુજરાતી)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SMS Meeting Alerts Configuration */}
            <div className="border border-ink/20 bg-secondary/10 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label htmlFor="voiceSmsAlerts" className="text-ink font-bold text-xs cursor-pointer flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-lime-700 dark:text-lime" /> Enable SMS Meeting Alerts
                  </label>
                  <p className="text-muted-foreground text-[11px] font-mono">
                    Receive instant SMS notifications whenever a new meeting is scheduled or extracted from an AI call.
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="voiceSmsAlerts"
                  checked={settings.sms_alerts_enabled}
                  onChange={(e) => setSettings({ ...settings, sms_alerts_enabled: e.target.checked })}
                  className="cursor-pointer accent-violet w-4 h-4"
                />
              </div>

              <div className="space-y-1.5 pt-2 border-t border-ink/10 font-mono text-xs">
                <label className="label-mono text-muted-foreground flex items-center gap-1.5">
                  Alert Phone Number (fallback)
                </label>
                <input
                  type="text"
                  placeholder="+919876543210"
                  value={settings.alert_phone_number}
                  onChange={(e) => setSettings({ ...settings, alert_phone_number: e.target.value })}
                  className="w-full border border-ink/30 bg-paper px-3 py-2 text-ink focus:outline-none focus:border-violet"
                />
                <span className="text-[10px] text-muted-foreground block font-mono">
                  Fallback phone number to receive SMS alerts if user profile phone is not set.
                </span>
              </div>
            </div>

            {/* Calendly Integration Section */}
            <div className="space-y-3 border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                <span className="label-mono text-[10px] text-emerald-700 dark:text-emerald-400 uppercase font-bold tracking-wider">
                  Calendly Integration — Self-Booking Links for Leads
                </span>
              </div>
              <div className="space-y-1.5 font-mono text-xs">
                <label className="label-mono text-muted-foreground">Calendly Personal Access Token</label>
                <input
                  type="password"
                  placeholder="eyJ... (paste your Calendly PAT)"
                  value={settings.calendly_api_token}
                  onChange={(e) => setSettings({ ...settings, calendly_api_token: e.target.value })}
                  className="w-full border border-ink/30 bg-paper px-3 py-2 text-ink focus:outline-none focus:border-emerald-500 font-mono text-xs"
                />
                <span className="text-[10px] text-muted-foreground block">
                  Your Calendly API token. Used to fetch your event type scheduling links automatically.
                </span>
              </div>
              <div className="space-y-1.5 font-mono text-xs">
                <label className="label-mono text-muted-foreground">Calendly Booking URL (override or specific link)</label>
                <input
                  type="url"
                  placeholder="https://calendly.com/yourname/30min"
                  value={settings.calendly_event_url}
                  onChange={(e) => setSettings({ ...settings, calendly_event_url: e.target.value })}
                  className="w-full border border-ink/30 bg-paper px-3 py-2 text-ink focus:outline-none focus:border-emerald-500 font-mono text-xs"
                />
                <span className="text-[10px] text-muted-foreground block">
                  If set, this link is sent to leads via WhatsApp & SMS when a booking is confirmed. Overrides auto-fetch.
                </span>
              </div>
            </div>

            {/* Hate Speech & Abuse Guardrail Section */}
            <div className="space-y-3 border border-red-500/30 bg-red-500/5 dark:bg-red-950/20 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                  <div>
                    <span className="label-mono text-[10px] text-red-700 dark:text-red-400 uppercase font-bold tracking-wider block">
                      Trust & Safety — Multi-Lingual Speech Guardrail & Blacklist
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Real-time protection against hate speech, insults, and harassment across 10+ Indic languages.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      try {
                        localStorage.setItem("vyaperi_active_nav", "guardrail");
                        const url = new URL(window.location.href);
                        url.searchParams.set("tab", "guardrail");
                        window.history.replaceState(null, "", url.toString());
                        window.location.reload();
                      } catch {}
                    }
                  }}
                  className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 shrink-0"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Manage Blocked Numbers (PIN: 8899)
                </button>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="submit"
                disabled={savingSettings}
                className="border border-ink bg-ink text-paper px-5 py-2.5 label-mono font-bold hover:bg-violet hover:border-violet transition-all flex items-center gap-2"
              >
                {savingSettings ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                Save Voice Persona Preferences
              </button>

              {settingsSavedMessage && (
                <span className="label-mono text-lime-700 dark:text-lime font-bold">
                  ✓ Persona Preferences Saved
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* ── CALL DETAILS DEEP-DIVE MODAL / DRAWER ────────────────── */}
      {selectedCall && (
        <div className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="border-2 border-ink bg-paper w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="border-b border-ink/20 p-5 bg-secondary/30 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedCall.direction === "inbound" ? (
                    <span className="inline-flex items-center gap-1 border border-lime/40 bg-lime/10 text-lime-700 dark:text-lime px-2 py-0.5 text-[9px] font-bold">
                      <PhoneIncoming className="w-3 h-3" /> INBOUND CALL
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 border border-violet/40 bg-violet/10 text-violet px-2 py-0.5 text-[9px] font-bold">
                      <PhoneOutgoing className="w-3 h-3" /> OUTBOUND SDR CALL
                    </span>
                  )}
                  {isSampleCall(selectedCall) && (
                    <span className="border border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[9px] font-bold">
                      [DEMONSTRATION SAMPLE]
                    </span>
                  )}
                  <span className="label-mono text-muted-foreground text-[10px]">
                    ID: {selectedCall.id.slice(0, 8)}
                  </span>
                </div>
                <h3 className="font-display text-xl font-bold uppercase text-ink">
                  {selectedCall.customer_name} ({selectedCall.customer_phone})
                </h3>
                <p className="font-mono text-xs text-muted-foreground">
                  Representing: <span className="text-ink font-bold">{selectedCall.business_name}</span> · Reason: {selectedCall.call_reason}
                </p>
              </div>

              <button
                onClick={() => setSelectedCall(null)}
                className="border border-ink/20 p-1.5 hover:bg-danger hover:text-paper transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-ink/20 bg-secondary/10 px-5 gap-4 font-mono text-xs">
              <button
                onClick={() => setActiveDetailTab("transcript")}
                className={`py-3 font-bold uppercase border-b-2 transition-all flex items-center gap-1.5 ${
                  activeDetailTab === "transcript"
                    ? "border-violet text-violet"
                    : "border-transparent text-muted-foreground hover:text-ink"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" /> Timely Transcript ({selectedCall.transcript.length} turns)
              </button>
              <button
                onClick={() => setActiveDetailTab("analysis")}
                className={`py-3 font-bold uppercase border-b-2 transition-all flex items-center gap-1.5 ${
                  activeDetailTab === "analysis"
                    ? "border-violet text-violet"
                    : "border-transparent text-muted-foreground hover:text-ink"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-violet" /> Groq AI Call Review & Analysis
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 font-mono text-xs">
              {/* Tab 1: Timely Transcript */}
              {activeDetailTab === "transcript" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-ink/10 pb-2">
                    <span className="text-muted-foreground text-[10px] uppercase font-bold">
                      Call Duration: {formatDuration(selectedCall.duration_seconds)}
                    </span>
                    <button
                      onClick={() => {
                        const fullText = selectedCall.transcript
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

                  <div className="space-y-3">
                    {selectedCall.transcript.map((turn, i) => (
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
                                <Bot className="w-3.5 h-3.5 text-violet" /> AI Voice SDR (
                                {selectedCall.business_name})
                              </>
                            ) : (
                              <>
                                <User className="w-3.5 h-3.5 text-muted-foreground" /> {selectedCall.customer_name}
                              </>
                            )}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => playSarvamAudio(turn.message, "auto", `modal-${i}`)}
                              className="border border-ink/20 px-1.5 py-0.5 text-[9px] hover:bg-lime/20 flex items-center gap-1 text-ink transition-colors font-mono font-bold"
                              title="Listen in Native Indic Voice (Sarvam AI)"
                            >
                              {playingAudioId === `modal-${i}` ? (
                                <RefreshCw className="w-2.5 h-2.5 animate-spin text-lime-700 dark:text-lime" />
                              ) : (
                                <Volume2 className="w-2.5 h-2.5 text-lime-700 dark:text-lime" />
                              )}
                              Hear Voice
                            </button>
                            <span className="border border-ink/15 bg-paper px-1.5 py-0.2 text-[9px]">
                              {turn.timestamp}
                            </span>
                          </div>
                        </div>
                        <p className="leading-relaxed text-xs">{turn.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 2: Groq AI Call Review */}
              {activeDetailTab === "analysis" && (
                <div className="space-y-5">
                  {selectedCall.analysis ? (
                    <>
                      {/* Top Metric Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="border border-ink/15 bg-secondary/20 p-4 space-y-1">
                          <span className="label-mono text-muted-foreground text-[9px] block">Call Disposition</span>
                          <span className="font-display text-base font-bold text-ink">
                            {selectedCall.analysis.call_outcome || "—"}
                          </span>
                        </div>

                        <div className="border border-ink/15 bg-secondary/20 p-4 space-y-1">
                          <span className="label-mono text-muted-foreground text-[9px] block">Intent Qualification</span>
                          <div className="flex items-center gap-2">
                            <span className="font-display text-xl font-black text-violet">
                              {selectedCall.analysis.intent_score !== undefined ? `${selectedCall.analysis.intent_score}%` : "—"}
                            </span>
                            <span
                              className={`label-mono px-2 py-0.5 text-[9px] font-bold ${
                                selectedCall.analysis.lead_temperature === "Hot"
                                  ? "border border-danger/40 bg-danger/10 text-danger"
                                  : "border border-amber-500/40 bg-amber-500/10 text-amber-600"
                              }`}
                            >
                              {selectedCall.analysis.lead_temperature || "—"}
                            </span>
                          </div>
                        </div>

                        <div className="border border-ink/15 bg-secondary/20 p-4 space-y-1">
                          <span className="label-mono text-muted-foreground text-[9px] block">Sentiment</span>
                          <span
                            className={`font-display text-base font-bold uppercase ${
                              selectedCall.analysis.sentiment === "positive"
                                ? "text-lime-700 dark:text-lime"
                                : selectedCall.analysis.sentiment === "negative" || selectedCall.analysis.sentiment === "hostile_or_abusive"
                                ? "text-danger"
                                : "text-ink"
                            }`}
                          >
                            {selectedCall.analysis.sentiment === "hostile_or_abusive"
                              ? "Hostile / Abusive"
                              : selectedCall.analysis.sentiment || "—"}
                          </span>
                        </div>
                      </div>

                      {/* Abusive Language Warning Banner if detected */}
                      {(selectedCall.analysis.abuse_detected || selectedCall.abuse_detected || selectedCall.flagged) && (
                        <div className="border border-red-500/40 bg-red-500/10 p-4 space-y-1">
                          <span className="label-mono text-danger text-[10px] font-bold block uppercase flex items-center gap-1.5">
                            ⚠️ QA Flag: Abusive / Hostile Language Detected
                          </span>
                          <p className="text-xs text-danger font-medium leading-relaxed">
                            {selectedCall.analysis.abuse_details || selectedCall.flagged || "Caller used aggressive insults, foul language, or profanity during call."}
                          </p>
                        </div>
                      )}

                      {/* Meeting Booked Banner if confirmed */}
                      {(selectedCall.analysis.meeting_booked || selectedCall.analysis.call_outcome === "Meeting Booked") && (
                        <div className="border border-lime/40 bg-lime/10 p-4 space-y-1">
                          <span className="label-mono text-lime-700 dark:text-lime text-[10px] font-bold block uppercase flex items-center gap-1.5">
                            📅 Meeting Confirmed & Added to Calendar
                          </span>
                          <p className="text-xs text-ink font-medium leading-relaxed">
                            {selectedCall.analysis.meeting_details?.date_time_requested
                              ? `Requested Time: ${selectedCall.analysis.meeting_details.date_time_requested} • Attendee: ${selectedCall.analysis.meeting_details.attendee_name || selectedCall.customer_name} (${selectedCall.analysis.meeting_details.attendee_email || selectedCall.customer_phone})`
                              : "Meeting details successfully extracted and synchronized to the Calendar tab."}
                          </p>
                        </div>
                      )}

                      {/* Executive Summary */}
                      <div className="border border-ink/15 bg-paper p-4 space-y-2">
                        <span className="label-mono text-violet text-[10px] font-bold block uppercase">
                          Executive Conversation Summary
                        </span>
                        <p className="text-xs text-ink leading-relaxed">
                          {selectedCall.analysis.summary}
                        </p>
                      </div>

                      {/* Key Discussion Points */}
                      {selectedCall.analysis.key_points_discussed && (
                        <div className="border border-ink/15 bg-paper p-4 space-y-2">
                          <span className="label-mono text-muted-foreground text-[10px] font-bold block uppercase">
                            Key Factual Points Discussed
                          </span>
                          <ul className="space-y-1 text-xs text-ink list-disc list-inside">
                            {selectedCall.analysis.key_points_discussed.map((pt, idx) => (
                              <li key={idx}>{pt}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Customer Objections or Concerns */}
                      {selectedCall.analysis.customer_concerns && selectedCall.analysis.customer_concerns.length > 0 && (
                        <div className="border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
                          <span className="label-mono text-amber-700 dark:text-amber-400 text-[10px] font-bold block uppercase">
                            Customer Objections & Hesitations Raised
                          </span>
                          <ul className="space-y-1 text-xs text-ink list-disc list-inside">
                            {selectedCall.analysis.customer_concerns.map((ob, idx) => (
                              <li key={idx}>{ob}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Action Items & Follow-up Checklist */}
                      {selectedCall.analysis.action_items && (
                        <div className="border border-lime/30 bg-lime/5 p-4 space-y-2">
                          <span className="label-mono text-lime-700 dark:text-lime text-[10px] font-bold block uppercase">
                            Recommended Action Items & Next Steps
                          </span>
                          <div className="space-y-1.5 pt-1">
                            {selectedCall.analysis.action_items.map((action, idx) => {
                              const key = `${selectedCall.id}-act-${idx}`;
                              const isChecked = checkedItems[key] || false;
                              return (
                                <div
                                  key={idx}
                                  onClick={() => setCheckedItems((prev) => ({ ...prev, [key]: !isChecked }))}
                                  className="flex items-center gap-2 cursor-pointer hover:text-violet"
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

                      {/* Agent Review */}
                      {selectedCall.analysis.agent_performance_review && (
                        <div className="border border-ink/15 bg-secondary/20 p-4 space-y-1 text-[11px] text-muted-foreground">
                          <span className="label-mono text-[9px] uppercase font-bold text-ink block">
                            AI Agent Quality Review:
                          </span>
                          <p>{selectedCall.analysis.agent_performance_review}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="p-8 text-center space-y-3">
                      <p className="text-muted-foreground">No Groq review has been generated for this call yet.</p>
                      <button
                        onClick={() => handleReanalyzeCall(selectedCall.id)}
                        disabled={reanalyzing}
                        className="border border-violet bg-violet text-violet-foreground px-4 py-2 label-mono text-xs font-bold hover:bg-violet/90"
                      >
                        {reanalyzing ? "Analyzing with Groq..." : "Run Groq Post-Call Audit Now"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-ink/20 p-4 bg-secondary/20 flex items-center justify-between">
              <button
                onClick={() => handleReanalyzeCall(selectedCall.id)}
                disabled={reanalyzing}
                className="border border-ink/30 px-3 py-1.5 label-mono text-xs font-bold hover:bg-paper transition-all flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reanalyzing ? "animate-spin text-violet" : ""}`} />
                {reanalyzing ? "Re-Auditing..." : "Re-Analyze with Groq"}
              </button>

              <button
                onClick={() => setSelectedCall(null)}
                className="border border-ink bg-ink text-paper px-4 py-1.5 label-mono text-xs font-bold hover:bg-secondary hover:text-ink transition-all"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
