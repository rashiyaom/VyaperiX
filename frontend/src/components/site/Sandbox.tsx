import { useEffect, useRef, useState } from "react";
import {
  Play,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Volume2,
  UploadCloud,
  Radio,
  Check,
} from "lucide-react";

type StageState = "idle" | "running" | "pass" | "hold" | "stop";

export const STAGES = [
  ["01", "Onboarding", "Submit URL, description & company documents"],
  ["02", "LLM Reasoning", "Derive services, ICP parameters & target keywords"],
  ["03", "Mode Selection", "Choose [Calling Only] (upload) or [Leads + Calling] (scan)"],
  ["04", "Discovery", "Multi-channel sweep across 40+ public boards & RFP feeds"],
  ["05", "Enrichment", "Fill verified email, phone, firmographics & source URLs"],
  ["06", "Qualification", "AI rank & fit scoring against derived ICP criteria"],
  ["07", "Campaign", "Schedule timezone cadences, goals & conversational script"],
  ["08", "AI Voice Fleet", "Outbound/inbound multilingual calls, FAQs & retries"],
  ["09", "Capture", "Sub-second transcript, summary, sentiment & next actions"],
  ["10", "Surfaced Deals", "Instant AE alert, hot prospect badge & CRM sync"],
  ["11", "Analytics Loop", "Conversion funnels, objection heatmap & repeat iteration"],
] as const;

type Scenario = {
  id: string;
  label: string;
  mode: "leads_and_calling" | "calling_only";
  blurb: string;
  source: string;
  postUrl: string;
  outcomes: StageState[];
  log: string[][];
  verdict: string;
  verdictTone: "lime" | "violet" | "danger";
};

