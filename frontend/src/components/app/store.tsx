import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type Source = "LinkedIn" | "X" | "Website" | "Directory" | "Freelance" | "CRM";
export type Stage = "new" | "enriched" | "qualified" | "contacted" | "interested" | "rejected";
export type Outcome = "INTERESTED" | "CALLBACK" | "VOICEMAIL" | "NOT_INTERESTED" | "NO_ANSWER";

export type Lead = {
  id: string;
  name: string;
  title: string;
  company: string;
  website: string;
  industry: string;
  size: string;
  location: string;
  email: string | null;
  phone: string | null;
  linkedin: string;
  source: Source;
  postUrl: string;
  requirement: string;
  discovered: string;
  score: number;
  stage: Stage;
  language: string;
};

export type Campaign = {
  id: string;
  name: string;
  segment: string;
  leads: number;
  status: "draft" | "scheduled" | "running" | "completed";
  schedule: string;
  timezone: string;
  language: string;
  dialled: number;
  connected: number;
  interested: number;
  meetings: number;
};

export type CallRecord = {
  id: string;
  ts: string;
  lead: string;
  company: string;
  language: string;
  duration: string;
  outcome: Outcome;
  score: number;
  summary: string;
  nextAction: string;
  transcript: { who: "AGENT" | "PROSPECT"; text: string }[];
};

export type VoiceAgent = {
  id: string;
  name: string;
  language: string;
  voice: string;
  persona: string;
  status: "active" | "paused";
  minutes: number;
  connectRate: number;
};

export type Playbook = {
  id: string;
  name: string;
  stage: string;
  action: "QUALIFY" | "ESCALATE" | "SUPPRESS";
  description: string;
  enabled: boolean;
  hits: number;
};

export type Signal = {
  id: string;
  company: string;
  type: "Funding" | "Hiring" | "Tech Stack" | "Competitor";
  detail: string;
  date: string;
  impact: number;
};

export type ReviewItem = {
  id: string;
  kind: "Product validation" | "High-value lead" | "Compliance";
  subject: string;
  detail: string;
  score: number;
  raised: string;
  status: "pending" | "approved" | "denied";
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "Owner" | "Sales Manager" | "SDR" | "Analyst";
  plan: "Starter" | "Growth" | "Enterprise";
  status: "active" | "suspended";
  minutes: number;
};

export type AuditLog = {
  id: string;
  ts: string;
  actor: string;
  action: string;
  tone: "ok" | "warn" | "bad";
};

type Workspace = {
  company: string;
  website: string;
  plan: "Starter" | "Growth" | "Enterprise";
  region: string;
  language: string;
  minutesUsed: number;
  minutesQuota: number;
  contactsUsed: number;
  contactsQuota: number;
  ownInfra: boolean;
  dncRespect: boolean;
  notifyEmail: string;
};

export type PipelineMode = "calling_only" | "leads_and_calling";

export type BusinessProfile = {
  url: string;
  description: string;
  documents: string[];
  derivedServices: string[];
  derivedIcp: {
    targetAudience: string;
    companySize: string;
    industries: string[];
    geography: string;
  };
  derivedKeywords: string[];
  status: "idle" | "analyzing" | "completed";
};

