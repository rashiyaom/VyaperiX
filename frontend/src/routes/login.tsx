import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  Loader2,
  Sparkles,
  Building,
  Mail,
  Lock,
  User,
  ShieldCheck,
  Zap,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/site/Chrome";
import { LangSwitcher, useLang } from "@/components/app/lang";
import { ThemeToggle } from "@/components/app/theme";
import { useAuth } from "@/lib/auth";
import { GoogleLogin } from "@react-oauth/google";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In & Create Account — VYAPERI X AI Sales Platform" },
      {
        name: "description",
        content:
          "Sign in to your VYAPERI X workspace or start a free 14-day trial with Supabase JWT authentication and Google login.",
      },
    ],
  }),
  component: LoginPage,
});

/* Typewriter hook */
function useTypewriter(texts: string[], speed = 55, pause = 1800) {
  const [displayed, setDisplayed] = useState("");
  const [textIdx, setTextIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = texts[textIdx % texts.length]!;
    const delay = deleting ? speed / 2 : charIdx === current.length ? pause : speed;

    const t = setTimeout(() => {
      if (!deleting && charIdx < current.length) {
        setDisplayed(current.slice(0, charIdx + 1));
        setCharIdx((c) => c + 1);
      } else if (!deleting && charIdx === current.length) {
        setDeleting(true);
      } else if (deleting && charIdx > 0) {
        setDisplayed(current.slice(0, charIdx - 1));
        setCharIdx((c) => c - 1);
      } else {
        setDeleting(false);
        setTextIdx((i) => (i + 1) % texts.length);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [charIdx, deleting, textIdx, texts, speed, pause]);

  return displayed;
}

function Counter({ end, label, suffix = "" }: { end: number; label: string; suffix?: string }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let frame = 0;
    const steps = 48;
    const timer = setInterval(() => {
      frame++;
      const p = 1 - Math.pow(1 - frame / steps, 3);
      setVal(Math.round(end * p));
      if (frame >= steps) clearInterval(timer);
    }, 20);
    return () => clearInterval(timer);
  }, [end]);
  return (
    <div className="text-center">
      <div className="font-display text-2xl font-extrabold text-paper tabular-nums">
        {val.toLocaleString()}
        {suffix}
      </div>
      <div className="mt-1 font-mono text-[10px] text-paper/50 uppercase tracking-widest">
        {label}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.15z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.98 0 12s.46 3.84 1.26 5.42l4.02-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

function LoginPage() {
  const API_BASE = (import.meta.env["VITE_SCRAPER_API_BASE"] as string) || "http://localhost:8000";
  const { t } = useLang();
  const navigate = useNavigate();
  const {
    user,
    session,
    profile,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resendVerificationEmail,
    resetPassword,
  } = useAuth();

  const [tab, setTab] = useState<"Signup" | "Signin" | "Forgot">("Signup");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Email verification state
  const [verificationPending, setVerificationPending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Form inputs
  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("SaaS / Technology");

  // If already authenticated, redirect to onboarding or dashboard
  useEffect(() => {
    if (session && user) {
      if (profile && !profile.onboarding_completed) {
        navigate({ to: "/onboarding" });
      } else {
        navigate({ to: "/dashboard" });
      }
    }
  }, [session, user, profile, navigate]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const headlines = [
    t("login.tagline") || "Autonomous AI Sales Intelligence",
    "11-Step Autonomous Pipeline",
    "Lead Radar → Intelligence → Voice SDRs",
    "Close Enterprise Deals on Autopilot",
  ];
  const headline = useTypewriter(headlines);

  const personas = [
    { key: "Enterprise Account Executive", desc: "Full pipeline + voice fleet", company: "Apex Global Dynamics" },
    { key: "SDR Team Lead", desc: "Prospect discovery + cold conversion", company: "Krypton Commerce" },
    { key: "Growth Founder", desc: "Commercial due-diligence + radar", company: "Synthetix AI Lab" },
    { key: "Commercial Analyst", desc: "Multi-source PDF/CSV/Web reports", company: "Meridian Partners" },
  ];

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setErrorMessage(err?.message || "Google authentication failed.");
    } finally {
      setGoogleLoading(false);
    }
  };

  /* ─── Instant Admin Provisioning Bypass (Rate Limit Solution) ─── */
  const handleBypassRegister = async () => {
    if (!workEmail || !password) {
      setErrorMessage("Please enter both work email and password.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: workEmail,
          password: password,
          full_name: fullName,
          company_name: companyName,
          industry: industry,
          auto_confirm: true,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "Failed to provision account.");
      }

      const { session: authedSession, error: signInErr } = await signInWithEmail(
        workEmail,
        password
      );

      if (signInErr) {
        throw new Error(signInErr.message);
      }

      if (authedSession) {
        setSuccessMessage("✓ Workspace activated! Launching onboarding…");
        try {
          sessionStorage.setItem(
            "vyaperi_onboarding",
            JSON.stringify({
              name: fullName || "Sales Leader",
              email: workEmail,
              company: companyName || "My Enterprise",
              industry,
              teamSize: "2–10",
              useCase: "full_cycle",
              source: "Admin Provisioned",
            })
          );
        } catch {}
        setTimeout(() => navigate({ to: "/onboarding" }), 600);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to provision workspace.");
    } finally {
      setLoading(false);
    }
  };

  /* ─── Sign Up Handler (Supabase) ─── */
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!workEmail || !password) {
      setErrorMessage("Please enter both work email and password.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);
    try {
      const { user, session: newSession, error, needsVerification } = await signUpWithEmail(
        workEmail,
        password,
        {
          full_name: fullName,
          company_name: companyName,
          industry,
        }
      );

      if (error && error.message?.toLowerCase().includes("rate limit")) {
        console.info("Supabase email rate limit exceeded — activating admin provisioning bypass...");
        try {
          const bypassRes = await fetch(`${API_BASE}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: workEmail,
              password: password,
              full_name: fullName,
              company_name: companyName,
              industry: industry,
              auto_confirm: true,
            }),
          });

          if (bypassRes.ok) {
            const { session: authedSession, error: signInErr } = await signInWithEmail(
              workEmail,
              password
            );

            if (!signInErr && authedSession) {
              setSuccessMessage("✓ Workspace Provisioned! Launching onboarding…");
              try {
                sessionStorage.setItem(
                  "vyaperi_onboarding",
                  JSON.stringify({
                    name: fullName || "Sales Leader",
                    email: workEmail,
                    company: companyName || "My Enterprise",
                    industry,
                    teamSize: "2–10",
                    useCase: "full_cycle",
                    source: "Admin Provisioned",
                  })
                );
              } catch {}
              setTimeout(() => navigate({ to: "/onboarding" }), 600);
              return;
            }
          }
        } catch (adminErr) {
          console.warn("Admin bypass failed:", adminErr);
        }
      }

      if (error) {
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      // Store local onboarding intent
      try {
        sessionStorage.setItem(
          "vyaperi_onboarding",
          JSON.stringify({
            name: fullName || "Sales Leader",
            email: workEmail,
            company: companyName || "My Enterprise",
            industry,
            teamSize: "2–10",
            useCase: "full_cycle",
            source: "Supabase Sign Up",
          })
        );
      } catch {}

      if (needsVerification || (!newSession && user)) {
        setPendingEmail(workEmail);
        setVerificationPending(true);
        setResendCooldown(30);
      } else if (newSession) {
        setSuccessMessage("Account created! Launching your onboarding journey…");
        setTimeout(() => navigate({ to: "/onboarding" }), 800);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to create account.");
    } finally {
      setLoading(false);
    }
  };

  /* ─── Sign In Handler (Supabase) ─── */
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!workEmail || !password) {
      setErrorMessage("Please enter both work email and password.");
      return;
    }

    setLoading(true);
    try {
      const { user: authedUser, session: authedSession, error } = await signInWithEmail(
        workEmail,
        password
      );

      if (error) {
        if (
          error.message?.toLowerCase().includes("email not confirmed") ||
          error.message?.toLowerCase().includes("not verified")
        ) {
          setPendingEmail(workEmail);
          setErrorMessage(
            "Your email address has not been confirmed yet. Please verify your email using the link sent to your inbox."
          );
        } else {
          setErrorMessage(error.message || "Invalid email or password.");
        }
        setLoading(false);
        return;
      }

      if (authedSession && authedUser) {
        setSuccessMessage("✓ Authenticated! Opening your workspace…");
        const isDone = Boolean(authedUser.user_metadata?.["onboarding_completed"]);
        setTimeout(() => {
          navigate({ to: isDone ? "/dashboard" : "/onboarding" });
        }, 600);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Sign in failed.");
    } finally {
      setLoading(false);
    }
  };

  /* ─── Resend Verification Email ─── */
  const handleResendVerification = async () => {
    if (!pendingEmail) return;
    setResendingEmail(true);
    setErrorMessage(null);
    try {
      const { error } = await resendVerificationEmail(pendingEmail);
      if (error) {
        setErrorMessage(error.message);
      } else {
        setSuccessMessage(`✓ Verification email resent to ${pendingEmail}`);
        setResendCooldown(45);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to resend verification email.");
    } finally {
      setResendingEmail(false);
    }
  };

  /* ─── Forgot Password ─── */
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!workEmail) {
      setErrorMessage("Please provide your work email to send a reset link.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await resetPassword(workEmail);
      if (error) {
        setErrorMessage(error.message);
      } else {
        setSuccessMessage(`✓ Password reset email sent to ${workEmail}. Please check your inbox.`);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to send reset link.");
    } finally {
      setLoading(false);
    }
  };

  /* ─── Instant Sandbox Persona Login ─── */
  const handlePersonaLogin = (persona: (typeof personas)[0]) => {
    setLoading(true);
    try {
      sessionStorage.setItem(
        "vyaperi_onboarding",
        JSON.stringify({ company: persona.company, industry: "B2B Tech" })
      );
    } catch {}
    setTimeout(() => {
      navigate({ to: "/dashboard" });
    }, 400);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* ── Left Branding Panel (Permanent Dark Cyberpunk Style) ── */}
      <div className="relative hidden flex-col justify-between border-r border-neutral-800 bg-neutral-950 p-12 text-neutral-100 lg:flex overflow-hidden">
        <div className="grid-paper absolute inset-0 opacity-20" />

        {/* Top Brand Bar */}
        <div className="flex items-center justify-between relative z-10">
          <Logo />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LangSwitcher dark />
          </div>
        </div>

        {/* Dynamic Typewriter Hero */}
        <div className="relative z-10 space-y-6">
          <div className="min-h-[5.5rem] font-display text-[clamp(2rem,4.2vw,3.6rem)] font-extrabold leading-[0.9]">
            {headline}
            <span
              className="border-r-2 border-lime ml-1"
              style={{ animation: "typing-cursor 0.8s step-end infinite" }}
            >
              &nbsp;
            </span>
          </div>
          <p className="max-w-md font-mono text-xs leading-relaxed text-neutral-300">
            Autonomous multi-source intelligence, 40+ signal buying intent discovery radar, and multilingual voice SDR fleet. Powered by Supabase Auth & Postgres.
          </p>

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-px border border-white/15 bg-white/10">
            <Counter end={11} label="Pipeline Gates" suffix="" />
            <Counter end={40} label="Signal Feeds" suffix="+" />
            <Counter end={14} label="Hours Saved / Wk" suffix="h" />
          </div>
        </div>

        {/* Bottom Feature Badges */}
        <div className="relative z-10 flex items-center gap-6 border-t border-white/15 pt-6 text-neutral-400 font-mono text-xs">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-lime" /> Supabase JWT Encrypted
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-lime" /> Instant Workspace Provisioning
          </span>
        </div>
      </div>

      {/* ── Right Auth Form Panel ── */}
      <div className="flex flex-col bg-paper">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-ink/20 px-6 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 label-mono hover:text-violet transition-colors text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
          </Link>
          <span className="lg:hidden">
            <Logo />
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LangSwitcher />
          </div>
        </div>

        <div className="mx-auto w-full max-w-lg flex-1 px-6 py-8 flex flex-col justify-center">
          <div className="space-y-1">
            <span className="label-mono text-violet font-bold text-xs">// Supabase Authenticated Access</span>
            <h2 className="font-display text-3xl font-extrabold uppercase">
              {verificationPending
                ? "Verify Your Email"
                : tab === "Signup"
                ? "Start Free 14-Day Trial"
                : tab === "Signin"
                ? "Sign In to Console"
                : "Reset Your Password"}
            </h2>
            <p className="font-mono text-xs text-muted-foreground">
              {verificationPending
                ? "We sent an activation link to your email to verify your workspace."
                : tab === "Signup"
                ? "Create your workspace to experience the complete intelligence & sales suite."
                : tab === "Signin"
                ? "Enter your credentials to access your autonomous sales console."
                : "Enter your work email and we will send you a secure password recovery link."}
            </p>
          </div>

          {/* Feedback Alerts */}
          {errorMessage && (
            <div className="mt-4 border border-danger/40 bg-danger/10 p-3 text-xs font-mono text-danger flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>{errorMessage}</p>
                {errorMessage.toLowerCase().includes("rate limit") && (
                  <button
                    type="button"
                    onClick={handleBypassRegister}
                    disabled={loading}
                    className="mt-2 inline-flex items-center gap-1.5 border border-ink bg-ink text-paper px-3 py-1.5 font-mono text-[11px] font-bold hover:bg-violet hover:border-violet transition-colors shadow"
                  >
                    <Zap className="w-3.5 h-3.5 text-paper" /> Activate Workspace Instantly (Bypass Email Rate Limit)
                  </button>
                )}
                {pendingEmail && (
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resendingEmail || resendCooldown > 0}
                    className="underline text-ink font-bold hover:text-violet block text-[11px]"
                  >
                    {resendingEmail
                      ? "Resending..."
                      : resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : "Resend verification link"}
                  </button>
                )}
              </div>
            </div>
          )}

          {successMessage && (
            <div className="mt-4 border border-lime/40 bg-lime/10 p-3 text-xs font-mono text-lime-800 dark:text-lime flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-lime-700 dark:text-lime" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Verification Screen */}
          {verificationPending ? (
            <div className="mt-6 border border-ink/20 bg-secondary/20 p-6 space-y-4 text-center">
              <div className="mx-auto w-12 h-12 border border-violet bg-violet/10 text-violet flex items-center justify-center rounded-full">
                <Mail className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-bold uppercase">Check Your Inbox</h3>
                <p className="font-mono text-xs text-muted-foreground">
                  A custom Vyepari X verification email was sent to:
                </p>
                <div className="font-mono text-xs font-bold text-ink bg-paper border border-ink/20 py-1.5 px-3 inline-block">
                  {pendingEmail}
                </div>
              </div>

              <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">
                Click the confirmation link inside the email to activate your workspace and continue directly into the 11-step intelligence onboarding journey.
              </p>

              <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendingEmail || resendCooldown > 0}
                  className="border border-ink/30 bg-paper px-4 py-2.5 label-mono text-xs font-bold hover:border-violet hover:bg-secondary transition-all flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${resendingEmail ? "animate-spin" : ""}`} />
                  {resendingEmail
                    ? "Sending..."
                    : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : "Resend Email"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVerificationPending(false);
                    setTab("Signin");
                  }}
                  className="border border-ink bg-ink text-paper px-4 py-2.5 label-mono text-xs font-bold hover:border-violet hover:bg-violet transition-all flex items-center justify-center gap-1.5 shadow"
                >
                  Go to Sign In <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="mt-6 grid grid-cols-2 gap-px border border-ink bg-ink/15">
                {[
                  { id: "Signup", label: "Create Account" },
                  { id: "Signin", label: "Sign In" },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => {
                      setTab(id as any);
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className={`py-2.5 label-mono text-xs font-bold transition-all ${
                      tab === id ? "bg-ink text-paper" : "bg-paper text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* 1-Click Google OAuth */}
              <div className="mt-5">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={googleLoading || loading}
                  className="w-full border border-ink/30 bg-paper py-3 px-4 font-mono text-xs font-bold text-ink hover:border-violet hover:bg-secondary/40 active:scale-[0.99] transition-all flex items-center justify-center gap-2.5 shadow-sm"
                >
                  {googleLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-violet" />
                  ) : (
                    <GoogleIcon />
                  )}
                  <span>Continue with Google</span>
                </button>

                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-ink/15" />
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase font-mono">
                    <span className="bg-paper px-3 text-muted-foreground">Or with work email</span>
                  </div>
                </div>
              </div>

              {/* Form 1: Sign Up */}
              {tab === "Signup" && (
                <form onSubmit={handleSignUp} className="space-y-4">
                  <Field
                    label="Full Name"
                    type="text"
                    placeholder="e.g. Sarah Jenkins"
                    value={fullName}
                    onChange={setFullName}
                    icon={User}
                  />
                  <Field
                    label="Work Email"
                    type="email"
                    placeholder="you@company.com"
                    value={workEmail}
                    onChange={setWorkEmail}
                    icon={Mail}
                  />
                  <Field
                    label="Password (min. 6 chars)"
                    type="password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={setPassword}
                    icon={Lock}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field
                      label="Company Name"
                      type="text"
                      placeholder="e.g. Acme Corp"
                      value={companyName}
                      onChange={setCompanyName}
                      icon={Building}
                    />
                    <label className="block">
                      <span className="label-mono text-xs text-muted-foreground">Industry</span>
                      <select
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        className="mt-1.5 w-full border border-ink/30 bg-paper px-3 py-2.5 font-mono text-xs text-ink outline-none focus:border-violet focus:ring-1 focus:ring-violet transition-all"
                      >
                        <option value="SaaS / Technology">SaaS / Technology</option>
                        <option value="Financial Services">Financial Services</option>
                        <option value="Manufacturing & Supply">Manufacturing & Supply</option>
                        <option value="Healthcare & Bio">Healthcare & Bio</option>
                        <option value="Agency & Services">Agency & Services</option>
                      </select>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 border border-ink bg-ink text-paper py-3.5 label-mono font-bold hover:border-violet hover:bg-violet active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Provisioning Workspace…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-paper" /> Create Account & Start Free Trial →
                      </>
                    )}
                  </button>

                  <p className="text-center font-mono text-[11px] text-muted-foreground pt-1">
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setTab("Signin");
                        setErrorMessage(null);
                      }}
                      className="text-violet font-bold hover:underline"
                    >
                      Sign In
                    </button>
                  </p>
                </form>
              )}

              {/* Form 2: Sign In */}
              {tab === "Signin" && (
                <form onSubmit={handleSignIn} className="space-y-4">
                  <Field
                    label="Work Email"
                    type="email"
                    placeholder="you@company.com"
                    value={workEmail}
                    onChange={setWorkEmail}
                    icon={Mail}
                  />
                  <Field
                    label="Password"
                    type="password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={setPassword}
                    icon={Lock}
                  />

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setTab("Forgot");
                        setErrorMessage(null);
                        setSuccessMessage(null);
                      }}
                      className="font-mono text-[11px] text-violet hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 border border-ink bg-ink text-paper py-3.5 label-mono font-bold hover:border-violet hover:bg-violet active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Authenticating…
                      </>
                    ) : (
                      <>
                        Sign In to Console <ArrowUpRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <p className="text-center font-mono text-[11px] text-muted-foreground pt-1">
                    Don't have an account yet?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setTab("Signup");
                        setErrorMessage(null);
                      }}
                      className="text-violet font-bold hover:underline"
                    >
                      Start Free 14-Day Trial
                    </button>
                  </p>
                </form>
              )}

              {/* Form 3: Forgot Password */}
              {tab === "Forgot" && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <Field
                    label="Registered Work Email"
                    type="email"
                    placeholder="you@company.com"
                    value={workEmail}
                    onChange={setWorkEmail}
                    icon={Mail}
                  />

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 border border-ink bg-ink text-paper py-3.5 label-mono font-bold hover:border-violet hover:bg-violet active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Sending Link…
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" /> Send Password Reset Email
                      </>
                    )}
                  </button>

                  <p className="text-center font-mono text-[11px] text-muted-foreground pt-1">
                    Remembered your password?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setTab("Signin");
                        setErrorMessage(null);
                      }}
                      className="text-violet font-bold hover:underline"
                    >
                      Back to Sign In
                    </button>
                  </p>
                </form>
              )}
            </>
          )}

          {/* 1-Click Fast Sandbox Personas */}
          <div className="mt-8 pt-6 border-t border-ink/15">
            <span className="label-mono text-muted-foreground text-[10px] block mb-2.5">
              // Instant Sandbox Persona Access (Local Development Testing)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {personas.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handlePersonaLogin(p)}
                  className="border border-ink/15 bg-paper p-3 text-left hover:border-violet hover:bg-secondary/40 transition-all group"
                >
                  <span className="font-display text-xs font-bold uppercase text-ink group-hover:text-violet transition-colors block">
                    {p.key}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground block truncate">
                    {p.company} · {p.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  placeholder,
  value,
  onChange,
  icon: Icon,
}: {
  label: string;
  type: string;
  placeholder: string;
  value?: string;
  onChange?: (v: string) => void;
  icon?: React.ElementType;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <label className="block space-y-1">
      <span
        className={`label-mono text-xs transition-colors flex items-center gap-1 ${
          focused ? "text-violet font-bold" : "text-muted-foreground"
        }`}
      >
        {Icon && <Icon className="w-3 h-3" />} {label}
      </span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full border border-ink/30 bg-paper px-3.5 py-2.5 font-mono text-xs text-ink outline-none placeholder:text-muted-foreground/50 focus:border-violet focus:ring-1 focus:ring-violet transition-all"
      />
    </label>
  );
}
