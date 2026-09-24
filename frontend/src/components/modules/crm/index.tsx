import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { getApiBase, getAuthHeaders } from "@/lib/api";
import {
  Share2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Download,
  Building,
  Mail,
  Phone,
  Flame,
  Zap,
  ShieldCheck,
  Search,
  Filter,
  DollarSign,
  Users,
  Briefcase,
  Layers,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  Link as LinkIcon,
  Sliders,
  Check,
} from "lucide-react";

interface CRMModuleProps {
  companyName?: string;
}

interface CRMStatus {
  crm_type: string;
  hubspot: {
    configured: boolean;
    has_token: boolean;
    connected: boolean;
    mode: "live" | "sandbox_mock";
    message: string;
  };
  webhook: {
    configured: boolean;
    url: string;
    events: string[];
  };
  totals: {
    synced_contacts: number;
    synced_deals: number;
    total_deal_value_inr: number;
    last_sync_at: string | null;
  };
}

interface CRMRecord {
  id?: string;
  lead_id?: string;
  meeting_id?: string;
  company: string;
  contact_name: string;
  email: string;
  phone: string;
  deal_name?: string;
  deal_amount: number;
  deal_stage?: string;
  hubspot_contact_id?: string;
  hubspot_deal_id?: string;
  sync_status: string;
  hubspot_mode?: string;
  webhook_dispatched?: boolean;
  notes?: string;
  updated_at?: string;
}

const API_BASE = getApiBase();