const REQUIREMENTS: [string, Source, string][] = [
  [
    "Looking for a SharePoint implementation partner — SharePoint Online setup, M365 integration, legacy migration, user training. Moving fast.",
    "LinkedIn",
    "linkedin.com/posts/sharepoint-partner-7291",
  ],
  [
    "Need an AI voice automation vendor for our inside-sales team. 40 seats, Hindi + English. Referrals welcome.",
    "LinkedIn",
    "linkedin.com/posts/voice-ai-vendor-8812",
  ],
  [
    "We're hiring an agency for a Shopify → headless commerce replatform in Q4. DMs open.",
    "X",
    "x.com/status/1892374651",
  ],
  [
    "RFP open: ERP data migration and Power BI reporting layer for a 400-person manufacturer.",
    "Directory",
    "tenders.gov.in/notice/44821",
  ],
  [
    "Seeking a React Native team to rebuild our field-service app. Budget approved.",
    "Freelance",
    "upwork.com/jobs/~0198aa",
  ],
  [
    "Looking for a partner to set up a modern data warehouse on Snowflake + dbt.",
    "Website",
    "acme.io/careers/rfp-data",
  ],
  [
    "Need multilingual customer-support automation across WhatsApp and voice for tier-2 cities.",
    "LinkedIn",
    "linkedin.com/posts/support-automation-4410",
  ],
  [
    "Evaluating CRM migration from spreadsheets to HubSpot. Recommendations appreciated.",
    "CRM",
    "crm.internal/opportunity/2291",
  ],
];

const NAMES = [
  [
    "Ananya Sharma",
    "Head of Digital Transformation",
    "Northbridge Infra",
    "northbridge.in",
    "Construction",
    "1,200",
    "Mumbai, IN",
  ],
  [
    "Rahul Menon",
    "VP Sales",
    "Kavach Logistics",
    "kavachlog.com",
    "Logistics",
    "480",
    "Bengaluru, IN",
  ],
  [
    "Priya Nair",
    "Director of IT",
    "Sunrise Health",
    "sunrisehealth.org",
    "Healthcare",
    "2,600",
    "Pune, IN",
  ],
  [
    "Daniel Whitfield",
    "COO",
    "Orbit Retail Group",
    "orbitretail.co.uk",
    "Retail",
    "890",
    "London, UK",
  ],
  ["Meera Iyer", "Founder", "Trellis Analytics", "trellis.ai", "SaaS", "45", "Hyderabad, IN"],
  [
    "Karan Bhatia",
    "Procurement Lead",
    "Vajra Manufacturing",
    "vajramfg.com",
    "Manufacturing",
    "3,100",
    "Ahmedabad, IN",
  ],
  [
    "Sofia Marquez",
    "Head of CX",
    "Andes Telecom",
    "andestel.com",
    "Telecom",
    "5,400",
    "Bogotá, CO",
  ],
  ["Vikram Desai", "CTO", "Pehchaan Fintech", "pehchaan.money", "Fintech", "310", "Gurugram, IN"],
  ["Aisha Rahman", "Marketing Director", "Zaytoon Foods", "zaytoon.ae", "FMCG", "760", "Dubai, AE"],
  [
    "Neha Kulkarni",
    "Program Manager",
    "Setu Public Works",
    "setupw.gov.in",
    "Public Sector",
    "9,000",
    "Delhi, IN",
  ],
  [
    "Arjun Rao",
    "Head of Ops",
    "Bluewave Energy",
    "bluewave.energy",
    "Energy",
    "1,050",
    "Chennai, IN",
  ],
  [
    "Emily Chen",
    "VP Engineering",
    "Lumen Robotics",
    "lumenrobotics.io",
    "Robotics",
    "220",
    "Singapore, SG",
  ],
];

const LANGS = [
  "Hindi",
  "English",
  "Marathi",
  "Tamil",
  "Spanish",
  "Arabic",
  "Bengali",
  "Telugu",
  "Gujarati",
];

let seed = 20260901;
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

export function makeLead(i: number): Lead {
  const p = NAMES[i % NAMES.length]!;
  const r = REQUIREMENTS[i % REQUIREMENTS.length]!;
  const score = 34 + Math.floor(rnd() * 64);
  const hasEmail = rnd() > 0.28;
  const hasPhone = rnd() > 0.45;
  const slug = p[0]!.toLowerCase().replace(/\s+/g, ".");
  const stage: Stage = score > 84 ? "qualified" : score > 66 ? "enriched" : "new";
  const d = new Date(Date.UTC(2026, 8, 1, 11, 12, 0) - i * 411000);
  return {
    id: `LD-${4200 - i}`,
    name: p[0]!,
    title: p[1]!,
    company: p[2]!,
    website: p[3]!,
    industry: p[4]!,
    size: p[5]!,
    location: p[6]!,
    email: hasEmail ? `${slug}@${p[3]}` : null,
    phone: hasPhone
      ? `+91 ${90000 + Math.floor(rnd() * 9999)} ${10000 + Math.floor(rnd() * 89999)}`
      : null,
    linkedin: `linkedin.com/in/${slug}`,
    source: r[1],
    postUrl: r[2],
    requirement: r[0],
    discovered: d.toISOString().slice(0, 16).replace("T", " "),
    score,
    stage,
    language: LANGS[i % LANGS.length]!,
  };
}

