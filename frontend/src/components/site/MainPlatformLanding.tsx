import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Maximize2,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Activity,
  Zap,
  TrendingUp,
  DollarSign,
  Users,
  Globe,
  Radio,
  Volume2,
  Play,
} from "lucide-react";
import { useState, useEffect } from "react";
import heroRender from "@/assets/mesh-render.jpg";
import { SectionHead, SiteFooter, SiteHeader } from "@/components/site/Chrome";
import { Sandbox } from "@/components/site/Sandbox";
import { Tag, Bar, SpeakingWave, LiveDot } from "@/components/app/ui";
import { VoiceAgentSynthesizerWidget, HeroVoicePreview } from "@/components/app/voice-synthesizer";
import { ScrollProgressBar, ScrollReveal } from "@/components/app/scroll-reveal";
import { PipelineCarousel } from "@/components/site/PipelineCarousel";
import { BharatSignalMap } from "@/components/site/BharatSignalMap";
import { useAuth } from "@/lib/auth";

const MODULES = [
  {
    n: "01",
    t: "Business Onboarding Ingestion",
    tag: "URL · Docs · Profile",
    d: "Business submits company URL, product catalog, sales decks, or documentation. Zero complex manual configuration required.",
    metric: "Instant Ingestion",
  },
  {
    n: "02",
    t: "Business Understanding Engine (LLM)",
    tag: "Autonomous Reasoning",
    d: "Deep LLM engine parses company assets to derive commercial services, target ICP personas, qualification rubrics, and high-intent buyer keywords.",
    metric: "4 Services & ICP Extracted",
  },
  {
    n: "03",
    t: "Dynamic Mode Selection",
    tag: "Calling Only vs Radar",
    d: "Flexible pipeline routing: choose [Calling Only] to upload existing CSV/Excel/CRM lead files, or [Leads + Calling] to trigger the autonomous discovery radar.",
    metric: "Dual Cadence Supported",
  },
  {
    n: "04",
    t: "Multi-Source Intent Discovery",
    tag: "40+ Channel Sweep",
    d: "Continuously scans LinkedIn, X/Twitter, corporate RFP portals, public directories, bidding platforms, freelance marketplaces, and requirement boards.",
    metric: "4,200+ Daily Signals",
  },
  {
    n: "05",
    t: "Deep Profile Enrichment",
    tag: "Sub-Second MX & Phone",
    d: "Fills verified corporate emails, direct phone lines, LinkedIn profiles, employee headcount, firmographics, and verifiable public source links.",
    metric: "99.8% Resolution Rate",
  },
  {
    n: "06",
    t: "AI ICP Qualification & Scoring",
    tag: "Ranked Fit Matrix",
    d: "Multi-factor AI scoring evaluates each prospect against the derived ICP, company size thresholds, and buying velocity, prioritizing hot leads.",
    metric: "92% Qualification Accuracy",
  },
  {
    n: "07",
    t: "Campaign Creation & Scheduling",
    tag: "Timezone & Target Cadence",
    d: "User schedules outbound cadences aligned to prospect timezones and office hours, setting customized consultative sales goals and playbooks.",
    metric: "Global Timezone Sync",
  },
  {
    n: "08",
    t: "Multilingual AI Voice Fleet",
    tag: "Sub-150ms Turn-Taking",
    d: "Conducts human-like outbound & inbound calls in Hindi, Gujarati, English, Spanish, and regional dialects — qualifying leads, answering FAQs, and retrying missed calls.",
    metric: "61% Average Connect Rate",
  },
  {
    n: "09",
    t: "Real-Time Intelligence Capture",
    tag: "Live Audio & Telemetry",
    d: "Instant transcript generation, executive conversation summaries, prospect sentiment analysis, objection tracking, and next-best actions.",
    metric: "Sub-100ms Telemetry",
  },
  {
    n: "10",
    t: "Interested Prospect Surfacing",
    tag: "Immediate CRM Handoff",
    d: "Automatically highlights interested buyers, triggers instant AE slack/email notifications, and syncs qualified opportunities into HubSpot or Salesforce.",
    metric: "Zero Handoff Friction",
  },
  {
    n: "11",
    t: "Campaign Analytics & Repeat Loop",
    tag: "Closed-Loop Learning",
    d: "Comprehensive ROI analytics, objection heatmaps, connect-rate attribution, and continuous LLM prompt refinement for repeat campaigns.",
    metric: "+340% Pipeline Velocity",
  },
];

