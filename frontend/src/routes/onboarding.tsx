import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Linkedin,
  Globe,
  Users,
  MessageSquare,
  Search,
  Target,
  BarChart3,
  Layers,
  Brain,
  Radio,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Logo } from "@/components/site/Chrome";
import { ScrollReveal } from "@/components/app/scroll-reveal";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "VYAPERI X — Getting Started" },
      { name: "description", content: "Tell us about yourself to get started with VYAPERI X." },
    ],
  }),
  component: OnboardingPage,
});

/* ─── Step Data ─── */
const SOURCE_OPTIONS = [
  { id: "linkedin", label: "LinkedIn", icon: Linkedin },
  { id: "google", label: "Google Search", icon: Search },
  { id: "word_of_mouth", label: "Word of Mouth", icon: MessageSquare },
  { id: "twitter", label: "X / Twitter", icon: Globe },
  { id: "partner", label: "Partner / Agency", icon: Users },
  { id: "other", label: "Other", icon: Globe },
];

const INDUSTRIES = [
  "SaaS / Technology",
  "Financial Services",
  "Healthcare",
  "E-Commerce / Retail",
  "Manufacturing",
  "Real Estate",
  "Professional Services",
  "Education",
  "Other",
];

const TEAM_SIZES = ["Just me", "2–10", "11–50", "51–200", "200+"];

const USE_CASES = [
  {
    id: "lead_intel",
    icon: Target,
    title: "Lead Intelligence",
    desc: "Discover and qualify high-intent prospects from 40+ sources before calling.",
  },
  {
    id: "competitor",
    icon: BarChart3,
    title: "Competitor Research",
    desc: "Analyze competitor websites, pricing, and positioning in real time.",
  },
  {
    id: "due_diligence",
    icon: Brain,
    title: "Commercial Due Diligence",
    desc: "Turn any company URL or pitch deck into a board-grade intelligence report.",
  },
  {
    id: "sales_qual",
    icon: Layers,
    title: "Sales Qualification",
    desc: "Auto-score inbound leads against your ICP before SDRs spend time on them.",
  },
];

