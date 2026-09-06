"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  autoFocusOnMount = true,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  autoFocusOnMount?: boolean;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocusOnMount) ref.current?.focus();
  }, [autoFocusOnMount]);

  const submit = () => {
    const v = value.trim();
    if (!v || isStreaming) return;
    onSend(v);
    setValue("");
  };

  return (
    <div className="relative rounded-card border border-line bg-panel transition-colors focus-within:border-ink focus-within:ring-1 focus-within:ring-focus">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder="Ask about an Indian startup…"
        className="block max-h-[200px] w-full resize-none bg-transparent px-4 pb-12 pt-3.5 text-base leading-relaxed text-ink placeholder:text-faint focus:outline-none"
      />

      <div className="pointer-events-none absolute bottom-3.5 left-4 hidden sm:block">
        <span className="font-mono text-xs text-faint">
          ↵ send&nbsp;·&nbsp;⇧↵ newline
        </span>
      </div>

      <div className="absolute bottom-2.5 right-2.5">
        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className="inline-flex h-8 w-8 items-center justify-center rounded-card bg-ink text-base transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
          >
            <Square size={12} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim()}
            aria-label="Send message"
            className="inline-flex h-8 w-8 items-center justify-center rounded-card bg-ink text-base transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:opacity-25"
          >
            <ArrowUp size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