const CAPABILITIES = [
  {
    tag: "Autonomous Radar",
    t: "Multi-Source Buying Intent Radar",
    d: "While your competitors sleep, VYAPERI X monitors over 40 public data streams for prospects actively requesting vendors, issuing RFPs, or discussing technology migrations.",
    stat: "4,200+ Daily Targets",
  },
  {
    tag: "Native Dialects",
    t: "Multilingual Voice Conversions",
    d: "AI voice agents conduct human-like, consultative phone conversations in Hindi, Gujarati, English, Spanish, and regional dialects — qualifying needs, resolving objections, and booking meetings directly on AE calendars.",
    stat: "14+ Supported Dialects",
  },
  {
    tag: "Zero-Handoff",
    t: "Closed-Loop Sales Execution",
    d: "From the initial social intent post to verified CRM contact creation and voice qualification call, every step executes autonomously in one unified enterprise architecture.",
    stat: "100% Automated Cadence",
  },
];

const PROTOCOL_TRANSCRIPTS: Record<
  string,
  { title: string; agent: string; lead: string; outcome: string; lines: [string, string][] }
> = {
  hi: {
    title: "Hindi Voice Protocol — Ananya Sharma (Northbridge Infra)",
    agent: "Saanvi",
    lead: "Ananya Sharma",
    outcome: "INTERESTED · Meeting booked Thu 11:00 IST",
    lines: [
      [
        "AGENT",
        "नमस्ते Ananya जी, मैं Vyaperi X से बोल रही हूँ। आपने SharePoint migration partner के बारे में पोस्ट किया था — क्या अभी वह project active है?",
      ],
      [
        "PROSPECT",
        "हाँ, हम Q4 में शुरू करना चाहते हैं। Budget approved हो चुका है और legacy migration मुख्य scope है।",
      ],
      ["AGENT", "समझ गई। क्या Microsoft 365 integration और user training भी scope में शामिल है?"],
      ["PROSPECT", "बिल्कुल, दोनों चाहिए।"],
      [
        "AGENT",
        "बढ़िया — गुरुवार सुबह 11 बजे हमारे Senior Solution Architect के साथ एक scoping call schedule कर देती हूँ?",
      ],
      ["PROSPECT", "हाँ, चलेगा। ईमेल पर इनवाइट भेज दीजिए।"],
    ],
  },
  gu: {
    title: "Gujarati Voice Protocol — Bharat Patel (Patel Textiles)",
    agent: "Dhruv",
    lead: "Bharat Patel",
    outcome: "INTERESTED · Live Demo Confirmed Wed 10:00 IST",
    lines: [
      [
        "AGENT",
        "નમસ્તે Bharat ભાઈ, હું Vyaperi X થી ધ્રુવ વાત કરું છું. આપના ગોડાઉન ઇન્વેન્ટરી અને GST બિલિંગ ઓટોમેશન અંગે વાત કરવી હતી — શું આપ 2 મિનિટ ફાળવી શકશો?",
      ],
      [
        "PROSPECT",
        "હા, ચોક્કસ. અમે હાલમાં 4 વેરહાઉસ માટે નવું Cloud ERP સિસ્ટમ શોધી રહ્યા છીએ.",
      ],
      [
        "AGENT",
        "સરસ! અમારું પ્લેટફોર્મ મલ્ટિ-વેરહાઉસ રિયલ-ટાઇમ સ્ટોક ટ્રેકિંગ અને ઇ-વે બિલ ઓટોમેશન સપોર્ટ કરે છે. શું આપ બુધવારે સવારે 10 વાગ્યે 15 મિનિટનો લાઇવ ડેમો જોવા માંગો છો?",
      ],
      ["PROSPECT", "હા, એ સમય અનુકૂળ રહેશે. મને વોટ્સએપ અને ઈમેલ પર મીટિંગ લિંક મોકલી આપો."],
      [
        "AGENT",
        "ચોક્કસ Bharat ભાઈ, કેલેન્ડર ઇનવાઇટ અને ડેમો વિગતો આપના રજિસ્ટર્ડ ઇમેઇલ પર મોકલી દીધી છે. આભાર!",
      ],
    ],
  },
  en: {
    title: "Global Enterprise Protocol — Daniel Wright (Orbit Retail)",
    agent: "Arjun",
    lead: "Daniel Wright",
    outcome: "QUALIFIED · Discovery Briefing Fri 14:00 GMT",
    lines: [
      [
        "AGENT",
        "Hi Daniel, Arjun here from VyaperiX. I noticed Orbit Retail recently posted an RFP for enterprise headless commerce migration — is that initiative currently active for Q4?",
      ],
      [
        "PROSPECT",
        "Yes, hi Arjun. We've got executive sign-off and we're vetting architectures that can handle high holiday concurrency.",
      ],
      [
        "AGENT",
        "Makes sense. We specialize in zero-downtime microservices with autonomous failover. Would it make sense to connect with our Lead Enterprise Architect this Friday at 2 PM GMT?",
      ],
      ["PROSPECT", "That works well. Please send over the calendar invite and our procurement deck."],
      [
        "AGENT",
        "Done. The invite and architectural whitepaper are in your inbox. Looking forward to speaking Friday, Daniel!",
      ],
    ],
  },
};

