# Indian Startup Ecosystem RAG (ISRA)

[![CI](https://github.com/prayagtushar/isra/actions/workflows/ci.yml/badge.svg)](https://github.com/prayagtushar/isra/actions/workflows/ci.yml)

**Status: archived.** I tore down the live deployment on 2026-08-22 (Cloud Run, Artifact Registry, and secrets, all deleted to stop GCP billing), so `isra.prayagtushar.xyz`, `/lab`, `/search`, and `/startups` no longer respond. The code, evals, and the [Deployment](#deployment) runbook below still work if you want to stand it back up yourself.

A hand-rolled Retrieval-Augmented Generation (RAG) system over Indian startup data, built without LangChain so that ranking, fusion and citation behaviour stay under direct control. The full pipeline runs vector search and Postgres full-text search into RRF fusion, then a BGE reranker, then streaming generation. All of it is implemented from primitives and measured by an evaluation harness that is also hand-rolled.

**Scope, stated honestly.** The corpus is 116 Indian startups scraped from Wikipedia's unicorn list and Y Combinator's directory. It is a deliberately small, verifiable dataset, not a web-scale index. At this size the interesting engineering is in *measuring* retrieval quality rather than in scaling it, and the numbers below are reported as measured, including where they contradict the design and where they got worse.

### The pipeline, resolving

![The retrieval lab: four pipeline stages, each shown as it completes](assets/lab.png)

One query, four stages, streamed as each finishes. The timings are the point.
Vector search, keyword search and RRF fusion land in **145 to 155 ms**. The
cross-encoder takes **7,033 ms**, roughly 45 times the rest combined, so the
first three columns appear immediately instead of the whole page waiting on the
slowest step. The arrows track every chunk's movement against the stage it is
meant to improve on, which is what makes fusion's cost to direct lookups visible
rather than merely reported.

### Grounded answers, with the retrieval behind them

![The chat: a multi-hop answer with inline citations beside its retrieval trace](assets/chat.png)

Every claim carries an inline citation to the chunk it came from, and the trace
panel shows the ranked candidates that produced it. On a question the corpus
cannot answer, the model declines and names the source it checked.

```mermaid
flowchart LR
    subgraph Ingest
        A[Scrapers] --> B[Startup Pydantic model]
        B --> C[Chunker]
        C --> D[Embedder]
        D --> E[(Postgres + pgvector + tsvector)]
    end

    subgraph Retrieval
        Q[User query] --> F[Vector search]
        Q --> G[Full-text search]
        F --> H[RRF fusion]
        G --> H
        H --> I[BGE reranker]
    end

    subgraph Generation
        I --> J[Prompt builder]
        J --> K[LLM streaming]
        K --> L[Next.js UI]
    end

    E --> F
    E --> G
```

## What this is

ISRA is an end-to-end RAG application built to answer questions about the Indian startup ecosystem using curated, citeable sources. Every answer is grounded in retrieved chunks, with inline `[N]` citations pointing back to the original source URLs.

Key design decisions:

- **No LangChain.** The retrieval pipeline is intentionally hand-rolled to keep full control over ranking, fusion, and citations.
- **No Ragas / DeepEval.** Evaluations use a hand-rolled LLM-judge via the OpenRouter API to avoid pulling in the LangChain dependency family.
- **One database.** Postgres 16 with `pgvector` stores vectors and `tsvector` handles keyword search in a single datastore.
- **Streaming UX.** The `/chat` endpoint streams Server-Sent Events (SSE) so sources appear progressively while the answer is generated.
- **Observability.** Optional Langfuse tracing is wired into `/search` and `/chat`.

## Tech stack

| Layer | Technology |
|---|---|
| Python package manager | uv |
| JS package manager | Bun 1.3.14 |
| Monorepo orchestration | Turborepo |
| Web framework | FastAPI |
| Frontend | Next.js 16, React 19, TypeScript 5.9, Tailwind CSS v4 |
| Database | Postgres 16 + pgvector |
| Python DB driver | psycopg 3 |
| Embeddings | sentence-transformers (`BAAI/bge-small-en-v1.5`, 384-dim) |
| Reranker | BGE cross-encoder (sentence-transformers) |
| LLM | Hosted API via OpenRouter (Claude / OpenAI models) |
| Validation | Pydantic v2 |
| Evals | Hand-rolled LLM-judge |
| Observability | Langfuse Cloud |
| Local infrastructure | Docker Compose |
| Deployment targets | GCP Cloud Run (API), Vercel (web), Supabase (Postgres). Decommissioned 2026-08-22. |

## Architecture

### Data flow

1. **Ingest** (`apps/ingest`)
   - Indian startups are scraped from two sources, Wikipedia's unicorn list and Y Combinator's company directory filtered to India, then merged.
   - Records validate into the `Startup` Pydantic model and are deduplicated by `normalized_name`.
   - Descriptions are chunked using either naive or semantic chunking.
   - Each chunk is embedded with `BAAI/bge-small-en-v1.5` and loaded into Postgres.

2. **Retrieval** (`packages/retrieval`)
   - `retrieve(query, top_k, mode)` is the public API.
   - Supported modes: `vector`, `hybrid`, `hybrid+rerank`.
   - Vector search uses cosine similarity over `pgvector` embeddings.
   - Keyword search uses Postgres `tsvector` and `tsquery` full-text search.
   - Reciprocal Rank Fusion (RRF) combines the two ranked lists.
   - A BGE cross-encoder reranks the fused results when `hybrid+rerank` is selected.

3. **Generation** (`apps/api`)
   - `/chat` builds a prompt from the retrieved chunks and conversation history.
   - The LLM streams tokens back over SSE.
   - The final `done` event contains the full answer and a validated `citations` array.

4. **UI** (`apps/web`)
   - Next.js App Router proxies `/api/*` requests to FastAPI to keep API keys server-side.
   - `/chat` shows progressive sources, inline citations, and thumbs up or down feedback.
   - `/lab` streams the four pipeline stages as each completes.
   - `/search` and `/startups` provide search-explorer and startup-browser views.
   - Every retrieval surface is public, and so is `/chat`. The demo is meant to
     be used without signing up. LLM spend is bounded by a global daily ceiling
     rather than by a login. Only `/ingest` is gated, by a shared admin key,
     because it rewrites the corpus.

### Monorepo layout

```
.
├── apps/
│   ├── api/              # FastAPI service
│   ├── evals/            # Golden-set eval runner + LLM-judge
│   ├── ingest/           # Scrapers → chunks → embeddings → Postgres
│   └── web/              # Next.js 16 chat UI
├── packages/
│   ├── contracts/        # TypeScript types generated from OpenAPI
│   └── retrieval/        # Shared retrieval library + DB layer
├── infra/                # Docker Compose + init scripts
├── data/                 # Scraped corpus (large files gitignored)
└── notebooks/            # Embedding experiments
```

## Features

- **Hybrid retrieval** with vector and full-text search.
- **RRF fusion** and optional **BGE reranker**.
- **Streaming chat** with memory, sources, and inline citations.
- **Retrieval lab** that streams each pipeline stage, meaning vector search, keyword
  search, RRF fusion and cross-encoder rerank, as it finishes, with the measured
  cost of each and every chunk's movement between them. One run, not three: the
  columns are also what `vector`, `hybrid` and `hybrid+rerank` each return.
- **Search explorer** for inspecting ranked chunks.
- **Startup browser** with sector filters and detail drawers.
- **Feedback capture** stored in Postgres.
- **Offline-friendly eval runner** with hit@k, MRR, and LLM-judge generation metrics.
- **Optional Langfuse tracing** for `/search` and `/chat`.

## Quickstart

### Prerequisites

- Python >= 3.11
- uv
- Bun 1.3.14+
- Docker (for local Postgres)

### Install

```bash
uv sync          # Python workspace
bun install      # JS workspace
```

### Start local infrastructure

```bash
docker compose -f infra/compose.yml up -d
```

Default local database URL: `postgresql://isra:isra@localhost:5432/isra`

### Run the stack

```bash
bun run ingest     # scrape → chunk → embed → load
bun run dev:api    # FastAPI with hot reload on http://localhost:8000
bun run dev:web    # Next.js dev server on http://localhost:3000
```

### Regenerate TypeScript contracts

```bash
bun run dev:api    # API must be running
bun run gen:contracts
```

### Run evals

```bash
bun run eval                 # full pipeline
bun run eval -- --no-generation   # retrieval metrics only
```

## API reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check with database connectivity verification |
| `POST` | `/search` | Ranked retrieval results |
| `POST` | `/search/trace` | One SSE event per pipeline stage, sent as each completes |
| `POST` | `/chat` | Streaming chat over SSE |
| `POST` | `/feedback` | Store thumbs up or down feedback |
| `GET` | `/startups` | Paginated startup browser data |
| `POST` | `/ingest` | Stream ingest progress over SSE. Requires `X-ISRA-Admin-Key` |

### Abuse controls

`/chat` is open to anyone, so nothing stands between a stranger and the LLM bill
except server-side limits. There are four layers, in order of what they stop:

1. **A global daily ceiling** (`ISRA_DAILY_CHAT_LIMIT`, default 200 answers per
   UTC day). This is the one that actually caps spend, because per-IP limits do
   nothing against a bot pool. When it is reached, `/chat` still returns retrieved
   sources but stops calling the model and says so. Set it to `0` to halt
   answering immediately without a redeploy. Set `-1` to remove the cap.
2. **Per-IP rate limits**, listed below, which stop a single visitor hammering the demo.
3. **Bounded requests.** `question` and `query` are capped at 600 characters, history at
   10 turns, `top_k` at 10, and the completion at `max_tokens=1024`, so no single
   call can run up an unbounded prompt or an unbounded rerank. The search
   endpoints enforce this too, which they did not originally: `/search` took an
   unbounded `top_k` and an empty query while this section claimed otherwise.
4. **The GCP billing budget**, the backstop, since the daily counter is held in
   process and a restart resets it.

Because the web app calls the API server-side, the API would otherwise see every
visitor as the same hosting egress IP and one person could exhaust everyone's
budget. The proxy forwards the caller's address, and the API trusts it only when
`ISRA_PROXY_SECRET` matches on both sides. **Set it, or per-IP limits collapse
into a single shared bucket.**

### Rate limits

Every endpoint except `/health` is limited per client IP. Over-limit requests get
`429` with `Retry-After`, and allowed requests carry `X-RateLimit-Limit` and
`X-RateLimit-Remaining`. Budgets are sized by what each call costs to serve:

| Endpoint | Limit |
|---|---|
| `/chat` | 15 / hour (spends LLM tokens) |
| `/ingest` | 3 / hour (writes, runs the scraper) |
| `/search` | 30 / min (runs the cross-encoder; `/search/trace` shares this budget) |
| `/feedback` | 20 / min |
| `/startups` | 60 / min |

Limits are held in process. That is accurate while the service runs with
`--max-instances 1`. Scaling past one instance makes them per-instance, and they
would need to move to a shared store.

### Example: `/chat`

```bash
curl -N -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Which Indian fintech unicorn was founded in 2014?",
    "top_k": 5,
    "mode": "hybrid+rerank"
  }'
```

SSE events:

- `sources`, the retrieved chunks with scores and URLs.
- `token`, streamed answer tokens.
- `done`, the full answer and validated citations.
- `error`, a retrieval or generation failure message.

## Evaluation results

Generated 2026-08-11, over 41 questions, at top_k 5, judged by `anthropic/claude-haiku-4.5`.

The golden set has four question types, because a single "name the startup" phrasing
only measures one thing:

| Category | n | What it tests |
|---|---|---|
| `direct` | 12 | Plain entity lookup |
| `paraphrase` | 11 | Colloquial phrasing, misspellings, indirect description |
| `multi_hop` | 8 | Questions needing **every** one of several startups retrieved |
| `unanswerable` | 10 | Plausible questions the corpus cannot answer, where the model must abstain |

### Retrieval mode comparison

Scored on answerable questions only. `hit@k` requires every expected entity on
multi-hop questions, and `recall@k` gives partial credit.

| Mode | hit@5 | recall@5 | MRR |
|---|---|---|---|
| **vector** | **0.839** | **0.825** | **0.756** |
| hybrid | 0.613 | 0.583 | 0.632 |
| hybrid+rerank | 0.774 | 0.755 | 0.748 |

### By category (hit@5)

| Mode | direct | paraphrase | multi_hop |
|---|---|---|---|
| vector | **0.917** | **1.000** | 0.500 |
| hybrid | 0.667 | 0.818 | 0.250 |
| hybrid+rerank | 0.750 | 1.000 | 0.500 |

**The finding.** Plain vector search beats both hybrid variants, so `vector` is
what the application sends. The original default, `hybrid+rerank`, measures
worse. The category split shows where it goes wrong: RRF fusion loses direct
lookups, dropping 0.917 to 0.667, because keyword hits displace the chunk vector
search already had in first place, and the cross-encoder recovers only part of
that, bringing 0.667 back to 0.750. Fusion is under-tuned rather than wrong in
principle, and tuning its weighting is the obvious next step. All three stages
are visible in `/lab` (no longer deployed, see Status above), which is how the
keyword list, the step that does the damage, became inspectable at all.

One wrinkle worth stating, because the code does not read the way that paragraph
does. `retrieve()` still declares `mode: str = "hybrid+rerank"` in its signature.
The web proxy overrides it to `vector` on `/search` and `/chat`, which is what
makes vector the effective default in the running application. `/lab` deliberately
keeps `hybrid+rerank`, because a lab that skipped three of the four stages would
have nothing to show. The library default and the application default disagree,
and the application is the one these numbers describe.

### Generation quality (`vector`, LLM-judge)

| Metric | Mean | Coverage |
|---|---|---|
| Faithfulness | 0.909 | 31/31 |
| Answer Relevancy | 0.690 | 31/31 |
| Context Precision | 0.332 | 31/31 |
| **Abstention** (unanswerable only) | **1.000** | 10/10 |

Abstention is the metric worth pointing at. On all 10 questions the corpus cannot
answer, the model declined instead of inventing a fact, and said which source it
had checked. Context precision is the weakest number and the reason fusion
tuning is next.

The unanswerable set is built to ask for facts that are *absent from records that
are present*, such as Flipkart's last funding round, Razorpay's headcount, or
Zomato's share price. That is a harder test than asking about absent companies,
and it survives the corpus growing.

### These numbers went down, and that is the interesting part

An earlier report (2026-08-08) recorded vector at hit@5 0.871, MRR 0.832 and
context precision 0.385. Six commits then changed the corpus: 32 content-free
boilerplate descriptions replaced with facts, four hand-written fixtures replaced
with real scraped articles, four Wikipedia disambiguation pages rejected, sector
vocabulary normalized. Retrieval measured *worse* afterwards, not better.

The first hypothesis was wrong. The replacement stubs shared a clause, "which
places it among India's unicorns", byte-identical across 28 records and about a
quarter of each one, which looked like the same defect as the boilerplate it
replaced. Removing it moved almost nothing: recall@5 went 0.809 to 0.825, context
precision 0.313 to 0.332, and `hybrid` went 0.710 down to **0.613**. It was kept
anyway, because filler repeated across records is wrong on its own terms, but it
does not explain the drop.

What remains is the corpus itself being genuinely different. Real Wikipedia leads
are longer and carry more tangential prose than a one-line stub, five more
companies compete for every query, and full-text ranking is sensitive to document
length, which is the most likely reason `hybrid` moved most. On n=41 a single
question flipping is worth 0.024 of hit@5, so several of these deltas are two or
three questions wide, which is the same instability the golden-set sizing note is
about.

The honest summary: the corpus got more truthful and the retrieval metrics got
slightly worse, and the ranking of the three modes did not change.

Eval code lives in `apps/evals`. `EVALUATION.md` and `evaluation.json` are
generated by `bun run eval` and should not be hand-edited.

## Deployment

The live deployment described below was decommissioned on 2026-08-22 to stop GCP billing. This section is kept as a runbook for standing it back up.

### Recommended target architecture

- **API:** GCP Cloud Run. The image ships the BGE models and is roughly 1.5 GB
  compressed, running on 4 vCPU so cross-encoder reranking returns in about 4.5
  seconds instead of about 20.
- **Web:** Vercel.
- **Database:** Supabase Postgres with `pgvector` enabled.

### Required environment variables

**API / Cloud Run**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` or `ISRA_DATABASE_URL` | Postgres connection string |
| `OPENROUTER_API_KEY` | LLM access for `/chat` |
| `ISRA_OPENROUTER_API_KEY` | LLM access for evals |
| `ISRA_CORS_ORIGINS` | Comma-separated allowed origins for direct API calls (default `*`) |
| `ISRA_TRUSTED_PROXY_HOPS` | Proxy hops appended to `X-Forwarded-For` (default `1`, correct for Cloud Run). Set `0` when no proxy sits in front, or rate limits key on the proxy address instead of the caller |
| `ISRA_DAILY_CHAT_LIMIT` | Answers the open demo will generate per UTC day (default `200`). `0` stops answering, `-1` removes the cap |
| `ISRA_PROXY_SECRET` | Shared with the web app so the API can trust the forwarded caller address. **Must match `ISRA_PROXY_SECRET` on Vercel** or every visitor shares one rate-limit bucket |
| `ISRA_ADMIN_KEY` | Shared key required by `POST /ingest`. **Unset means /ingest is closed**, so a deployment that forgets it fails closed rather than open |
| `ISRA_LANGFUSE_PUBLIC_KEY` *(optional)* | Langfuse tracing |
| `ISRA_LANGFUSE_SECRET_KEY` *(optional)* | Langfuse tracing |
| `ISRA_LANGFUSE_HOST` *(optional)* | Langfuse host URL |

**Web / Vercel**

| Variable | Purpose |
|---|---|
| `API_URL` | Deployed FastAPI endpoint (required in production) |
| `ISRA_PROXY_SECRET` | Must match the API's value, so the API can trust the forwarded caller IP |

The web build fails loudly if `API_URL` is missing in production. Locally it falls back to `http://localhost:8000`. There is no `AUTH_SECRET`, because with accounts gone there are no sessions to sign.

### First deploy checklist

1. Provision Postgres and enable the `pgvector` extension.
2. Run `packages/retrieval/src/isra_retrieval/schema.sql` to create tables.
3. Deploy the API and confirm `/health` returns `ok`.
4. Run ingest once against the deployed API or directly against the database.
5. Set `API_URL` to the live API endpoint and deploy the web app.

## Development workflow

```bash
bun run dev       # turbo dev, starts API + web concurrently
bun run build     # turbo build
bun run lint      # turbo lint
bun run test      # turborepo test task (web + contracts)
```

Run Python tests individually:

```bash
uv sync --all-packages
uv run --directory packages/retrieval pytest
uv run --directory apps/api pytest
uv run --directory apps/ingest pytest
uv run --directory apps/evals pytest
```

### Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and pull
request: the four Python suites against a real `pgvector` service container, plus
the web app's lint, unit tests and production build.

The retrieval integration tests bind to `ISRA_TEST_DATABASE_URL` (default
`postgresql://isra:isra@localhost:5432/isra`) and **deliberately ignore**
`DATABASE_URL`. They insert and delete rows, and `isra_retrieval.db` calls
`load_dotenv()` on import, so without that separation a local test run would
write to whatever database `.env` points at. They skip when no test database is
reachable.

## Security notes

- `.env*` files are gitignored. Do not commit secrets.
- LLM API keys live server-side only, and the Next.js UI proxies all API calls.
- Docker Compose exposes Postgres on `localhost:5432` with weak local credentials. Do not expose it to a network.

## Project documentation

- [`AGENTS.md`](AGENTS.md) is the onboarding reference for contributors and AI coding agents.
- [`EVALUATION.md`](EVALUATION.md) holds the latest retrieval and generation metrics.
- [`apps/web/README.md`](apps/web/README.md) has frontend-specific notes.

## License

MIT
