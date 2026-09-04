"use client";

import { useEffect, useState } from "react";

import { fetchStartups } from "@/lib/api";

/** The arrival screen: what this is, what it knows, and what to ask. The last example is out of corpus. */

const EXAMPLES = [
  { q: "Which Indian startup builds electric scooters?", note: "direct lookup" },
  {
    q: "Which companies offer payment gateways for businesses?",
    note: "needs two startups",
  },
  {
    q: "where do retail investors in India buy stocks cheaply?",
    note: "no names given",
  },
  {
    q: "What was Flipkart's valuation at its last funding round?",
    note: "not in the corpus — watch it decline",
  },
];

export function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  // Counted from the corpus, not written into the copy: the hardcoded 111 was already wrong.
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    fetchStartups({ limit: 1 })
      .then((res) => setCount(res.total))
      .catch(() => setCount(null));
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl">
        <h1 className="display-sm text-2xl text-ink">
          StartupIndex
        </h1>
        <p className="mt-2 label text-faint">
          {count === null ? "Indian startups" : `${count} startups`} · Y Combinator +
          Wikipedia · 384-dim embeddings
        </p>
        <p className="prose-human mt-4 max-w-xl text-base leading-relaxed text-muted">
          Ask a question and vector search and keyword search run side by side,
          fuse, and rerank. Every answer cites the chunks it used, and when the
          corpus cannot answer, it says so instead of guessing.
        </p>

        {/* This used to be a footer strip on every page. It is one-time framing,
            so it belongs on the one screen a first-time visitor actually reads. */}
        <p className="mt-3 max-w-xl font-mono text-xs leading-relaxed text-faint">
          Reading is open to everyone; re-ingesting the corpus needs a key.
        </p>

        <p className="label mt-8">try one</p>
        <div className="mt-3 grid gap-px border border-line bg-line sm:grid-cols-2">
          {EXAMPLES.map(({ q, note }) => (
            <button
              key={q}
              type="button"
              onClick={() => onPick(q)}
              className="group bg-panel px-4 py-3 text-left transition-colors hover:bg-panel-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
            >
              <span className="block text-sm leading-snug text-ink">
                {q}
              </span>
              <span className="mt-1.5 block font-mono text-xs text-faint">
                {note}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
