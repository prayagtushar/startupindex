
import { getAdminKey } from "@/components/ingest/AdminKey";
import { parseSSE } from "./sse";
import type {
  ChatEvent,
  ChatRequest,
  FeedbackRequest,
  IngestEvent,
  SearchRequest,
  SearchResponse,
  StartupsResponse,
} from "./types";

/**
 * A request that cannot hang forever.
 *
 * With the API down, a plain fetch never settles and the page sits on its
 * spinner with no way out. Every read gets a deadline so the failure reaches
 * the UI as an error state a visitor can retry.
 */
const REQUEST_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Honour a caller's own signal alongside the deadline.
  const external = init.signal;
  const onExternalAbort = () => controller.abort();
  external?.addEventListener("abort", onExternalAbort);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted && !external?.aborted) {
      throw new Error(
        "The API didn't respond in time. It may be starting up — try again in a moment.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onExternalAbort);
  }
}

/** The API answers errors as `{"error": "..."}`; show that, not the envelope. */
async function errorDetail(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => "");
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as { error?: string; detail?: string };
    return parsed.error ?? parsed.detail ?? fallback;
  } catch {
    return text;
  }
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithTimeout(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await errorDetail(res, `Request to ${path} failed (${res.status})`));
  }
  return (await res.json()) as T;
}

export async function* streamChat(
  req: ChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent, void, unknown> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(await errorDetail(res, `Chat request failed (${res.status})`));
  }
  yield* parseSSE<ChatEvent>(res.body);
}

export function search(req: SearchRequest): Promise<SearchResponse> {
  return postJSON<SearchResponse>("/api/search", req);
}

export async function* streamIngest(
  req: { limit?: number | null; refresh?: boolean },
  signal?: AbortSignal,
): AsyncGenerator<IngestEvent, void, unknown> {
  const res = await fetch("/api/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ISRA-Admin-Key": getAdminKey(),
    },
    body: JSON.stringify(req),
    signal,
  });
  if (res.status === 401) {
    throw new Error(
      "Re-ingesting needs the admin key. Reading the corpus is open to everyone.",
    );
  }
  if (!res.ok || !res.body) {
    throw new Error(await errorDetail(res, `Ingest request failed (${res.status})`));
  }
  yield* parseSSE<IngestEvent>(res.body);
}

export async function sendFeedback(req: FeedbackRequest): Promise<void> {
  await postJSON<{ status: string }>("/api/feedback", req);
}

export interface StartupsQuery {
  limit?: number;
  offset?: number;
  q?: string;
  sector?: string;
}

export async function fetchStartups(
  query: StartupsQuery = {},
  signal?: AbortSignal,
): Promise<StartupsResponse> {
  const params = new URLSearchParams();
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.offset != null) params.set("offset", String(query.offset));
  if (query.q) params.set("q", query.q);
  if (query.sector) params.set("sector", query.sector);

  const res = await fetchWithTimeout(`/api/startups?${params.toString()}`, { signal });
  if (!res.ok) {
    throw new Error(await errorDetail(res, `Startups request failed (${res.status})`));
  }
  return (await res.json()) as StartupsResponse;
}
