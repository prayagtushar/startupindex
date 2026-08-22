# AGENTS.md: Indian Startup Ecosystem RAG (ISRA)

> Onboarding reference for AI coding agents working on this repo. Read this before modifying code or running commands.
>
> Verified against `af0b6f0` on 2026-08-11.

---

## Project overview

ISRA is a RAG (Retrieval-Augmented Generation) system over Indian startup data. It demonstrates a hand-rolled retrieval pipeline: vector search plus Postgres full-text search, then RRF fusion, then BGE rerank, backed by measured evals and a streaming Next.js chat UI.

```
scrapers → startups.jsonl → chunk → embed → Postgres (chunks + vectors + tsvector)
user query → /chat → retrieve(vector) → prompt → LLM (stream) → SSE → UI
                  └────────────── Langfuse trace ──────────────┘
golden set → evals runner → retrieval (hit@k/MRR) + LLM-judge metrics → EVALUATION.md
```

Key product decisions:

- **No LangChain.** The retrieval pipeline is intentionally hand-rolled.
- **No Ragas/DeepEval.** Evals use a hand-rolled LLM-judge. Ragas declares the LangChain family (langchain, langchain-community, langchain-openai) as core dependencies, which this repo bans.
- **One Postgres** handles both vector (`pgvector`) and keyword (`tsvector`) search.
- **Embedding model:** `BAAI/bge-small-en-v1.5`, producing 384-dimensional vectors.
- **Reranker:** BGE cross-encoder.
- **LLM:** hosted API via OpenRouter (Claude / OpenAI models).
- **Deployment target:** GCP Cloud Run (API), Vercel (web), Supabase (Postgres + pgvector). Decommissioned 2026-08-22: Cloud Run, Artifact Registry, and secrets were torn down. Nothing is live.

### Retrieval mode: read this before changing a default

`retrieve()` in `packages/retrieval/src/isra_retrieval/pipeline.py` still declares
`mode: str = "hybrid+rerank"` in its signature, but that is **not** what the running
application uses. The web proxy sends `mode: body.mode ?? "vector"` for both
`/search` and `/chat` (`apps/web/app/api/search/route.ts`, `apps/web/app/api/chat/route.ts`),
because measured evals put plain vector search ahead of both hybrid variants.

The exception is deliberate: `apps/web/app/api/search/trace/route.ts` sends
`hybrid+rerank`, because `/lab` exists to show all four stages and vector mode
would skip three of them.

So the library default and the application default disagree. Do not "fix" one to
match the other without reading `EVALUATION.md` first.

---

## Repository structure

This is a **Turborepo + uv workspace** monorepo.

```
.
├── apps/
│   ├── api/              # FastAPI service
│   ├── evals/            # hand-rolled golden-set eval runner + LLM-judge
│   ├── ingest/           # scrapers → chunks → embeddings → Postgres
│   └── web/              # Next.js 16 chat UI
├── packages/
│   ├── contracts/        # TypeScript API types generated from OpenAPI
│   └── retrieval/        # shared Python retrieval library + DB layer
├── data/                 # scraped corpus + cache (large files gitignored)
├── docs/                 # gitignored; private build plans and guides
├── infra/                # Docker compose + init scripts
├── notebooks/            # embedding experiments
├── pyproject.toml        # root uv workspace manifest
├── package.json          # root bun monorepo manifest
└── turbo.json            # Turborepo task graph
```

### `apps/api`

- **Stack:** FastAPI, SSE streaming, Langfuse, psycopg, pgvector, sentence-transformers, numpy.
- **Entry:** `apps/api/src/main.py`.
- **Endpoints:**
  - `GET /health`, with database connectivity verification.
  - `POST /search` ranked chunks.
  - `POST /search/trace` one SSE event per pipeline stage, emitted as each completes. Backs `/lab`.
  - `POST /chat` SSE streaming chat with sources and inline citations.
  - `POST /feedback` thumbs up or down, stored in Postgres.
  - `GET /startups` paginated startup browser.
  - `POST /ingest` SSE ingest progress. Requires `X-ISRA-Admin-Key`.
