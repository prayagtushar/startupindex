import { formatFunding } from "@/lib/format";
import type { Startup } from "@/lib/types";

export function StartupCard({
  startup,
  onClick,
}: {
  startup: Startup;
  onClick: () => void;
}) {
  const funding = formatFunding(startup.fundings);
  // Only YC records carry a one-liner, so fall back to the text the retriever works from.
  const summary = startup.one_liner ?? startup.description ?? null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full flex-col rounded-card border border-line bg-panel p-4 text-left transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-base font-semibold text-ink">
          {startup.name}
        </span>
        {funding && (
          // A valuation is a figure, not a retrieval channel — the four hues are spoken for.
          <span className="shrink-0 font-mono text-xs tabular-nums text-ink">
            {funding}
          </span>
        )}
      </div>
      {summary && (
        <p className="mt-1 line-clamp-2 text-sm leading-snug text-muted">
          {summary}
        </p>
      )}
      {startup.sectors.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {startup.sectors.slice(0, 3).map((sec) => (
            <span
              key={sec}
              className="rounded-full border border-line px-2 py-0.5 label text-faint"
            >
              {sec}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
