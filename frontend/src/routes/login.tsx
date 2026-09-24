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
    <div className="border border-white/15 bg-white/[0.04] p-4 backdrop-blur-md transition-colors hover:border-violet/40">
      <div className="font-display text-2xl sm:text-3xl font-extrabold text-white tabular-nums tracking-tight">
        {val.toLocaleString()}
        {suffix}
      </div>
      <div className="mt-1.5 font-mono text-[10px] sm:text-[11px] font-bold text-neutral-300 uppercase tracking-wider">
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

  /* ─── Sign Up Handler (Supabase) ─── */
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = workEmail.trim();
    const cleanPassword = password.trim();
    const cleanName = fullName.trim();

    if (!cleanEmail || !cleanPassword) {
      setErrorMessage("Please enter both work email and password.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setErrorMessage("Please enter a valid work email address.");
      return;
    }

    if (cleanPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);
    try {
      const { user, session: newSession, error, needsVerification } = await signUpWithEmail(
        cleanEmail,
        cleanPassword,
        {
          full_name: cleanName,
          company_name: companyName.trim(),
          industry,
        }
      );

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
            name: cleanName || "Sales Leader",
            email: cleanEmail,
            company: companyName || "My Enterprise",
            industry,
            teamSize: "2–10",
            useCase: "full_cycle",
            source: "Supabase Sign Up",
          })
        );
      } catch {}

      if (needsVerification || (!newSession && user)) {
        setPendingEmail(cleanEmail);
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

  /* ─── Sign In Handler (Supabase with Strict Validation) ─── */
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = workEmail.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setErrorMessage("Please enter both your work email and password.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setErrorMessage("Please enter a valid work email address.");
      return;
    }

    if (cleanPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const { user: authedUser, session: authedSession, error } = await signInWithEmail(
        cleanEmail,
        cleanPassword
      );

      if (error) {
        if (
          error.message?.toLowerCase().includes("email not confirmed") ||
          error.message?.toLowerCase().includes("not verified")
        ) {
          setPendingEmail(cleanEmail);
          setErrorMessage(
            "Your email address has not been confirmed yet. Please verify your email using the link sent to your inbox."
          );
        } else {
          setErrorMessage(error.message || "Invalid email or password. Please check your credentials.");
        }
        setLoading(false);
        return;
      }

      if (authedSession && authedUser) {
        setSuccessMessage("✓ Authenticated! Opening your workspace…");
        const isDone = Boolean(authedUser.user_metadata?.["onboarding_completed"]);
        setTimeout(() => {
          navigate({ to: isDone ? "/dashboard" : "/onboarding" });
        }, 500);
      } else {
        setErrorMessage("Invalid email or password. Please try again.");
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Sign in failed. Please try again.");
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
    const cleanEmail = workEmail.trim();
    if (!cleanEmail) {
      setErrorMessage("Please provide your work email to send a reset link.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await resetPassword(cleanEmail);
      if (error) {
        setErrorMessage(error.message);
      } else {
        setSuccessMessage(`✓ Password reset email sent to ${cleanEmail}. Please check your inbox.`);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to send reset link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr] bg-paper text-ink">
      {/* ── Left Branding Panel (Cyberpunk Dark Aesthetic with High Contrast) ── */}
      <div className="relative hidden flex-col justify-between border-r border-white/10 bg-[#0B0C12] p-12 text-white lg:flex overflow-hidden">
        {/* Ambient Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:32px_32px] opacity-40 pointer-events-none" />

        {/* Top Brand Bar */}
        <div className="flex items-center justify-between relative z-10">
          <Logo />
          <div className="flex items-center gap-2">
            <ThemeToggle className="text-white hover:text-lime" />
            <LangSwitcher dark />
          </div>
        </div>

        {/* Dynamic Typewriter Hero */}
        <div className="relative z-10 space-y-6 my-auto">
          <div className="inline-flex items-center gap-2 border border-lime/30 bg-lime/10 px-3 py-1 font-mono text-[11px] font-bold text-lime uppercase tracking-widest">
            <span className="h-1.5 w-1.5 rounded-full bg-lime animate-pulse" /> Enterprise Engine
          </div>

          <div className="min-h-[5.5rem] font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[0.92] text-white">
            {headline}
            <span
              className="border-r-2 border-lime ml-1"
              style={{ animation: "typing-cursor 0.8s step-end infinite" }}
            >
              &nbsp;
            </span>
          </div>

          <p className="max-w-md font-mono text-xs leading-relaxed text-neutral-300">
            Autonomous multi-source intelligence, 40+ signal buying intent discovery radar, and multilingual voice SDR fleet. Zero manual qualification required.
          </p>

          {/* High Contrast Metrics */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            <Counter end={11} label="Pipeline Gates" suffix="" />
            <Counter end={40} label="Signal Feeds" suffix="+" />
            <Counter end={14} label="Hours Saved / Wk" suffix="h" />
          </div>
        </div>

        {/* Bottom Feature Badges */}
        <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-6 text-neutral-400 font-mono text-xs">
          <span className="flex items-center gap-2 text-neutral-300">
            <ShieldCheck className="w-4 h-4 text-lime" /> Supabase JWT Encrypted
          </span>
          <span className="flex items-center gap-2 text-neutral-300">
            <Zap className="w-4 h-4 text-lime" /> Zero-Trust Security
          </span>
        </div>
      </div>

      {/* ── Right Auth Form Panel ── */}
      <div className="flex flex-col bg-paper text-ink">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-ink/20 px-6 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 label-mono hover:text-violet transition-colors text-xs text-ink"
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

        <div className="mx-auto w-full max-w-lg flex-1 px-6 py-10 flex flex-col justify-center">
          <div className="space-y-1.5">
            <span className="label-mono text-violet font-bold text-xs">// Secure Supabase Authentication</span>
            <h2 className="font-display text-3xl font-extrabold uppercase text-ink">
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
            <div className="mt-5 border border-danger/50 bg-danger/10 p-3.5 text-xs font-mono text-danger flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">{errorMessage}</p>
                {pendingEmail && (
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resendingEmail || resendCooldown > 0}
                    className="underline text-ink font-bold hover:text-violet block text-[11px] mt-1"
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
            <div className="mt-5 border border-lime/40 bg-lime/10 p-3.5 text-xs font-mono text-lime-800 dark:text-lime flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-lime-700 dark:text-lime" />
              <span className="font-semibold">{successMessage}</span>
            </div>
          )}

          {/* Verification Screen */}
          {verificationPending ? (
            <div className="mt-6 border border-ink/20 bg-card p-6 space-y-4 text-center">
              <div className="mx-auto w-12 h-12 border border-violet bg-violet/10 text-violet flex items-center justify-center rounded-full">
                <Mail className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-bold uppercase text-ink">Check Your Inbox</h3>
                <p className="font-mono text-xs text-muted-foreground">
                  A custom Vyaperi X verification email was sent to:
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
              <div className="mt-6 grid grid-cols-2 gap-px border border-ink/30 bg-ink/15">
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
                      tab === id ? "bg-ink text-paper" : "bg-card text-muted-foreground hover:bg-secondary hover:text-ink"
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
                  className="w-full border border-ink/30 bg-card py-3 px-4 font-mono text-xs font-bold text-ink hover:border-violet hover:bg-secondary/40 active:scale-[0.99] transition-all flex items-center justify-center gap-2.5 shadow-sm cursor-pointer"
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
                        className="mt-1.5 w-full border border-ink/30 bg-card px-3 py-2.5 font-mono text-xs text-ink outline-none focus:border-violet focus:ring-1 focus:ring-violet transition-all"
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
                    className="w-full mt-3 border border-ink bg-ink text-paper py-3.5 label-mono font-bold hover:border-violet hover:bg-violet active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
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
                      className="text-violet font-bold hover:underline cursor-pointer"
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
                      className="font-mono text-[11px] text-violet hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-3 border border-ink bg-ink text-paper py-3.5 label-mono font-bold hover:border-violet hover:bg-violet active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
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
                      className="text-violet font-bold hover:underline cursor-pointer"
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
                    className="w-full mt-3 border border-ink bg-ink text-paper py-3.5 label-mono font-bold hover:border-violet hover:bg-violet active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
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
                      className="text-violet font-bold hover:underline cursor-pointer"
                    >
                      Back to Sign In
                    </button>
                  </p>
                </form>
              )}
            </>
          )}
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
        className="w-full border border-ink/30 bg-card px-3.5 py-2.5 font-mono text-xs text-ink outline-none placeholder:text-muted-foreground/50 focus:border-violet focus:ring-1 focus:ring-violet transition-all"
      />
    </label>
  );
}
