import React, { forwardRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { MessageSquareText, X } from "lucide-react";
import { useChatWidget } from "./ChatWidgetProvider";

export interface ChatLauncherProps {
  className?: string;
}

export const ChatLauncher = forwardRef<HTMLButtonElement, ChatLauncherProps>(
  ({ className = "" }, ref) => {
    const { isOpen, toggle, unreadCount } = useChatWidget();
    const shouldReduceMotion = useReducedMotion();

    return (
      <motion.button
        ref={ref}
        id="vyaperix-chat-launcher"
        onClick={toggle}
        aria-label={isOpen ? "Close AI chat assistant" : "Open Ask This Report chat assistant"}
        aria-expanded={isOpen}
        aria-controls="vyaperix-chat-panel"
        aria-haspopup="dialog"
        title={isOpen ? "Close chat (Esc)" : "Ask this report (Ctrl+K)"}
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 12 }}
        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 12 }}
        whileHover={shouldReduceMotion ? {} : { scale: 1.05, y: -2 }}
        whileTap={shouldReduceMotion ? {} : { scale: 0.95 }}
        transition={{ type: "spring", stiffness: 380, damping: 24 }}
        className={`fixed bottom-8 right-8 z-40 flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink bg-ink text-white shadow-[0_8px_24px_rgba(0,0,0,0.3)] transition-all hover:scale-105 hover:border-violet hover:bg-violet hover:shadow-[0_0_24px_rgba(124,58,237,0.5)] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2 dark:border-paper dark:bg-violet dark:text-white dark:shadow-[0_0_25px_rgba(139,92,246,0.6)] dark:hover:bg-violet/90 dark:hover:border-lime dark:hover:shadow-[0_0_28px_rgba(163,230,53,0.5)] ${className}`}
      >
        <span className="sr-only">
          {isOpen ? "Close chat panel" : `Open chat panel${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        </span>

        {/* Dynamic Icon */}
        <motion.div
          key={isOpen ? "close-icon" : "open-icon"}
          initial={{ rotate: isOpen ? -90 : 90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          exit={{ rotate: isOpen ? 90 : -90, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="flex items-center justify-center text-white"
        >
          {isOpen ? (
            <X className="h-6 w-6 stroke-[2.5] text-white" />
          ) : (
            <MessageSquareText className="h-6 w-6 stroke-[2.2] text-white" />
          )}
        </motion.div>

        {/* Unread Message Badge */}
        {unreadCount > 0 && !isOpen && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-paper bg-lime px-1 font-mono text-[10px] font-black text-neutral-950 shadow-md"
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-60" />
            <span className="relative z-10">{unreadCount > 9 ? "9+" : unreadCount}</span>
          </motion.span>
        )}
      </motion.button>
    );
  },
);

ChatLauncher.displayName = "ChatLauncher";
