"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { useConversations } from "@/lib/store/conversations";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";

export function ConversationList({ onNavigate }: { onNavigate?: () => void }) {
  const {
    conversations,
    activeId,
    hydrated,
    selectConversation,
    deleteConversation,
    renameConversation,
  } = useConversations();
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (!hydrated) return null;

  if (conversations.length === 0) {
    return (
      <p className="px-3 py-2 text-sm leading-relaxed text-faint">
        Your conversations will appear here.
      </p>
    );
  }

  const open = (id: string) => {
    selectConversation(id);
    router.push("/chat");
    onNavigate?.();
  };

  const commit = () => {
    if (editingId) renameConversation(editingId, draft);
    setEditingId(null);
  };

  return (
    <ul className="flex flex-col gap-0.5 pb-2">
      {conversations.map((c) => {
        const active = c.id === activeId;
        const title = c.title || "New chat";

        if (editingId === c.id) {
          return (
            <li key={c.id} className="flex items-center gap-1 px-0.5">
              <input
                autoFocus
                value={draft}
                aria-label="Conversation title"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="h-8 min-w-0 flex-1 rounded-card border border-line bg-panel px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
              />
              <SmallIcon label="Save" onClick={commit}>
                <Check size={14} />
              </SmallIcon>
              <SmallIcon label="Cancel" onClick={() => setEditingId(null)}>
                <X size={14} />
              </SmallIcon>
            </li>
          );
        }

        // Deleting used to go through a native confirm() dialog, which broke out
        // of the app's own surface. The confirmation now happens in place.
        if (confirmingId === c.id) {
          return (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-card border border-line bg-panel-2 px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                Delete “{title}”?
              </span>
              <button
                type="button"
                onClick={() => {
                  deleteConversation(c.id);
                  setConfirmingId(null);
                }}
                className="label shrink-0 rounded-card px-2 py-1 text-danger transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
              >
                Delete
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmingId(null)}
                className="label shrink-0 rounded-card px-2 py-1 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
              >
                Keep
              </button>
            </li>
          );
        }

        return (
          <li key={c.id} className="group relative">
            <button
              type="button"
              onClick={() => open(c.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-card py-2 pl-3 pr-20 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base",
                active
                  ? "bg-panel-2 text-ink"
                  : "text-muted hover:bg-panel-2 hover:text-ink",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{title}</span>
            </button>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-xs text-faint group-focus-within:opacity-0 group-hover:opacity-0">
              {relativeTime(c.updatedAt)}
            </span>
            {/* Kept in the DOM rather than mounted on hover, so a keyboard can reach them. */}
            <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <SmallIcon
                label={`Rename “${title}”`}
                onClick={() => {
                  setEditingId(c.id);
                  setDraft(c.title);
                }}
              >
                <Pencil size={13} />
              </SmallIcon>
              <SmallIcon
                label={`Delete “${title}”`}
                onClick={() => setConfirmingId(c.id)}
              >
                <Trash2 size={13} />
              </SmallIcon>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SmallIcon({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      // 32px, not 24: the old target was smaller than a fingertip.
      className="inline-flex h-8 w-8 items-center justify-center rounded-card text-faint transition-colors hover:bg-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
    >
      {children}
    </button>
  );
}
