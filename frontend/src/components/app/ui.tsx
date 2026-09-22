import { CheckCircle2, PhoneCall, PhoneOff, Voicemail, Clock } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Outcome } from "./store";

/* ── Page heading ── */
export function PageHead({
  index,
  title,
  subtitle,
  action,
}: {
  index: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink/20 pb-6 fade-in-up">
      <div className="min-w-0">
        <span className="label-mono text-violet">{index}</span>
        <h1 className="mt-3 font-display text-3xl font-extrabold uppercase tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl font-mono text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {action && <div className="fade-in anim-d-200">{action}</div>}
    </div>
  );
}

/* ── Panel ── */
export function Panel({
  title,
  hint,
  children,
  flash,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  flash?: boolean;
}) {
  return (
    <section className={`border border-ink/20 fade-in-up ${flash ? "row-flash" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/20 bg-secondary px-4 py-3">
        <h2 className="font-display text-sm font-extrabold uppercase tracking-tight">{title}</h2>
        {hint && <div className="label-mono text-muted-foreground">{hint}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/* ── Animated stat (counts up from 0) ── */
export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  const num = parseInt(value.replace(/[^0-9]/g, ""), 10);
  const suffix = isNaN(num) ? "" : value.replace(/[0-9,]/g, "");
  const [displayed, setDisplayed] = useState(isNaN(num) ? value : "0");
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (isNaN(num)) {
      setDisplayed(value);
      return;
    }
    setFlashing(true);
    const duration = 900;
    const steps = 36;
    let frame = 0;
    const timer = setInterval(() => {
      frame++;
      const progress = frame / steps;
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(num * eased).toLocaleString() + suffix);
      if (frame >= steps) {
        clearInterval(timer);
        setFlashing(false);
      }
    }, duration / steps);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="bg-paper px-5 py-6 fade-in-up">
      <div className="label-mono text-muted-foreground">{label}</div>
      <div
        className={`mt-2 font-display text-2xl font-extrabold tabular-nums transition-colors ${flashing ? "counter-flash" : ""}`}
      >
        {displayed}
      </div>
      {note && <div className="mt-1 font-mono text-[11px] text-muted-foreground">{note}</div>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-px border border-ink/20 bg-ink/15 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

/* ── Live indicator dot ── */
export function LiveDot({ label = "Live" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-emerald-700 dark:text-lime font-bold">
      <span className="inline-block h-1.5 w-1.5 bg-emerald-600 dark:bg-lime live-dot" />
      {label}
    </span>
  );
}

/* ── Speaking waveform (for active voice agents) ── */
export function SpeakingWave({ active }: { active: boolean }) {
  const delays = ["0ms", "120ms", "60ms", "180ms", "90ms"];
  return (
    <span className="inline-flex items-end gap-[2px] h-4">
      {delays.map((d, i) => (
        <span
          key={i}
          className="inline-block w-[3px] bg-emerald-600 dark:bg-lime origin-bottom"
          style={
            active
              ? { animation: `wave-bar 0.6s ease-in-out infinite`, animationDelay: d }
              : { height: "3px" }
          }
        />
      ))}
    </span>
  );
}

/* ── Shimmer loading placeholder ── */
export function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-secondary ${className}`}>
      <div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-paper/60 to-transparent"
        style={{ animation: "shimmer 1.4s ease-in-out infinite" }}
      />
    </div>
  );
}

