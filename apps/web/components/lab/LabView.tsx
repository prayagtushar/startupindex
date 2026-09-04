"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Columns3, TriangleAlert } from "lucide-react";

import { useRetrievalStages } from "@/lib/hooks/useRetrievalStages";
import { useSettings } from "@/lib/store/settings";
import { Button } from "@/components/ui/Button";
import { TopKControl } from "@/components/ui/TopKControl";
import { Spinner } from "@/components/ui/Spinner";
import { StateView } from "@/components/ui/StateView";
import { ExampleQueries, LAB_EXAMPLES } from "@/components/ui/ExampleQueries";
import { ScoreBar } from "@/components/ui/ScoreBar";
import { ChannelTag } from "@/components/ui/ChannelTag";
import {
  CHANNEL_HINTS,
  CHANNEL_LABELS,
  CHANNEL_SIGILS,
  channelStyle,
  type Channel,
} from "@/lib/channels";
import { formatScore, truncate } from "@/lib/format";
import type { LiveStage, Source } from "@/lib/types";
import { cn } from "@/lib/cn";

/** The pipeline, one column per stage, in the order the server finishes them. */

// The order the pipeline runs in, which is also the order these arrive.
const STAGE_ORDER: Channel[] = ["vector", "keyword", "fusion", "rerank"];

/** What each stage's movement is measured against: fusion and keyword both against vector. */
const MEASURED_AGAINST: Partial<Record<Channel, Channel>> = {
  keyword: "vector",
  fusion: "vector",
  rerank: "fusion",
};

const rankMap = (list: Source[]) => {
  const ranks = new Map<number, number>();
  list.forEach((s, i) => ranks.set(s.id, i + 1));
  return ranks;
};

