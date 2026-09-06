"use client";

import { useState } from "react";
import { Search as SearchIcon, TriangleAlert } from "lucide-react";
import { search } from "@/lib/api";
import { useSettings } from "@/lib/store/settings";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { StateView } from "@/components/ui/StateView";
import { ExampleQueries, SEARCH_EXAMPLES } from "@/components/ui/ExampleQueries";
import { ResultRow } from "./ResultRow";
import { modeChannel } from "@/lib/channels";
import type { Source } from "@/lib/types";

export function SearchView() {
  // Read-only here: the sidebar is where these are changed.
  const { mode, topK } = useSettings();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Source[] | null>(null);
  const [ranQuery, setRanQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accepts an override so an example runs in one click rather than only filling the box.
  const run = async (override?: string) => {
    const q = (override ?? query).trim();
    if (!q || loading) return;
    if (override) setQuery(override);
    setLoading(true);
    setError(null);
    try {
      const res = await search({ query: q, top_k: topK, mode });
      setResults(res.results);
      setRanQuery(q);
    } catch (e) {
      setError((e as Error).message || "Search failed.");
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line">
        <div className="mx-auto w-full max-w-4xl space-y-3 px-4 py-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run()}
                placeholder="Search the corpus for a chunk…"
                className="h-10 w-full rounded-card border border-line bg-panel pl-9 pr-3 text-sm text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
              />
            </div>
            <Button
              variant="primary"
              onClick={() => run()}
              disabled={!query.trim() || loading}
              className="min-w-[5rem]"
            >
              {loading ? <Spinner /> : "Search"}
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 py-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-faint">
              <Spinner />
              <span className="label">
                Retrieving
              </span>
            </div>
          ) : error ? (
            <StateView
              icon={TriangleAlert}
              title="Search failed"
              hint={error}
              action={{ label: "Try again", onClick: () => run() }}
            />
          ) : results === null ? (
            <StateView
              icon={SearchIcon}
              title="Inspect the retrieval pipeline"
              hint="Run a query to see the ranked chunks, their scores, and sources — straight from /search."
            >
              <ExampleQueries examples={SEARCH_EXAMPLES} onPick={(q) => run(q)} />
            </StateView>
          ) : results.length === 0 ? (
            <StateView
              icon={SearchIcon}
              title="No results"
              hint={`Nothing matched “${ranQuery}”. Try a different query or mode.`}
            />
          ) : (
            <>
              <p className="label mb-3">
                {results.length} result{results.length > 1 ? "s" : ""} · {mode} · “{ranQuery}”
              </p>
              <ol className="space-y-2">
                {results.map((r, i) => (
                  <ResultRow
                    key={`${r.id}-${i}`}
                    rank={i + 1}
                    source={r}
                    maxScore={results[0].score}
                    channel={modeChannel(mode)}
                  />
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
