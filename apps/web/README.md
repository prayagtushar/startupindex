# ISRA Web

Next.js 16 frontend for the Indian Startup Research Assistant API — a minimal,
monochrome (light + dark) interface with a streaming chat, a retrieval lab, a
search explorer, and a startup browser.

## Development

Run from the repo root:

```bash
bun run dev:web    # Next.js dev server on http://localhost:3000
bun run dev:api    # FastAPI on http://localhost:8000 (the UI proxies to this)
```

The browser never calls FastAPI directly — Next.js route handlers under
`/api/*` proxy to it, keeping LLM keys server-side. Point them at a different
backend with the `API_URL` environment variable (default
`http://localhost:8000`):

```bash
# apps/web/.env.local
API_URL=http://localhost:8000
```

## Views

- **`/chat`** — streaming chat. Shows a live pipeline tree mapped to the real
  RAG stages (vector ∥ keyword → RRF fusion → rerank → generating), inline
  `[N]` citation chips, collapsible source cards, and 👍/👎 feedback.
  Multi-turn with memory; conversations persist in `localStorage`.
- **`/lab`** — Retrieval Lab. Runs one query across all three modes and shows
  rank movement between them.
- **`/search`** — Search Explorer. Ranked chunks with scores and sources.
- **`/startups`** — card grid + sector filter, detail drawer, "Ask about this".

`⌘K` opens a command palette. The sidebar holds the shared retrieval defaults
(mode + `top_k`) and the theme toggle.

## API routes (proxies to FastAPI)

| Route | Forwards to |
|-------|-------------|
| `POST /api/chat` | `POST /chat` (SSE pass-through; adds `history`) |
| `POST /api/search` | `POST /search` |
| `POST /api/feedback` | `POST /feedback` |
| `GET /api/startups` | `GET /startups` |

## Backend expectations

The frontend builds against the real contract in `lib/types.ts`. The backend
(`apps/api`) implements all of it, including:

1. **`POST /chat` accepts an optional `history`** array
   (`[{ role: "user" | "assistant", content }]`) for conversational memory.
   SSE events are unchanged.
2. **`GET /startups?limit&offset&q&sector`** returns
   `{ total, startups: [...] }` for the browser view.

> The frontend imports shared types from `@isra/contracts`. Regenerate it with
> `bun run gen:contracts` whenever the FastAPI schema changes.
>
> The chat SSE stream is standards-compliant (`data: {...}\n\n`); the parser in
> `lib/sse.ts` also tolerates older non-standard spacing.

## Tech

Next.js 16 App Router · React 19 · TypeScript · Tailwind CSS v4 ·
`react-markdown` + `remark-gfm` · `lucide-react`. State is React context +
`localStorage` (no external store).

## Deployment

Designed for **Vercel**. Set `API_URL` to the deployed FastAPI endpoint.
