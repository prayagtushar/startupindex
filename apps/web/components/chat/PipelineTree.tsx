"use client";

import { Check } from "lucide-react";
import type { PipelineState, StageStatus } from "@/lib/hooks/useChatStream";
import type { StageName } from "@/lib/types";
import { cn } from "@/lib/cn";

const LABELS: Record<StageName, string> = {
  vector: "Vector search",
  keyword: "Keyword search",
  fusion: "RRF fusion",
  rerank: "Rerank · BGE",
  generate: "Generating answer",
};

const STATUS_TEXT: Record<StageStatus, string> = {
  done: "done",
  running: "running",
  pending: "queued",
};

function Marker({ status }: { status: StageStatus }) {
  return (
    <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center" aria-hidden>
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

function Row({
  label,
  status,
  generating,
}: {
  label: string;
  status: StageStatus;
  generating?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 py-[3px]">
      <Marker status={status} />
      <span
        title={STATUS_TEXT[status]}
        className={cn(
          "label transition-colors",
          status === "running"
            ? "text-ink"
            : status === "done"
              ? "text-muted"
              : "text-faint",
        )}
      >
        {label}
        <span className="sr-only"> — {STATUS_TEXT[status]}</span>
        {generating && status === "running" && (
          <span className="ml-1 animate-pulse-dot" aria-hidden>
            …
          </span>
        )}
      </span>
    </div>
  );
}

export function PipelineTree({ pipeline }: { pipeline: PipelineState }) {
  const find = (n: StageName) => pipeline.stages.find((s) => s.name === n);
  const has = (n: StageName) => pipeline.stages.some((s) => s.name === n);

  const generate = find("generate");
  const retrievalNames: StageName[] = ["vector", "keyword", "fusion", "rerank"];
  const retrievalDone = retrievalNames
    .filter(has)
    .every((n) => find(n)!.status === "done");

  const allDone = pipeline.stages.every((s) => s.status === "done");
  const phase = allDone
    ? "Complete"
    : generate?.status === "running"
      ? "Generating"
      : "Retrieving";

  const isHybrid = has("keyword");
  const groupStatus: StageStatus = retrievalDone ? "done" : "running";

  return (
    <div className="animate-rise-in py-1" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="label text-faint">
          {phase}
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="mt-3 space-y-0.5">
        {isHybrid ? (
          <>
            <Row label="Parallel retrieval" status={groupStatus} />
            <div className="ml-[1.4rem] space-y-0.5 border-l border-line pl-3">
              <Row label={LABELS.vector} status={find("vector")!.status} />
              <Row label={LABELS.keyword} status={find("keyword")!.status} />
            </div>
            <Row label={LABELS.fusion} status={find("fusion")!.status} />
            {has("rerank") && (
              <Row label={LABELS.rerank} status={find("rerank")!.status} />
            )}
          </>
        ) : (
          <Row label={LABELS.vector} status={find("vector")!.status} />
        )}
        <Row
          label={LABELS.generate}
          status={generate!.status}
          generating
        />
      </div>
    </div>
  );
}
