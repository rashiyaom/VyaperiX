import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { getApiBase, getAuthHeaders } from "@/lib/api";
import {
  Settings,
  Database,
  Webhook,
  Sliders,
  ShieldCheck,
  Check,
  Save,
  Radio,
  CheckCircle2,
  Cpu,
  Lock,
  MessageSquare,
  RefreshCw,
  Mail,
  Send,
  Sparkles,
  Info,
} from "lucide-react";

interface SettingsModuleProps {
  companyName?: string;
}

export function SettingsModule({ companyName = "Target Enterprise" }: SettingsModuleProps) {
  const { session } = useAuth();
  const [voiceModel, setVoiceModel] = useState("aura-conversational-v2");
  const [autoEnrich, setAutoEnrich] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("https://api.vyaperi.ai/v1/webhook/leads");
  const [smsAlertsEnabled, setSmsAlertsEnabled] = useState(true);
  const [alertPhoneNumber, setAlertPhoneNumber] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Email & Notifications Engine State
  const [emailStatus, setEmailStatus] = useState<{
    status: string;
    is_configured: boolean;
    mock_mode: boolean;
    host: string;
    port: number;
    from_name: string;
    from_email: string;
    registered_user_email?: string;
  } | null>(null);
  const [sendingGreeting, setSendingGreeting] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [emailActionMsg, setEmailActionMsg] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const headers = getAuthHeaders(session?.access_token);
        const res = await fetch(`${getApiBase()}/api/voice/config`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.sms_alerts_enabled !== undefined) {
            setSmsAlertsEnabled(Boolean(data.sms_alerts_enabled));
          }
          if (data.alert_phone_number) {
            setAlertPhoneNumber(data.alert_phone_number);
          }
        }

        // Fetch Email status & registered user email
        const emailRes = await fetch(`${getApiBase()}/api/email/status`, { headers });
        if (emailRes.ok) {
          const emailData = await emailRes.json();
          setEmailStatus(emailData);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    };
    loadSettings();
  }, [session]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const headers = getAuthHeaders(session?.access_token, { "Content-Type": "application/json" });
      await fetch(`${getApiBase()}/api/voice/config`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          sms_alerts_enabled: smsAlertsEnabled,
          alert_phone_number: alertPhoneNumber,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleSendGreeting = async () => {
    try {
      setSendingGreeting(true);
      setEmailActionMsg(null);
      const headers = getAuthHeaders(session?.access_token, { "Content-Type": "application/json" });
      const res = await fetch(`${getApiBase()}/api/email/send-greeting`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEmailActionMsg(`✓ Welcome email dispatched to registered email (${data.recipient})!`);
        setTimeout(() => setEmailActionMsg(null), 5000);
      } else {
        alert(data.detail || data.error || "Failed to send greeting email.");
      }
    } catch (err: any) {
      alert(`Error sending greeting: ${err.message}`);
    } finally {
      setSendingGreeting(false);
    }
  };

  const handleSendTestEmail = async () => {
    try {
      setSendingTestEmail(true);
      setEmailActionMsg(null);
      const headers = getAuthHeaders(session?.access_token, { "Content-Type": "application/json" });
      const res = await fetch(`${getApiBase()}/api/email/test`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEmailActionMsg(`✓ Test email delivered to ${data.recipient}! (${data.result?.status === 'mocked' ? 'Mock Mode' : 'Live SMTP'})`);
        setTimeout(() => setEmailActionMsg(null), 5000);
      } else {
        alert(data.detail || data.error || "Failed to send test email.");
      }
    } catch (err: any) {
      alert(`Error sending test email: ${err.message}`);
    } finally {
      setSendingTestEmail(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="border border-ink/20 bg-secondary/30 p-6 space-y-1">
        <span className="label-mono text-violet font-bold">[SYSTEM SETTINGS]</span>
        <h2 className="font-display text-2xl font-extrabold uppercase">
          Workspace & AI Fleet Configuration
        </h2>
        <p className="font-mono text-xs text-muted-foreground">
          Managed platform settings for <span className="text-ink font-bold">{companyName}</span>.
        </p>
      </div>

      <div className="border border-ink/20 bg-paper p-6 space-y-5">
        {/* Managed Infrastructure Status (No customer API entry) */}
        <div className="border border-lime/40 bg-lime/10 p-4 space-y-2 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="label-mono text-lime-700 dark:text-lime font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Platform Managed AI Infrastructure
            </span>
            <span className="label-mono border border-lime/40 bg-lime/20 text-lime-700 dark:text-lime px-2 py-0.5 text-[9px] font-bold">
              OPERATIONAL
            </span>
          </div>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            All Groq Llama 3.3 intelligence engines, Twilio SIP trunks, and Vapi AI voice agents are provisioned, scaled, and managed automatically by the platform. Customer API entry is disabled.
          </p>
        </div>

        <div className="space-y-2 font-mono text-xs">
          <label className="label-mono text-muted-foreground flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-lime-700 dark:text-lime" /> Default AI Voice Engine Persona
          </label>
          <select
            value={voiceModel}
            onChange={(e) => setVoiceModel(e.target.value)}
            className="w-full border border-ink/30 bg-paper px-3.5 py-2 text-ink focus:outline-none focus:border-violet"
          >
            <option value="aura-conversational-v2">Aura Conversational Neural V2 (Ultra-Low Latency)</option>
            <option value="elevenlabs-multilingual">ElevenLabs Multilingual Turbo (High Realism)</option>
            <option value="cartesia-sonic">Cartesia Sonic Indian-English / Regional Dialect</option>
          </select>
        </div>

        <div className="space-y-2 font-mono text-xs">
          <label className="label-mono text-muted-foreground flex items-center gap-1.5">
            <Webhook className="w-3.5 h-3.5 text-violet" /> Outbound Lead Webhook Integration URL
          </label>
          <input
            type="text"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            className="w-full border border-ink/30 bg-paper px-3.5 py-2 text-ink focus:outline-none focus:border-violet"
          />
        </div>

        <div className="flex items-center gap-3 pt-2 font-mono text-xs">
          <input
            type="checkbox"
            id="autoEnrich"
            checked={autoEnrich}
            onChange={(e) => setAutoEnrich(e.target.checked)}
            className="cursor-pointer accent-violet"
          />
          <label htmlFor="autoEnrich" className="text-ink cursor-pointer">
            Automatically enrich discovered leads with buying intent, hiring signals, and decision-maker profiles
          </label>
        </div>

        {/* SMS Meeting Alerts Section */}
        <div className="border border-ink/20 bg-secondary/10 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label htmlFor="smsAlerts" className="text-ink font-bold text-xs cursor-pointer flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-lime-700 dark:text-lime" /> Enable SMS Meeting Alerts
              </label>
              <p className="text-muted-foreground text-[11px] font-mono">
                Receive instant SMS notifications whenever a new meeting is scheduled or extracted from an AI call.
              </p>
            </div>
            <input
              type="checkbox"
              id="smsAlerts"
              checked={smsAlertsEnabled}
              onChange={(e) => setSmsAlertsEnabled(e.target.checked)}
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
              value={alertPhoneNumber}
              onChange={(e) => setAlertPhoneNumber(e.target.value)}
              className="w-full border border-ink/30 bg-paper px-3.5 py-2 text-ink focus:outline-none focus:border-violet"
            />
            <span className="text-[10px] text-muted-foreground block font-mono">
              Fallback number if your user profile phone is not configured.
            </span>
          </div>
        </div>

        {/* Enterprise Email Notification Engine Section */}
        <div className="border border-violet/30 bg-violet/5 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-ink font-bold text-xs flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-violet" /> Enterprise Email System & Meeting Alerts
              </span>
              <p className="text-muted-foreground text-[11px] font-mono">
                Dispatches automated welcome emails upon login/registration, and confirms booked meetings with live video links to your registered email.
              </p>
            </div>
            <span className={`label-mono px-2 py-0.5 text-[9px] font-bold border ${
              emailStatus?.is_configured
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-violet/40 bg-violet/20 text-violet"
            }`}>
              {emailStatus?.is_configured ? "LIVE SMTP CONNECTED" : "DEV MOCK MODE ACTIVE"}
            </span>
          </div>

          {/* Registered Email & SMTP details */}
          <div className="border border-ink/10 bg-paper/60 p-3 space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Registered Account Email:</span>
              <span className="text-ink font-bold font-mono">
                {emailStatus?.registered_user_email || session?.user?.email || "Not authenticated"}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-ink/10 pt-1.5">
              <span className="text-muted-foreground">SMTP Gateway Host:</span>
              <span className="text-ink font-mono">
                {emailStatus?.host || "smtp.gmail.com"}:{emailStatus?.port || 587}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-ink/10 pt-1.5">
              <span className="text-muted-foreground">Sender Identity:</span>
              <span className="text-ink font-mono">
                {emailStatus?.from_name || "VyaperiX AI"} &lt;{emailStatus?.from_email || "notifications@vyaperix.ai"}&gt;
              </span>
            </div>
          </div>

          {/* Toast / Status banner */}
          {emailActionMsg && (
            <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs font-mono font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{emailActionMsg}</span>
            </div>
          )}

          {/* Action Trigger Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleSendGreeting}
              disabled={sendingGreeting}
              className="px-3.5 py-2 label-mono text-xs font-bold border border-violet bg-violet text-white hover:bg-violet/90 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Send welcome greeting email to registered login/signup email"
            >
              {sendingGreeting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{sendingGreeting ? "Sending Greeting..." : "Send Welcome / Greeting Email"}</span>
            </button>

            <button
              type="button"
              onClick={handleSendTestEmail}
              disabled={sendingTestEmail}
              className="px-3.5 py-2 label-mono text-xs font-bold border border-ink/30 bg-paper text-ink hover:bg-secondary transition-all flex items-center gap-1.5 cursor-pointer"
              title="Send verification test email to registered email"
            >
              {sendingTestEmail ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              ) : (
                <Send className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              <span>{sendingTestEmail ? "Testing..." : "Send Test Email"}</span>
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-ink/15 flex items-center justify-between">
          <button
            onClick={handleSave}
            disabled={saving}
            className="border border-ink bg-ink text-paper px-5 py-2.5 label-mono font-bold hover:bg-violet hover:border-violet transition-all flex items-center gap-2"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved ? "Settings Saved" : "Save Preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}
