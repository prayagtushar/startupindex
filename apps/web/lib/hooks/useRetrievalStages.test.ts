import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useRetrievalStages } from "./useRetrievalStages";

/** These hold the stream open and assert what is visible part-way through, not just the final array. */

function stageEvent(name: string, elapsed: number, total = 100) {
  return `data: ${JSON.stringify({
    type: "stage",
    name,
    elapsed_ms: elapsed,
    total,
    results: [
      {
        id: 1,
        startup_name: `From ${name}`,
        chunk_index: 0,
        text: "...",
        source_url: "https://example.com",
        score: 0.5,
      },
    ],
  })}\n\n`;
}

/** A response whose body this test feeds by hand, one chunk at a time. */
function controllableStream() {
  let push!: (chunk: string) => void;
  let close!: () => void;
  const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      const encoder = new TextEncoder();
      push = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      close = () => controller.close();
    },
  });
  return { body, push, close };
}

function mockFetch(response: Partial<Response> & { body: ReadableStream | null }) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, ...response });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useRetrievalStages", () => {
  it("exposes each stage as it arrives, not only at the end", async () => {
    const { body, push, close } = controllableStream();
    mockFetch({ body });

    const { result } = renderHook(() => useRetrievalStages());
    act(() => {
      void result.current.run("payments", 5, "hybrid+rerank");
    });

    await act(async () => {
      push(stageEvent("vector", 20));
    });
    await waitFor(() => expect(result.current.stages).toHaveLength(1));
    // Mid-stream: one stage readable, and the run is still going.
    expect(result.current.stages[0].name).toBe("vector");
    expect(result.current.running).toBe(true);

    await act(async () => {
      push(stageEvent("keyword", 24));
      push(stageEvent("fusion", 25));
    });
    await waitFor(() => expect(result.current.stages).toHaveLength(3));
    expect(result.current.running).toBe(true);

    await act(async () => {
      push(stageEvent("rerank", 700));
      close();
    });
    await waitFor(() => expect(result.current.running).toBe(false));
    expect(result.current.stages.map((s) => s.name)).toEqual([
      "vector",
      "keyword",
      "fusion",
      "rerank",
    ]);
  });

  it("keeps the server's order rather than sorting", async () => {
    // Whatever order the server reports is the order the pipeline ran in.
    const { body, push, close } = controllableStream();
    mockFetch({ body });

    const { result } = renderHook(() => useRetrievalStages());
    act(() => {
      void result.current.run("q", 5, "hybrid+rerank");
    });
    await act(async () => {
      push(stageEvent("keyword", 10));
      push(stageEvent("vector", 20));
      close();
    });

    await waitFor(() => expect(result.current.running).toBe(false));
    expect(result.current.stages.map((s) => s.name)).toEqual(["keyword", "vector"]);
  });

  it("carries the timing and the candidate count through", async () => {
    const { body, push, close } = controllableStream();
    mockFetch({ body });

    const { result } = renderHook(() => useRetrievalStages());
    act(() => {
      void result.current.run("q", 5, "hybrid+rerank");
    });
    await act(async () => {
      push(stageEvent("vector", 21.5, 100));
      close();
    });

    await waitFor(() => expect(result.current.stages).toHaveLength(1));
    expect(result.current.stages[0].elapsed_ms).toBe(21.5);
    expect(result.current.stages[0].total).toBe(100);
  });

  it("reports an error event without discarding the stages already shown", async () => {
    // A reranker that dies should not blank out the three stages that worked.
    const { body, push, close } = controllableStream();
    mockFetch({ body });

    const { result } = renderHook(() => useRetrievalStages());
    act(() => {
      void result.current.run("q", 5, "hybrid+rerank");
    });
    await act(async () => {
      push(stageEvent("vector", 20));
      push(`data: ${JSON.stringify({ type: "error", message: "reranker died" })}\n\n`);
      close();
    });

    await waitFor(() => expect(result.current.error).toBe("reranker died"));
    expect(result.current.stages).toHaveLength(1);
  });

  it("surfaces the server's message when the request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        body: null,
        text: async () => JSON.stringify({ error: "Rate limit exceeded" }),
      }),
    );

    const { result } = renderHook(() => useRetrievalStages());
    await act(async () => {
      await result.current.run("q", 5, "hybrid+rerank");
    });

    expect(result.current.error).toBe("Rate limit exceeded");
    expect(result.current.running).toBe(false);
  });

  it("clears the previous run's stages when a new one starts", async () => {
    const first = controllableStream();
    mockFetch({ body: first.body });

    const { result } = renderHook(() => useRetrievalStages());
    act(() => {
      void result.current.run("first", 5, "hybrid+rerank");
    });
    await act(async () => {
      first.push(stageEvent("vector", 20));
      first.close();
    });
    await waitFor(() => expect(result.current.stages).toHaveLength(1));

    const second = controllableStream();
    mockFetch({ body: second.body });
    act(() => {
      void result.current.run("second", 5, "hybrid+rerank");
    });

    // Two pipelines interleaved into one column set would be unreadable.
    await waitFor(() => expect(result.current.stages).toHaveLength(0));
    expect(result.current.ranQuery).toBe("second");
    await act(async () => {
      second.close();
    });
  });

  it("ignores a blank query instead of calling the API", async () => {
    const fetchMock = mockFetch({ body: null });
    const { result } = renderHook(() => useRetrievalStages());

    await act(async () => {
      await result.current.run("   ", 5, "hybrid+rerank");
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.running).toBe(false);
  });

  it("asks for the query, top_k and mode it was given", async () => {
    const { body, close } = controllableStream();
    const fetchMock = mockFetch({ body });

    const { result } = renderHook(() => useRetrievalStages());
    act(() => {
      void result.current.run("  payments  ", 7, "hybrid");
    });
    await act(async () => {
      close();
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/search/trace");
    expect(JSON.parse(init.body as string)).toEqual({
      query: "payments",
      top_k: 7,
      mode: "hybrid",
    });
  });
});