const LIVE_DISCOVERY_FEED = [
  {
    source: "LinkedIn",
    author: "Rajesh V. (VP Tech)",
    company: "Kavach Logistics",
    text: "Seeking M365 migration team for 800 seats",
    fit: "96%",
    loc: "Bengaluru, IN",
  },
  {
    source: "X / Twitter",
    author: "Priya Nair (Dir IT)",
    company: "Sunrise Health",
    text: "Evaluating AI voice vendors for tier-2 clinics",
    fit: "92%",
    loc: "Pune, IN",
  },
  {
    source: "Directories",
    author: "Bharat Patel (MD)",
    company: "Patel Textiles",
    text: "RFP open: Cloud ERP with GST sync for 4 warehouses",
    fit: "98%",
    loc: "Surat, Gujarat",
  },
  {
    source: "Website RFP",
    author: "Daniel W. (COO)",
    company: "Orbit Retail",
    text: "Headless Shopify replatforming Q4 budget approved",
    fit: "89%",
    loc: "London, UK",
  },
];

const STACK = [
  "LINKEDIN",
  "X / TWITTER",
  "OPENAI",
  "TWILIO",
  "HUBSPOT",
  "WHATSAPP",
  "SALESFORCE",
  "SNOWFLAKE",
  "POSTGRESQL",
  "WEBHOOKS",
];