const SCENARIOS: Scenario[] = [
  {
    id: "gujarat-sme",
    label: "Gujarat SME Cloud Modernization",
    mode: "leads_and_calling",
    blurb:
      "“Need enterprise ERP & GST automation software for 4 warehouse facilities in Surat & Ahmedabad.”",
    source: "LinkedIn Post (Discovery Radar)",
    postUrl: "linkedin.com/posts/gujarat-erp-modernization-9912",
    outcomes: [
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
    ],
    log: [
      [
        "url = futurrizon.com",
        "catalog = ERP_Modernization_Deck.pdf ingested",
        "docs parsed in 420ms",
      ],
      [
        "services = [Cloud ERP, GST Automation, Warehouse Sync]",
        "derived ICP = Gujarat Mid-Market (200–2,000 emp)",
        "keywords = [seeking ERP, warehouse GST]",
      ],
      ["selected mode = [Leads + Calling]", "autonomous discovery radar armed for 40+ channels"],
      [
        "radar match = LinkedIn Post #9912",
        "intent verbs = [seeking ERP, multi-warehouse, budget approved]",
        "relevance = 0.96 · captured source link",
      ],
      [
        "person = Bharat Patel · Managing Director",
        "email = b.patel@pateltextiles.in (verified MX)",
        "phone = +91 98250 ••811 (active line)",
        "company = Patel Textiles · 850 emp · Surat",
      ],
      [
        "icp.fit = 0.94 · intent = 0.91",
        "rank = #1 (Hot Lead)",
        "language routed: Gujarati + Hindi",
      ],
      [
        "cadence = Gujarat SME Business Hours (10:00–18:00 IST)",
        "goal = Qualify warehouse count & book architect demo",
        "script = Gujarati Consultative Playbook",
      ],
      [
        "dialling +91 98250 ••811 via Gujarati Agent Dhruv",
        "prospect confirmed Q4 budget & 4 warehouse locations",
        "handled 2 GST integration questions with sub-150ms voice turnaround",
      ],
      [
        "transcript stored in database",
        "sentiment = ENTHUSIASTIC (0.94)",
        "summary generated: Immediate need for 4 facilities",
        "next_action = AE Scoping Demo",
      ],
      [
        "prospect flagged: HOT LEAD",
        "instant notification dispatched to Gujarat Regional AE",
        "crm.sync = HubSpot deal created (₹18.5L pipeline)",
      ],
      [
        "campaign connect rate = 68%",
        "objection rate = 0%",
        "prompt weights updated for continuous iteration",
      ],
    ],
    verdict: "MEETING BOOKED · Wed 10:30 IST (Gujarati Agent Dhruv) · CRM Synced",
    verdictTone: "lime",
  },
  {
    id: "sharepoint-m365",
    label: "Pan-India SharePoint M365",
    mode: "leads_and_calling",
    blurb:
      "“Looking for a SharePoint implementation partner — M365 integration, legacy migration, training.”",
    source: "X / Twitter (Discovery Radar)",
    postUrl: "x.com/northbridge/status/1892374651",
    outcomes: [
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
    ],
    log: [
      ["url = futurrizon.com", "profile = Enterprise IT Solutions", "ingested 2 product briefs"],
      [
        "services = [SharePoint Online, M365 Migration, Azure]",
        "derived ICP = IT Leaders & VPs (500–5,000 emp)",
        "keywords = [SharePoint partner, M365 migration]",
      ],
      ["selected mode = [Leads + Calling]", "radar sweeping public X/Twitter and corporate forums"],
      [
        "radar match = X / Twitter Public Post",
        "author = Ananya Sharma · Head of Digital Transformation",
        "intent = [looking for, partner, moving fast]",
      ],
      [
        "email = ananya.sharma@northbridge.in (verified)",
        "phone = +91 98•••• ••12",
        "company = Northbridge Infra · 1,200 emp · Mumbai",
      ],
      [
        "icp.fit = 0.91 · intent = 0.88",
        "score = 92/100 → Enterprise Priority Queue",
        "language = Hindi",
      ],
      [
        "cadence = Pan-India Enterprise (10:00–17:30 IST)",
        "goal = Executive Scoping Call",
        "script = Hindi Enterprise Protocol",
      ],
      [
        "dialling +91 98•••• ••12 via Hindi Agent Saanvi",
        "confirmed Q4 budget and 800 seats scope",
        "resolved licensing FAQ autonomously",
      ],
      [
        "transcript & audio recording archived",
        "sentiment = POSITIVE (0.89)",
        "next_action = Calendar Invite for Senior Architect",
      ],
      [
        "surfaced in Rep Dashboard as Top Priority",
        "slack alert fired to AE Ankit",
        "crm.sync = Salesforce Opportunity created",
      ],
      [
        "closed-loop telemetry logged",
        "repeat campaign iteration scheduled for Northbridge affiliates",
      ],
    ],
    verdict: "MEETING BOOKED · Thu 11:00 IST (Hindi Agent Saanvi) · Calendar Booked",
    verdictTone: "lime",
  },
  {
    id: "calling-only-csv",
    label: "UK Retail Replatforming (Uploaded CSV)",
    mode: "calling_only",
    blurb:
      "Client uploaded internal CSV file 'uk_retail_q4.csv' containing 240 inbound prospective accounts.",
    source: "Uploaded Lead File (CSV / CRM)",
    postUrl: "local://imports/uk_retail_q4.csv",
    outcomes: [
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
    ],
    log: [
      [
        "url = futurrizon.co.uk",
        "onboarding description = Headless commerce agency",
        "documents parsed",
      ],
      [
        "services = [Headless Commerce, Shopify Plus, Microservices]",
        "derived ICP = UK Retail COOs & CMOs",
        "keywords = [headless commerce, Shopify replatform]",
      ],
      [
        "selected mode = [Calling Only]",
        "bypassing public scraping → 240 uploaded CSV contacts loaded",
      ],
      ["discovery stage = CSV Ingestion Complete (240 records loaded from uk_retail_q4.csv)"],
      [
        "contact match = Daniel Whitfield · COO · Orbit Retail Group",
        "corporate email & London HQ phone validated",
        "company size = 890 emp",
      ],
      [
        "icp.fit = 0.89 against derived retail criteria",
        "segment: UK Mid-Market Retail",
        "language = English (UK)",
      ],
      [
        "cadence = London Business Hours (09:00–17:00 BST)",
        "goal = Schedule discovery scoping post board meeting",
      ],
      [
        "dialling via UK English Agent Arjun",
        "Daniel confirmed vendor evaluation is underway",
        "board review slated for 12th Sep · requested callback",
      ],
      [
        "transcript captured with sub-second latency",
        "sentiment = RECEPTIVE (0.82)",
        "next_action = Automated callback set for 13th Sep 15:00 BST",
      ],
      [
        "callback task synced to AE Calendar",
        "briefing PDF automatically emailed to prospect",
        "crm.sync = HubSpot Deal Updated",
      ],
      ["dialling velocity = 48 calls/hr", "retry rules configured for unanswered CSV batch leads"],
    ],
    verdict: "CALLBACK SCHEDULED · 13 Sep 15:00 BST (English Agent Arjun)",
    verdictTone: "violet",
  },
  {
    id: "notfit",
    label: "Out-of-ICP & DNC Suppression",
    mode: "leads_and_calling",
    blurb:
      "Prospect matches keyword 'ERP' but fails minimum headcount threshold and national DNC registry.",
    source: "Public Tender Directory",
    postUrl: "tenders.gov.in/notice/44821",
    outcomes: [
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "stop",
      "stop",
      "stop",
      "stop",
      "stop",
      "pass",
    ],
    log: [
      ["url = futurrizon.com", "onboarding ingested", "thresholds initialized"],
      ["derived ICP = Minimum 150 employees, commercial B2B, strict consent verification"],
      ["selected mode = [Leads + Calling]", "radar active on public directories"],
      ["radar match = tenders.gov.in Notice #44821", "keyword ERP detected"],
      [
        "enrichment completed",
        "firmographic scan = 11 employees (micro enterprise)",
        "phone on National DNC list",
      ],
      [
        "qualification = FAILED (fit score 0.18 < 0.60 threshold)",
        "disqualified: Out-of-ICP headcount + DNC conflict",
      ],
      ["campaign creation = BLOCKED by Zero-Spam Policy PB-05"],
      ["voice agent = SKIPPED (0 voice credits consumed)"],
      ["capture = suppression reason archived"],
      ["surfaced = placed into disqualified queue with audit report"],
      ["analytics = 100% false-positive prevention · 0 marketing budget wasted"],
    ],
    verdict: "COMPLIANCE BLOCKED · 0 CREDITS CONSUMED · AUDIT LOGGED",
    verdictTone: "danger",
  },
];