const INITIAL_LEADS = Array.from({ length: 24 }, (_, i) => makeLead(i));

const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    id: "CMP-118",
    name: "SharePoint partners — IN/UK",
    segment: "IT services · 500+ employees",
    leads: 412,
    status: "running",
    schedule: "Daily 10:00–18:00",
    timezone: "Asia/Kolkata",
    language: "Hindi + English",
    dialled: 318,
    connected: 191,
    interested: 47,
    meetings: 18,
  },
  {
    id: "CMP-117",
    name: "Headless commerce replatform",
    segment: "Retail · D2C",
    leads: 260,
    status: "scheduled",
    schedule: "Starts 03 Sep, 09:30",
    timezone: "Europe/London",
    language: "English",
    dialled: 0,
    connected: 0,
    interested: 0,
    meetings: 0,
  },
  {
    id: "CMP-115",
    name: "Data warehouse RFPs",
    segment: "Manufacturing · 1000+",
    leads: 184,
    status: "completed",
    schedule: "Ran 21–28 Aug",
    timezone: "Asia/Kolkata",
    language: "Hindi + Gujarati",
    dialled: 184,
    connected: 121,
    interested: 33,
    meetings: 12,
  },
  {
    id: "CMP-119",
    name: "LATAM support automation",
    segment: "Telecom · CX leaders",
    leads: 96,
    status: "draft",
    schedule: "—",
    timezone: "America/Bogota",
    language: "Spanish",
    dialled: 0,
    connected: 0,
    interested: 0,
    meetings: 0,
  },
];