- **CORS:** configurable via `ISRA_CORS_ORIGINS` (default `*`).
- **Abuse controls:** per-IP rate limits, bounded request sizes, and a global
  daily answer ceiling in `apps/api/src/budget.py`. See the README for the full
  ordering and what each layer actually stops.
- **Run locally:** `bun run dev:api`, serving `http://localhost:8000`.

### `apps/ingest`

- **Stack:** httpx, BeautifulSoup4, lxml, Pydantic v2.
- **Goal:** scrape Indian startups, normalize into a `Startup` Pydantic model, dedupe, chunk (naive and semantic), embed, and load into Postgres.
- **Run:** `bun run ingest`.

### `apps/evals`

- **Stack:** `openai` SDK pointed at OpenRouter, pydantic-settings. No external eval framework.
- **Goal:** golden-set evaluation. It runs a deterministic retrieval-mode comparison (hit@k and MRR across `vector`, `hybrid`, `hybrid+rerank`) plus reference-free generation metrics (faithfulness, answer relevancy, context precision) scored by a hand-rolled LLM-judge, and writes `EVALUATION.md` with an `evaluation.json` sidecar.
- **Golden set:** `apps/evals/src/golden.jsonl`, 41 questions across four categories (`direct`, `paraphrase`, `multi_hop`, `unanswerable`).
- **Run:** `bun run eval`. Add `-- --no-generation` for the retrieval-only path, which needs no LLM.
- **`EVALUATION.md` and `evaluation.json` are generated artifacts.** Do not hand-edit them. Regenerate with `bun run eval`.

### `apps/web`

- **Stack:** Next.js 16.2.0, React 19.2.0, TypeScript 5.9.2, Bun, Tailwind CSS v4, Framer Motion, Radix Slot.
- **Pages:** every page is public. `/` is the chat itself. There is no landing page and no sign-in.
- **Auth: none.** Accounts were removed in `7e40ccd`. The only gate is a shared
  `ISRA_ADMIN_KEY` on `POST /ingest`, sent as `X-ISRA-Admin-Key`. Abuse is bounded
  server-side instead, by per-IP rate limits, request size caps, and a global daily
  ceiling on generated answers.
- **Run:** `bun run dev:web`, serving `http://localhost:3000`.

### The retrieval lab (`/lab`)

- A dedicated page, not a per-user toggle on `/chat`.
- Calls `POST /search/trace`, which streams one SSE event per stage as that stage finishes: vector search, keyword search, RRF fusion, BGE rerank.
- The first three stages land in roughly 145 to 155 ms; the cross-encoder takes about 7 seconds, so streaming per stage is what keeps the page from waiting on the slowest step.
- Sends `hybrid+rerank` deliberately, so all four stages have something to show.

### `packages/retrieval`

- **Stack:** pgvector, sentence-transformers, psycopg, numpy.
- **Responsibility:** shared data layer and retrieval logic.
- **Public API:** `retrieve(query, top_k, mode)` where `mode` is one of `vector`, `hybrid`, `hybrid+rerank`. See the retrieval mode note above before changing the default.

### `packages/contracts`

- TypeScript API types used by the UI.
- **Regenerate:** `bun run gen:contracts`, which requires the API running on `localhost:8000`.

---

## Technology stack

| Layer | Technology |
|-------|------------|
| Python package manager | uv |
| JS package manager | bun (1.3.14) |
| Monorepo orchestration | Turborepo |
| Python build backend | hatchling |
| Python | >=3.11 |
| Web framework | FastAPI |
| Frontend | Next.js 16, React 19, TypeScript 5.9 |
| Frontend animations | Framer Motion |
| Database | Postgres 16 + pgvector |
| Python DB driver | psycopg 3 |
| Embeddings | sentence-transformers (`BAAI/bge-small-en-v1.5`) |
| Reranker | BGE cross-encoder (sentence-transformers) |
| Scraping | httpx, BeautifulSoup4, lxml |
| Validation | Pydantic v2 |
| Evals | Hand-rolled LLM-judge (OpenRouter via `openai` SDK) |
| Observability | Langfuse Cloud |
| Local infra | Docker Compose |
| Deployment | GCP Cloud Run, Vercel, Supabase. Decommissioned 2026-08-22. |
| Testing | pytest (Python), Vitest (web) |

