import { useState, type FormEvent } from "react";
import { Bot, LoaderCircle, MessageCircle, Send, User } from "lucide-react";
import { useAuth } from "@/lib/auth";

const API_BASE = (import.meta.env["VITE_SCRAPER_API_BASE"] as string) || "http://localhost:8000";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  confidence?: "exact" | "inferred" | "not_found";
  reason?: string;
  sources?: string[];
  citations?: Array<{ id: string; source: string; url?: string; score?: number | null }>;
}

export function ReportChat({ reportId }: { reportId: string }) {
  const { session } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanQuestion = question.trim();
    if (!cleanQuestion || sending) return;
    setSending(true);
    setError(null);
    try {
      const token = session?.access_token || localStorage.getItem("vyepari_x_auth_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const response = await fetch(`${API_BASE}/api/reports/${reportId}/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({ question: cleanQuestion }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || `Chat request failed (${response.status})`);
      setMessages((current) => [
        ...current,
        { role: "user", text: cleanQuestion },
        { role: "assistant", text: result.answer, confidence: result.confidence, reason: result.reason, sources: result.sources || [], citations: result.citations || [] },
      ]);
      setQuestion("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send your question.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="border border-ink bg-card">
      <div className="flex items-center gap-3 border-b border-ink/20 p-5">
        <div className="border border-violet/30 bg-violet/10 p-2 text-violet"><MessageCircle className="h-4 w-4" /></div>
        <div>
          <h2 className="font-display text-sm font-extrabold uppercase">Ask this report</h2>
          <p className="font-mono text-[10px] text-muted-foreground">Answers use this report’s submitted URLs, uploaded documents, and business notes.</p>
        </div>
      </div>

      <div className="min-h-72 space-y-3 p-5" aria-live="polite">
        {messages.length === 0 && (
          <div className="mx-auto max-w-lg py-10 text-center">
            <Bot className="mx-auto mb-3 h-7 w-7 text-violet" />
            <p className="font-display text-xs font-bold uppercase">Ask about the site or its documents</p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">If the submitted sources don’t contain an answer, chat will say so.</p>
          </div>
        )}
        {messages.map((message, index) => (
          <div key={`${index}-${message.role}`} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            {message.role === "assistant" && <Bot className="mt-2 h-4 w-4 shrink-0 text-violet" />}
            <div className={`max-w-[85%] border p-3 ${message.role === "user" ? "border-ink/20 bg-secondary" : "border-violet/20 bg-violet/5"}`}>
              {message.confidence === "inferred" && (
                <span className="mb-2 inline-block border border-amber-600/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-amber-800">
                  Inferred from related content
                </span>
              )}
              {message.confidence === "exact" && (
                <span className="mb-2 inline-block border border-violet/30 px-2 py-0.5 font-mono text-[9px] uppercase">Quoted from submitted sources</span>
              )}
              {message.reason === "sources_need_refresh" && (
                <p className="mb-2 font-mono text-[10px] text-amber-800">Run a new analysis with these URLs and documents to refresh the source evidence.</p>
              )}
              <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{message.text}</p>
              {!!message.citations?.length && (
                <div className="mt-2 border-t border-ink/10 pt-2 font-mono text-[9px] text-muted-foreground">
                  Sources: {message.citations.map((citation, citationIndex) => (
                    <span key={citation.id}>
                      {citationIndex > 0 && " · "}
                      {citation.url && /^https?:\/\//i.test(citation.url) ? (
                        <a className="underline hover:text-violet" href={citation.url} target="_blank" rel="noopener noreferrer">{citation.source}</a>
                      ) : citation.source}
                      {typeof citation.score === "number" && <span title="Retrieval similarity, not a probability that the answer is correct">{` (similarity ${citation.score.toFixed(2)})`}</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {message.role === "user" && <User className="mt-2 h-4 w-4 shrink-0 text-ink/60" />}
          </div>
        ))}
        {sending && <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Searching this report’s sources…</div>}
        {error && <p role="alert" className="border border-danger/30 bg-danger/5 p-3 font-mono text-xs text-danger">{error}</p>}
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-ink/20 p-4">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={2000}
          aria-label="Ask a question about this report"
          placeholder="Ask a question about these sources…"
          className="min-w-0 flex-1 border border-ink/25 bg-paper px-3 py-2 font-mono text-xs outline-none focus:border-violet"
        />
        <button type="submit" disabled={sending || !question.trim()} className="flex items-center gap-2 border border-ink bg-ink px-4 py-2 font-mono text-xs font-bold text-paper transition-colors hover:border-violet hover:bg-violet disabled:cursor-not-allowed disabled:opacity-50">
          <Send className="h-3.5 w-3.5" /> Ask
        </button>
      </form>
    </section>
  );
}
