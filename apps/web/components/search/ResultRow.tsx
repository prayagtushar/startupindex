import { ExternalLink } from "lucide-react";
import { formatScore, hostname, truncate } from "@/lib/format";
import type { Source } from "@/lib/types";
import { ScoreBar } from "@/components/ui/ScoreBar";
import type { Channel } from "@/lib/channels";

export function ResultRow({
  rank,
  source,
  maxScore,
  channel = "vector",
}: {
  rank: number;
  source: Source;
  maxScore: number;
  channel?: Channel;
}) {
  return (
    <li className="group rounded-card border border-line bg-panel p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start gap-3">
        <span className="w-6 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-faint">
          {String(rank).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-base font-medium text-ink">
              {source.startup_name}
            </span>
            <span
              title="Retrieval score"
              className="shrink-0 font-mono text-xs tabular-nums text-muted"
            >
              {formatScore(source.score)}
            </span>
          </div>
          <ScoreBar
            score={source.score}
            maxScore={maxScore}
            channel={channel}
            className="mt-2 h-1"
          />
          <p className="prose-human mt-2 text-sm text-muted">
            {truncate(source.text, 280)}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <a
              href={source.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 label text-faint transition-colors hover:text-ink"
            >
              <ExternalLink size={11} />
              {hostname(source.source_url)}
            </a>
            <span className="font-mono text-xs text-faint">
              chunk #{source.chunk_index}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
