"use client";

/** Clickable queries, chosen from the eval set so the three modes visibly disagree. */

export interface ExampleQuery {
  q: string;
  note: string;
}

export const LAB_EXAMPLES: ExampleQuery[] = [
  { q: "Which Indian startup builds electric scooters?", note: "fusion pushes the right chunk down" },
  { q: "Which companies offer payment gateways?", note: "needs several — rerank helps here" },
  { q: "cheap stock trading app", note: "no names, no keywords to match" },
];

export const SEARCH_EXAMPLES: ExampleQuery[] = [
  { q: "fintech unicorn payments", note: "crowded sector" },
  { q: "quick grocery delivery in ten minutes", note: "described, not named" },
  { q: "Flipkart valuation", note: "not in the corpus" },
];

export function ExampleQueries({
  examples,
  onPick,
}: {
  examples: ExampleQuery[];
  onPick: (q: string) => void;
}) {
  return (
    <div className="mt-6 w-full max-w-lg text-left">
      <p className="label mb-2 text-center">try one</p>
      <div className="grid gap-px border border-line bg-line">
        {examples.map(({ q, note }) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="flex items-baseline justify-between gap-3 bg-panel px-3 py-2.5 text-left transition-colors hover:bg-panel-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
          >
            <span className="text-sm leading-snug text-ink">{q}</span>
            <span className="shrink-0 font-mono text-xs text-faint">{note}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
