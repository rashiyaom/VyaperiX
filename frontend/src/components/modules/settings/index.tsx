import React, { useState } from "react";
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
} from "lucide-react";

interface SettingsModuleProps {
  companyName?: string;
}

export function SettingsModule({ companyName = "Target Enterprise" }: SettingsModuleProps) {
  const [voiceModel, setVoiceModel] = useState("aura-conversational-v2");
  const [autoEnrich, setAutoEnrich] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("https://api.vyaperi.ai/v1/webhook/leads");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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

        <div className="pt-4 border-t border-ink/15 flex items-center justify-between">
          <button
            onClick={handleSave}
            className="border border-ink bg-ink text-paper px-5 py-2.5 label-mono font-bold hover:bg-violet hover:border-violet transition-all flex items-center gap-2"
          >
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? "Settings Saved" : "Save Preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}
