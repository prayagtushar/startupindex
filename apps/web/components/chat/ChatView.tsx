"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useConversations } from "@/lib/store/conversations";
import { useChatStream } from "@/lib/hooks/useChatStream";
import { Message, StreamingView } from "./Message";
import { ChatInput } from "./ChatInput";
import { EmptyState } from "./EmptyState";
import { RetrievalTrace } from "./RetrievalTrace";
import { useSettings } from "@/lib/store/settings";

export function ChatView() {
  const { active, updateMessage } = useConversations();
  const { send, stop, streaming, pipeline, isStreaming } = useChatStream();
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledQuery = useRef<string | null>(null);
  const { showRetrievalTrace } = useSettings();

  const messages = active?.messages ?? [];
  const showEmpty = !isStreaming && messages.length === 0;

  const activeTrace =
    streaming?.trace ??
    (!isStreaming ? messages[messages.length - 1]?.trace : undefined);
  const showTrace = showRetrievalTrace && activeTrace != null;

  useEffect(() => {
    const q = searchParams.get("q");
    if (q && handledQuery.current !== q) {
      handledQuery.current = q;
      void send(q);
      router.replace("/chat");
    }
  }, [searchParams, send, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, streaming?.content, streaming?.sources.length, pipeline]);

  // One region, mounted for the life of the view. Writing the finished answer
  // into it is what makes it announce; a region that mounts with its text
  // already in place stays silent.
  const lastAssistant = messages[messages.length - 1];
  const announcement =
    !isStreaming && lastAssistant?.role === "assistant" && lastAssistant.content
      ? lastAssistant.content
      : "";

  const handleFeedback = (msgId: string) => (f: "up" | "down") => {
    if (active) updateMessage(active.id, msgId, { feedback: f });
  };

  const queryFor = (index: number) => {
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].content;
    }
    return "";
  };

  return (
    <div className="flex h-full flex-col xl:flex-row">
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {showEmpty ? (
            <EmptyState onPick={send} />
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8">
              {messages.map((m, i) => (
                <Message
                  key={m.id}
                  message={m}
                  query={m.role === "assistant" ? queryFor(i) : ""}
                  onFeedback={handleFeedback(m.id)}
                />
              ))}
              {streaming && (
                <StreamingView streaming={streaming} pipeline={pipeline} />
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="border-t border-line bg-base/85 backdrop-blur">
          <div className="mx-auto w-full max-w-3xl px-4 py-4">
            <ChatInput
              onSend={send}
              onStop={stop}
              isStreaming={isStreaming}
              autoFocusOnMount
            />
            <p className="mt-2 text-center font-mono text-xs tracking-wide text-faint">
              Answers are grounded in the retrieved corpus and may be incomplete.
            </p>
          </div>
        </div>
      </div>

      {showTrace && (
        <aside className="hidden w-[320px] shrink-0 border-l border-line bg-base xl:block">
          <RetrievalTrace trace={activeTrace} />
        </aside>
      )}
    </div>
  );
}