const INITIAL_CALLS: CallRecord[] = [
  {
    id: "CL-9921",
    ts: "11:12:04",
    lead: "Ananya Sharma",
    company: "Northbridge Infra",
    language: "Hindi",
    duration: "3m 12s",
    outcome: "INTERESTED",
    score: 92,
    summary:
      "Confirmed active SharePoint migration project, budget approved for Q4, wants a scoping call with a solution architect.",
    nextAction: "Book architect call — Thu 11:00 IST",
    transcript: [
      {
        who: "AGENT",
        text: "नमस्ते Ananya जी, मैं Vyaperi X से बोल रही हूँ। आपने SharePoint implementation partner के बारे में पोस्ट किया था — क्या अभी वह project active है?",
      },
      {
        who: "PROSPECT",
        text: "हाँ, हम Q4 में शुरू करना चाहते हैं। Migration legacy system से करना है।",
      },
      {
        who: "AGENT",
        text: "समझ गई। क्या Microsoft 365 integration और user training भी scope में है?",
      },
      { who: "PROSPECT", text: "बिल्कुल, दोनों चाहिए. Budget approved हो चुका है." },
      {
        who: "AGENT",
        text: "बढ़िया। मैं गुरुवार 11 बजे हमारे solution architect के साथ call schedule कर देती हूँ, ठीक रहेगा?",
      },
      { who: "PROSPECT", text: "हाँ, चलेगा।" },
    ],
  },
  {
    id: "CL-9920",
    ts: "11:08:41",
    lead: "Daniel Whitfield",
    company: "Orbit Retail Group",
    language: "English",
    duration: "1m 48s",
    outcome: "CALLBACK",
    score: 71,
    summary:
      "Replatform decision moves to the board on 12 Sep. Asked to be called back after the review.",
    nextAction: "Auto-callback scheduled 13 Sep, 15:00 BST",
    transcript: [
      {
        who: "AGENT",
        text: "Hi Daniel, calling about your headless commerce replatform post — is the evaluation still open?",
      },
      { who: "PROSPECT", text: "It is, but the board signs off on 12 September." },
      {
        who: "AGENT",
        text: "Understood. I'll schedule a callback for the 13th and send a short capability brief meanwhile.",
      },
    ],
  },
  {
    id: "CL-9919",
    ts: "11:03:22",
    lead: "Sofia Marquez",
    company: "Andes Telecom",
    language: "Spanish",
    duration: "0m 34s",
    outcome: "VOICEMAIL",
    score: 55,
    summary:
      "No answer. Multilingual voicemail left with callback number and source-post reference.",
    nextAction: "Retry attempt 2 of 4 — today 17:40 COT",
    transcript: [
      {
        who: "AGENT",
        text: "Hola Sofia, le llamo de Vyaperi X sobre su búsqueda de automatización de soporte multilingüe. Le devolveremos la llamada esta tarde.",
      },
    ],
  },
  {
    id: "CL-9918",
    ts: "10:57:10",
    lead: "Karan Bhatia",
    company: "Vajra Manufacturing",
    language: "Gujarati",
    duration: "2m 05s",
    outcome: "NOT_INTERESTED",
    score: 18,
    summary: "Vendor already selected two weeks ago. Requested no further contact this quarter.",
    nextAction: "Suppressed for 90 days · added to do-not-call",
    transcript: [
      {
        who: "AGENT",
        text: "નમસ્તે Karan ભાઈ, ERP migration RFP વિશે વાત કરવી હતી. અમે Vyaperi X Analytics છીએ — ડેટા warehouse setup અને Power BI reporting ક્ષેત્રે specialise કરીએ છીએ.",
      },
      { who: "PROSPECT", text: "અમે vendor નક્કી કરી લીધો છે, આભાર." },
      {
        who: "AGENT",
        text: "સમજ્યો, Karan ભાઈ. ખૂબ ખૂબ ધન્યવાદ — ભવિષ્યની project માટે contact ચાલુ રાખવી? Q2 2027 track કરી દઉં?",
      },
      { who: "PROSPECT", text: "ના, હમણાં નહીં. Thank you." },
    ],
  },
  {
    id: "CL-9917",
    ts: "10:44:22",
    lead: "Meera Iyer",
    company: "Trellis Analytics",
    language: "Gujarati + English",
    duration: "4m 18s",
    outcome: "INTERESTED",
    score: 88,
    summary:
      "Interested in Snowflake + dbt data warehouse setup. Budget confirmed. Wants a live demo next week.",
    nextAction: "Send demo invite — Mon 10:00 IST",
    transcript: [
      {
        who: "AGENT",
        text: "Hello Meera, I'm calling from Vyaperi X. You posted about setting up a modern data warehouse on Snowflake + dbt — is that initiative still active?",
      },
      { who: "PROSPECT", text: "Yes absolutely, we have budget cleared for this quarter." },
      {
        who: "AGENT",
        text: "ઉત્તમ! અમે Snowflake setup, dbt pipelines અને Power BI dashboards ત્રણેય deliver કરીએ છીએ. Would you like a live demo next week?",
      },
      { who: "PROSPECT", text: "That would be great! Monday works for us." },
      {
        who: "AGENT",
        text: "Monday 10 AM IST — I'll send a calendar invite right now. Thanks Meera!",
      },
    ],
  },
];

