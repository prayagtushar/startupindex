"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { truncate } from "@/lib/format";
import type { Source } from "@/lib/types";

const CITATION_RE = /\[Source\s+(\d+(?:\s*,\s*\d+)*)\]/g;

function Citation({ n, source }: { n: number; source?: Source }) {
  const title = source
    ? `${source.startup_name} — ${truncate(source.text, 160)}`
    : `Source ${n}`;
  const chip = (
    <span className="mx-0.5 inline-flex h-[1.15rem] min-w-[1.15rem] -translate-y-px items-center justify-center rounded-card border border-line bg-panel-2 px-1 font-mono text-xs text-muted transition-colors hover:border-ink hover:text-ink">
      {n}
    </span>
  );
  if (!source) return <span title={title}>{chip}</span>;
  return (
    <a href={source.source_url} target="_blank" rel="noreferrer" title={title}>
      {chip}
    </a>
  );
}

function withCitations(children: ReactNode, sources: Source[]): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") return splitCitations(child, sources);
    if (isValidElement(child)) {
      const el = child as ReactElement<{ children?: ReactNode }>;
      if (el.props.children) {
        return cloneElement(
          el,
          el.props,
          withCitations(el.props.children, sources),
        );
      }
    }
    return child;
  });
}

function splitCitations(text: string, sources: Source[]): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  CITATION_RE.lastIndex = 0;
  while ((m = CITATION_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const nums = m[1]
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    for (const n of nums) {
      parts.push(<Citation key={`cite-${key++}`} n={n} source={sources[n - 1]} />);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : text;
}

export function Answer({
  content,
  sources = [],
}: {
  content: string;
  sources?: Source[];
}) {
  const cite = (nodes: ReactNode) => withCitations(nodes, sources);

  const components: Components = {
    p: ({ children }) => (
      <p className="mb-3 leading-7 last:mb-0">{cite(children)}</p>
    ),
    ul: ({ children }) => (
      <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0 marker:text-faint">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0 marker:text-faint">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-7">{cite(children)}</li>,
    strong: ({ children }) => (
      <strong className="font-semibold text-ink">{cite(children)}</strong>
    ),
    em: ({ children }) => <em className="italic">{cite(children)}</em>,
    a: ({ children, href }) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-line underline-offset-2 hover:decoration-ink"
      >
        {children}
      </a>
    ),
    // The model's markdown is a fragment inside the page, so its headings are
    // demoted: an <h1> per streamed answer left the document with several.
    h1: ({ children }) => (
      <h3 className="mb-2 mt-4 text-base font-semibold first:mt-0">
        {cite(children)}
      </h3>
    ),
    h2: ({ children }) => (
      <h4 className="mb-2 mt-4 text-base font-semibold first:mt-0">
        {cite(children)}
      </h4>
    ),
    h3: ({ children }) => (
      <h5 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">
        {cite(children)}
      </h5>
    ),
    blockquote: ({ children }) => (
      <blockquote className="mb-3 border-l-2 border-line pl-3 text-muted last:mb-0">
        {cite(children)}
      </blockquote>
    ),
    code: ({ children, className }) => {
      const isBlock = (className ?? "").includes("language-");
      if (isBlock) {
        return (
          <code className="font-mono text-sm leading-relaxed">
            {children}
          </code>
        );
      }
      return (
        <code className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-sm text-ink">
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre className="mb-3 overflow-x-auto rounded-card border border-line bg-panel-2 p-3 last:mb-0">
        {children}
      </pre>
    ),
    hr: () => <hr className="my-4 border-line" />,
    table: ({ children }) => (
      <div className="mb-3 overflow-x-auto last:mb-0">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-line bg-panel-2 px-2 py-1 text-left font-medium">
        {cite(children)}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-line px-2 py-1 align-top">
        {cite(children)}
      </td>
    ),
  };

  return (
    <div className="prose-human text-base text-ink">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </Markdown>
    </div>
  );
}