---

## Build, install, and run commands

Run all commands from the repository root unless noted.

### Install dependencies

```bash
uv sync       # Python workspace
bun install   # JS workspace
```

### Local infrastructure

```bash
docker compose -f infra/compose.yml up -d
```

Default local database URL: `postgresql://isra:isra@localhost:5432/isra`.
Set `DATABASE_URL` in production.

### Run the stack

```bash
bun run ingest    # scrape → chunk → embed → load
bun run dev:api   # FastAPI with hot reload
bun run dev:web   # Next.js dev server
```

### Type generation

```bash
bun run gen:contracts
```

### Evals

```bash
bun run eval
```

### Root package scripts

| Script | Command |
|--------|---------|
| `dev` | `turbo dev` |
| `build` | `turbo build` |
| `lint` | `turbo lint` |
| `test` | `turbo test` |
| `ingest` | `uv run --directory apps/ingest python -m src` |
| `eval` | `uv run --directory apps/evals python -m src` |
| `gen:contracts` | `bun run --cwd packages/contracts gen` |
| `dev:api` | `uv run --directory apps/api uvicorn src.main:app --reload` |
| `dev:web` | `bun run --cwd apps/web dev` |

### Turborepo tasks (`turbo.json`)

- `dev` is persistent and not cached.
- `build` depends on `^build`, and outputs `.next/**` and `dist/**`.
- `lint` has no special config.
- `test` has no special config.
- `typecheck` depends on `^build`.

---

## Code organization and conventions

### Package naming

- Python packages: `isra-retrieval`, `isra-ingest`, `isra-evals`, `isra-api`.
- JS packages: `web`, `@isra/contracts`.
- Import names:
  - `isra_retrieval.*` from `packages/retrieval/src/isra_retrieval/`
  - `src.*` from each app `src/` directory

### Python workspace

- Root `pyproject.toml` defines the uv workspace with members: `apps/api`, `apps/ingest`, `apps/evals`, `packages/retrieval`.
- Each Python package has its own `pyproject.toml`, uses `hatchling`, and declares `packages = ["src"]` (or `"src/isra_retrieval"`).
- Each Python package declares a `dev = ["pytest"]` dependency group.
- Shared local packages are referenced via workspace sources.

### Source layout

- `apps/<app>/src/` is the Python source root for each app.
- `packages/retrieval/src/isra_retrieval/` is the shared library source root.
- `apps/web/app/` is the Next.js App Router root.
- `packages/contracts/src/types.ts` exports the generated TypeScript contract types.

### Schema-first data model

- All scraped data must validate into the `Startup` Pydantic model in `apps/ingest/src/schema.py`.
- `normalized_name` is the deduplication key.
- Every record must have a `source_url` for citations.

### Retrieval API

- The public function is `retrieve(query, top_k, mode)`.
- `mode` must support `"vector"`, `"hybrid"`, and `"hybrid+rerank"`.

### No LangChain / DeepEval

Do not add LangChain, LangChain Community, or DeepEval dependencies.

---

## Testing strategy

Tests exist and run in CI. They are not planned work.

- **Python:** pytest in each package.
  - `packages/retrieval`: RRF fusion correctness, rank ordering, mode parity against a fixture database.
  - `apps/ingest`: schema validation, dedup and merge logic, cached-run idempotency.
  - `apps/api`: endpoint tests with a mocked LLM, and SSE event-sequence tests.
  - `apps/evals`: hit@k and MRR math with an injected `retrieve`, judge score parsing and clamping, and report rendering. All offline, needing no database and no network.
- **Web:** Vitest, plus lint and a production build.
- **Run Python tests:** `uv run --directory <package> pytest`.
- **Run all monorepo tasks:** `bun run test`.