const INITIAL_AGENTS: VoiceAgent[] = [
  {
    id: "VA-01",
    name: "Saanvi",
    language: "Hindi + English",
    voice: "Warm · Female · 1.0x",
    persona: "Consultative SDR for IT services",
    status: "active",
    minutes: 4820,
    connectRate: 61,
  },
  {
    id: "VA-02",
    name: "Arjun",
    language: "English (IN/UK)",
    voice: "Neutral · Male · 1.05x",
    persona: "Enterprise qualification specialist",
    status: "active",
    minutes: 3110,
    connectRate: 57,
  },
  {
    id: "VA-03",
    name: "Lucía",
    language: "Spanish (LATAM)",
    voice: "Bright · Female · 0.95x",
    persona: "CX automation outreach",
    status: "paused",
    minutes: 940,
    connectRate: 44,
  },
  {
    id: "VA-04",
    name: "Kavya",
    language: "Tamil + Telugu",
    voice: "Calm · Female · 1.0x",
    persona: "Regional SMB outreach",
    status: "active",
    minutes: 1360,
    connectRate: 52,
  },
  {
    id: "VA-05",
    name: "Dhruv",
    language: "Gujarati + English",
    voice: "Warm · Male · 1.0x",
    persona: "Textile & manufacturing segment specialist",
    status: "active",
    minutes: 890,
    connectRate: 58,
  },
];

const INITIAL_PLAYBOOKS: Playbook[] = [
  {
    id: "PB-01",
    name: "High-intent post detector",
    stage: "Discovery",
    action: "QUALIFY",
    description: "Flag posts containing hiring/partner/RFP intent verbs within the last 14 days.",
    enabled: true,
    hits: 1841,
  },
  {
    id: "PB-02",
    name: "Duplicate & domain dedupe",
    stage: "Enrichment",
    action: "SUPPRESS",
    description: "Collapse duplicate prospects across sources on email + company domain.",
    enabled: true,
    hits: 612,
  },
  {
    id: "PB-03",
    name: "ICP fit scoring",
    stage: "Qualification",
    action: "QUALIFY",
    description: "Score against industry, company size, geography and tech-stack signals.",
    enabled: true,
    hits: 2290,
  },
  {
    id: "PB-04",
    name: "Enterprise deal escalation",
    stage: "Qualification",
    action: "ESCALATE",
    description: "Any prospect above 1,000 employees routes to a human AE before dialling.",
    enabled: true,
    hits: 148,
  },
  {
    id: "PB-05",
    name: "DNC & quiet hours",
    stage: "Voice",
    action: "SUPPRESS",
    description: "Never dial do-not-call numbers or outside 09:00–20:00 local prospect time.",
    enabled: true,
    hits: 377,
  },
  {
    id: "PB-06",
    name: "Callback ladder",
    stage: "Voice",
    action: "QUALIFY",
    description: "Retry unanswered numbers up to 4 times across different time bands.",
    enabled: true,
    hits: 903,
  },
  {
    id: "PB-07",
    name: "Competitor-mention router",
    stage: "Intelligence",
    action: "ESCALATE",
    description: "Prospects naming a competitor route to the battlecard playbook.",
    enabled: false,
    hits: 62,
  },
];

const INITIAL_SIGNALS: Signal[] = [
  {
    id: "SG-441",
    company: "Trellis Analytics",
    type: "Funding",
    detail: "Raised $12M Series A led by Elevation — budget expansion likely in 60 days.",
    date: "29 Aug 2026",
    impact: 88,
  },
  {
    id: "SG-440",
    company: "Northbridge Infra",
    type: "Hiring",
    detail: "9 open roles for SharePoint / M365 administrators posted this month.",
    date: "28 Aug 2026",
    impact: 81,
  },
  {
    id: "SG-438",
    company: "Orbit Retail Group",
    type: "Tech Stack",
    detail: "Detected Shopify Plus + legacy Magento — replatform signal confirmed.",
    date: "26 Aug 2026",
    impact: 74,
  },
  {
    id: "SG-436",
    company: "Pehchaan Fintech",
    type: "Competitor",
    detail: "Evaluating two rival voice-AI vendors; pricing page visited 6 times.",
    date: "24 Aug 2026",
    impact: 69,
  },
  {
    id: "SG-433",
    company: "Andes Telecom",
    type: "Hiring",
    detail: "Hiring multilingual CX leads across Bogotá and Lima.",
    date: "22 Aug 2026",
    impact: 63,
  },
];