export function CRMModule({ companyName = "VyaperiX" }: CRMModuleProps) {
  const { user, session } = useAuth();
  const [status, setStatus] = useState<CRMStatus | null>(null);
  const [records, setRecords] = useState<CRMRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Settings State
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [webhookUrlInput, setWebhookUrlInput] = useState<string>("");
  const [autoSyncInput, setAutoSyncInput] = useState<boolean>(true);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  // Test Connection State
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    mode?: string;
    account_id?: string;
  } | null>(null);

  // Sync State
  const [syncingAll, setSyncingAll] = useState<boolean>(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("all");

  // Fetch status and records
  const loadData = async () => {
    try {
      setRefreshing(true);
      const headers = getAuthHeaders(session?.access_token);
      const userParam = user?.id ? `?user_id=${encodeURIComponent(user.id)}` : "";
      const recUserParam = user?.id ? `&user_id=${encodeURIComponent(user.id)}` : "";
      const [statusRes, recordsRes] = await Promise.all([
        fetch(`${API_BASE}/api/crm/status${userParam}`, { headers }),
        fetch(`${API_BASE}/api/crm/records?limit=100${recUserParam}`, { headers }),
      ]);

      if (statusRes.ok) {
        const sData: CRMStatus = await statusRes.json();
        setStatus(sData);
        if (sData.webhook?.url) {
          setWebhookUrlInput(sData.webhook.url);
        }
      }

      if (recordsRes.ok) {
        const rData = await recordsRes.json();
        setRecords(Array.isArray(rData.records) ? rData.records : []);
      }
    } catch (e) {
      console.error("Failed to load CRM data:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id]);

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccess(null);
    try {
      const headers = getAuthHeaders(session?.access_token);
      const userParam = user?.id ? `?user_id=${encodeURIComponent(user.id)}` : "";
      const res = await fetch(`${API_BASE}/api/crm/settings${userParam}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          crm_type: "hubspot",
          api_key: apiKeyInput.trim() || undefined,
          webhook_url: webhookUrlInput.trim(),
          auto_sync: autoSyncInput,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save CRM settings");
      }

      const data = await res.json();
      setSettingsSuccess("CRM configuration saved to MongoDB successfully!");
      if (apiKeyInput.trim()) {
        setApiKeyInput("");
      }
      await loadData();
    } catch (err: any) {
      alert("Error saving settings: " + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // Test Connection
  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const headers = getAuthHeaders(session?.access_token);
      const res = await fetch(`${API_BASE}/api/crm/test-connection`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          access_token: apiKeyInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: "Network error testing CRM connection: " + err.message,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // Sync All Radar Leads
  const handleSyncAllLeads = async () => {
    setSyncingAll(true);
    setSyncSuccessMsg(null);
    setSyncErrorMsg(null);
    try {
      const headers = getAuthHeaders(session?.access_token);
      const userParam = user?.id ? `?user_id=${encodeURIComponent(user.id)}` : "";
      const res = await fetch(`${API_BASE}/api/crm/sync-all-leads${userParam}`, {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Batch sync failed");
      }
      setSyncSuccessMsg(
        `Successfully synced ${data.synced_count} leads to HubSpot (${data.mode === "live" ? "Live API" : "Simulated Sandbox"}). Total Deal Pipeline: ₹${(data.total_deal_value || 0).toLocaleString("en-IN")}`
      );
      await loadData();
    } catch (err: any) {
      setSyncErrorMsg(err.message);
    } finally {
      setSyncingAll(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const userParam = user?.id ? `?user_id=${encodeURIComponent(user.id)}` : "";
    window.open(`${API_BASE}/api/crm/export-csv${userParam}`, "_blank");
  };

  // Filter records
  const filteredRecords = records.filter((rec) => {
    const matchesSearch =
      rec.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.contact_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (rec.deal_name && rec.deal_name.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStage =
      stageFilter === "all" || (rec.deal_stage || "").toLowerCase() === stageFilter.toLowerCase();

    return matchesSearch && matchesStage;
  });

  const formatCurrency = (val: number) => {
    if (val >= 10000000) {
      return `₹${(val / 10000000).toFixed(2)} Cr`;
    }
    if (val >= 100000) {
      return `₹${(val / 100000).toFixed(2)} L`;
    }
    return `₹${val.toLocaleString("en-IN")}`;
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-ink/20 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="label-mono border border-violet/40 bg-violet/10 text-violet px-2 py-0.5 text-[10px] font-bold">
              HubSpot REST v3
            </span>
            <span className="label-mono border border-lime/40 bg-lime/10 text-lime-700 dark:text-lime px-2 py-0.5 text-[10px] font-bold">
              Universal Webhook Gateway
            </span>
            <span className="label-mono border border-ink/20 bg-secondary text-muted-foreground px-2 py-0.5 text-[10px]">
              MongoDB Isolated
            </span>
          </div>
          <h2 className="font-display text-2xl font-black uppercase tracking-tight text-ink flex items-center gap-2">
            <Share2 className="w-6 h-6 text-violet" />
            CRM Pipeline & Webhook Gateway
          </h2>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">
            Automated bidirectional sync of Lead Radar verified prospects, deal values, and meeting outcomes into HubSpot & outbound webhooks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadData}
            disabled={refreshing}
            className="border border-ink/20 bg-paper px-3 py-2 label-mono text-xs font-bold text-ink hover:border-ink/60 flex items-center gap-1.5 transition-all"
            title="Refresh CRM records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            onClick={handleExportCSV}
            className="border border-ink/30 bg-paper px-3 py-2 label-mono text-xs font-bold text-ink hover:border-lime hover:bg-lime/10 flex items-center gap-1.5 transition-all"
          >
            <Download className="w-3.5 h-3.5 text-lime-700 dark:text-lime" />
            Export CSV
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="border border-ink/30 bg-paper px-3 py-2 label-mono text-xs font-bold text-ink hover:border-violet flex items-center gap-1.5 transition-all"
          >
            <Sliders className="w-3.5 h-3.5 text-violet" />
            {showSettings ? "Close Settings" : "Configure API"}
          </button>

          <button
            onClick={handleSyncAllLeads}
            disabled={syncingAll}
            className="border border-violet bg-violet text-violet-foreground px-4 py-2 label-mono text-xs font-black uppercase hover:bg-violet/90 flex items-center gap-2 transition-all shadow-sm"
          >
            <Zap className={`w-3.5 h-3.5 text-lime ${syncingAll ? "animate-spin" : ""}`} />
            {syncingAll ? "Syncing Radar..." : "Sync All Leads to HubSpot"}
          </button>
        </div>
      </div>

      {/* Alert Notices */}
      {syncSuccessMsg && (
        <div className="border border-lime/40 bg-lime/10 p-3 flex items-center justify-between text-xs font-mono text-lime-800 dark:text-lime-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-lime shrink-0" />
            <span>{syncSuccessMsg}</span>
          </div>
          <button
            onClick={() => setSyncSuccessMsg(null)}
            className="text-[10px] uppercase font-bold underline ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {syncErrorMsg && (
        <div className="border border-danger/40 bg-danger/10 p-3 flex items-center justify-between text-xs font-mono text-danger">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{syncErrorMsg}</span>
          </div>
          <button
            onClick={() => setSyncErrorMsg(null)}
            className="text-[10px] uppercase font-bold underline ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Synced Contacts */}
        <div className="border border-ink/20 bg-paper p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="label-mono text-[10px] text-muted-foreground uppercase">
              Synced Contacts
            </span>
            <Users className="w-4 h-4 text-violet" />
          </div>
          <div className="font-display text-2xl font-black text-ink">
            {status?.totals?.synced_contacts ?? 0}
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            Enriched B2B decision-makers in CRM
          </p>
        </div>

        {/* Pipeline Deals */}
        <div className="border border-ink/20 bg-paper p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="label-mono text-[10px] text-muted-foreground uppercase">
              Pipeline Deals
            </span>
            <Briefcase className="w-4 h-4 text-lime-700 dark:text-lime" />
          </div>
          <div className="font-display text-2xl font-black text-ink">
            {status?.totals?.synced_deals ?? 0}
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            High-intent deals attached to contacts
          </p>
        </div>

        {/* Total Pipeline Value */}
        <div className="border border-ink/20 bg-paper p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="label-mono text-[10px] text-muted-foreground uppercase">
              Pipeline Value
            </span>
            <DollarSign className="w-4 h-4 text-amber-500" />
          </div>
          <div className="font-display text-2xl font-black text-ink">
            {formatCurrency(status?.totals?.total_deal_value_inr ?? 0)}
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            Aggregate pipeline in Indian Rupees
          </p>
        </div>

        {/* Integration Engine Status */}
        <div className="border border-ink/20 bg-paper p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="label-mono text-[10px] text-muted-foreground uppercase">
              HubSpot Engine
            </span>
            <ShieldCheck className="w-4 h-4 text-violet" />
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                status?.hubspot?.mode === "live"
                  ? "bg-lime animate-pulse"
                  : "bg-amber-500"
              }`}
            />
            <span className="font-display text-base font-extrabold text-ink uppercase">
              {status?.hubspot?.mode === "live" ? "Live Bearer Token" : "Sandbox Simulation"}
            </span>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            {status?.hubspot?.mode === "live"
              ? "Syncing directly to HubSpot API v3"
              : "Zero-token safe dev mode active"}
          </p>
        </div>
      </div>

      {/* Settings / Configuration Panel */}
      {showSettings && (
        <div className="border border-violet/30 bg-paper p-5 space-y-5 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between border-b border-ink/10 pb-3">
            <div>
              <h3 className="font-display text-base font-bold uppercase text-ink flex items-center gap-2">
                <Lock className="w-4 h-4 text-violet" /> HubSpot API & Webhook Configuration
              </h3>
              <p className="font-mono text-xs text-muted-foreground">
                Enter your HubSpot Private App Access Token or configure a Zapier / Make webhook URL. Stored strictly in local MongoDB.
              </p>
            </div>
            <button
              onClick={handleTestConnection}
              disabled={testingConnection}
              className="border border-ink/30 bg-secondary px-3 py-1.5 label-mono text-xs font-bold text-ink hover:border-violet flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3 h-3 ${testingConnection ? "animate-spin" : ""}`} />
              {testingConnection ? "Pinging HubSpot..." : "Test Connection"}
            </button>
          </div>

          {testResult && (
            <div
              className={`p-3 border text-xs font-mono flex items-center gap-2 ${
                testResult.success
                  ? "border-lime/40 bg-lime/10 text-lime-800 dark:text-lime-200"
                  : "border-danger/40 bg-danger/10 text-danger"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-lime" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>
                {testResult.message}{" "}
                {testResult.account_id && `(Portal / Hub ID: ${testResult.account_id})`}
              </span>
            </div>
          )}

          {settingsSuccess && (
            <div className="p-3 border border-lime/40 bg-lime/10 text-xs font-mono text-lime-800 dark:text-lime-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-lime" />
              <span>{settingsSuccess}</span>
            </div>
          )}

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* HubSpot Access Token */}
              <div className="space-y-1.5">
                <label className="label-mono text-xs font-bold uppercase text-ink flex items-center justify-between">
                  <span>HubSpot Private App Access Token</span>
                  <a
                    href="https://app.hubspot.com/developer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet hover:underline flex items-center gap-1 font-normal lowercase text-[10px]"
                  >
                    hubspot portal <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={
                      status?.hubspot?.has_token
                        ? "•••••••••••••••••••••••• (Configured in MongoDB / .env)"
                        : "pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    }
                    className="w-full px-3 py-2 border border-ink/20 bg-secondary font-mono text-xs text-ink focus:outline-none focus:border-violet"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-ink"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">
                  Requires scopes: <code className="text-violet">crm.objects.contacts.write</code>, <code className="text-violet">crm.objects.deals.write</code>.
                </p>
              </div>

              {/* Webhook Gateway URL */}
              <div className="space-y-1.5">
                <label className="label-mono text-xs font-bold uppercase text-ink flex items-center gap-1">
                  <LinkIcon className="w-3 h-3 text-lime-700 dark:text-lime" /> Universal Outbound Webhook URL
                </label>
                <input
                  type="url"
                  value={webhookUrlInput}
                  onChange={(e) => setWebhookUrlInput(e.target.value)}
                  placeholder="https://hooks.zapier.com/hooks/catch/xxxxxx or Make.com"
                  className="w-full px-3 py-2 border border-ink/20 bg-secondary font-mono text-xs text-ink focus:outline-none focus:border-lime"
                />
                <p className="font-mono text-[10px] text-muted-foreground">
                  Every synced lead or scheduled meeting will fire a JSON webhook payload to this endpoint.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer font-mono text-xs text-ink">
                <input
                  type="checkbox"
                  checked={autoSyncInput}
                  onChange={(e) => setAutoSyncInput(e.target.checked)}
                  className="accent-violet"
                />
                <span>Automatically sync high-intent prospects and newly booked video meetings</span>
              </label>

              <button
                type="submit"
                disabled={savingSettings}
                className="border border-ink bg-ink text-paper px-4 py-2 label-mono text-xs font-bold hover:bg-violet hover:border-violet transition-all"
              >
                {savingSettings ? "Saving Settings..." : "Save Settings to MongoDB"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Synced Pipeline Table Card */}
      <div className="border border-ink/20 bg-paper space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink/10 pb-4">
          <div>
            <h3 className="font-display text-lg font-bold uppercase text-ink">
              Synced Deals & Contacts Pipeline
            </h3>
            <p className="font-mono text-xs text-muted-foreground">
              Real-time records tracked in MongoDB collection <code className="text-violet">crm_records</code>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search company, contact, email..."
                className="pl-8 pr-3 py-1.5 border border-ink/20 bg-secondary font-mono text-xs text-ink w-56 focus:outline-none focus:border-violet"
              />
            </div>

            {/* Stage Filter */}
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="border border-ink/20 bg-secondary px-3 py-1.5 font-mono text-xs text-ink focus:outline-none focus:border-violet"
            >
              <option value="all">All Deal Stages</option>
              <option value="appointmentscheduled">Appointment Scheduled</option>
              <option value="qualifiedtobuy">Qualified to Buy</option>
              <option value="presentationscheduled">Presentation Scheduled</option>
              <option value="decisionmakerboughtin">Decision Maker Bought-In</option>
              <option value="closedwon">Closed Won</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="p-12 text-center space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-violet mx-auto" />
            <p className="font-mono text-xs text-muted-foreground">Loading CRM records from MongoDB...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center space-y-4 border border-dashed border-ink/20">
            <div className="border border-ink/20 bg-secondary p-3 inline-flex mx-auto">
              <Share2 className="w-6 h-6 text-violet" />
            </div>
            <div className="space-y-1">
              <h4 className="font-display text-base font-bold uppercase text-ink">
                No Synced Records Found
              </h4>
              <p className="font-mono text-xs text-muted-foreground max-w-md mx-auto">
                No leads or meetings have been synced yet. Click <strong>"Sync All Leads to HubSpot"</strong> above or sync individual leads from <strong>Lead Radar</strong>.
              </p>
            </div>
            <button
              onClick={handleSyncAllLeads}
              disabled={syncingAll}
              className="border border-violet bg-violet text-violet-foreground px-4 py-2 label-mono text-xs font-bold hover:bg-violet/90 transition-all inline-flex items-center gap-2"
            >
              <Zap className="w-3.5 h-3.5 text-lime" /> Sync All Discovered Leads Now
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-ink/20 bg-secondary text-ink font-bold label-mono text-[10px] uppercase">
                  <th className="py-2.5 px-3">Company & Contact</th>
                  <th className="py-2.5 px-3">Direct Info</th>
                  <th className="py-2.5 px-3">Deal Value</th>
                  <th className="py-2.5 px-3">Stage</th>
                  <th className="py-2.5 px-3">HubSpot Identifiers</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Last Synced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {filteredRecords.map((rec, idx) => (
                  <tr key={rec.id || idx} className="hover:bg-secondary/40 transition-colors">
                    {/* Company & Contact */}
                    <td className="py-3 px-3">
                      <div className="font-display text-sm font-extrabold uppercase text-ink">
                        {rec.company}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Users className="w-3 h-3 text-violet" />
                        {rec.contact_name}
                      </div>
                    </td>

                    {/* Email & Phone */}
                    <td className="py-3 px-3 space-y-0.5">
                      <div className="text-ink flex items-center gap-1">
                        <Mail className="w-3 h-3 text-muted-foreground" />
                        {rec.email || "—"}
                      </div>
                      <div className="text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3 text-muted-foreground" />
                        {rec.phone || "—"}
                      </div>
                    </td>

                    {/* Deal Value */}
                    <td className="py-3 px-3">
                      <div className="font-display text-sm font-bold text-ink">
                        {formatCurrency(rec.deal_amount || 0)}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                        {rec.deal_name || "New Commercial Deal"}
                      </div>
                    </td>

                    {/* Stage */}
                    <td className="py-3 px-3">
                      <span className="label-mono border border-violet/30 bg-violet/10 text-violet px-2 py-0.5 text-[9px] uppercase font-bold">
                        {rec.deal_stage?.replace(/([A-Z])/g, " $1") || "Qualified to Buy"}
                      </span>
                    </td>

                    {/* HubSpot IDs */}
                    <td className="py-3 px-3 space-y-0.5">
                      {rec.hubspot_contact_id && (
                        <div className="text-[10px] text-muted-foreground">
                          Contact: <code className="text-ink font-bold">{rec.hubspot_contact_id}</code>
                        </div>
                      )}
                      {rec.hubspot_deal_id && (
                        <div className="text-[10px] text-muted-foreground">
                          Deal: <code className="text-ink font-bold">{rec.hubspot_deal_id}</code>
                        </div>
                      )}
                      {!rec.hubspot_contact_id && !rec.hubspot_deal_id && (
                        <span className="text-muted-foreground text-[10px] italic">Webhook Only</span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-lime" />
                        <span className="label-mono text-[10px] uppercase font-bold text-lime-700 dark:text-lime">
                          {rec.sync_status || "synced"}
                        </span>
                      </div>
                      <span className="text-[9px] text-muted-foreground capitalize">
                        {rec.hubspot_mode === "live" ? "HubSpot Live" : "Sandbox"}
                      </span>
                    </td>

                    {/* Last Synced */}
                    <td className="py-3 px-3 text-right text-muted-foreground text-[10px]">
                      {rec.updated_at
                        ? new Date(rec.updated_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Just now"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
