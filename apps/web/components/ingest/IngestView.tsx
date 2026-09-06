"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Database, RefreshCw, TriangleAlert } from "lucide-react";
import { fetchStartups, streamIngest } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import type { IngestStage } from "@/lib/types";

type Status = "pending" | "running" | "done";

const STAGES: { key: IngestStage; label: string }[] = [
  { key: "discover", label: "Discover companies" },
  { key: "scrape", label: "Scrape sources" },
  { key: "embed", label: "Embed chunks" },
  { key: "load", label: "Load into Postgres" },
];

const ALL_PENDING: Record<IngestStage, Status> = {
  discover: "pending",
  scrape: "pending",
  embed: "pending",
  load: "pending",
};

function Marker({ status }: { status: Status }) {
  return (
    <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
      {status === "done" ? (
        <Check size={12} strokeWidth={2.25} className="text-muted" />
      ) : status === "running" ? (
        <span className="h-[7px] w-[7px] rounded-full bg-ink animate-pulse-dot" />
      ) : (
        <span className="h-[7px] w-[7px] rounded-full border border-faint" />
      )}
    </span>
  );
}

export function IngestView() {
  const [statuses, setStatuses] = useState<Record<IngestStage, Status>>(ALL_PENDING);
  const [scrape, setScrape] = useState<{ done: number; total: number; name?: string } | null>(null);
  const [result, setResult] = useState<{ startups: number; chunks: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [corpusSize, setCorpusSize] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchStartups({ limit: 1 })
      .then((res) => setCorpusSize(res.total))
      .catch(() => setCorpusSize(null));
  }, []);

  const start = useCallback(async () => {
    if (running) return;
    setStatuses(ALL_PENDING);
    setScrape(null);
    setResult(null);
    setError(null);
    setStarted(true);
    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      for await (const evt of streamIngest({ refresh: true }, controller.signal)) {
        if (evt.type === "stage") {
          const stage = evt.stage;
          setStatuses((prev) => ({
            ...prev,
            [stage]: evt.status === "done" ? "done" : "running",
          }));
          if (stage === "scrape" && evt.status === "progress") {
            setScrape({ done: evt.done ?? 0, total: evt.total ?? 0, name: evt.name });
          }
        } else if (evt.type === "done") {
          setResult({ startups: evt.startups, chunks: evt.chunks });
          setStatuses({
            discover: "done",
            scrape: "done",
            embed: "done",
            load: "done",
          });
        } else if (evt.type === "error") {
          setError(evt.message || "Ingest failed.");
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError((e as Error)?.message || "Couldn’t reach the server.");
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }, [running]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const pct = scrape && scrape.total ? Math.round((scrape.done / scrape.total) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line">
        <div className="mx-auto w-full max-w-3xl px-4 py-4">
          <p className="label mb-1">Data pipeline</p>
          <p className="text-sm leading-relaxed text-muted">
            Rebuild the corpus straight from the web: pull Indian startups from
            Wikipedia and Y Combinator, embed each, and load into Postgres —
            no terminal required.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={start} disabled={running} className="gap-2">
              {running ? <Spinner /> : <RefreshCw size={14} />}
              {running ? "Ingesting…" : "Refresh data"}
            </Button>
            {running && (
              <Button variant="ghost" onClick={stop}>
                Stop
              </Button>
            )}
            {/* Counted, not written into the copy — the hardcoded ~110 was stale
                the moment the corpus grew, exactly as the 111 in the chat header was. */}
            <span className="ml-auto label text-faint">
              {corpusSize === null ? "live sources" : `~${corpusSize} companies`} · ≈1–2 min
            </span>
          </div>

          {!started ? (
            <div className="mt-10 flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Database size={22} className="text-faint" />
              <p className="text-sm text-faint">
                Run the pipeline to (re)populate the corpus from live sources.
              </p>
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-card border border-line bg-panel">
              <div className="space-y-0.5 p-4">
                {STAGES.map(({ key, label }) => (
                  <div key={key}>
                    <div className="flex items-center gap-2.5 py-[3px]">
                      <Marker status={statuses[key]} />
                      <span
                        className={cn(
                          "label transition-colors",
                          statuses[key] === "running"
                            ? "text-ink"
                            : statuses[key] === "done"
                              ? "text-muted"
                              : "text-faint",
                        )}
                      >
                        {label}
                      </span>
                      {key === "scrape" && scrape && statuses.scrape === "running" && (
                        <span className="ml-auto font-mono text-xs tabular-nums text-muted">
                          {scrape.done}/{scrape.total}
                          {scrape.name ? ` · ${scrape.name}` : ""}
                        </span>
                      )}
                    </div>
                    {key === "scrape" && scrape && statuses.scrape !== "pending" && (
                      <div className="ml-[1.4rem] mt-1 mb-1 h-1 overflow-hidden rounded-full bg-panel-2">
                        <div
                          className="h-full rounded-full bg-ink transition-[width] duration-300"
                          style={{ width: `${statuses.scrape === "done" ? 100 : pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {(result || error) && (
                <div className="border-t border-line px-4 py-3">
                  {error ? (
                    <div className="flex items-start gap-2 text-sm text-ink">
                      <TriangleAlert size={15} className="mt-0.5 shrink-0 text-faint" />
                      <span>{error}</span>
                    </div>
                  ) : result ? (
                    <div className="flex items-center gap-2 text-sm text-ink">
                      <Check size={15} className="shrink-0 text-muted" />
                      <span>
                        Loaded{" "}
                        <span className="font-medium tabular-nums">{result.startups}</span>{" "}
                        startups and{" "}
                        <span className="font-medium tabular-nums">{result.chunks}</span>{" "}
                        chunks. Chat and search now reflect the fresh data.
                      </span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
