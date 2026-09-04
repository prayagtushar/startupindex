"use client";

import { TriangleAlert } from "lucide-react";
import { Answer } from "./Answer";
import { SourcesPanel } from "./SourcesPanel";
import { FeedbackBar } from "./FeedbackBar";
import { PipelineTree } from "./PipelineTree";
import { RetrievalTrace } from "./RetrievalTrace";
import { useSettings } from "@/lib/store/settings";
import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/lib/store/conversations";
import type {
  PipelineState,
  StreamingMessage,
} from "@/lib/hooks/useChatStream";
import type { RetrievalTrace as RetrievalTraceType } from "@/lib/types";

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="prose-human max-w-[85%] whitespace-pre-wrap border border-line bg-panel px-4 py-2.5 text-base leading-relaxed text-ink">
        {content}
      </div>
    </div>
  );
}

function ErrorNote({ message, subtle }: { message?: string; subtle?: boolean }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-card border border-line px-3 py-2 text-sm text-muted",
        subtle ? "mt-3" : "bg-danger-soft",
      )}
    >
      <TriangleAlert size={14} className="mt-0.5 shrink-0 text-danger" aria-hidden />
      <span>
        {message || "Something went wrong while answering. Please try again."}
      </span>
    </div>
  );
}

function TraceCollapsible({ trace }: { trace: RetrievalTraceType }) {
  return (
    <div className="mt-4 xl:hidden">
      <details className="rounded-card border border-line bg-panel overflow-hidden">
        <summary className="flex cursor-pointer items-center justify-between px-3 py-2 label text-ink">
          <span>Retrieval trace</span>
          <span className="text-faint">
            {trace.stages.length} stages · {trace.latency_ms.toFixed(1)}ms
          </span>
        </summary>
        <div className="border-t border-line">
          <RetrievalTrace trace={trace} hideHeader />
        </div>
      </details>
    </div>
  );
}

export function Message({
  message,
  query,
  onFeedback,
}: {
  message: ChatMessage;
  query: string;
  onFeedback: (f: "up" | "down") => void;
}) {
  const { showRetrievalTrace } = useSettings();

  if (message.role === "user") return <UserBubble content={message.content} />;

  const hasError = message.status === "error";

  return (
    <div className="animate-rise-in">
      {hasError && !message.content ? (
        <ErrorNote message={message.error} />
      ) : (
        <>
          <Answer content={message.content} sources={message.sources ?? []} />
          {hasError && message.error && (
            <ErrorNote message={message.error} subtle />
          )}
          <SourcesPanel sources={message.sources ?? []} />
          {message.trace && showRetrievalTrace && (
            <TraceCollapsible trace={message.trace} />
          )}
          {message.content && !hasError && (
            <FeedbackBar
              query={query}
              answer={message.content}
              feedback={message.feedback ?? null}
              onFeedback={onFeedback}
            />
          )}
        </>
      )}
    </div>
  );
}

export function StreamingView({
  streaming,
  pipeline,
}: {
  streaming: StreamingMessage;
  pipeline: PipelineState | null;
}) {
  const { showRetrievalTrace } = useSettings();

  return (
    <div className="animate-rise-in">
      {pipeline && <PipelineTree pipeline={pipeline} />}
      {streaming.content && (
        <div className="mt-4">
          <Answer content={streaming.content} sources={streaming.sources} />
        </div>
      )}
      {streaming.sources.length > 0 && (
        <SourcesPanel sources={streaming.sources} defaultOpen />
      )}
      {streaming.trace && showRetrievalTrace && (
        <TraceCollapsible trace={streaming.trace} />
      )}
    </div>
  );
}
