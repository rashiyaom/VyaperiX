import React, { useState, type FormEvent, type KeyboardEvent } from "react";
import { Send } from "lucide-react";

export interface ChatInputProps {
  onSend: (text: string) => void;
  sending: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  sending,
  disabled = false,
  placeholder = "Ask a question about this report’s sources…",
}: ChatInputProps) {
  const [text, setText] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || sending || disabled) return;
    onSend(clean);
    setText("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-ink/15 bg-card p-3 font-mono text-xs dark:border-ink/25"
    >
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || sending}
          maxLength={2000}
          aria-label="Ask a question about this report"
          placeholder={disabled ? "Select a report to ask questions" : placeholder}
          className="min-w-0 flex-1 border border-ink/25 bg-paper px-3 py-2.5 font-mono text-xs text-ink outline-none transition-colors placeholder:text-muted-foreground focus:border-violet focus:ring-1 focus:ring-violet disabled:cursor-not-allowed disabled:opacity-50 dark:border-ink/30 dark:bg-paper dark:text-ink"
        />
        <button
          type="submit"
          disabled={disabled || sending || !text.trim()}
          className="flex h-10 items-center justify-center gap-1.5 border border-ink bg-ink px-4 font-display text-xs font-black uppercase text-paper transition-all hover:border-violet hover:bg-violet hover:text-violet-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Ask</span>
        </button>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Enter to send</span>
        <span>Esc to close</span>
      </div>
    </form>
  );
}
