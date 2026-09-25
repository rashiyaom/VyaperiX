import React, { useState, useEffect } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Ban,
  Lock,
  Unlock,
  Trash2,
  Plus,
  RefreshCw,
  Search,
  AlertTriangle,
  Sparkles,
  Phone,
  PhoneOff,
  User,
  Clock,
  Terminal,
  Volume2,
  CheckCircle2,
  Sliders,
  Settings,
  HelpCircle,
  Eye,
  EyeOff,
  Flame,
} from "lucide-react";
import { getApiBase } from "@/lib/api";

interface BlocklistEntry {
  id: string;
  phone: string;
  raw_phone?: string;
  customer_name: string;
  reason: string;
  transcript_snippet?: string;
  language?: string;
  severity: "high" | "medium" | "critical";
  category: string;
  blocked_by: "ai_guardrail" | "admin";
  status: "active" | "unblocked";
  created_at: string;
  updated_at?: string;
}

interface GuardrailSettings {
  auto_block_enabled: boolean;
  sensitivity: "strict" | "balanced" | "lenient";
  action_on_rude: "warn" | "disconnect";
  max_strikes: number;
  warning_phrase: string;
  termination_phrase: string;
  secret_pin?: string;
  languages_monitored: string[];
}

interface EvalResult {
  safe: boolean;
  verdict: "SAFE" | "WARNING" | "BLOCKED";
  severity: string;
  category: string;
  detected_language: string;
  explanation: string;
  trigger_words: string[];
  current_strikes: number;
  new_strikes: number;
  action: "continue" | "warn" | "disconnect_and_block";
  prompt_response?: string;
  blocked?: boolean;
}

