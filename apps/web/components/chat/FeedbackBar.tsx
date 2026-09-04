"use client";

import { useState } from "react";
import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { sendFeedback } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Feedback } from "@/lib/store/conversations";

export function FeedbackBar({
  query,
  answer,
  feedback,
  onFeedback,
}: {
  query: string;
  answer: string;
  feedback: Feedback;
  onFeedback: (f: "up" | "down") => void;
}) {
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [copied, setCopied] = useState(false);

  const rate = (thumbs: boolean) => {
    onFeedback(thumbs ? "up" : "down");
    void sendFeedback({ query, answer, thumbs }).catch(() => {});
    setCommentOpen(!thumbs);
  };

  const submitComment = () => {
    const text = comment.trim();
    if (text) {
      void sendFeedback({
        query,
        answer,
        thumbs: feedback === "up",
        comment: text,
      }).catch(() => {});
    }
    setComment("");
    setCommentOpen(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex items-center gap-0.5">
        <IconToggle active={feedback === "up"} label="Good answer" onClick={() => rate(true)}>
          <ThumbsUp size={13} />
        </IconToggle>
        <IconToggle active={feedback === "down"} label="Needs work" onClick={() => rate(false)}>
          <ThumbsDown size={13} />
        </IconToggle>
        <span className="mx-1 h-3.5 w-px bg-line" />
        <IconToggle active={copied} label={copied ? "Copied" : "Copy answer"} onClick={copy}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </IconToggle>
      </div>

      {commentOpen && (
        <div className="flex items-center gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitComment();
              if (e.key === "Escape") setCommentOpen(false);
            }}
            placeholder="What was off? (optional)"
            className="h-8 flex-1 rounded-card border border-line bg-panel px-3 text-sm text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
          />
          <Button size="sm" variant="subtle" onClick={submitComment}>
            Send
          </Button>
        </div>
      )}
    </div>
  );
}

function IconToggle({
  children,
  label,
  active,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base",
        active
          ? "bg-panel-2 text-ink"
          : "text-faint hover:bg-panel-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