function playTone(freq = 440) {
  try {
    const ctx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch {
    // Audio context may be unavailable or blocked before user gesture
  }
}

export function Sandbox() {
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]!);
  const [states, setStates] = useState<StageState[]>(Array(11).fill("idle"));
  const [step, setStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStates(Array(11).fill("idle"));
    setStep(-1);
    setRunning(false);
  };

  const run = () => {
    reset();
    setRunning(true);
    playTone(520);

    scenario.outcomes.forEach((outcome, i) => {
      // step starts
      timers.current.push(
        setTimeout(() => {
          setStates((prev) => {
            const next = [...prev];
            next[i] = "running";
            return next;
          });
          setStep(i);
          playTone(360 + i * 45);
        }, i * 420),
      );

      // step finishes
      timers.current.push(
        setTimeout(
          () => {
            setStates((prev) => {
              const next = [...prev];
              next[i] = outcome;
              return next;
            });
            playTone(outcome === "pass" ? 640 : outcome === "stop" ? 220 : 420);
          },
          i * 420 + 320,
        ),
      );
    });

    timers.current.push(
      setTimeout(
        () => {
          setRunning(false);
          playTone(840);
        },
        scenario.outcomes.length * 420 + 350,
      ),
    );
  };

  return (
    <div className="border border-ink bg-card text-ink shadow-xl rounded-none">
      {/* Scenario Selector Tab Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-ink/20 bg-secondary px-4 py-3 gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-mono text-muted-foreground text-xs mr-1">// Test Scenarios:</span>
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                reset();
                setScenario(s);
              }}
              className={`px-3 py-1.5 font-mono text-xs transition-all border flex items-center gap-1.5 ${
                scenario.id === s.id
                  ? "bg-ink text-paper border-ink font-bold shadow"
                  : "bg-paper text-ink border-ink/20 hover:border-violet"
              }`}
            >
              <span>{s.label}</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 border uppercase font-mono ${
                  scenario.id === s.id
                    ? s.mode === "calling_only"
                      ? "bg-violet/30 text-paper border-violet/60"
                      : "bg-lime/20 text-lime border-lime/50"
                    : s.mode === "calling_only"
                      ? "bg-violet/10 text-violet border-violet/30"
                      : "bg-emerald-600/10 text-emerald-700 dark:text-lime border-emerald-500/30"
                }`}
              >
                {s.mode === "calling_only" ? "Calling Only" : "Leads + Calling"}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="border border-ink/30 bg-paper p-2 font-mono text-xs hover:bg-secondary transition-colors"
            title="Reset Simulation"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={run}
            disabled={running}
            className="inline-flex items-center gap-2 border border-ink bg-lime px-4 py-2 font-mono text-xs font-bold text-lime-foreground hover:bg-ink hover:text-paper transition-all disabled:opacity-50 active:scale-95 shadow-sm"
          >
            {running ? (
              <>
                <Sparkles className="h-3.5 w-3.5 animate-spin" /> Simulating 11 Stages…
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" /> Run 11-Step Simulation
              </>
            )}
          </button>
        </div>
      </div>

      {/* Scenario Context Bar */}
      <div className="border-b border-ink/15 bg-paper p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-violet bg-violet/10 px-2 py-0.5 border border-violet/30">
              Source: {scenario.source}
            </span>
            <span className="font-bold px-2 py-0.5 border border-ink/20 bg-secondary">
              Mode:{" "}
              {scenario.mode === "calling_only"
                ? "[Calling Only] CSV/CRM Upload"
                : "[Leads + Calling] Autonomous Radar"}
            </span>
            <span className="text-muted-foreground truncate max-w-md italic">{scenario.blurb}</span>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground underline">
            {scenario.postUrl}
          </span>
        </div>
      </div>

      {/* 11 Stage Interactive Pipeline Flow Nodes */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-11 gap-px bg-ink/15 border-b border-ink/20">
        {STAGES.map(([code, title, desc], i) => {
          const state = states[i]!;
          const isCurrent = step === i && running;
          return (
            <div
              key={code}
              className={`p-3 transition-all flex flex-col justify-between ${
                isCurrent
                  ? "bg-violet/15 border-b-2 border-violet"
                  : state === "pass"
                    ? "bg-paper dark:bg-card"
                    : "bg-paper dark:bg-card"
              }`}
            >
              <div>
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="font-bold text-violet">#{code}</span>
                  <span
                    className={`px-1 py-0.2 text-[8px] font-bold uppercase rounded-none border ${
                      state === "pass"
                        ? "bg-lime text-lime-foreground border-lime"
                        : state === "running"
                          ? "bg-violet text-white border-violet animate-pulse"
                          : state === "hold"
                            ? "bg-violet/20 text-violet border-violet"
                            : state === "stop"
                              ? "bg-danger text-white border-danger"
                              : "bg-secondary text-muted-foreground border-transparent"
                    }`}
                  >
                    {state}
                  </span>
                </div>
                <div className="mt-1.5 font-display text-[11px] font-bold text-ink leading-tight">
                  {title}
                </div>
              </div>
              <div className="mt-1 font-mono text-[9px] text-muted-foreground line-clamp-2 leading-tight">
                {desc}
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Stage Execution Terminal Logs (Permanent Dark Console for Phosphor Contrast) */}
      <div className="p-6 border border-neutral-800 bg-neutral-950 text-neutral-100 dark:bg-black space-y-4">
        <div className="flex items-center justify-between font-mono text-xs text-neutral-400 border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-lime animate-ping" />
            <span>Autonomous Flow Engine Telemetry</span>
          </div>
          <span className="text-lime font-bold">
            {running
              ? `Executing Step ${step + 1} of 11: [${STAGES[step]?.[1] ?? ""}]…`
              : step >= 0
                ? "All 11 Steps Processed"
                : "Simulator Ready"}
          </span>
        </div>

        <div className="min-h-[170px] max-h-[260px] overflow-y-auto space-y-2.5 font-mono text-[11px]">
          {step < 0 && (
            <div className="py-12 text-center text-neutral-400 space-y-1">
              <div>
                // Click "Run 11-Step Simulation" above to watch VYAPERI X process this workflow
              </div>
              <div className="text-[10px] text-neutral-500">
                From Onboarding & LLM Understanding through Discovery, Enrichment, Voice Call, and
                CRM Sync
              </div>
            </div>
          )}

          {step >= 0 &&
            scenario.log.slice(0, step + 1).map((entries, stageIdx) => (
              <div key={stageIdx} className="space-y-1 fade-in">
                <div className="text-violet font-bold flex items-center gap-2">
                  <span className="bg-violet/20 px-1.5 py-0.5 text-[10px] text-white">
                    Step {STAGES[stageIdx]![0]}
                  </span>
                  <span>[{STAGES[stageIdx]![1]}]:</span>
                </div>
                <div className="pl-4 space-y-0.5 text-neutral-300">
                  {entries.map((logLine, logIdx) => (
                    <div key={logIdx} className="flex items-center gap-2">
                      <span className="text-lime text-[10px]">✓</span>
                      <span>{logLine}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>

        {/* Final Pipeline Outcome Verdict */}
        {step === 10 && !running && (
          <div
            className={`mt-4 border border-ink p-3 text-center font-mono text-xs font-bold uppercase tracking-wider fade-in-up ${
              scenario.verdictTone === "lime"
                ? "bg-lime text-lime-foreground"
                : scenario.verdictTone === "violet"
                  ? "bg-violet text-white"
                  : "bg-danger text-white"
            }`}
          >
            11-Step Pipeline Outcome: {scenario.verdict}
          </div>
        )}
      </div>
    </div>
  );
}