export function SecretGuardrailPanel({
  onClose,
}: {
  onClose?: () => void;
}) {
  const API_BASE = getApiBase();

  // Authentication State
  const [pin, setPin] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinError, setPinError] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState<"blocklist" | "settings" | "simulator">("blocklist");

  // Blocklist Data
  const [blocklist, setBlocklist] = useState<BlocklistEntry[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "unblocked" | "all">("active");

  // Manual Block Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [newReason, setNewReason] = useState("Manually blacklisted by team");
  const [addingBlock, setAddingBlock] = useState(false);

  // Settings State
  const [settings, setSettings] = useState<GuardrailSettings>({
    auto_block_enabled: true,
    sensitivity: "balanced",
    action_on_rude: "warn",
    max_strikes: 2,
    warning_phrase:
      "I understand you may be upset, but please maintain polite and respectful language so I can assist you.",
    termination_phrase:
      "This call is being terminated due to abusive or inappropriate language. Have a good day.",
    secret_pin: "8899",
    languages_monitored: [
      "Hindi",
      "Gujarati",
      "English",
      "Tamil",
      "Telugu",
      "Marathi",
      "Bengali",
      "Kannada",
      "Malayalam",
      "Punjabi",
      "Odia",
    ],
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedMsg, setSettingsSavedMsg] = useState("");

  // Simulator State
  const [simText, setSimText] = useState("");
  const [simContext, setSimContext] = useState("");
  const [simStrikes, setSimStrikes] = useState(0);
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);

  // Check if previously unlocked in current browser session
  useEffect(() => {
    const sessionAuth = sessionStorage.getItem("vyaperi_guardrail_unlocked");
    if (sessionAuth === "true") {
      setIsUnlocked(true);
    }
  }, []);

  // Fetch blocklist and settings once unlocked
  useEffect(() => {
    if (isUnlocked) {
      fetchBlocklist();
      fetchSettings();
    }
  }, [isUnlocked, statusFilter]);

  const handleVerifyPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pin) {
      setPinError("Please enter your 4-digit PIN");
      return;
    }
    setVerifying(true);
    setPinError("");
    try {
      const res = await fetch(`${API_BASE}/api/guardrail/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.authorized) {
        setIsUnlocked(true);
        sessionStorage.setItem("vyaperi_guardrail_unlocked", "true");
      } else {
        setPinError("Incorrect Security PIN. Access denied.");
      }
    } catch (err: any) {
      // Fallback local check if backend is starting
      if (pin === "8899") {
        setIsUnlocked(true);
        sessionStorage.setItem("vyaperi_guardrail_unlocked", "true");
      } else {
        setPinError("Connection error or invalid PIN.");
      }
    } finally {
      setVerifying(false);
    }
  };

  const fetchBlocklist = async () => {
    setLoadingList(true);
    try {
      const res = await fetch(`${API_BASE}/api/guardrail/blocklist?status=${statusFilter}`);
      const data = await res.json();
      if (data.success) {
        setBlocklist(data.blocklist || []);
      }
    } catch (err) {
      console.error("Failed to load blocklist", err);
    } finally {
      setLoadingList(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/guardrail/settings`);
      const data = await res.json();
      if (data.success && data.settings) {
        setSettings((prev) => ({ ...prev, ...data.settings }));
      }
    } catch (err) {
      console.error("Failed to fetch guardrail settings", err);
    }
  };

  const handleUnblock = async (phoneOrId: string) => {
    if (!confirm(`Are you sure you want to unblock ${phoneOrId}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/guardrail/blocklist/${encodeURIComponent(phoneOrId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        fetchBlocklist();
      }
    } catch (err) {
      alert("Failed to unblock phone number.");
    }
  };

  const handleAddManualBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone.trim()) return;
    setAddingBlock(true);
    try {
      const res = await fetch(`${API_BASE}/api/guardrail/blocklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: newPhone.trim(),
          customer_name: newName.trim() || "Manual Blacklist",
          reason: newReason.trim() || "Manually blocked by admin",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddModal(false);
        setNewPhone("");
        setNewName("");
        fetchBlocklist();
      } else {
        alert(data.detail || "Failed to block number.");
      }
    } catch (err: any) {
      alert("Error adding number to blocklist: " + err.message);
    } finally {
      setAddingBlock(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setSettingsSavedMsg("");
    try {
      const res = await fetch(`${API_BASE}/api/guardrail/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        setSettingsSavedMsg("✓ Guardrail settings saved & deployed across fleet!");
        setTimeout(() => setSettingsSavedMsg(""), 4000);
      }
    } catch (err: any) {
      alert("Failed to update settings: " + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRunSimulation = async (textToTest?: string) => {
    const text = textToTest || simText;
    if (!text.trim()) return;
    setEvaluating(true);
    setEvalResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/guardrail/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          conversation_context: simContext.trim() || undefined,
          current_strikes: simStrikes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEvalResult(data.result);
      }
    } catch (err: any) {
      alert("Simulation failed: " + err.message);
    } finally {
      setEvaluating(false);
    }
  };

  const filteredBlocklist = blocklist.filter((b) => {
    const q = searchQuery.toLowerCase();
    return (
      b.phone.toLowerCase().includes(q) ||
      (b.customer_name && b.customer_name.toLowerCase().includes(q)) ||
      (b.reason && b.reason.toLowerCase().includes(q)) ||
      (b.transcript_snippet && b.transcript_snippet.toLowerCase().includes(q))
    );
  });

  // ─────────────────────────── LOCKED SCREEN ───────────────────────────
  if (!isUnlocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-foreground">
        <div className="relative w-full max-w-md p-8 rounded-2xl bg-card/90 border border-primary/20 backdrop-blur-xl shadow-2xl shadow-primary/5 text-center">
          {/* Glowing Shield Icon */}
          <div className="inline-flex p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 mb-6 shadow-lg shadow-red-500/10 animate-pulse">
            <ShieldAlert className="w-12 h-12" />
          </div>

          <h2 className="text-2xl font-bold font-display tracking-tight text-foreground">
            Trust & Safety Shield
          </h2>
          <p className="text-xs text-muted-foreground mt-2 font-mono">
            RESTRICTED ADMIN ACCESS • MULTI-LINGUAL SPEECH GUARDRAIL
          </p>

          <form onSubmit={handleVerifyPin} className="mt-8 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono font-medium text-muted-foreground block text-left">
                  Security Passcode
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setPin("8899");
                    setPinError("");
                  }}
                  className="text-[11px] font-mono text-primary hover:underline hover:text-primary/80 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" /> Default: <strong className="text-foreground bg-secondary/80 px-1.5 py-0.5 rounded border border-border/50">8899</strong>
                </button>
              </div>
              <div className="relative">
                <input
                  type="password"
                  maxLength={8}
                  placeholder="Enter PIN (Default: 8899)"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full text-center tracking-[0.4em] font-mono text-xl py-3 px-4 rounded-xl bg-background/80 border border-border focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:tracking-normal placeholder:text-sm text-foreground"
                  autoFocus
                />
                <Lock className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <p className="text-[11px] font-mono text-muted-foreground text-left">
                First time logging in? The master setup PIN is <strong className="text-foreground">8899</strong>. You can customize this in Shield Settings once unlocked.
              </p>
            </div>

            {pinError && (
              <p className="text-xs font-mono text-red-500 bg-red-500/10 border border-red-500/20 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 animate-shake">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {pinError}
              </p>
            )}

            <button
              type="submit"
              disabled={verifying}
              className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 transition-all disabled:opacity-50"
            >
              {verifying ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Unlock className="w-4 h-4" />
              )}
              Unlock Command Center
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-border/50 text-[11px] font-mono text-muted-foreground">
            🛡️ VyaperiX Defense Matrix • 10+ Indic Languages Active
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────── UNLOCKED DASHBOARD ───────────────────────
  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 text-foreground">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-500 shadow-sm">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold font-display tracking-tight text-foreground">
                Hate Speech & Abuse Guardrail
              </h1>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                ● ACTIVE FLEET SHIELD
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              10+ Indic Languages Monitored • Automated Abuse Termination • Blacklist Defense
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => {
              setIsUnlocked(false);
              sessionStorage.removeItem("vyaperi_guardrail_unlocked");
            }}
            className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg border border-border hover:bg-secondary/70 transition-colors text-muted-foreground hover:text-foreground"
            title="Lock Panel"
          >
            <Lock className="w-3.5 h-3.5" />
            Lock
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs font-mono px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-1">
        <button
          onClick={() => setActiveTab("blocklist")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-semibold transition-all ${
            activeTab === "blocklist"
              ? "bg-red-500/15 border border-red-500/30 text-red-600 dark:text-red-400 shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
          }`}
        >
          <Ban className="w-4 h-4" />
          Blocked Numbers ({blocklist.filter((b) => b.status === "active").length})
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-semibold transition-all ${
            activeTab === "settings"
              ? "bg-primary/15 border border-primary/30 text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
          }`}
        >
          <Sliders className="w-4 h-4" />
          Guardrail Settings
        </button>

        <button
          onClick={() => setActiveTab("simulator")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-semibold transition-all ${
            activeTab === "simulator"
              ? "bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Multi-Lingual Simulator
        </button>
      </div>

      {/* ─────────────────────────── TAB 1: BLOCKLIST ─────────────────────── */}
      {activeTab === "blocklist" && (
        <div className="space-y-4">
          {/* Action Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search phone, caller, or reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-card border border-border focus:border-red-500 outline-none text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <select
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl bg-card border border-border text-foreground outline-none"
              >
                <option value="active">Active Blocked Only</option>
                <option value="unblocked">Unblocked History</option>
                <option value="all">All Records</option>
              </select>

              <button
                onClick={fetchBlocklist}
                className="p-2 rounded-xl border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                title="Refresh list"
              >
                <RefreshCw className={`w-4 h-4 ${loadingList ? "animate-spin" : ""}`} />
              </button>

              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 text-xs font-mono px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                Add to Blocklist
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/80 bg-secondary/50 font-mono text-muted-foreground uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Caller / Phone</th>
                    <th className="py-3 px-4">Violation Reason & Trigger</th>
                    <th className="py-3 px-4">Language</th>
                    <th className="py-3 px-4">Severity</th>
                    <th className="py-3 px-4">Blocked Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredBlocklist.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted-foreground font-mono">
                        {loadingList ? (
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-red-500" />
                            Loading blocklist...
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <ShieldCheck className="w-8 h-8 text-emerald-500/50 mx-auto" />
                            <p className="text-sm font-medium">No phone numbers in this filter</p>
                            <p className="text-[11px] text-muted-foreground">
                              Abusive callers will be automatically listed here.
                            </p>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredBlocklist.map((item) => (
                      <tr key={item.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-foreground flex items-center gap-1.5">
                            <PhoneOff className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            {item.phone}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                            {item.customer_name || "Unknown Caller"}
                          </div>
                        </td>

                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-medium text-foreground truncate" title={item.reason}>
                            {item.reason}
                          </div>
                          {item.transcript_snippet && (
                            <div
                              className="text-[10px] font-mono text-muted-foreground italic truncate mt-0.5 bg-background/50 px-2 py-0.5 rounded border border-border/50"
                              title={item.transcript_snippet}
                            >
                              "{item.transcript_snippet}"
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 font-mono text-[11px]">
                          <span className="px-2 py-0.5 rounded-full bg-secondary text-foreground">
                            {item.language || "Indic"}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full font-mono text-[10px] uppercase font-semibold ${
                              item.severity === "high" || item.severity === "critical"
                                ? "bg-red-500/15 border border-red-500/30 text-red-500"
                                : "bg-amber-500/15 border border-amber-500/30 text-amber-500"
                            }`}
                          >
                            {item.severity}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Date(item.created_at).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>

                        <td className="py-3 px-4">
                          {item.status === "active" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-red-500 font-semibold bg-red-500/10 px-2 py-0.5 rounded-full">
                              ● Blocked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-500 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                              ✓ Unblocked
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          {item.status === "active" ? (
                            <button
                              onClick={() => handleUnblock(item.phone)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium border border-border hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-500 transition-all text-muted-foreground"
                            >
                              Unblock
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setNewPhone(item.phone);
                                setNewName(item.customer_name);
                                setShowAddModal(true);
                              }}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium border border-border hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-500 transition-all text-muted-foreground"
                            >
                              Re-block
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────── TAB 2: SETTINGS ─────────────────────── */}
      {activeTab === "settings" && (
        <div className="space-y-6 max-w-4xl">
          <div className="p-6 rounded-2xl bg-card border border-border space-y-6 shadow-sm">
            <h2 className="text-base font-bold font-display flex items-center gap-2 text-foreground">
              <Sliders className="w-5 h-5 text-primary" />
              Automated Guardrail Behavior
            </h2>

            {/* Toggle: Auto Block */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/70">
              <div className="space-y-0.5 pr-4">
                <span className="text-sm font-semibold text-foreground">
                  Automated Number Blacklisting
                </span>
                <p className="text-xs text-muted-foreground">
                  When enabled, any caller uttering severe hate speech, threats, or exceeding warning strikes is immediately added to the Blacklist and calls are dropped.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={settings.auto_block_enabled}
                  onChange={(e) =>
                    setSettings({ ...settings, auto_block_enabled: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
              </label>
            </div>

            {/* Sensitivity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-mono font-medium text-foreground">
                  AI Guard Sensitivity
                </label>
                <select
                  value={settings.sensitivity}
                  onChange={(e: any) =>
                    setSettings({ ...settings, sensitivity: e.target.value })
                  }
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground outline-none focus:border-primary"
                >
                  <option value="strict">Strict — Zero tolerance for mild rudeness</option>
                  <option value="balanced">Balanced (Recommended) — Distinguishes complaints from insults</option>
                  <option value="lenient">Lenient — Only blocks explicit threats & severe profanity</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono font-medium text-foreground">
                  Action on Personal Insult ("You have 0 sense / dog")
                </label>
                <select
                  value={settings.action_on_rude}
                  onChange={(e: any) =>
                    setSettings({ ...settings, action_on_rude: e.target.value })
                  }
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground outline-none focus:border-primary"
                >
                  <option value="warn">Warn on Strike 1 (Polite boundary setting)</option>
                  <option value="disconnect">Immediate Disconnect on 1st Insult</option>
                </select>
              </div>
            </div>

            {/* Warning Phrase */}
            <div className="space-y-2">
              <label className="text-xs font-mono font-medium text-foreground flex items-center justify-between">
                <span>AI Warning Phrase (Strike 1)</span>
                <span className="text-[10px] text-muted-foreground">Spoken to caller upon insult</span>
              </label>
              <textarea
                rows={2}
                value={settings.warning_phrase}
                onChange={(e) => setSettings({ ...settings, warning_phrase: e.target.value })}
                className="w-full p-3 rounded-xl bg-background border border-border text-xs text-foreground outline-none focus:border-primary font-mono"
              />
            </div>

            {/* Termination Phrase */}
            <div className="space-y-2">
              <label className="text-xs font-mono font-medium text-foreground flex items-center justify-between">
                <span>AI Disconnection Phrase (Call Termination)</span>
                <span className="text-[10px] text-muted-foreground">Spoken before hanging up</span>
              </label>
              <textarea
                rows={2}
                value={settings.termination_phrase}
                onChange={(e) => setSettings({ ...settings, termination_phrase: e.target.value })}
                className="w-full p-3 rounded-xl bg-background border border-border text-xs text-foreground outline-none focus:border-red-500 font-mono"
              />
            </div>

            {/* Secret PIN Update */}
            <div className="p-4 rounded-xl bg-background/50 border border-border/80 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Lock className="w-4 h-4 text-amber-500" />
                Change Secret Access PIN
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  maxLength={8}
                  placeholder="Set 4-digit PIN"
                  value={settings.secret_pin || ""}
                  onChange={(e) => setSettings({ ...settings, secret_pin: e.target.value })}
                  className="w-40 font-mono text-center tracking-widest text-sm py-2 px-3 rounded-lg bg-card border border-border text-foreground outline-none focus:border-primary"
                />
                <span className="text-[11px] text-muted-foreground">
                  Default: 8899. Protects this panel from unauthorized access.
                </span>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-between pt-2">
              {settingsSavedMsg ? (
                <span className="text-xs font-mono text-emerald-500 font-medium animate-fadeIn">
                  {settingsSavedMsg}
                </span>
              ) : <div />}

              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-mono font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                {savingSettings ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Save Guardrail Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────── TAB 3: SIMULATOR ─────────────────────── */}
      {activeTab === "simulator" && (
        <div className="space-y-6 max-w-4xl">
          <div className="p-6 rounded-2xl bg-card border border-border space-y-5 shadow-sm">
            <div>
              <h2 className="text-base font-bold font-display flex items-center gap-2 text-foreground">
                <Sparkles className="w-5 h-5 text-amber-500" />
                Multi-Lingual Speech Evaluation Simulator
              </h2>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                Test how the Guardrail classifies Indian languages, insults, and negotiations.
              </p>
            </div>

            {/* Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-mono text-muted-foreground">Quick Test Presets:</span>
              <div className="flex flex-wrap gap-2">
                {[
                  {
                    label: "🟢 Clean Hindi Negotiation",
                    text: "Bhaiya thoda discount milega kya wholesale order pe? Ham regular lenge.",
                  },
                  {
                    label: "🟡 Insult: '0 sense / kutte'",
                    text: "You are a dog and you have 0 sense, dimag nahi hai tere me.",
                  },
                  {
                    label: "🟡 Gujarati Insult: 'Akkal nathi'",
                    text: "Tame badha pagal cho, tamara ma akkal nathi, koi samaj nathi.",
                  },
                  {
                    label: "🟡 Tamil Insult: 'Arivu illa'",
                    text: "Unakku arivu irukka? Enna pesara nee?",
                  },
                  {
                    label: "🔴 Direct Violent Threat",
                    text: "I will come with 10 people and destroy your office and kill you.",
                  },
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSimText(preset.text);
                      handleRunSimulation(preset.text);
                    }}
                    className="text-[11px] font-mono px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-all text-foreground"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Box */}
            <div className="space-y-2">
              <label className="text-xs font-mono font-medium text-foreground">
                Input Utterance / Transcript Line:
              </label>
              <textarea
                rows={3}
                placeholder="Type or paste any customer statement in Hindi, Gujarati, Tamil, English, etc..."
                value={simText}
                onChange={(e) => setSimText(e.target.value)}
                className="w-full p-3.5 rounded-xl bg-background border border-border text-xs text-foreground outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-muted-foreground">Simulate Strikes:</span>
                <select
                  value={simStrikes}
                  onChange={(e) => setSimStrikes(Number(e.target.value))}
                  className="px-2 py-1 rounded-lg bg-background border border-border text-foreground"
                >
                  <option value={0}>Strike 0 (First Utterance)</option>
                  <option value={1}>Strike 1 (Already Warned)</option>
                </select>
              </div>

              <button
                onClick={() => handleRunSimulation()}
                disabled={evaluating || !simText.trim()}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-mono font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                {evaluating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Evaluate with AI Guard
              </button>
            </div>

            {/* Results Display */}
            {evalResult && (
              <div
                className={`p-5 rounded-xl border mt-4 transition-all ${
                  evalResult.verdict === "SAFE"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-300"
                    : evalResult.verdict === "WARNING"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-300"
                    : "bg-red-500/10 border-red-500/30 text-red-900 dark:text-red-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold font-display uppercase tracking-wider">
                      Verdict: {evalResult.verdict}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-background/80 border border-current">
                      Lang: {evalResult.detected_language}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-background/80 border border-current">
                      Cat: {evalResult.category}
                    </span>
                  </div>

                  <span className="text-xs font-mono font-bold">
                    Action: {evalResult.action.toUpperCase()}
                  </span>
                </div>

                <p className="text-xs font-mono mt-2 opacity-90">
                  <strong>Analysis:</strong> {evalResult.explanation}
                </p>

                {evalResult.trigger_words && evalResult.trigger_words.length > 0 && (
                  <div className="mt-2 text-xs font-mono flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold">Triggered by:</span>
                    {evalResult.trigger_words.map((w, idx) => (
                      <span
                        key={idx}
                        className="px-1.5 py-0.5 rounded bg-background/80 text-[10px] font-bold border border-current"
                      >
                        "{w}"
                      </span>
                    ))}
                  </div>
                )}

                {evalResult.prompt_response && (
                  <div className="mt-3 p-3 rounded-lg bg-background/90 border border-current/20 text-xs font-mono text-foreground">
                    <div className="flex items-center gap-1.5 font-bold mb-1 text-primary">
                      <Volume2 className="w-3.5 h-3.5" />
                      Suggested AI Spoken Response:
                    </div>
                    "{evalResult.prompt_response}"
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────── MANUAL BLOCK MODAL ─────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md p-6 rounded-2xl bg-card border border-border shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold font-display flex items-center gap-2 text-foreground">
                <Ban className="w-5 h-5 text-red-500" />
                Manually Blacklist Phone Number
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-xs text-muted-foreground hover:text-foreground font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddManualBlock} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-mono text-foreground font-medium">
                  Phone Number *
                </label>
                <input
                  type="text"
                  placeholder="+919876543210 or 9876543210"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  required
                  className="w-full text-xs font-mono p-2.5 rounded-xl bg-background border border-border text-foreground outline-none focus:border-red-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono text-foreground font-medium">
                  Caller / Lead Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Abusive Caller"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl bg-background border border-border text-foreground outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono text-foreground font-medium">
                  Reason for Blacklisting
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Threatening call / Repeated profanity"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl bg-background border border-border text-foreground outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-mono text-muted-foreground hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingBlock || !newPhone.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-red-600 hover:bg-red-500 text-white shadow-sm disabled:opacity-50"
                >
                  {addingBlock ? "Blocking..." : "Add to Blocklist"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