### Integration tests bind to their own database

The retrieval integration tests read `ISRA_TEST_DATABASE_URL` (default
`postgresql://isra:isra@localhost:5432/isra`) and **deliberately ignore**
`DATABASE_URL`. They insert and delete rows, and `isra_retrieval.db` calls
`load_dotenv()` on import, so without that separation a local test run would
write to whatever database `.env` points at. They skip when no test database is
reachable.

### Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: the four Python
suites against a real `pgvector` service container, plus the web app's lint, unit
tests and production build.

---

## Environment variables and secrets

There is no `AUTH_SECRET` and there are no session cookies. Accounts were removed
in `7e40ccd`, so there is nothing to sign.

**API**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` or `ISRA_DATABASE_URL` | Postgres connection string |
| `OPENROUTER_API_KEY` | LLM access for `/chat` |
| `ISRA_OPENROUTER_API_KEY` | LLM access for evals |
| `ISRA_CORS_ORIGINS` | Comma-separated allowed origins for direct API calls (default `*`) |
| `ISRA_TRUSTED_PROXY_HOPS` | Proxy hops appended to `X-Forwarded-For` (default `1`, correct for Cloud Run) |
| `ISRA_DAILY_CHAT_LIMIT` | Answers generated per UTC day (default `200`). `0` stops answering, `-1` removes the cap |
| `ISRA_PROXY_SECRET` | Shared with the web app so the API can trust the forwarded caller address. Must match on both sides, or every visitor shares one rate-limit bucket |
| `ISRA_ADMIN_KEY` | Shared key required by `POST /ingest`. Unset means `/ingest` is closed, so a deployment that forgets it fails closed rather than open |
| `ISRA_LANGFUSE_PUBLIC_KEY` | Optional, for tracing |
| `ISRA_LANGFUSE_SECRET_KEY` | Optional, for tracing |
| `ISRA_LANGFUSE_HOST` | Optional, Langfuse host URL |

**Web**

| Variable | Purpose |
|---|---|
| `API_URL` | Deployed FastAPI endpoint, required in production |
| `ISRA_PROXY_SECRET` | Must match the API's value |

All `.env*` files are gitignored. Do not commit secrets.

---

## Deployment

**Decommissioned 2026-08-22.** The Cloud Run service, Artifact Registry images, and Secret Manager secrets were deleted to stop GCP billing. Nothing described below is live; treat it as a runbook for redeploying from scratch.

- **API:** GCP Cloud Run. The image ships the BGE models and is roughly 1.5 GB compressed. It runs with 4 vCPU so cross-encoder reranking returns in about 4.5 seconds instead of about 20, and with `--max-instances 1` because rate limits are held in process.
- **Web:** Vercel.
- **Database:** Supabase Postgres with pgvector.

Full runbook, including cost ceilings and the Artifact Registry cleanup policy, is in the local `docs/DEPLOY.md`.

---

## Security considerations

- Do not commit `.env` files, API keys, or database credentials.
- Keep `DATABASE_URL` configurable via environment variable.
- The FastAPI server is intended to be called by the Next.js server-side route handler, which avoids CORS problems and keeps secrets out of the browser. Configure `ISRA_CORS_ORIGINS` if the API must also accept direct browser calls.
- LLM API keys must live server-side only.
- `ISRA_PROXY_SECRET` must be set on both sides. Without it the API sees every visitor as the hosting egress IP, and one person can exhaust everyone's budget.
- Docker Compose exposes Postgres on `localhost:5432` with weak local credentials (`isra:isra`). Do not expose this to a network.

---

## Agent notes

- Use **Bun** for JS: `bun install`, `bun run <script>`.
- Use **uv** for Python: `uv sync`, `uv run`.
- Do not assume a feature exists. Verify by reading the file.
- `EVALUATION.md` and `evaluation.json` are generated. Regenerate, do not edit.
- Update this `AGENTS.md` if you change the technology stack, package layout, build commands, or deployment strategy, and move the verified-against SHA at the top when you do.
