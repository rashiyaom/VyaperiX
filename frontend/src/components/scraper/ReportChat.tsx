import React from "react";
import { MessageCircle } from "lucide-react";
import { useChatWidget, type ChatMessage, type ChatCitation } from "@/components/chat/ChatWidgetProvider";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";

export type { ChatMessage, ChatCitation };

export interface ReportChatProps {
  reportId?: string;
  reportTitle?: string;
  className?: string;
}

/**
 * Presentational wrapper around ChatMessages and ChatInput.
 * Free of report-tab assumptions; synchronizes with global ChatWidget state.
 */
export function ReportChat({ reportId, reportTitle, className = "" }: ReportChatProps) {
  const {
    activeReportId,
    activeReportTitle,
    messages,
    sending,
    error,
    sendMessage,
    retryLastMessage,
  } = useChatWidget();

  const targetReportId = reportId || activeReportId;
  const targetReportTitle = reportTitle || activeReportTitle;

  return (
    <section className={`border border-ink bg-card dark:border-ink/30 ${className}`}>
      <div className="flex items-center gap-3 border-b border-ink/20 p-4 dark:border-ink/25">
        <div className="border border-violet/30 bg-violet/10 p-2 text-violet">
          <MessageCircle className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-display text-xs font-black uppercase text-ink">
            Ask This Report {targetReportTitle ? `· ${targetReportTitle}` : ""}
          </h2>
          <p className="font-mono text-[10px] text-muted-foreground">
            Strictly grounded in submitted URLs, uploaded documents, and business context.
          </p>
        </div>
      </div>

      <div className="min-h-72 max-h-[500px] overflow-y-auto">
        <ChatMessages
          messages={messages}
          sending={sending}
          error={error}
          activeReportId={targetReportId}
          activeReportTitle={targetReportTitle}
          onRetry={retryLastMessage}
        />
      </div>

      <ChatInput
        onSend={sendMessage}
        sending={sending}
        disabled={!targetReportId}
        placeholder={
          targetReportId
            ? `Ask about ${targetReportTitle || "this report"}…`
            : "Select a report to ask questions"
        }
      />
    </section>
  );
}
