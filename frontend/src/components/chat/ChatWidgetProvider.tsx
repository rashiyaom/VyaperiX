import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/lib/auth";
import { getApiBase, getAuthHeaders } from "@/lib/api";

export interface ChatCitation {
  id: string;
  source: string;
  url?: string;
  score?: number | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  confidence?: "exact" | "inferred" | "not_found";
  reason?: string;
  sources?: string[];
  citations?: ChatCitation[];
  timestamp: number;
  status?: "pending" | "sent" | "error";
}

interface ChatContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  activeReportId: string | null;
  activeReportTitle: string | null;
  setActiveReport: (id: string | null, title?: string | null) => void;
  setActiveReportId: (id: string | null, title?: string | null) => void;
  messages: ChatMessage[];
  unreadCount: number;
  sending: boolean;
  error: string | null;
  sendMessage: (question: string) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  clearMessages: () => void;
  markAsRead: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const STORAGE_KEY_OPEN = "vyaperix_chat_widget_open";
const STORAGE_KEY_MESSAGES = "vyaperix_chat_messages_by_report";
const STORAGE_KEY_ACTIVE_REPORT = "vyaperix_chat_active_report_meta";

function safeGetSessionItem<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSetSessionItem<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function ChatWidgetProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();

  // 1. Open State
  const [isOpen, setIsOpen] = useState<boolean>(() =>
    safeGetSessionItem<boolean>(STORAGE_KEY_OPEN, false),
  );

  // 2. Active Report Info
  const [activeReportId, setActiveReportIdState] = useState<string | null>(() => {
    const saved = safeGetSessionItem<{ id: string | null; title: string | null } | null>(
      STORAGE_KEY_ACTIVE_REPORT,
      null,
    );
    return saved?.id || null;
  });

  const [activeReportTitle, setActiveReportTitle] = useState<string | null>(() => {
    const saved = safeGetSessionItem<{ id: string | null; title: string | null } | null>(
      STORAGE_KEY_ACTIVE_REPORT,
      null,
    );
    return saved?.title || null;
  });

  // 3. Messages Map per reportId
  const [messagesByReport, setMessagesByReport] = useState<Record<string, ChatMessage[]>>(() =>
    safeGetSessionItem<Record<string, ChatMessage[]>>(STORAGE_KEY_MESSAGES, {}),
  );

  // 4. In-flight status and error
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 5. Unread count tracking
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // 6. In-flight abort controller
  const abortControllerRef = useRef<AbortController | null>(null);

  // Persist open state
  useEffect(() => {
    safeSetSessionItem(STORAGE_KEY_OPEN, isOpen);
    if (isOpen) {
      setUnreadCount(0);
    }
  }, [isOpen]);

  // Persist messagesByReport
  useEffect(() => {
    safeSetSessionItem(STORAGE_KEY_MESSAGES, messagesByReport);
  }, [messagesByReport]);

  // Set active report helper
  const setActiveReport = useCallback(
    (id: string | null, title?: string | null) => {
      // Abort active request if switching to another report
      if (abortControllerRef.current && id !== activeReportId) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        setSending(false);
      }
      setActiveReportIdState(id);
      setActiveReportTitle(title || null);
      setError(null);
      safeSetSessionItem(STORAGE_KEY_ACTIVE_REPORT, { id, title: title || null });
    },
    [activeReportId],
  );

  const open = useCallback(() => {
    setIsOpen(true);
    setUnreadCount(0);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setSending(false);
    }
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (!next && abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        setSending(false);
      }
      if (next) {
        setUnreadCount(0);
      }
      return next;
    });
  }, []);

  const markAsRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  // Current messages for active report
  const currentMessages = useMemo(() => {
    if (!activeReportId) return [];
    return messagesByReport[activeReportId] || [];
  }, [activeReportId, messagesByReport]);

  // Clear messages for active report
  const clearMessages = useCallback(() => {
    if (!activeReportId) return;
    setMessagesByReport((prev) => {
      const next = { ...prev };
      delete next[activeReportId];
      return next;
    });
    setError(null);
  }, [activeReportId]);

  // Send message
  const sendMessage = useCallback(
    async (question: string) => {
      const cleanQuestion = question.trim();
      if (!cleanQuestion || sending) return;

      if (!activeReportId) {
        setError("Please open an intelligence report to ask grounded questions.");
        return;
      }

      setError(null);
      setSending(true);

      const userMessageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const userMessage: ChatMessage = {
        id: userMessageId,
        role: "user",
        text: cleanQuestion,
        timestamp: Date.now(),
        status: "sent",
      };

      // Optimistically add user message
      setMessagesByReport((prev) => {
        const existing = prev[activeReportId] || [];
        return {
          ...prev,
          [activeReportId]: [...existing, userMessage],
        };
      });

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const headers = getAuthHeaders(session?.access_token, { "Content-Type": "application/json" });

        const response = await fetch(`${getApiBase()}/api/reports/${activeReportId}/chat`, {
          method: "POST",
          headers,
          body: JSON.stringify({ question: cleanQuestion }),
          signal: controller.signal,
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(result.detail || `Chat request failed (${response.status})`);
        }

        const assistantMessageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: "assistant",
          text: result.answer,
          confidence: result.confidence,
          reason: result.reason,
          sources: result.sources || [],
          citations: result.citations || [],
          timestamp: Date.now(),
          status: "sent",
        };

        setMessagesByReport((prev) => {
          const existing = prev[activeReportId] || [];
          return {
            ...prev,
            [activeReportId]: [...existing, assistantMessage],
          };
        });

        // Increment unread count if widget is currently closed
        if (!isOpen) {
          setUnreadCount((c) => c + 1);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") {
          return;
        }
        const errMsg = err instanceof Error ? err.message : "Could not send your question.";
        setError(errMsg);
      } finally {
        setSending(false);
        abortControllerRef.current = null;
      }
    },
    [activeReportId, isOpen, sending, session],
  );

  // Retry last message
  const retryLastMessage = useCallback(async () => {
    if (!activeReportId) return;
    const history = messagesByReport[activeReportId] || [];
    // Find last user message
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i]?.role === "user") {
        await sendMessage(history[i]!.text);
        break;
      }
    }
  }, [activeReportId, messagesByReport, sendMessage]);

  const value = useMemo<ChatContextValue>(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      activeReportId,
      activeReportTitle,
      setActiveReport,
      setActiveReportId: setActiveReport,
      messages: currentMessages,
      unreadCount,
      sending,
      error,
      sendMessage,
      retryLastMessage,
      clearMessages,
      markAsRead,
    }),
    [
      isOpen,
      open,
      close,
      toggle,
      activeReportId,
      activeReportTitle,
      setActiveReport,
      currentMessages,
      unreadCount,
      sending,
      error,
      sendMessage,
      retryLastMessage,
      clearMessages,
      markAsRead,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatWidget(): ChatContextValue {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatWidget must be used within a ChatWidgetProvider");
  }
  return context;
}
