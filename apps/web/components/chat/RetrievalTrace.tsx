"use client";

import { useMemo } from "react";
import { formatScore, hostname, truncate } from "@/lib/format";
import type { RetrievalTrace, Source, TraceStage } from "@/lib/types";
import { cn } from "@/lib/cn";

import { CHANNEL_HINTS, CHANNEL_LABELS, stageChannel, type Channel } from "@/lib/channels";
import { ChannelTag } from "@/components/ui/ChannelTag";
import { ScoreBar } from "@/components/ui/ScoreBar";

function StageCard({
  rank,
  source,
  maxScore,
  channel,
}: {
  rank: number;
  source: Source;
  maxScore: number;
  channel: Channel;
}) {
  return (
    <div className="animate-rise-in rounded-card border border-line bg-panel p-2.5">
      <div className="flex items-start gap-2">
        <span className="w-5 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-faint">
          {String(rank).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-ink">
              {source.startup_name}
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
              {formatScore(source.score)}
            </span>
          </div>
          <ScoreBar
            score={source.score}
            maxScore={maxScore}
            channel={channel}
            label={`${CHANNEL_LABELS[channel]} score for ${source.startup_name}`}
            className="mt-1.5"
          />
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            {truncate(source.text, 120)}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="font-mono text-xs text-faint">
              {hostname(source.source_url)}
            </span>
            <span className="font-mono text-xs text-faint">
              #{source.chunk_index}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StageSection({ stage }: { stage: TraceStage }) {
  const maxScore = useMemo(
    () => Math.max(...stage.results.map((r) => r.score), 0),
    [stage.results],
  );
  const channel = stageChannel(stage.name);

  return (
    <section className="animate-rise-in border-b border-line last:border-b-0">
      <div className="flex items-center justify-between px-3 py-2">
        <h3
          className="flex items-center gap-2 label text-ink"
          title={CHANNEL_HINTS[channel]}
        >
          <ChannelTag channel={channel} />
          {CHANNEL_LABELS[channel]}
        </h3>
        <span className="font-mono text-xs tabular-nums text-faint">
          {stage.results.length}
        </span>
      </div>
      <div className="space-y-2 px-3 pb-3">
        {stage.results.map((source, i) => (
          <StageCard
            key={`${stage.name}-${source.id}-${i}`}
            rank={i + 1}
            source={source}
            maxScore={maxScore}
            channel={channel}
          />
        ))}
      </div>
    </section>
  );
}

export function RetrievalTrace({
  trace,
  className,
  hideHeader = false,
}: {
  trace: RetrievalTrace;
  className?: string;
  hideHeader?: boolean;
}) {
  return (
    <div className={cn("h-full overflow-y-auto", className)}>
      {!hideHeader && (
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <h2 className="label text-ink">Retrieval trace</h2>
          <span className="font-mono text-xs tabular-nums text-faint">
            {trace.latency_ms.toFixed(1)}ms
          </span>
        </div>
      )}
      <div>
        {trace.stages.map((stage) => (
          <StageSection key={stage.name} stage={stage} />
        ))}
      </div>
    </div>
  );
}
