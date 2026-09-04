"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { formatScore, hostname, truncate } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Source } from "@/lib/types";

export function SourcesPanel({
  sources,
  defaultOpen = false,
}: {
  sources: Source[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!sources.length) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group inline-flex items-center gap-1.5 rounded-card py-1 text-faint transition-colors hover:text-ink"
      >
        <ChevronDown
          size={13}
          className={cn("transition-transform", open && "rotate-180")}
        />
        <span className="label">
          {sources.length} source{sources.length > 1 ? "s" : ""}
        </span>
      </button>

      {open && (
        <ol className="mt-2 space-y-1.5">
          {sources.map((s, i) => (
            <SourceCard key={`${s.id}-${i}`} index={i + 1} source={s} />
          ))}
        </ol>
      )}
    </div>
  );
}

function SourceCard({ index, source }: { index: number; source: Source }) {
  return (
    <li className="rounded-card border border-line bg-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-card border border-line bg-panel-2 px-1 font-mono text-xs text-muted">
            {index}
          </span>
          <span className="truncate text-sm font-medium text-ink">
            {source.startup_name}
          </span>
        </div>
        <span
          title="Retrieval score"
          className="shrink-0 font-mono text-xs tabular-nums text-faint"
        >
          {formatScore(source.score)}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        {truncate(source.text, 240)}
      </p>
      <a
        href={source.source_url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 label text-faint transition-colors hover:text-ink"
      >
        <ExternalLink size={11} />
        {hostname(source.source_url)}
      </a>
    </li>
  );
}