/* ─── Progress Bar ─── */
function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 transition-all duration-500 ${
            i < current ? "bg-violet" : i === current ? "bg-violet/50" : "bg-ink/15"
          }`}
        />
      ))}
    </div>
  );
}

/* ─── Option Card ─── */
function OptionCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left border p-4 transition-all w-full active:scale-[0.98] ${
        selected
          ? "border-violet bg-violet/8 shadow-[0_0_0_1px_oklch(0.55_0.24_291)]"
          : "border-ink/20 bg-card hover:border-ink/50 hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function OnboardingPage() {
  const navigate = useNavigate();
  const { user, profile, completeOnboarding, updateProfile, loading } = useAuth();
  const [step, setStep] = useState(0); // 0-3
  const [source, setSource] = useState("");
  const [company, setCompany] = useState(profile?.company_name || user?.user_metadata?.["company_name"] || "");
  const [industry, setIndustry] = useState(profile?.industry || user?.user_metadata?.["industry"] || "");
  const [teamSize, setTeamSize] = useState("");
  const [useCase, setUseCase] = useState("");
  const [animDir, setAnimDir] = useState<"forward" | "back">("forward");

  const TOTAL_STEPS = 4;

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-6 space-y-4">
        <div className="w-10 h-10 border-2 border-violet border-t-transparent rounded-full animate-spin" />
        <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
          Initializing Onboarding...
        </p>
      </div>
    );
  }

  const goNext = () => {
    setAnimDir("forward");
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };
  const goBack = () => {
    setAnimDir("back");
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleFinish = async () => {
    sessionStorage.setItem(
      "vyaperi_onboarding",
      JSON.stringify({ company, industry, teamSize, useCase, source })
    );
    if (user?.id) {
      try {
        localStorage.setItem(
          `vyaperi_onboarding_${user.id}`,
          JSON.stringify({ company, industry, teamSize, useCase, source })
        );
      } catch {}
    }

    try {
      if (user) {
        await completeOnboarding();
        await updateProfile({
          company_name: company || profile?.company_name,
          industry: industry || profile?.industry,
        });
      }
    } catch (e) {
      console.warn("Could not sync onboarding completion to Supabase:", e);
    }
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col selection:bg-lime selection:text-ink">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 border-b border-ink/15 bg-paper/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[900px] items-center justify-between px-4 py-3 sm:px-6">
          <Logo />
          <div className="flex items-center gap-4">
            <div className="w-48 hidden sm:block">
              <StepProgress current={step} total={TOTAL_STEPS} />
            </div>
            <span className="label-mono text-muted-foreground">
              Step {step + 1} / {TOTAL_STEPS}
            </span>
          </div>
        </div>
      </header>

      {/* Main Step Container */}
      <main className="flex-1 flex items-start justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-[680px] space-y-8">

          {/* ── Step 0: How did you hear about us? ── */}
          {step === 0 && (
            <div className="space-y-8 fade-in-up">
              <div className="space-y-3">
                <span className="label-mono text-violet">/01 Discovery Source</span>
                <h1 className="font-display text-[clamp(2rem,6vw,3.2rem)] font-extrabold leading-[0.88] tracking-tight">
                  How did you
                  <br />
                  hear about us?
                </h1>
                <p className="font-mono text-sm text-muted-foreground">
                  Helps us understand where our community comes from.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SOURCE_OPTIONS.map((opt) => (
                  <OptionCard
                    key={opt.id}
                    selected={source === opt.id}
                    onClick={() => setSource(opt.id)}
                  >
                    <div className="flex items-center gap-2.5">
                      <opt.icon className={`w-4 h-4 shrink-0 ${source === opt.id ? "text-violet" : "text-muted-foreground"}`} />
                      <span className="font-mono text-xs font-semibold">{opt.label}</span>
                    </div>
                    {source === opt.id && (
                      <div className="mt-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-violet" />
                      </div>
                    )}
                  </OptionCard>
                ))}
              </div>

              <button
                onClick={goNext}
                disabled={!source}
                className="group flex items-center gap-3 border border-ink bg-ink text-paper px-8 py-4 label-mono font-bold hover:border-violet hover:bg-violet transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Continue
                <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>
            </div>
          )}

          {/* ── Step 1: Company Info ── */}
          {step === 1 && (
            <div className="space-y-8 fade-in-up">
              <div className="space-y-3">
                <span className="label-mono text-violet">/02 Company Profile</span>
                <h1 className="font-display text-[clamp(2rem,6vw,3.2rem)] font-extrabold leading-[0.88] tracking-tight">
                  Tell us about
                  <br />
                  your company
                </h1>
                <p className="font-mono text-sm text-muted-foreground">
                  We'll tailor your workspace to your industry and scale.
                </p>
              </div>

              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label className="label-mono text-muted-foreground">Company / Organisation Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Technologies Pvt Ltd"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full border border-ink/40 bg-card px-4 py-3 font-mono text-sm text-ink placeholder-muted-foreground focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="label-mono text-muted-foreground">Industry</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {INDUSTRIES.map((ind) => (
                      <OptionCard
                        key={ind}
                        selected={industry === ind}
                        onClick={() => setIndustry(ind)}
                      >
                        <span className="font-mono text-xs">{ind}</span>
                      </OptionCard>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="label-mono text-muted-foreground">Team Size</label>
                  <div className="flex flex-wrap gap-2">
                    {TEAM_SIZES.map((sz) => (
                      <OptionCard
                        key={sz}
                        selected={teamSize === sz}
                        onClick={() => setTeamSize(sz)}
                      >
                        <span className="font-mono text-xs font-semibold">{sz}</span>
                      </OptionCard>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={goBack}
                  className="flex items-center gap-2 border border-ink/30 px-5 py-3.5 label-mono text-muted-foreground hover:border-ink hover:text-ink transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  onClick={goNext}
                  disabled={!company || !industry || !teamSize}
                  className="group flex items-center gap-3 border border-ink bg-ink text-paper px-8 py-3.5 label-mono font-bold hover:border-violet hover:bg-violet transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Continue
                  <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Primary Use Case ── */}
          {step === 2 && (
            <div className="space-y-8 fade-in-up">
              <div className="space-y-3">
                <span className="label-mono text-violet">/03 Primary Use Case</span>
                <h1 className="font-display text-[clamp(2rem,6vw,3.2rem)] font-extrabold leading-[0.88] tracking-tight">
                  What's your
                  <br />
                  primary goal?
                </h1>
                <p className="font-mono text-sm text-muted-foreground">
                  We'll activate the right modules for your workflow.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {USE_CASES.map((uc) => (
                  <OptionCard
                    key={uc.id}
                    selected={useCase === uc.id}
                    onClick={() => setUseCase(uc.id)}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className={`p-2 border ${useCase === uc.id ? "border-violet/40 bg-violet/10" : "border-ink/20 bg-secondary"}`}>
                          <uc.icon className={`w-4 h-4 ${useCase === uc.id ? "text-violet" : "text-muted-foreground"}`} />
                        </div>
                        {useCase === uc.id && <CheckCircle2 className="w-4 h-4 text-violet" />}
                      </div>
                      <div>
                        <p className="font-display text-sm font-extrabold uppercase">{uc.title}</p>
                        <p className="font-mono text-xs text-muted-foreground mt-1 leading-relaxed">{uc.desc}</p>
                      </div>
                    </div>
                  </OptionCard>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={goBack}
                  className="flex items-center gap-2 border border-ink/30 px-5 py-3.5 label-mono text-muted-foreground hover:border-ink hover:text-ink transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  onClick={goNext}
                  disabled={!useCase}
                  className="group flex items-center gap-3 border border-ink bg-ink text-paper px-8 py-3.5 label-mono font-bold hover:border-violet hover:bg-violet transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Continue
                  <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Confirmation / Launch ── */}
          {step === 3 && (
            <div className="space-y-10 fade-in-up text-center">
              <div className="flex justify-center">
                <div className="relative">
                  <div className="border-2 border-lime bg-lime/10 p-8">
                    <Sparkles className="w-12 h-12 text-violet mx-auto" style={{ animation: "spin-slow 6s linear infinite" }} />
                  </div>
                  <div className="absolute -inset-2 border border-lime/40 live-dot pointer-events-none" />
                </div>
              </div>

              <div className="space-y-3">
                <span className="label-mono text-violet">/04 Workspace Activated</span>
                <h1 className="font-display text-[clamp(2rem,6vw,3.2rem)] font-extrabold leading-[0.88] tracking-tight">
                  {company ? `${company},` : ""}
                  <br />
                  You're all set!
                </h1>
                <p className="font-mono text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  Your Intelligence Suite workspace is ready. The{" "}
                  <strong className="text-ink">Commercial Due Diligence Engine</strong> is your
                  first activated module — paste any company URL to start.
                </p>
              </div>

              {/* Summary & Activated Modules Grid */}
              <div className="space-y-4 max-w-md mx-auto text-left">
                {/* Profile Card */}
                <div className="border border-ink bg-card p-5 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between border-b border-ink/15 pb-2">
                    <span className="label-mono text-muted-foreground text-xs font-bold">// Workspace Profile</span>
                    <span className="label-mono text-violet text-[10px]">Configured</span>
                  </div>
                  {[
                    ["Acquisition Source", SOURCE_OPTIONS.find((s) => s.id === source)?.label || source],
                    ["Company Entity", company || "—"],
                    ["Primary Industry", industry || "—"],
                    ["Sales Team Size", teamSize || "—"],
                    ["Core Objective", USE_CASES.find((u) => u.id === useCase)?.title || "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-4 font-mono text-xs">
                      <span className="text-muted-foreground text-[11px]">{k}</span>
                      <span className="font-bold text-ink text-right">{v}</span>
                    </div>
                  ))}
                </div>

                {/* Activated Modules 2x2 Grid */}
                <div className="border border-ink bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-ink/15 pb-2">
                    <span className="label-mono text-muted-foreground text-xs font-bold">// Module Activation Status</span>
                    <span className="label-mono text-lime-700 dark:text-lime text-[10px] font-bold">1 Active · 3 On-Deck</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      {
                        label: "Intelligence Suite",
                        icon: Brain,
                        status: "ACTIVE & READY",
                        active: true,
                        sub: "DD Scraper & Parser",
                      },
                      {
                        label: "Voice Fleet",
                        icon: Sparkles,
                        status: "UNLOCK ON REPORT",
                        active: false,
                        sub: "Autonomous Voice SDR",
                      },
                      {
                        label: "Lead Radar",
                        icon: Radio,
                        status: "UNLOCK ON REPORT",
                        active: false,
                        sub: "40+ Signal Sweeper",
                      },
                      {
                        label: "Analytics",
                        icon: BarChart3,
                        status: "UNLOCK ON REPORT",
                        active: false,
                        sub: "Executive KPI Radar",
                      },
                    ].map(({ label, icon: Icon, status, active, sub }) => (
                      <div
                        key={label}
                        className={`border p-3 space-y-1.5 transition-all ${
                          active
                            ? "border-violet bg-violet/5 text-ink shadow-sm ring-1 ring-violet/20"
                            : "border-ink/15 bg-paper/50 text-muted-foreground"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Icon className={`w-3.5 h-3.5 ${active ? "text-violet" : "text-ink/30"}`} />
                            <span className="font-display text-xs font-black uppercase text-ink">{label}</span>
                          </div>
                          {active ? (
                            <div className="h-1.5 w-1.5 rounded-full bg-lime animate-pulse" />
                          ) : (
                            <div className="h-1.5 w-1.5 rounded-full bg-ink/20" />
                          )}
                        </div>
                        <div className="flex items-center justify-between font-mono text-[9px] pt-1 border-t border-ink/10">
                          <span className="text-muted-foreground">{sub}</span>
                          <span
                            className={`label-mono font-bold ${
                              active ? "text-lime-700 dark:text-lime" : "text-muted-foreground"
                            }`}
                          >
                            {status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <button
                  onClick={handleFinish}
                  className="group inline-flex items-center justify-center gap-3 border border-ink bg-ink text-paper px-8 py-4 label-mono font-bold hover:border-violet hover:bg-violet active:scale-95 transition-all shadow-lg"
                >
                  Launch Workspace Dashboard
                  <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>

              <div className="flex items-center justify-center gap-6">
                {[
                  { icon: ShieldCheck, label: "Anti-Hallucination Verified" },
                  { icon: Zap, label: "Sub-90s Reports" },
                ].map(({ icon: Icon, label }) => (
                  <span key={label} className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                    <Icon className="w-3.5 h-3.5 text-lime-700 dark:text-lime" />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Bottom step dots (mobile) */}
      <div className="sm:hidden border-t border-ink/15 py-4 flex justify-center gap-2">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 transition-all duration-300 ${
              i === step ? "w-6 bg-violet" : i < step ? "w-3 bg-ink/40" : "w-3 bg-ink/15"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
