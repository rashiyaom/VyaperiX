import React, { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Bot, ExternalLink, FileSearch, RefreshCcw, Sparkles, User } from "lucide-react";
import type { ChatMessage } from "./ChatWidgetProvider";

export interface ChatMessagesProps {
  messages: ChatMessage[];
  sending: boolean;
  error: string | null;
  activeReportId: string | null;
  activeReportTitle?: string | null;
  onRetry?: () => void;
}

export function ChatMessages({
  messages,
  sending,
  error,
  activeReportId,
  activeReportTitle,
  onRetry,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  // Scroll to bottom on new messages or when sending starts
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, error]);

  // Capped animation: animate only the last 5 messages to preserve performance
  const animateThreshold = Math.max(0, messages.length - 5);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-atomic="false"
      className="flex-1 space-y-4 p-4 text-xs font-mono"
    >
      {/* ── Case 1: No active report selected ── */}
      {!activeReportId && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-3 border border-ink/20 bg-secondary p-3 text-muted-foreground">
            <FileSearch className="h-6 w-6 text-violet" />
          </div>
          <h3 className="font-display text-xs font-black uppercase text-ink">
            No Active Report Selected
          </h3>
          <p className="mt-1.5 max-w-[260px] text-[11px] leading-relaxed text-muted-foreground">
            Open any company intelligence report in the dashboard to interrogate its scraped web
            signals and uploaded documents.
          </p>
        </div>
      )}

      {/* ── Case 2: Active report selected, but empty message history ── */}
      {activeReportId && messages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="mb-3 border border-violet/30 bg-violet/10 p-3 text-violet">
            <Sparkles className="h-6 w-6" />
          </div>
          <h3 className="font-display text-xs font-black uppercase text-ink">
            Interrogate {activeReportTitle || "Report"}
          </h3>
          <p className="mt-1.5 max-w-[280px] text-[11px] leading-relaxed text-muted-foreground">
            Ask specific commercial questions. Answers are strictly grounded in submitted URLs,
            uploaded PDFs/CSVs, and scraped website content.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {[
              "What are the primary products?",
              "What pricing or deal sizes are mentioned?",
              "List the main competitor threats",
            ].map((suggested) => (
              <span
                key={suggested}
                className="border border-ink/15 bg-secondary/50 px-2 py-1 text-[10px] text-muted-foreground"
              >
                "{suggested}"
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Message History ── */}
      {messages.map((message, index) => {
        const isRecent = index >= animateThreshold;
        const isUser = message.role === "user";

        return (
          <motion.div
            key={message.id || `${index}-${message.role}`}
            initial={shouldReduceMotion || !isRecent ? false : { opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2, delay: isRecent ? (index - animateThreshold) * 0.04 : 0 }}
            className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
          >
            {!isUser && (
              <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center border border-violet/30 bg-violet/10 text-violet">
                <Bot className="h-3.5 w-3.5" />
              </div>
            )}

            <div
              className={`max-w-[85%] border p-3.5 ${
                isUser
                  ? "border-ink/20 bg-secondary text-ink dark:border-ink/30 dark:bg-card"
                  : "border-violet/25 bg-violet/5 text-ink dark:border-violet/30 dark:bg-violet/[0.04]"
              }`}
            >
              {/* Confidence Badges */}
              {message.confidence === "exact" && (
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="border border-violet/40 bg-violet/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet dark:text-violet-foreground">
                    ✓ Quoted from submitted sources
                  </span>
                </div>
              )}

              {message.confidence === "inferred" && (
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="border border-amber-600/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    ⚠ Inferred from related content
                  </span>
                </div>
              )}

              {message.confidence === "not_found" && (
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="border border-ink/20 bg-secondary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    ℹ Not found in sources
                  </span>
                </div>
              )}

              {message.reason === "sources_need_refresh" && (
                <p className="mb-2 border-l-2 border-amber-500 pl-2 text-[10px] text-amber-700 dark:text-amber-400">
                  Run a new analysis with these URLs and documents to refresh the source evidence.
                </p>
              )}

              {/* Message Body */}
              <p className="whitespace-pre-wrap text-xs leading-relaxed selection:bg-lime selection:text-ink">
                {message.text}
              </p>

              {/* Grounded Citations */}
              {!!message.citations?.length && (
                <div className="mt-3 border-t border-ink/10 pt-2 text-[10px] text-muted-foreground">
                  <span className="font-bold text-ink/70">Verified Sources:</span>{" "}
                  <div className="mt-1 flex flex-col gap-1">
                    {message.citations.map((citation, cIdx) => (
                      <div key={citation.id || cIdx} className="flex items-start gap-1">
                        <span className="text-violet font-bold">•</span>
                        {citation.url && /^https?:\/\//i.test(citation.url) ? (
                          <a
                            href={citation.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-violet"
                          >
                            <span>{citation.source}</span>
                            <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                          </a>
                        ) : (
                          <span>{citation.source}</span>
                        )}
                        {typeof citation.score === "number" && (
                          <span
                            className="text-[9px] text-muted-foreground/75"
                            title="Vector similarity score (not probability of truth)"
                          >
                            ({(citation.score * 100).toFixed(0)}% match)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {isUser && (
              <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center border border-ink/20 bg-secondary text-ink/70">
                <User className="h-3.5 w-3.5" />
              </div>
            )}
          </motion.div>
        );
      })}

      {/* ── Typing / Searching Indicator ── */}
      {sending && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2.5 text-muted-foreground"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center border border-violet/30 bg-violet/10 text-violet">
            <Bot className="h-3.5 w-3.5 animate-pulse" />
          </div>
          <div className="flex items-center gap-2 border border-violet/20 bg-violet/5 px-3 py-2 text-[11px]">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet" style={{ animationDelay: "300ms" }} />
            </span>
            <span>Searching report sources & verifying claims…</span>
          </div>
        </motion.div>
      )}

      {/* ── Inline Error Alert with Retry ── */}
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-2 border border-danger/30 bg-danger/10 p-3 text-xs text-danger"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="leading-tight">{error}</span>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex shrink-0 items-center gap-1 border border-danger/40 bg-danger/20 px-2 py-0.5 font-display text-[10px] font-bold uppercase hover:bg-danger hover:text-white"
            >
              <RefreshCcw className="h-2.5 w-2.5" /> Retry
            </button>
          )}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
