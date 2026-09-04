import type { CSSProperties } from "react";
import type { RetrievalMode, TraceStage } from "@/lib/types";

/** Each retrieval channel owns a hue, so a bar says which search produced a result. */
export type Channel = "vector" | "keyword" | "fusion" | "rerank";

/**
 * Two mono characters carrying exactly what the hue carries. The four channel
 * hues sit at equal luminance, so a colour-blind reader, a grayscale print and
 * a screenshot all lose the distinction — the sigil survives all three.
 */
export const CHANNEL_SIGILS: Record<Channel, string> = {
  vector: "VE",
  keyword: "KW",
  fusion: "FU",
  rerank: "RR",
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  vector: "Vector search",
  keyword: "Keyword search",
  fusion: "RRF fusion",
  rerank: "BGE rerank",
};

export const CHANNEL_HINTS: Record<Channel, string> = {
  vector: "Cosine similarity over pgvector embeddings",
  keyword: "Postgres full-text search over tsvector",
  fusion: "Reciprocal rank fusion of both lists",
  rerank: "Cross-encoder scoring of the fused list",
};

/** Longhand backgroundColor: the `background` shorthand hydrates differently and drops the colour. */
export function channelStyle(channel: Channel): CSSProperties {
  return { backgroundColor: `var(--${channel})` };
}

/** The same hue for text or an icon rather than a filled bar. */
export function channelTextStyle(channel: Channel): CSSProperties {
  return { color: `var(--${channel})` };
}

export function stageChannel(stage: TraceStage["name"]): Channel {
  return stage as Channel;
}

/** The channel whose scores a plain result list is showing. */
export function modeChannel(mode: RetrievalMode): Channel {
  if (mode === "vector") return "vector";
  if (mode === "hybrid") return "fusion";
  return "rerank";
}