const INITIAL_REVIEW: ReviewItem[] = [
  {
    id: "RV-311",
    kind: "Product validation",
    subject: "SharePoint Migration Accelerator",
    detail: "AI validation inconclusive — service description lacks pricing and delivery scope.",
    score: 52,
    raised: "10:44",
    status: "pending",
  },
  {
    id: "RV-310",
    kind: "High-value lead",
    subject: "Setu Public Works — 9,000 employees",
    detail:
      "Public-sector prospect above enterprise threshold; requires AE approval before dialling.",
    score: 91,
    raised: "10:31",
    status: "pending",
  },
  {
    id: "RV-309",
    kind: "Compliance",
    subject: "+91 98••• ••512 — DNC conflict",
    detail: "Number appears on a national do-not-call list. Manual confirmation required.",
    score: 44,
    raised: "10:12",
    status: "pending",
  },
  {
    id: "RV-307",
    kind: "Product validation",
    subject: "Voice-AI Managed Service",
    detail: "Approved for AI selling in Hindi, English and Marathi.",
    score: 86,
    raised: "09:48",
    status: "approved",
  },
];

const INITIAL_USERS: AdminUser[] = [
  {
    id: "US-01",
    name: "Rohit Agarwal",
    email: "rohit@futurrizon.com",
    role: "Owner",
    plan: "Enterprise",
    status: "active",
    minutes: 2140,
  },
  {
    id: "US-02",
    name: "Deepika Shah",
    email: "deepika@futurrizon.com",
    role: "Sales Manager",
    plan: "Growth",
    status: "active",
    minutes: 1580,
  },
  {
    id: "US-03",
    name: "Imran Qureshi",
    email: "imran@futurrizon.com",
    role: "SDR",
    plan: "Growth",
    status: "active",
    minutes: 970,
  },
  {
    id: "US-04",
    name: "Tanvi Joshi",
    email: "tanvi@futurrizon.com",
    role: "Analyst",
    plan: "Starter",
    status: "suspended",
    minutes: 210,
  },
];

const INITIAL_AUDIT: AuditLog[] = [
  {
    id: "AU-9001",
    ts: "11:12",
    actor: "voice-agent/Saanvi",
    action: "Call CL-9921 completed — outcome INTERESTED, transcript stored",
    tone: "ok",
  },
  {
    id: "AU-9000",
    ts: "11:05",
    actor: "deepika@futurrizon.com",
    action: "Launched campaign CMP-118 with 412 leads",
    tone: "ok",
  },
  {
    id: "AU-8998",
    ts: "10:52",
    actor: "system/fraud",
    action: "Blocked bulk export of 12,000 contacts from unverified IP",
    tone: "bad",
  },
  {
    id: "AU-8996",
    ts: "10:31",
    actor: "system/policy",
    action: "Lead LD-4191 escalated to human review (enterprise threshold)",
    tone: "warn",
  },
  {
    id: "AU-8993",
    ts: "10:04",
    actor: "rohit@futurrizon.com",
    action: "Upgraded workspace plan Growth → Enterprise",
    tone: "ok",
  },
];

