import { useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Layers,
  Radio,
  Zap,
  ShieldCheck,
  Flame,
  ArrowUpRight,
} from "lucide-react";

export type PipelineModule = {
  n: string;
  t: string;
  tag: string;
  d: string;
  metric: string;
};

interface PipelineCarouselProps {
  modules: PipelineModule[];
}

export function PipelineCarousel({ modules }: PipelineCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const handleNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % modules.length);
  }, [modules.length]);

  const handlePrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + modules.length) % modules.length);
  }, [modules.length]);

  const activeModule = modules[activeIndex] || modules[0]!;

  return (
    <div className="space-y-6">
      {/* ── 1. Interactive Step Bar (11 Gates) ── */}
      <div className="border border-ink bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/15 pb-3">
          <div className="flex items-center gap-2">
            <span className="label-mono text-violet font-bold">// 11-Gate Pipeline Progression</span>
            <span className="h-1.5 w-1.5 rounded-full bg-lime live-dot" />
            <span className="label-mono text-muted-foreground text-[10px]">Click any step to inspect</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="label-mono text-muted-foreground text-[10px]">
              Stage {activeIndex + 1} of {modules.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrev}
                className="border border-ink/30 bg-paper p-1.5 text-ink hover:border-violet hover:bg-secondary transition-colors active:scale-95"
                title="Previous step"
                aria-label="Previous step"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleNext}
                className="border border-ink/30 bg-paper p-1.5 text-ink hover:border-violet hover:bg-secondary transition-colors active:scale-95"
                title="Next step"
                aria-label="Next step"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Responsive Grid of 11 Step Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-11 gap-1.5">
          {modules.map((m, idx) => {
            const isActive = idx === activeIndex;
            const isCompleted = idx < activeIndex;
            return (
              <button
                key={m.n}
                onClick={() => setActiveIndex(idx)}
                className={`p-2 border text-left font-mono text-xs transition-all flex flex-col justify-between group ${
                  isActive
                    ? "border-violet bg-violet text-violet-foreground font-black shadow-md ring-2 ring-violet/20"
                    : isCompleted
                    ? "border-lime-700/40 dark:border-lime/40 bg-lime/5 text-ink hover:border-violet hover:bg-secondary"
                    : "border-ink/15 bg-paper text-muted-foreground hover:border-ink hover:text-ink"
                }`}
              >
                <div className="flex items-center justify-between gap-1 w-full">
                  <span
                    className={`font-mono text-[10px] font-extrabold ${
                      isActive ? "text-lime" : isCompleted ? "text-lime-700 dark:text-lime" : "text-violet"
                    }`}
                  >
                    #{m.n}
                  </span>
                  {isActive && <div className="h-1.5 w-1.5 rounded-full bg-lime animate-ping" />}
                </div>
                <div className="truncate text-[10px] font-bold mt-1 w-full">
                  {m.t.split(" ")[0]}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Active Step Hero Display (High Contrast & Zero Lag) ── */}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
        {/* Main Stage Detail Card */}
        <div className="border-2 border-ink bg-paper p-6 sm:p-8 space-y-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/15 pb-4">
            <div className="flex items-center gap-3">
              <span className="border border-ink bg-violet text-violet-foreground px-3 py-1 font-mono text-xs font-black">
                STEP {activeModule.n}
              </span>
              <span className="label-mono border border-violet/30 bg-violet/10 text-violet px-2.5 py-0.5 text-[10px]">
                {activeModule.tag}
              </span>
            </div>

            <span className="label-mono border border-lime/30 bg-lime/10 text-lime-700 dark:text-lime px-2.5 py-0.5 text-[10px] font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {activeModule.metric}
            </span>
          </div>

          <div className="space-y-3">
            <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-ink leading-tight">
              {activeModule.t}
            </h3>
            <p className="font-mono text-sm sm:text-base text-muted-foreground leading-relaxed">
              {activeModule.d}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-ink/15">
            <div className="border border-ink/15 bg-secondary/30 p-3 space-y-1">
              <span className="label-mono text-muted-foreground text-[9px] block">Execution Pipeline Gate</span>
              <span className="font-mono text-xs font-bold text-ink">Autonomous Layer {activeModule.n}</span>
            </div>
            <div className="border border-ink/15 bg-secondary/30 p-3 space-y-1">
              <span className="label-mono text-muted-foreground text-[9px] block">Downstream Output</span>
              <span className="font-mono text-xs font-bold text-violet truncate block">
                {modules[(activeIndex + 1) % modules.length]?.t}
              </span>
            </div>
          </div>
        </div>

        {/* Upcoming Stages Strip & Quick Jump */}
        <div className="space-y-3 flex flex-col justify-between">
          <div className="border border-ink bg-card p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-ink/15 pb-2">
              <span className="label-mono text-muted-foreground text-xs flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-violet" /> Next Pipeline Stages
              </span>
              <span className="label-mono text-violet text-[10px] font-bold">Continuous Loop</span>
            </div>

            <div className="space-y-2">
              {[1, 2, 3].map((offset) => {
                const stepIdx = (activeIndex + offset) % modules.length;
                const step = modules[stepIdx]!;
                return (
                  <div
                    key={step.n}
                    onClick={() => setActiveIndex(stepIdx)}
                    className="border border-ink/15 bg-paper p-3 hover:border-violet transition-all cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono text-xs font-bold text-violet group-hover:text-ink">
                        #{step.n}
                      </span>
                      <div className="min-w-0">
                        <p className="font-display text-xs font-extrabold uppercase truncate group-hover:text-violet transition-colors">
                          {step.t}
                        </p>
                        <p className="label-mono text-muted-foreground text-[9px] truncate">
                          {step.tag}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-violet group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border border-neutral-800 bg-neutral-950 text-neutral-100 dark:bg-black p-4 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="font-display text-xs font-black uppercase text-lime">
                Ready to Experience The Pipeline?
              </span>
              <p className="font-mono text-[10px] text-neutral-400">
                Launch live intelligence simulation or test company intake.
              </p>
            </div>
            <a
              href="#sandbox"
              className="border border-lime bg-lime text-lime-foreground px-3.5 py-1.5 label-mono text-xs font-black hover:bg-lime/90 transition-all shrink-0 flex items-center gap-1"
            >
              Test Sandbox <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
