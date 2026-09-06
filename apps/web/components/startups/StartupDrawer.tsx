"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatFunding, hostname } from "@/lib/format";
import { useConversations } from "@/lib/store/conversations";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import type { Startup } from "@/lib/types";

export function StartupDrawer({
  startup,
  onClose,
}: {
  startup: Startup | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { newConversation } = useConversations();

  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panelRef, startup != null, onClose);

  if (!startup) return null;

  const ask = () => {
    newConversation();
    router.push(
      `/chat?q=${encodeURIComponent(`Tell me about ${startup.name}.`)}`,
    );
  };

  const funding = formatFunding(startup.fundings);

  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${startup.name} details`}
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-line bg-base shadow-[var(--shadow-panel)] animate-rise-in"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <span className="label">Startup</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-card text-muted transition-colors hover:bg-panel-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <h2 className="text-lg font-semibold text-ink">
            {startup.name}
          </h2>
          {startup.one_liner && (
            <p className="mt-1 text-base text-muted">{startup.one_liner}</p>
          )}

          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
            <Meta label="Founded" value={startup.founded_year?.toString()} />
            <Meta label="HQ" value={startup.headquarters ?? undefined} />
            <Meta label="Funding" value={funding ?? undefined} />
            <Meta label="Founders" value={startup.founders?.join(", ")} />
          </dl>

          {startup.description && (
            <div className="mt-5">
              <p className="label mb-1.5">About</p>
              <p className="text-base leading-relaxed text-muted">
                {startup.description}
              </p>
            </div>
          )}

          {startup.tags?.length > 0 && (
            <div className="mt-5">
              <p className="label mb-2">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {startup.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-line px-2 py-0.5 font-mono text-xs text-faint"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 py-4">
          <Button variant="primary" size="sm" onClick={ask}>
            <MessageSquare size={14} />
            Ask about this
          </Button>
          {startup.source_url && (
            <a
              href={startup.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-card border border-line px-3 text-sm text-muted transition-colors hover:bg-panel-2 hover:text-ink"
            >
              <ExternalLink size={13} />
              {hostname(startup.source_url)}
            </a>
          )}
        </div>
      </aside>
    </div>
  );
}

function Meta({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value || "—"}</dd>
    </div>
  );
}