/* ── Outcome chip ── */
export function OutcomeChip({ outcome }: { outcome: Outcome | string }) {
  const map: Record<string, [string, typeof CheckCircle2]> = {
    INTERESTED: ["bg-lime text-lime-foreground", CheckCircle2],
    CALLBACK: ["bg-violet text-violet-foreground", Clock],
    VOICEMAIL: ["bg-secondary text-muted-foreground", Voicemail],
    NO_ANSWER: ["bg-secondary text-muted-foreground", PhoneCall],
    NOT_INTERESTED: ["bg-danger text-destructive-foreground", PhoneOff],
  };
  const [cls, Icon] = map[outcome] ?? ["bg-secondary text-muted-foreground", PhoneCall];
  return (
    <span
      className={`inline-flex items-center gap-1.5 border border-ink px-2 py-1 label-mono transition-all ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {String(outcome).replace("_", " ")}
    </span>
  );
}

/* ── Progress bar (animated on mount) ── */
export function Bar({
  value,
  tone = "violet",
}: {
  value: number;
  tone?: "violet" | "lime" | "danger";
}) {
  const bg = tone === "lime" ? "bg-lime" : tone === "danger" ? "bg-danger" : "bg-violet";
  return (
    <div className="h-1.5 w-full bg-ink/10">
      <div
        className={`h-full ${bg}`}
        style={{
          width: `${Math.min(100, value)}%`,
          animation: "progress-fill 0.8s cubic-bezier(0.22,1,0.36,1) both",
        }}
      />
    </div>
  );
}

/* ── Button ── */
export function Btn({
  children,
  onClick,
  variant = "outline",
  disabled,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "outline" | "solid" | "lime" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const styles =
    variant === "solid"
      ? "border-ink bg-ink text-paper hover:bg-violet hover:border-violet"
      : variant === "lime"
        ? "border-ink bg-lime text-lime-foreground hover:bg-ink hover:text-paper"
        : variant === "danger"
          ? "border-ink bg-danger text-destructive-foreground hover:bg-ink"
          : "border-ink bg-transparent hover:bg-secondary";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 border px-3 py-2 label-mono transition-all duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

/* ── Form field ── */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label-mono text-muted-foreground">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

export const inputCls =
  "w-full border border-ink bg-paper px-3 py-2 font-mono text-xs outline-none focus:border-violet focus:ring-2 focus:ring-violet/30 transition-all";

/* ── Terminal with typewriter ── */
export function Terminal({
  lines,
  title = "agent trace",
  typewriter = false,
}: {
  lines: string[];
  title?: string;
  typewriter?: boolean;
}) {
  const [visible, setVisible] = useState<string[]>(typewriter ? [] : lines);
  const idx = useRef(0);

  useEffect(() => {
    if (!typewriter || !lines.length) {
      setVisible(lines);
      return;
    }
    setVisible([]);
    idx.current = 0;
    const push = () => {
      idx.current++;
      setVisible(lines.slice(0, idx.current));
      if (idx.current < lines.length) setTimeout(push, 160);
    };
    setTimeout(push, 300);
  }, [lines, typewriter]);

  return (
    <div className="border border-neutral-800 bg-neutral-950 p-4 text-neutral-100 dark:bg-black fade-in-up">
      <div className="flex items-center justify-between">
        <div className="label-mono text-neutral-400">vyaperi-x@sales-engine:~ {title}</div>
        <LiveDot label="running" />
      </div>
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
        {visible.length ? visible.join("\n") : "// no output"}
        {typewriter && visible.length < lines.length && (
          <span
            className="border-r-2 border-lime ml-0.5"
            style={{ animation: "typing-cursor 0.8s step-end infinite" }}
          >
            &nbsp;
          </span>
        )}
      </pre>
    </div>
  );
}

/* ── Tag chip ── */
export function Tag({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "lime" | "violet" | "danger";
}) {
  const cls =
    tone === "lime"
      ? "bg-lime text-lime-foreground"
      : tone === "violet"
        ? "bg-violet text-violet-foreground"
        : tone === "danger"
          ? "bg-danger text-destructive-foreground"
          : "bg-secondary text-muted-foreground";
  return (
    <span
      className={`inline-block border border-ink/30 px-2 py-0.5 font-mono text-[10px] uppercase ${cls}`}
    >
      {children}
    </span>
  );
}

/* ── Score dot ── */
export function ScoreDot({ score }: { score: number }) {
  const tone = score > 80 ? "bg-lime" : score > 55 ? "bg-violet" : "bg-ink/30";
  return <span className={`inline-block h-2 w-2 ${tone}`} />;
}
