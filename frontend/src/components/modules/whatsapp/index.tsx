import React, { useState, useEffect } from "react";
import {
  MessageSquare,
  Smartphone,
  QrCode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  Calendar,
  FileText,
  ShieldCheck,
  LogOut,
  ExternalLink,
  Sparkles,
  PhoneCall,
  Clock,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getApiBase, getAuthHeaders } from "@/lib/api";

interface WhatsAppModuleProps {
  companyName?: string;
}

interface GatewayStatus {
  status: string;
  connected: boolean;
  phone_number: string | null;
  has_qr: boolean;
  qr_url: string | null;
}

export function WhatsAppModule({ companyName = "VyaperiX" }: WhatsAppModuleProps) {
  const { session } = useAuth();
  const [statusData, setStatusData] = useState<GatewayStatus | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; msg: string } | null>(null);

  // Dispatch Form State
  const [targetPhone, setTargetPhone] = useState("+91 9727662885");
  const [msgType, setMsgType] = useState<"meeting" | "requirements" | "custom">("meeting");
  const [customerName, setCustomerName] = useState("Rajesh Sharma");
  const [agenda, setAgenda] = useState("Autonomous Voice SDR & WhatsApp Gateway Demo");
  const [requirements, setRequirements] = useState("1. Multilingual Indic voice bots\n2. Real-time Google Meet booking\n3. Zero-GST WhatsApp Business messaging");
  const [customText, setCustomText] = useState("Hello from VyaperiX! Your AI sales agent is active.");

  // Automation Settings State
  const [autoMeetingConfirm, setAutoMeetingConfirm] = useState(true);
  const [autoRecap, setAutoRecap] = useState(true);
  const [indicBilingual, setIndicBilingual] = useState(true);
  const [gatewayError, setGatewayError] = useState<string | null>(null);

  // Fetch Gateway Status
  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${getApiBase()}/api/whatsapp/status`, {
        headers: getAuthHeaders(session?.access_token),
      });
      if (res.ok) {
        const data = await res.json();
        setStatusData(data);
        if (data.error && !data.connected) {
          setGatewayError(data.error);
        } else {
          setGatewayError(null);
        }
        if (!data.connected) {
          fetchQR();
        } else {
          setQrBase64(null);
        }
      } else {
        setGatewayError(`Gateway returned status ${res.status}`);
      }
    } catch (e) {
      console.error("Failed to check WhatsApp status:", e);
      setGatewayError("Cannot connect to WhatsApp Gateway at port 3001.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch QR Code data URL
  const fetchQR = async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/whatsapp/qr`, {
        headers: getAuthHeaders(session?.access_token),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.qr_data_url) {
          setQrBase64(data.qr_data_url);
          setGatewayError(null);
        } else if (data.error) {
          setGatewayError(data.error);
        }
      }
    } catch (e) {
      console.error("Failed to fetch WhatsApp QR code:", e);
      setGatewayError("Gateway service offline on port 3001.");
    }
  };

  // Logout / Disconnect
  const handleLogout = async () => {
    if (!window.confirm("Are you sure you want to disconnect this WhatsApp number? You will need to scan QR code again.")) return;
    try {
      setLoading(true);
      const res = await fetch(`${getApiBase()}/api/whatsapp/logout`, {
        method: "POST",
        headers: getAuthHeaders(session?.access_token),
      });
      if (res.ok) {
        setTimeout(fetchStatus, 1500);
      }
    } catch (e) {
      console.error("Error logging out:", e);
    } finally {
      setLoading(false);
    }
  };

  // Send Test Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSendResult(null);

    try {
      let endpoint = `${getApiBase()}/api/whatsapp/send`;
      let payload: any = { phone: targetPhone };

      if (msgType === "meeting") {
        endpoint = `${getApiBase()}/api/whatsapp/send-meeting`;
        payload = {
          customer_name: customerName,
          customer_phone: targetPhone,
          business_name: companyName,
          start_time: new Date(Date.now() + 86400000).toISOString(),
          meet_url: "https://meet.google.com/ucy-hmke-bms",
          agenda: agenda,
          requirements: requirements,
        };
      } else if (msgType === "requirements") {
        endpoint = `${getApiBase()}/api/whatsapp/send-summary`;
        payload = {
          customer_name: customerName,
          customer_phone: targetPhone,
          business_name: companyName,
          requirements: requirements.split("\n").filter(Boolean),
          next_steps: ["Send official pricing deck", "Schedule follow-up call with solutions architect"],
        };
      } else {
        payload = {
          phone: targetPhone,
          message: customText,
        };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: getAuthHeaders(session?.access_token, { "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSendResult({ success: true, msg: `Message dispatched successfully to ${data.recipient || targetPhone}!` });
      } else {
        setSendResult({ success: false, msg: data.detail || data.error || "Failed to dispatch message." });
      }
    } catch (err: any) {
      setSendResult({ success: false, msg: err.message || "Network error dispatching message." });
    } finally {
      setSending(false);
    }
  };

  const isConnected = Boolean(statusData?.connected);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, isConnected ? 10000 : 4000);
    return () => clearInterval(interval);
  }, [isConnected]);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Top Header Card */}
      <div className="border border-ink/20 bg-secondary/30 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="label-mono text-lime-700 dark:text-lime font-bold">[COMMUNICATIONS MESH]</span>
            <span className="label-mono border border-lime/40 bg-lime/10 text-lime-700 dark:text-lime px-2 py-0.5 text-[9px] font-bold">
              ZERO-TAX ID ENGINE
            </span>
          </div>
          <h2 className="font-display text-2xl font-extrabold uppercase flex items-center gap-2.5">
            <MessageSquare className="w-6 h-6 text-lime-600 dark:text-lime" />
            WhatsApp Business Gateway
          </h2>
          <p className="font-mono text-xs text-muted-foreground">
            Direct-to-client automated messaging for <span className="text-ink font-bold">{companyName}</span> phone calls, Google Meet invites & discovery recaps.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center gap-1.5 border border-ink/20 bg-paper px-3 py-2 font-mono text-xs hover:bg-secondary transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <a
            href="http://localhost:3001/status"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 border border-ink/20 bg-paper px-3 py-2 font-mono text-xs hover:border-violet text-ink hover:text-violet transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Port 3001
          </a>
        </div>
      </div>

      {/* Connection Status Banner */}
      <div className={`border p-5 space-y-3 ${
        isConnected ? "border-lime/50 bg-lime/10" : "border-amber-500/40 bg-amber-500/10"
      }`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            {isConnected ? (
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-lime-600 dark:bg-lime"></span>
              </span>
            ) : (
              <span className="h-3 w-3 rounded-full bg-amber-500"></span>
            )}
            <span className="font-display text-base font-bold uppercase tracking-wide">
              {isConnected ? "WhatsApp Active & Linked" : "Awaiting Device Pairing"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isConnected && statusData?.phone_number && (
              <span className="label-mono border border-lime/40 bg-lime/20 text-lime-800 dark:text-lime font-mono font-bold px-2.5 py-1 text-xs">
                +{statusData.phone_number}
              </span>
            )}
            {isConnected && (
              <button
                onClick={handleLogout}
                disabled={loading}
                title="Disconnect this device"
                className="flex items-center gap-1 border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20 font-mono text-[10px] px-2 py-1 transition-colors"
              >
                <LogOut className="w-3 h-3" />
                Unlink Device
              </button>
            )}
          </div>
        </div>

        <p className="font-mono text-xs text-muted-foreground leading-relaxed">
          {isConnected
            ? `Your WhatsApp device (+${statusData?.phone_number}) is authenticated over Baileys WebSocket protocol. Automated call transcripts, Google Meet links, and customer requirement recaps will be sent directly from your number without Meta API rate limits or GST paperwork.`
            : "No active WhatsApp session detected. Scan the QR code below from your phone's WhatsApp Linked Devices to enable post-call automated messaging."}
        </p>
      </div>

      {/* Main Grid: QR Pairing or Messaging Hub */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Device Info & QR code */}
        <div className="lg:col-span-5 space-y-6">
          {!isConnected ? (
            <div className="border border-ink/20 bg-paper p-6 space-y-4 text-center">
              <span className="label-mono text-violet font-bold">[PAIR NEW DEVICE]</span>
              <h3 className="font-display text-lg font-bold">Scan to Connect</h3>
              <p className="font-mono text-xs text-muted-foreground">
                Open WhatsApp &rarr; Settings &rarr; Linked Devices &rarr; Link a Device
              </p>

              <div className="p-4 bg-white border border-ink/20 inline-block shadow-sm rounded-lg">
                {qrBase64 ? (
                  <div className="space-y-2">
                    <img src={qrBase64} alt="WhatsApp QR Code" className="w-56 h-56 mx-auto block" />
                    <span className="font-mono text-[10px] text-muted-foreground block">
                      Auto-refreshes every few seconds
                    </span>
                  </div>
                ) : gatewayError ? (
                  <div className="w-56 h-56 flex flex-col items-center justify-center p-3 gap-2 text-center">
                    <span className="font-mono text-[11px] font-bold text-red-500 uppercase">
                      [Gateway Offline]
                    </span>
                    <p className="font-mono text-[10px] text-muted-foreground leading-tight">
                      Port 3001 WhatsApp server is offline.
                    </p>
                    <code className="text-[10px] bg-secondary px-2 py-1 border border-ink/10 font-mono text-ink">
                      npm run dev:whatsapp
                    </code>
                    <button
                      onClick={fetchStatus}
                      className="mt-1 px-3 py-1 text-[11px] font-mono border border-ink/20 hover:border-violet text-ink hover:text-violet transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> Retry Connection
                    </button>
                  </div>
                ) : (
                  <div className="w-56 h-56 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <RefreshCw className="w-8 h-8 animate-spin text-violet" />
                    <span className="font-mono text-xs">Generating QR...</span>
                    <button
                      onClick={fetchStatus}
                      className="text-[10px] font-mono text-violet hover:underline mt-1 cursor-pointer"
                    >
                      Force Check
                    </button>
                  </div>
                )}
              </div>

              <div className="text-left bg-secondary/30 border border-ink/10 p-3 space-y-1 font-mono text-[11px] text-muted-foreground">
                <div className="text-ink font-bold">Zero Paperwork Guaranteed:</div>
                <div>• Zero Meta Cloud API approval</div>
                <div>• Zero GST or Certificate of Incorporation needed</div>
                <div>• Outbound messages deliver directly from your SIM/number</div>
              </div>
            </div>
          ) : (
            <div className="border border-ink/20 bg-paper p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-violet" />
                <h3 className="font-display text-base font-bold uppercase">Linked Device Specs</h3>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between border-b border-ink/10 pb-2">
                  <span className="text-muted-foreground">Device Number:</span>
                  <span className="text-ink font-bold">+{statusData?.phone_number}</span>
                </div>
                <div className="flex justify-between border-b border-ink/10 pb-2">
                  <span className="text-muted-foreground">Gateway Protocol:</span>
                  <span className="text-ink">Baileys WebSocket v6</span>
                </div>
                <div className="flex justify-between border-b border-ink/10 pb-2">
                  <span className="text-muted-foreground">Local Port:</span>
                  <span className="text-ink">3001</span>
                </div>
                <div className="flex justify-between border-b border-ink/10 pb-2">
                  <span className="text-muted-foreground">Encryption:</span>
                  <span className="text-lime-700 dark:text-lime font-bold">End-to-End (Signal)</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-muted-foreground">Meta Document Req:</span>
                  <span className="text-lime-700 dark:text-lime font-bold">0% (Bypassed)</span>
                </div>
              </div>

              <div className="border border-violet/30 bg-violet/10 p-3 space-y-1">
                <span className="label-mono text-violet font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Ready for Live Calls
                </span>
                <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">
                  Calls processed via the Voice Fleet will now immediately dispatch confirmations & summaries to callers.
                </p>
              </div>

              {/* Call Automation Toggles */}
              <div className="space-y-3 pt-2">
                <h4 className="label-mono text-muted-foreground">Automation Triggers</h4>
                
                <label className="flex items-center justify-between border border-ink/10 p-2.5 cursor-pointer hover:bg-secondary/40 transition-colors">
                  <div className="space-y-0.5">
                    <span className="font-mono text-xs font-bold block text-ink">Google Meet on Booking</span>
                    <span className="font-mono text-[10px] text-muted-foreground block">Auto-creates Google Meet and dispatches link</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoMeetingConfirm}
                    onChange={(e) => setAutoMeetingConfirm(e.target.checked)}
                    className="accent-violet h-4 w-4"
                  />
                </label>

                <label className="flex items-center justify-between border border-ink/10 p-2.5 cursor-pointer hover:bg-secondary/40 transition-colors">
                  <div className="space-y-0.5">
                    <span className="font-mono text-xs font-bold block text-ink">Discovery Requirements Recap</span>
                    <span className="font-mono text-[10px] text-muted-foreground block">Sends bulleted needs if no meeting was booked</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoRecap}
                    onChange={(e) => setAutoRecap(e.target.checked)}
                    className="accent-violet h-4 w-4"
                  />
                </label>

                <label className="flex items-center justify-between border border-ink/10 p-2.5 cursor-pointer hover:bg-secondary/40 transition-colors">
                  <div className="space-y-0.5">
                    <span className="font-mono text-xs font-bold block text-ink">Indic Bilingual Greetings</span>
                    <span className="font-mono text-[10px] text-muted-foreground block">Namaste / Kem Cho / Hello personalization</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={indicBilingual}
                    onChange={(e) => setIndicBilingual(e.target.checked)}
                    className="accent-violet h-4 w-4"
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Interactive Test Message Dispatcher */}
        <div className="lg:col-span-7 space-y-6">
          <div className="border border-ink/20 bg-paper p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-lime-600 dark:text-lime" />
                <h3 className="font-display text-base font-bold uppercase">Live Message Dispatcher</h3>
              </div>
              <span className="label-mono text-violet font-bold text-[10px] border border-violet/30 px-2 py-0.5">
                INSTANT TEST
              </span>
            </div>

            <form onSubmit={handleSendMessage} className="space-y-4 font-mono text-xs">
              <div>
                <label className="label-mono text-muted-foreground block mb-1.5">
                  Target Recipient Phone (with country code):
                </label>
                <input
                  type="text"
                  value={targetPhone}
                  onChange={(e) => setTargetPhone(e.target.value)}
                  placeholder="+91 9876543210"
                  className="w-full border border-ink/20 bg-secondary/20 p-2.5 text-ink font-mono focus:outline-none focus:border-violet"
                  required
                />
              </div>

              <div>
                <label className="label-mono text-muted-foreground block mb-1.5">
                  Select Workflow Template:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setMsgType("meeting")}
                    className={`p-2.5 border text-left transition-colors ${
                      msgType === "meeting"
                        ? "border-violet bg-violet/10 text-violet font-bold"
                        : "border-ink/20 bg-secondary/20 text-muted-foreground hover:text-ink"
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 mb-1 text-violet" />
                    <span className="block font-bold">Meeting Confirm</span>
                    <span className="text-[10px] opacity-75">With Meet link</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMsgType("requirements")}
                    className={`p-2.5 border text-left transition-colors ${
                      msgType === "requirements"
                        ? "border-violet bg-violet/10 text-violet font-bold"
                        : "border-ink/20 bg-secondary/20 text-muted-foreground hover:text-ink"
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 mb-1 text-lime-600 dark:text-lime" />
                    <span className="block font-bold">Requirements</span>
                    <span className="text-[10px] opacity-75">Bulleted recap</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMsgType("custom")}
                    className={`p-2.5 border text-left transition-colors ${
                      msgType === "custom"
                        ? "border-violet bg-violet/10 text-violet font-bold"
                        : "border-ink/20 bg-secondary/20 text-muted-foreground hover:text-ink"
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 mb-1 text-ink" />
                    <span className="block font-bold">Custom Text</span>
                    <span className="text-[10px] opacity-75">Freeform text</span>
                  </button>
                </div>
              </div>

              {msgType === "meeting" && (
                <div className="space-y-3 bg-secondary/20 border border-ink/10 p-3.5">
                  <div>
                    <label className="label-mono text-muted-foreground block mb-1">Customer Name:</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full border border-ink/20 bg-paper p-2 text-ink font-mono"
                    />
                  </div>
                  <div>
                    <label className="label-mono text-muted-foreground block mb-1">Discussion Agenda:</label>
                    <input
                      type="text"
                      value={agenda}
                      onChange={(e) => setAgenda(e.target.value)}
                      className="w-full border border-ink/20 bg-paper p-2 text-ink font-mono"
                    />
                  </div>
                  <div>
                    <label className="label-mono text-muted-foreground block mb-1">Requirements Captured in Call:</label>
                    <textarea
                      rows={2}
                      value={requirements}
                      onChange={(e) => setRequirements(e.target.value)}
                      className="w-full border border-ink/20 bg-paper p-2 text-ink font-mono"
                    />
                  </div>
                </div>
              )}

              {msgType === "requirements" && (
                <div className="space-y-3 bg-secondary/20 border border-ink/10 p-3.5">
                  <div>
                    <label className="label-mono text-muted-foreground block mb-1">Customer Name:</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full border border-ink/20 bg-paper p-2 text-ink font-mono"
                    />
                  </div>
                  <div>
                    <label className="label-mono text-muted-foreground block mb-1">Requirements (one per line):</label>
                    <textarea
                      rows={3}
                      value={requirements}
                      onChange={(e) => setRequirements(e.target.value)}
                      className="w-full border border-ink/20 bg-paper p-2 text-ink font-mono"
                    />
                  </div>
                </div>
              )}

              {msgType === "custom" && (
                <div>
                  <label className="label-mono text-muted-foreground block mb-1">Message Body:</label>
                  <textarea
                    rows={4}
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    className="w-full border border-ink/20 bg-paper p-2 text-ink font-mono"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={sending || !isConnected}
                className={`w-full py-3 px-4 font-display font-extrabold uppercase text-xs flex items-center justify-center gap-2 border transition-colors shadow-sm ${
                  !isConnected
                    ? "border-ink/20 bg-secondary/40 text-muted-foreground cursor-not-allowed"
                    : "border-lime bg-lime text-lime-foreground hover:opacity-95"
                }`}
              >
                {sending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sending WhatsApp Message...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Dispatch WhatsApp Message Now
                  </>
                )}
              </button>
            </form>

            {sendResult && (
              <div
                className={`p-3.5 border font-mono text-xs flex items-start gap-2.5 ${
                  sendResult.success
                    ? "border-lime/50 bg-lime/10 text-lime-800 dark:text-lime"
                    : "border-danger/50 bg-danger/10 text-danger"
                }`}
              >
                {sendResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <div>{sendResult.msg}</div>
              </div>
            )}
          </div>

          {/* Sample Dispatched Preview */}
          <div className="border border-ink/20 bg-paper p-5 space-y-3 font-mono text-xs">
            <span className="label-mono text-muted-foreground font-bold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-lime-600 dark:text-lime" />
              Automated Post-Call Trigger Flow
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
              <div className="border border-ink/10 bg-secondary/20 p-3 space-y-1">
                <span className="font-bold text-ink flex items-center gap-1">
                  <PhoneCall className="w-3.5 h-3.5 text-violet" />
                  1. Phone Call Finishes
                </span>
                <p className="text-muted-foreground">
                  Caller speaks Hindi/Gujarati/English with Sarvam AI Bulbul v3 voice.
                </p>
              </div>

              <div className="border border-ink/10 bg-secondary/20 p-3 space-y-1">
                <span className="font-bold text-ink flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-lime-600 dark:text-lime" />
                  2. Sub-Second Automation
                </span>
                <p className="text-muted-foreground">
                  Groq evaluates meeting intent or extracts requirements, and sends WhatsApp confirmation with Google Meet link.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