export function LabView() {
  const { topK, setTopK } = useSettings();
  const [query, setQuery] = useState("");
  const { stages, running, error, ranQuery, run } = useRetrievalStages();

  // Always the full pipeline: the shorter modes are just the earlier columns.
  const start = (override?: string) => {
    const q = override ?? query;
    if (override) setQuery(override);
    void run(q, topK, "hybrid+rerank");
  };

  const byName = new Map(stages.map((s) => [s.name, s]));
  const started = running || stages.length > 0 || Boolean(error);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line">
        <div className="mx-auto w-full max-w-7xl space-y-3 px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && start()}
              placeholder="Run one query through the whole pipeline…"
              className="h-10 min-w-0 flex-1 rounded-card border border-line bg-panel px-3 text-sm text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
            />
            <div className="flex items-center gap-2">
              <span className="label">Top K</span>
              <TopKControl value={topK} onChange={setTopK} />
            </div>
            <Button
              variant="primary"
              onClick={() => start()}
              disabled={!query.trim() || running}
              className="min-w-[4.5rem]"
            >
              {running ? <Spinner /> : "Run"}
            </Button>
          </div>
          <p className="text-sm leading-relaxed text-muted">
            One query, four stages, each shown the moment it finishes. Two searches
            run, fuse, and get re-scored — the arrows track every chunk&rsquo;s
            movement, and the timings are measured, not staged.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-4 py-6">
          {error && stages.length === 0 ? (
            <StateView
              icon={TriangleAlert}
              title="Retrieval failed"
              hint={error}
              action={{ label: "Try again", onClick: () => start() }}
            />
          ) : !started ? (
            <StateView
              icon={Columns3}
              title="Watch the pipeline resolve"
              hint="Vector and keyword search run side by side, fuse into one ranking, then a cross-encoder re-scores it. Each stage appears as it lands."
            >
              <ExampleQueries examples={LAB_EXAMPLES} onPick={(q) => start(q)} />
            </StateView>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="label">Query · “{ranQuery}”</p>
                {error && (
                  <p className="font-mono text-xs text-danger">{error}</p>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {STAGE_ORDER.map((channel, index) => {
                  const stage = byName.get(channel);
                  const baselineName = MEASURED_AGAINST[channel];
                  const baseline = baselineName ? byName.get(baselineName) : undefined;
                  return (
                    <StageColumn
                      key={channel}
                      channel={channel}
                      step={index + 1}
                      stage={stage}
                      baseline={baseline}
                      baselineName={baselineName}
                      // Only the next unfilled column is actually being worked on.
                      pending={!stage && running && stages.length === index}
                      waiting={!stage && running && stages.length < index}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StageColumn({
  channel,
  step,
  stage,
  baseline,
  baselineName,
  pending,
  waiting,
}: {
  channel: Channel;
  step: number;
  stage?: LiveStage;
  baseline?: LiveStage;
  baselineName?: Channel;
  pending: boolean;
  waiting: boolean;
}) {
  // Within a column, not across: RRF scores near 0.03 would flatten against cosine near 0.7.
  const maxScore = stage && stage.results.length > 0
    ? Math.max(...stage.results.map((s) => s.score))
    : 0;
  const ranks = baseline ? rankMap(baseline.results) : null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border bg-panel transition-opacity duration-300",
        stage ? "border-line" : "border-dashed border-line",
        waiting && "opacity-45",
      )}
    >
      <div className="h-0.5 w-full" style={stage ? channelStyle(channel) : undefined} aria-hidden />
      <div className="border-b border-line px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 label text-ink">
            {stage || pending ? (
              <ChannelTag channel={channel} className={cn(pending && "animate-pulse-dot")} />
            ) : (
              <span className="sigil bg-line-strong text-faint" aria-hidden>
                {CHANNEL_SIGILS[channel]}
              </span>
            )}
            <span className="truncate">
              {step}. {CHANNEL_LABELS[channel]}
            </span>
          </span>
          {stage ? (
            // The real elapsed time. This is why the columns arrive when they do.
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
              {Math.round(stage.elapsed_ms)}ms
            </span>
          ) : (
            <span className="shrink-0 font-mono text-xs text-faint">
              {pending ? "running" : "queued"}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-snug text-faint">{CHANNEL_HINTS[channel]}</p>
        {stage && (
          <p className="mt-1 label text-faint">
            {/* The funnel, stated: the early stages hold a hundred candidates and show eight. */}
            {stage.results.length === stage.total
              ? `${stage.total} kept`
              : `${stage.results.length} of ${stage.total}`}
            {baselineName && ` · vs ${baselineName}`}
          </p>
        )}
      </div>

      {!stage ? (
        <div className="px-3 py-8 text-center">
          <p className="label text-faint">
            {pending ? "Scoring" : "Waiting"}
          </p>
        </div>
      ) : stage.results.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-faint">
          Nothing matched at this stage.
        </p>
      ) : (
        <ol className="divide-y divide-line">
          {stage.results.map((s, i) => (
            <li key={`${s.id}-${i}`} className="animate-rise-in px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="w-4 shrink-0 font-mono text-xs tabular-nums text-faint">
                  {i + 1}
                </span>
                <RankDelta current={i + 1} previous={ranks?.get(s.id)} hasBaseline={ranks != null} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {s.startup_name}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                  {formatScore(s.score)}
                </span>
              </div>
              <ScoreBar
                score={s.score}
                maxScore={maxScore}
                channel={channel}
                label={`${CHANNEL_LABELS[channel]} score for ${s.startup_name}`}
                className="mt-1.5"
              />
              <p className="mt-1.5 text-sm leading-snug text-muted">
                {truncate(s.text, 100)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function RankDelta({
  current,
  previous,
  hasBaseline,
}: {
  current: number;
  previous?: number;
  hasBaseline: boolean;
}) {
  if (!hasBaseline) return <span className="w-9 shrink-0" />;

  // This stage's effect on the ranking is the finding, so it is the one thing drawn in colour.
  if (previous == null) {
    return (
      <span className="inline-flex w-9 shrink-0 justify-start label text-ink">
        new
      </span>
    );
  }
  const delta = previous - current;
  if (delta === 0) {
    return <span className="w-9 shrink-0 font-mono text-xs text-faint">—</span>;
  }
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex w-9 shrink-0 items-center gap-0.5 font-mono text-xs font-medium tabular-nums",
        up ? "text-ink" : "text-faint",
      )}
      title={
        up
          ? `Moved up ${delta} place${delta > 1 ? "s" : ""} at this stage`
          : `Pushed down ${Math.abs(delta)} place${Math.abs(delta) > 1 ? "s" : ""} at this stage`
      }
    >
      {up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
      {Math.abs(delta)}
    </span>
  );
}
