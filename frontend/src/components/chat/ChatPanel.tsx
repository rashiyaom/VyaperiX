import React, { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  FileText,
  Minus,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatWidget } from "./ChatWidgetProvider";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";

export interface ChatPanelProps {
  onClose?: () => void;
}

export function ChatPanel({ onClose }: ChatPanelProps) {
  const {
    isOpen,
    close,
    activeReportId,
    activeReportTitle,
    messages,
    sending,
    error,
    sendMessage,
    retryLastMessage,
    clearMessages,
  } = useChatWidget();

  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const handleClose = () => {
    close();
    onClose?.();
  };

  // Focus management & Escape key handling
  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    // Focus input or panel on open
    const inputEl = panelRef.current?.querySelector<HTMLInputElement>("input");
    inputEl?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }

      // Focus trap within the panel
      if (e.key === "Tab" && panelRef.current) {
        const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      // Restore focus to launcher on close
      const launcher = document.getElementById("vyaperix-chat-launcher");
      if (launcher) {
        launcher.focus();
      } else if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile Backdrop Overlay (< 640px) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs sm:hidden"
        aria-hidden="true"
      />

      {/* Main Panel */}
      <motion.aside
        ref={panelRef}
        id="vyaperix-chat-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Ask This Report AI Assistant"
        initial={
          shouldReduceMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.94, y: 16, transformOrigin: "bottom right" }
        }
        animate={
          shouldReduceMotion
            ? { opacity: 1 }
            : { opacity: 1, scale: 1, y: 0, transformOrigin: "bottom right" }
        }
        exit={
          shouldReduceMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.94, y: 16, transformOrigin: "bottom right" }
        }
        transition={{ type: "spring", stiffness: 350, damping: 28 }}
        className="fixed inset-0 z-50 flex flex-col border-2 border-ink bg-card shadow-[0_16px_48px_rgba(0,0,0,0.3)] sm:inset-auto sm:bottom-26 sm:right-8 sm:h-[600px] sm:w-[420px] dark:border-paper/60 dark:bg-card dark:shadow-[0_0_40px_rgba(0,0,0,0.8)]"
      >
        {/* ── Panel Header ── */}
        <div className="flex items-center justify-between border-b border-ink/20 bg-secondary px-4 py-3 dark:border-ink/30 dark:bg-secondary">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-violet/40 bg-violet/10 text-violet">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate font-display text-xs font-black uppercase text-ink">
                  Ask This Report
                </h2>
                <span className="border border-lime-600/40 bg-lime/20 px-1.5 py-0.2 font-mono text-[9px] font-bold text-lime-900 dark:text-lime">
                  RAG
                </span>
              </div>
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                {activeReportTitle ? (
                  <span className="flex items-center gap-1">
                    <FileText className="inline h-2.5 w-2.5" />
                    <span>{activeReportTitle}</span>
                  </span>
                ) : (
                  <span>Grounded in report signals</span>
                )}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                title="Clear current chat history"
                aria-label="Clear chat history"
                className="flex h-7 w-7 items-center justify-center border border-ink/15 text-muted-foreground transition-colors hover:border-ink hover:text-ink"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}

            <button
              onClick={handleClose}
              title="Minimize panel"
              aria-label="Minimize chat panel"
              className="hidden h-7 w-7 items-center justify-center border border-ink/15 text-muted-foreground transition-colors hover:border-ink hover:text-ink sm:flex"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={handleClose}
              title="Close panel (Esc)"
              aria-label="Close chat panel"
              className="flex h-7 w-7 items-center justify-center border border-ink/15 text-muted-foreground transition-colors hover:border-danger hover:bg-danger/10 hover:text-danger"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Active Dossier Indicator Strip ── */}
        <div className="flex items-center justify-between border-b border-ink/10 bg-paper px-4 py-1.5 font-mono text-[10px] text-muted-foreground dark:border-ink/20">
          <div className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                activeReportId ? "bg-lime animate-pulse" : "bg-muted-foreground"
              }`}
            />
            <span>
              {activeReportId
                ? `Active Dossier: ${activeReportTitle || activeReportId.slice(0, 8)}`
                : "No report linked"}
            </span>
          </div>
          <span className="font-bold uppercase tracking-wider text-[9px] text-ink/70">
            Strict Grounding
          </span>
        </div>

        {/* ── Messages Scroll Area ── */}
        <ScrollArea className="flex-1 bg-paper/50">
          <ChatMessages
            messages={messages}
            sending={sending}
            error={error}
            activeReportId={activeReportId}
            activeReportTitle={activeReportTitle}
            onRetry={retryLastMessage}
          />
        </ScrollArea>

        {/* ── Input Bar ── */}
        <ChatInput
          onSend={sendMessage}
          sending={sending}
          disabled={!activeReportId}
          placeholder={
            activeReportId
              ? `Ask about ${activeReportTitle || "this report"}…`
              : "Open a report in dashboard to ask questions"
          }
        />
      </motion.aside>
    </>
  );
}