type Store = {
  leads: Lead[];
  pushLead: () => void;
  setStage: (id: string, stage: Stage) => void;
  addLeads: (rows: Lead[]) => void;
  campaigns: Campaign[];
  setCampaignStatus: (id: string, status: Campaign["status"]) => void;
  addCampaign: (
    c: Omit<Campaign, "id" | "dialled" | "connected" | "interested" | "meetings">,
  ) => void;
  calls: CallRecord[];
  addCall: (c: CallRecord) => void;
  voiceAgents: VoiceAgent[];
  toggleVoiceAgent: (id: string) => void;
  addVoiceAgent: (name: string, language: string, persona: string) => void;
  playbooks: Playbook[];
  togglePlaybook: (id: string) => void;
  signals: Signal[];
  review: ReviewItem[];
  decideReview: (id: string, status: "approved" | "denied") => void;
  users: AdminUser[];
  toggleUser: (id: string) => void;
  audit: AuditLog[];
  workspace: Workspace;
  setWorkspace: (patch: Partial<Workspace>) => void;
  pipelineMode: PipelineMode;
  setPipelineMode: (mode: PipelineMode) => void;
  businessProfile: BusinessProfile;
  updateBusinessProfile: (patch: Partial<BusinessProfile>) => void;
  runUnderstandingEngine: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>(INITIAL_LEADS);
  const [campaigns, setCampaigns] = useState<Campaign[]>(INITIAL_CAMPAIGNS);
  const [calls, setCalls] = useState<CallRecord[]>(INITIAL_CALLS);
  const [voiceAgents, setVoiceAgents] = useState<VoiceAgent[]>(INITIAL_AGENTS);
  const [playbooks, setPlaybooks] = useState<Playbook[]>(INITIAL_PLAYBOOKS);
  const [signals] = useState<Signal[]>(INITIAL_SIGNALS);
  const [review, setReview] = useState<ReviewItem[]>(INITIAL_REVIEW);
  const [users, setUsers] = useState<AdminUser[]>(INITIAL_USERS);
  const [audit, setAudit] = useState<AuditLog[]>(INITIAL_AUDIT);
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>("leads_and_calling");
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>({
    url: "futurrizon.com",
    description:
      "Enterprise Cloud Architecture, Legacy ERP Modernization & Multilingual AI Voice Automation for Mid-Market Enterprises",
    documents: ["Futurrizon_Capability_Statement_2026.pdf", "Enterprise_ERP_Whitepaper.pdf"],
    derivedServices: [
      "Cloud ERP & GST Migration",
      "Microsoft 365 Architecture & SharePoint",
      "Multilingual AI Voice Fleet Deployment",
      "Data Warehouse & Snowflake Modernization",
    ],
    derivedIcp: {
      targetAudience:
        "VP of IT, Chief Technology Officer, Head of Digital Transformation, Operations Director",
      companySize: "200 – 5,000 employees",
      industries: ["Manufacturing", "Construction & Infra", "Logistics", "Retail & Commerce"],
      geography: "India (Gujarat, Maharashtra, Karnataka), UK, UAE",
    },
    derivedKeywords: [
      "SharePoint migration partner",
      "Cloud ERP vendor",
      "AI voice automation",
      "headless Shopify replatform",
      "data warehouse Snowflake",
      "warehouse automation GST",
    ],
    status: "completed",
  });

  const [workspace, setWs] = useState<Workspace>({
    company: "Futurrizon Technologies Pvt. Ltd.",
    website: "futurrizon.com",
    plan: "Enterprise",
    region: "ap-south-1 (Mumbai)",
    language: "Hindi",
    minutesUsed: 10230,
    minutesQuota: 25000,
    contactsUsed: 48210,
    contactsQuota: 100000,
    ownInfra: false,
    dncRespect: true,
    notifyEmail: "sales@futurrizon.com",
  });

  const runUnderstandingEngine = async () => {
    setBusinessProfile((prev) => ({ ...prev, status: "analyzing" }));
    await new Promise((resolve) => setTimeout(resolve, 1400));
    setBusinessProfile((prev) => ({
      ...prev,
      status: "completed",
      derivedServices: [
        "Cloud ERP Modernization & GST Sync",
        "Enterprise SharePoint & M365 Setup",
        "Autonomous AI Multilingual Voice Fleet",
        "Modern Data Warehouse (Snowflake + dbt)",
      ],
      derivedIcp: {
        targetAudience: "VP Tech, IT Director, COO, Head of Procurement",
        companySize: "150 – 4,500 employees",
        industries: ["Manufacturing", "Logistics", "Healthcare", "Enterprise Retail"],
        geography: "India, United Kingdom, GCC",
      },
      derivedKeywords: [
        "seeking ERP partner",
        "AI voice vendor RFP",
        "SharePoint migration",
        "vendor selection Q4",
      ],
    }));
    setAudit((prev) => [
      {
        id: `AU-${Math.floor(Math.random() * 9000 + 1000)}`,
        ts: new Date().toTimeString().slice(0, 5),
        actor: "engine/business-understanding-llm",
        action: "LLM re-analyzed URL & documentation: derived 4 services, 1 ICP, 4 keywords",
        tone: "ok",
      },
      ...prev,
    ]);
  };

  const value = useMemo<Store>(
    () => ({
      leads,
      pushLead: () =>
        setLeads((prev) => {
          const l = makeLead(prev.length + Math.floor(rnd() * 11));
          l.id = `LD-${4300 + prev.length}`;
          l.discovered = new Date().toISOString().slice(0, 16).replace("T", " ");
          return [l, ...prev].slice(0, 80);
        }),
      setStage: (id, stage) => setLeads((p) => p.map((l) => (l.id === id ? { ...l, stage } : l))),
      addLeads: (rows) => setLeads((p) => [...rows, ...p]),
      campaigns,
      setCampaignStatus: (id, status) =>
        setCampaigns((p) => p.map((c) => (c.id === id ? { ...c, status } : c))),
      addCampaign: (c) =>
        setCampaigns((p) => [
          {
            ...c,
            id: `CMP-${120 + p.length}`,
            dialled: 0,
            connected: 0,
            interested: 0,
            meetings: 0,
          },
          ...p,
        ]),
      calls,
      addCall: (c) => setCalls((p) => [c, ...p].slice(0, 40)),
      voiceAgents,
      toggleVoiceAgent: (id) =>
        setVoiceAgents((p) =>
          p.map((a) =>
            a.id === id ? { ...a, status: a.status === "active" ? "paused" : "active" } : a,
          ),
        ),
      addVoiceAgent: (name, language, persona) =>
        setVoiceAgents((p) => [
          {
            id: `VA-0${p.length + 1}`,
            name,
            language,
            persona,
            voice: "Neutral · 1.0x",
            status: "active",
            minutes: 0,
            connectRate: 0,
          },
          ...p,
        ]),
      playbooks,
      togglePlaybook: (id) =>
        setPlaybooks((p) => p.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x))),
      signals,
      review,
      decideReview: (id, status) =>
        setReview((p) => p.map((r) => (r.id === id ? { ...r, status } : r))),
      users,
      toggleUser: (id) =>
        setUsers((p) =>
          p.map((u) =>
            u.id === id ? { ...u, status: u.status === "active" ? "suspended" : "active" } : u,
          ),
        ),
      audit,
      workspace,
      setWorkspace: (patch) => setWs((w) => ({ ...w, ...patch })),
      pipelineMode,
      setPipelineMode,
      businessProfile,
      updateBusinessProfile: (patch) => setBusinessProfile((prev) => ({ ...prev, ...patch })),
      runUnderstandingEngine,
    }),
    [
      leads,
      campaigns,
      calls,
      voiceAgents,
      playbooks,
      signals,
      review,
      users,
      audit,
      workspace,
      pipelineMode,
      businessProfile,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export function toCsv(rows: Lead[]) {
  const head = [
    "ID",
    "Name",
    "Title",
    "Company",
    "Website",
    "Industry",
    "Size",
    "Location",
    "Email",
    "Phone",
    "LinkedIn",
    "Source",
    "Post URL",
    "Discovered",
    "Score",
    "Stage",
    "Language",
  ];
  const body = rows.map((l) =>
    [
      l.id,
      l.name,
      l.title,
      l.company,
      l.website,
      l.industry,
      l.size,
      l.location,
      l.email ?? "",
      l.phone ?? "",
      l.linkedin,
      l.source,
      l.postUrl,
      l.discovered,
      String(l.score),
      l.stage,
      l.language,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [head.join(","), ...body].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