export function MainPlatformLanding() {
  const { user, signOut } = useAuth();
  const [activeLang, setActiveLang] = useState<"hi" | "gu" | "en">("hi");
  const protocol = PROTOCOL_TRANSCRIPTS[activeLang] || PROTOCOL_TRANSCRIPTS["hi"]!;

  const [activeLeadTicker, setActiveLeadTicker] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveLeadTicker((prev) => (prev + 1) % LIVE_DISCOVERY_FEED.length);
    }, 3800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      id="platform-content"
      className="min-h-screen bg-paper text-ink transition-colors duration-300 relative selection:bg-lime selection:text-neutral-950"
    >
      {/* 🚀 Neon Top Scroll Progress Indicator */}
      <ScrollProgressBar />

      <SiteHeader />

      {/* ── /01 HERO SECTION WITH LIVE HUD RADAR ── */}
      <section className="border-b border-ink/20 overflow-hidden">
        <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-10 sm:py-12 lg:grid-cols-[1.05fr_1fr] lg:px-8 lg:py-20">
          <div className="min-w-0 space-y-5 sm:space-y-6">
            <ScrollReveal variant="fade-down" delay={50}>
              <div className="flex items-center gap-2">
                <span className="label-mono text-violet">/01 Platform</span>
                <span className="h-1.5 w-1.5 rounded-full bg-lime live-dot" />
                <span className="label-mono text-xs text-muted-foreground">
                  Autonomous Engine Online
                </span>
              </div>
            </ScrollReveal>

            <ScrollReveal variant="fade-up" delay={150}>
              <h1 className="font-display text-[clamp(2.4rem,9vw,6.5rem)] font-extrabold leading-[0.85] tracking-tight text-ink">
                AI Sales
                <br />
                Engine
              </h1>
            </ScrollReveal>

            <ScrollReveal variant="fade-up" delay={250}>
              <p className="label-mono text-violet text-sm font-bold">
                सुनो · समझो · सौदा करो
              </p>
              <p className="mt-3 max-w-lg font-mono text-sm leading-relaxed text-muted-foreground">
                VYAPERI X discovers high-intent prospects across 40+ public channels, enriches their
                profiles with verified emails and phone numbers, and deploys multilingual AI voice
                agents to qualify and close — autonomously, 24/7.
              </p>
            </ScrollReveal>

            {/* CTA Buttons */}
            <ScrollReveal variant="fade-up" delay={350}>
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
                {user ? (
                  <>
                    <Link
                      to="/dashboard"
                      className="group inline-flex items-center justify-center gap-3 border border-ink bg-lime text-black px-6 py-4 label-mono font-bold transition-all hover:bg-white hover:text-black active:scale-95 shadow-md text-sm"
                    >
                      <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
                      Open Command Console
                      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => signOut()}
                      className="inline-flex items-center justify-center gap-2 border border-ink/20 bg-card px-4 py-4 label-mono text-xs text-muted-foreground hover:text-destructive hover:border-destructive transition-all cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </>
                ) : (
                  <Link
                    to="/login"
                    search={{ tab: "Signup" }}
                    className="group inline-flex items-center justify-center gap-3 border border-ink bg-ink px-6 py-4 label-mono text-paper transition-all hover:border-violet hover:bg-violet hover:text-white active:scale-95 shadow-md text-sm"
                  >
                    Start Free Trial
                    <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Link>
                )}
                <a
                  href="#sandbox"
                  className="inline-flex items-center justify-center gap-2 border border-ink/20 bg-card px-4 py-4 label-mono text-ink hover:border-violet hover:text-violet transition-all text-sm"
                >
                  <Maximize2 className="h-3.5 w-3.5" /> Interactive Pipeline Sandbox
                </a>
              </div>
            </ScrollReveal>

            {/* Real Voice Preview Strip */}
            <ScrollReveal variant="fade-up" delay={450}>
              <HeroVoicePreview />
            </ScrollReveal>

            {/* Quick Stat Badges */}
            <ScrollReveal variant="fade-up" delay={550}>
              <dl className="grid grid-cols-2 gap-px border border-ink/20 bg-ink/15 sm:grid-cols-4 shadow-sm">
                {[
                  ["11", "End-to-End Steps"],
                  ["40+", "Source platforms"],
                  ["14+", "Native dialects"],
                  ["< 150ms", "Voice turnaround"],
                ].map(([v, l]) => (
                  <div
                    key={l}
                    className="bg-paper px-4 py-3.5 hover:bg-secondary transition-colors"
                  >
                    <dt className="font-display text-xl font-extrabold text-ink">{v}</dt>
                    <dd className="mt-0.5 label-mono text-[10px] text-muted-foreground">{l}</dd>
                  </div>
                ))}
              </dl>
            </ScrollReveal>
          </div>

          {/* Right Hero: Mesh Image with Live Telemetry Overlay */}
          <ScrollReveal variant="fade-left" delay={200} className="h-full">
            <div className="relative min-w-0 min-h-[220px] sm:min-h-[280px] lg:min-h-0 h-full border border-ink bg-card flex flex-col justify-between overflow-hidden shadow-2xl">
              {/* Top HUD bar */}
              <div className="absolute left-4 top-4 z-10 flex items-center gap-2 border border-ink bg-paper px-3 py-1.5 label-mono shadow">
                <span className="h-1.5 w-1.5 bg-lime live-dot" />
                Autonomous Lead Radar · Live
              </div>

              <img
                src={heroRender}
                alt="Isometric wireframe render of the VYAPERI X sales pipeline mesh"
                width={1200}
                height={1008}
                className="h-full w-full object-cover opacity-85 dark:opacity-75"
              />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── /02 11-STEP AUTONOMOUS PIPELINE ── */}
      <section id="pipeline" className="border-b border-ink/20">
        <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-16 lg:px-8">
          <ScrollReveal variant="fade-up">
            <SectionHead index="02" title="11-Step End-to-End Autonomous Pipeline Flow">
              <span className="label-mono text-muted-foreground">
                From Business Ingestion & LLM Discovery to Multilingual Voice Conversion
              </span>
            </SectionHead>
          </ScrollReveal>

          <ScrollReveal variant="fade-up" delay={150} className="mt-8">
            <PipelineCarousel modules={MODULES} />
          </ScrollReveal>
        </div>
      </section>

      {/* ── /03 INTERACTIVE SANDBOX SIMULATOR ── */}
      <section id="sandbox" className="border-b border-ink/20">
        <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-16 lg:px-8">
          <ScrollReveal variant="fade-up">
            <SectionHead index="03" title="Interactive Pipeline Sandbox">
              <span className="label-mono text-muted-foreground">
                Live Prospect Execution Simulator
              </span>
            </SectionHead>
          </ScrollReveal>

          <ScrollReveal variant="zoom-in" delay={150} className="mt-8">
            <Sandbox />
          </ScrollReveal>
        </div>
      </section>

      {/* ── /04 BHARAT SIGNAL MAP — MULTILINGUAL REACH ── */}
      <section id="reach" className="border-b border-ink/20 bg-secondary/30 overflow-hidden">
        <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-16 lg:px-8">
          <ScrollReveal variant="fade-up">
            <SectionHead index="04" title="One Agent. Every Language. Every City.">
              <span className="label-mono text-muted-foreground">Live Multilingual Reach</span>
            </SectionHead>
            <p className="mt-4 max-w-2xl font-mono text-xs leading-relaxed text-muted-foreground">
              Watch the voice fleet fan out from a single hub — each call opens in the prospect's own
              language and script, then qualifies, books and syncs the meeting to your CRM.
            </p>
          </ScrollReveal>

          <ScrollReveal variant="fade-up" delay={150}>
            <BharatSignalMap />
          </ScrollReveal>
        </div>
      </section>

      {/* ── /05 MULTILINGUAL VOICE PROTOCOL & LIVE SPEECH SYNTHESIS ── */}
      <section id="voice" className="border-b border-ink/20">
        <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-16 lg:px-8 space-y-8 sm:space-y-10">
          <ScrollReveal variant="fade-up">
            <div>
              <SectionHead index="05" title="Multilingual Voice Agent Testing Studio">
                <span className="label-mono text-muted-foreground">
                  Interactive Live Speech Synthesis
                </span>
              </SectionHead>
              <p className="mt-4 max-w-2xl font-mono text-xs text-muted-foreground leading-relaxed">
                Test our autonomous voice fleet in real-time. Choose between{" "}
                <strong className="text-ink">Male and Female voices</strong> across{" "}
                <strong className="text-violet">11 Indian languages</strong> — Hindi, Gujarati,
                English, Marathi, Bengali, Tamil, Telugu, Kannada, Malayalam, Punjabi and Odia.
                Pick a preset sales phrase or type your own script to hear it spoken by Sarvam AI.
              </p>
            </div>
          </ScrollReveal>

          {/* Interactive Synthesizer Widget */}
          <ScrollReveal variant="fade-up" delay={150}>
            <VoiceAgentSynthesizerWidget />
          </ScrollReveal>

          {/* Protocol Dialogue Inspector */}
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] pt-4">
            <ScrollReveal variant="fade-right" delay={200}>
              <div>
                <div className="label-mono text-xs text-violet font-bold">
                  // Autonomous Conversation Turn-Taking:
                </div>
                <p className="mt-3 font-mono text-xs leading-relaxed text-muted-foreground">
                  Every outbound call is culturally attuned and consultative. The AI voice agent
                  introduces itself, qualifies against your ICP parameters, addresses pricing &
                  timeline objections, and books meetings directly into your CRM.
                </p>

                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => setActiveLang("hi")}
                    className={`px-3 py-1.5 font-mono text-xs border transition-colors ${
                      activeLang === "hi"
                        ? "bg-violet text-white border-violet font-bold"
                        : "border-ink/20 hover:bg-secondary text-ink"
                    }`}
                  >
                    Hindi (हिन्दी)
                  </button>
                  <button
                    onClick={() => setActiveLang("gu")}
                    className={`px-3 py-1.5 font-mono text-xs border transition-colors ${
                      activeLang === "gu"
                        ? "bg-violet text-white border-violet font-bold"
                        : "border-ink/20 hover:bg-secondary text-ink"
                    }`}
                  >
                    Gujarati (ગુજરાતી)
                  </button>
                  <button
                    onClick={() => setActiveLang("en")}
                    className={`px-3 py-1.5 font-mono text-xs border transition-colors ${
                      activeLang === "en"
                        ? "bg-violet text-white border-violet font-bold"
                        : "border-ink/20 hover:bg-secondary text-ink"
                    }`}
                  >
                    English (UK/Global)
                  </button>
                </div>

                <ul className="mt-6 space-y-2.5">
                  {[
                    "Sub-150ms speech-to-speech conversational turnaround",
                    "Dialect-aware pronunciation across Indian & global regional accents",
                    "Real-time objection detection & dynamic playbook adaptation",
                    "Instant CRM meeting confirmation with audio recording & transcript",
                  ].map((li) => (
                    <li key={li} className="flex gap-2.5 font-mono text-xs text-ink">
                      <span className="text-emerald-700 dark:text-lime font-bold">✓</span>
                      {li}
                    </li>
                  ))}
                </ul>
              </div>
            </ScrollReveal>

            <ScrollReveal variant="fade-left" delay={250}>
              <div className="border border-ink bg-card p-6 text-ink shadow-lg space-y-4 rounded-none">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <span className="label-mono text-xs text-muted-foreground flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-violet" />
                    {protocol.title}
                  </span>
                  <Tag tone="lime">Agent: {protocol.agent}</Tag>
                </div>

                <div className="space-y-3 font-mono text-xs max-h-64 overflow-y-auto pr-1">
                  {protocol.lines.map(([role, text], idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded border leading-relaxed ${
                        role === "AGENT"
                          ? "bg-violet/10 border-violet/30 text-ink ml-4"
                          : "bg-secondary border-border mr-4"
                      }`}
                    >
                      <div className="font-bold text-[10px] mb-1 text-muted-foreground">
                        [{role === "AGENT" ? `AI AGENT — ${protocol.agent}` : protocol.lead}]
                      </div>
                      <div>{text}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-2 border border-ink bg-lime px-3 py-2 label-mono text-lime-foreground text-center font-bold">
                  {protocol.outcome}
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── /06 CORE CAPABILITIES ── */}
      <section id="capabilities" className="border-b border-ink/20">
        <div className="mx-auto max-w-[1400px] px-4 py-16 lg:px-8">
          <ScrollReveal variant="fade-up">
            <SectionHead index="06" title="Core Technological Advantage" />
          </ScrollReveal>

          <div className="mt-8 grid gap-px bg-ink/15 lg:grid-cols-3">
            {CAPABILITIES.map((c, i) => (
              <ScrollReveal key={c.t} variant="fade-up" delay={i * 120} className="h-full">
                <div className="h-full bg-paper p-8 space-y-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="inline-block border border-ink px-2.5 py-1 label-mono bg-secondary font-bold">
                        {c.tag}
                      </span>
                      <span className="font-mono text-xs text-violet font-semibold">{c.stat}</span>
                    </div>
                    <h3 className="font-display text-xl font-extrabold leading-tight text-ink">{c.t}</h3>
                    <p className="font-mono text-xs leading-relaxed text-muted-foreground">{c.d}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── /07 STATUS & INSTANT PROVISIONING CTA ── */}
      <section className="border-b border-ink/20 overflow-hidden">
        <div className="mx-auto grid max-w-[1400px] gap-px bg-ink/15 px-0 lg:grid-cols-2">
          <ScrollReveal variant="fade-right" className="bg-paper p-8 lg:p-14 space-y-6">
            <span className="label-mono text-violet">/07 Provisioning</span>
            <h2 className="font-display text-3xl font-extrabold leading-[0.9] sm:text-4xl text-ink">
              Start your
              <br />
              sales engine
            </h2>
            <p className="max-w-sm font-mono text-xs leading-relaxed text-muted-foreground">
              Configure your workspace, set target ICP parameters, and deploy your first
              multilingual voice fleet in minutes.
            </p>
            {user ? (
              <Link
                to="/dashboard"
                className="group inline-flex items-center gap-3 border border-ink bg-lime text-black px-6 py-4 label-mono font-bold transition-all hover:bg-white hover:text-black active:scale-95 shadow-lg"
              >
                Access Command Console
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            ) : (
              <Link
                to="/login"
                search={{ tab: "Signup" }}
                className="group inline-flex items-center gap-3 border border-ink bg-ink px-6 py-4 label-mono text-paper transition-all hover:border-violet hover:bg-violet hover:text-white active:scale-95 shadow-lg"
              >
                Start Free Trial →
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            )}
          </ScrollReveal>

          <ScrollReveal variant="fade-left" delay={150} className="bg-paper p-8 lg:p-14">
            <span className="label-mono text-violet">/08 Telemetry</span>
            <h2 className="mt-2 font-display text-xl font-extrabold text-ink">
              Autonomous Engine Telemetry
            </h2>
            <div className="mt-6 space-y-5">
              {[
                ["Multi-Source Discovery Radar", "Operational · 42 Nodes", 100],
                ["Multilingual SIP Voice Engine", "Sub-150ms Latency Active", 100],
                ["Real-Time MX & Phone Enrichment", "99.8% Resolution Rate", 99],
                ["Bidirectional CRM Pipeline Sync", "Operational (HubSpot/Salesforce)", 100],
              ].map(([l, v, p]) => (
                <div key={l as string}>
                  <div className="flex items-baseline justify-between font-mono text-[11px]">
                    <span className="label-mono text-muted-foreground">{l}</span>
                    <span className="font-semibold text-ink">{v}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full bg-ink/10">
                    <div className="h-full bg-lime" style={{ width: `${p as number}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 border border-ink bg-lime px-4 py-3 label-mono text-lime-foreground text-center font-bold">
              ✓ All Autonomous Sales Pipelines Operational
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── /12 INTELLIGENCE SUITE MODULE CTA ── */}
      <section className="border-b border-ink/20">
        <div className="mx-auto max-w-[1400px] px-4 py-16 lg:px-8">
          <ScrollReveal variant="fade-up">
            <SectionHead index="12" title="Intelligence Suite — Commercial Due Diligence Engine">
              <span className="label-mono text-muted-foreground">New Module · Available Now</span>
            </SectionHead>
          </ScrollReveal>

          <ScrollReveal variant="fade-up" delay={100} className="mt-8">
            <div className="grid gap-px bg-ink/15 lg:grid-cols-[1.2fr_1fr]">
              {/* Left — Description */}
              <div className="bg-paper p-8 lg:p-12 space-y-6">
                <div className="inline-flex items-center gap-2 border border-violet/30 bg-violet/5 px-3 py-1.5 label-mono text-violet">
                  <Sparkles className="h-3.5 w-3.5" />
                  Multi-Source: Web + PDF + CSV + Excel + Images
                </div>
                <h3 className="font-display text-3xl font-extrabold leading-[0.9] sm:text-4xl text-ink">
                  Turn Raw Company
                  <br />
                  Assets into Board-Grade
                  <br />
                  <span className="text-violet">Intelligence</span>
                </h3>
                <p className="max-w-md font-mono text-xs leading-relaxed text-muted-foreground">
                  Paste a company URL, attach their pitch decks, financial sheets, or product
                  catalogs. The engine scrapes, ingests and cross-references all sources —
                  surfacing discrepancies, competitive gaps, conversion funnel health, and a
                  prioritized strategic roadmap in under 90 seconds.
                </p>
                <ul className="space-y-2">
                  {[
                    "Per-source isolation — no blended hallucinations",
                    "Automatic discrepancy detection between public & internal claims",
                    "Interactive 4-quarter growth forecast & funnel diagnostics",
                    "Prioritized action playbooks with execution checklists",
                  ].map((li) => (
                    <li key={li} className="flex gap-2.5 font-mono text-xs text-ink">
                      <span className="text-emerald-700 dark:text-lime font-bold">✓</span>
                      {li}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/scraper"
                  className="group inline-flex items-center gap-3 border border-ink bg-ink px-6 py-4 label-mono text-paper transition-all hover:border-violet hover:bg-violet hover:text-white active:scale-95 shadow-md"
                >
                  Open Intelligence Suite
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </div>

              {/* Right — Stats Grid */}
              <div className="bg-secondary/30 p-8 lg:p-12 flex flex-col justify-between gap-8">
                <div className="grid grid-cols-2 gap-px bg-ink/15">
                  {[
                    ["5+", "File Source Types"],
                    ["< 90s", "Report Generation"],
                    ["Anti-Hall.", "Verified Output"],
                    ["100%", "Source Attribution"],
                  ].map(([v, l]) => (
                    <div
                      key={l}
                      className="bg-paper px-5 py-6 hover:bg-secondary transition-colors"
                    >
                      <dt className="font-display text-2xl font-extrabold text-ink">{v}</dt>
                      <dd className="mt-1 label-mono text-[10px] text-muted-foreground">{l}</dd>
                    </div>
                  ))}
                </div>
                <div className="border border-ink bg-lime px-4 py-3 label-mono text-lime-foreground text-center font-bold">
                  ✓ Intelligence Engine Operational
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Marquee Stack */}
      <section className="overflow-hidden border-b border-ink/20 py-8">
        <div className="flex w-max marquee-track gap-14 pr-14">
          {[...STACK, ...STACK].map((s, i) => (
            <span
              key={`${s}-${i}`}
              className="font-display text-2xl font-extrabold text-ink/20 dark:text-ink/30"
            >
              {s}
            </span>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
