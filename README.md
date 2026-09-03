# StartupIndex

Search and question answering over 116 Indian startups, with every claim traced
back to the chunk it came from.

**[Live demo](https://isra.prayagtushar.xyz)** · no signup

The retrieval pipeline is written from primitives. No LangChain, no Ragas, no
DeepEval. Vector search and Postgres full-text search feed RRF fusion, then a BGE
cross-encoder, then streaming generation. The evaluation harness is hand-rolled
too, which is the part that matters, because it is what caught the design being
wrong.

## The finding

I built the sophisticated pipeline first. Then I measured it against plain vector
search, and plain vector search won.

| Mode | hit@5 | recall@5 | MRR |
|---|---|---|---|
| **vector** | **0.839** | **0.825** | **0.756** |
| hybrid | 0.613 | 0.583 | 0.632 |
| hybrid+rerank | 0.774 | 0.755 | 0.748 |

The cross-encoder also costs 7,033 ms against 145 to 155 ms for every stage
before it combined, roughly 45 times the rest. So the application sends `vector`,
and the elaborate path survives only in `/lab`, where you can watch all four
stages resolve and see exactly where fusion loses ground.

Breaking it down by question type shows the mechanism:

| Mode | direct | paraphrase | multi_hop |
|---|---|---|---|
| vector | **0.917** | **1.000** | 0.500 |
| hybrid | 0.667 | 0.818 | 0.250 |
| hybrid+rerank | 0.750 | 1.000 | 0.500 |

RRF fusion loses direct lookups, 0.917 down to 0.667, because keyword hits
displace the chunk vector search already had in first place. The cross-encoder
recovers part of that, 0.667 back to 0.750, and no more. Fusion is under-tuned
rather than wrong in principle, and tuning its weighting is the obvious next
step.

One wrinkle, because the code does not read the way that paragraph does.
`retrieve()` still declares `mode: str = "hybrid+rerank"`. The web proxy
overrides it to `vector` on `/search` and `/chat`, which is what makes vector the
effective default in the running application. `/lab` keeps `hybrid+rerank`
deliberately, since a lab that skipped three of four stages would have nothing to
show.

## Scope

The corpus is 116 startups scraped from Wikipedia's unicorn list and Y
Combinator's directory. It is small and verifiable on purpose, not a web-scale
index. At this size the interesting engineering is measuring retrieval quality
rather than scaling it, and every number here is reported as measured, including
the ones that contradict the design.

![The retrieval lab: four pipeline stages, each shown as it completes](assets/lab.png)

One query, four stages, streamed as each finishes. The arrows track every chunk's
movement against the stage it is meant to improve on, which makes fusion's cost
to direct lookups visible rather than merely reported.

![The chat: a multi-hop answer with inline citations beside its retrieval trace](assets/chat.png)

Every claim carries an inline citation, and the trace panel shows the ranked
candidates that produced it. On a question the corpus cannot answer, the model
declines and names the source it checked.

## Design decisions

**No LangChain.** Ranking, fusion and citation behaviour stay under direct
control, and I can explain every line of the retrieval path.

**No Ragas or DeepEval.** The LLM judge calls OpenRouter directly, which avoids
pulling in the LangChain dependency family for one function.

**One database.** Postgres 16 holds vectors in `pgvector` and keyword indexes in
`tsvector`. No second datastore to keep in sync.

**Streaming everywhere.** `/chat` sends sources over SSE before the answer
starts, so the page fills in as retrieval lands instead of waiting on generation.

## Architecture

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

`apps/ingest` scrapes both sources, merges them, deduplicates by
`normalized_name`, chunks, embeds with `BAAI/bge-small-en-v1.5` at 384 dimensions
and loads Postgres.

`packages/retrieval` exposes `retrieve(query, top_k, mode)` across three modes.
Vector search runs cosine similarity over pgvector. Keyword search runs Postgres
full-text. RRF combines the two ranked lists, and the cross-encoder reranks the
result when asked.

`apps/api` builds the prompt, streams tokens over SSE, and returns a validated
citations array on the `done` event.

`apps/web` proxies every `/api/*` call server-side so keys never reach the
browser. Retrieval and chat are both public, since the demo is meant to be used
without signing up. Only `/ingest` is gated, by a shared admin key, because it
rewrites the corpus.

```
apps/api          FastAPI service
apps/evals        Golden-set runner and LLM judge
apps/ingest       Scrapers, chunking, embeddings
apps/web          Next.js 16 chat UI
packages/contracts  TypeScript types generated from OpenAPI
packages/retrieval  Retrieval library and DB layer
infra             Docker Compose, Cloud Build config
```

## Stack

Python 3.11 with uv, FastAPI, Pydantic v2, psycopg 3. Next.js 16, React 19,
TypeScript 5.9, Tailwind v4, Bun and Turborepo. Postgres 16 with pgvector.
Embeddings and reranking through sentence-transformers. Generation through
OpenRouter. Optional Langfuse tracing.

## Quickstart

Requires Python 3.11+, uv, Bun 1.3.14+, and Docker for local Postgres.

```bash
uv sync
bun install
docker compose -f infra/compose.yml up -d

bun run ingest     # scrape, chunk, embed, load
bun run dev:api    # http://localhost:8000
bun run dev:web    # http://localhost:3000
```

Local database URL is `postgresql://isra:isra@localhost:5432/isra`.

Run the evaluation with `bun run eval`, or `bun run eval -- --no-generation` for
retrieval metrics only. `EVALUATION.md` and `evaluation.json` are generated by
that command and should not be hand-edited.

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check, verifies database connectivity |
| `POST` | `/search` | Ranked retrieval results |
| `POST` | `/search/trace` | One SSE event per pipeline stage |
| `POST` | `/chat` | Streaming chat over SSE |
| `POST` | `/feedback` | Store thumbs up or down |
| `GET` | `/startups` | Paginated browser data |
| `POST` | `/ingest` | Stream ingest progress. Requires `X-ISRA-Admin-Key` |

```bash
curl -N -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "Which Indian fintech unicorn was founded in 2014?", "top_k": 5}'
```

Events are `sources`, then `token` repeatedly, then `done` with the full answer
and citations, or `error`.

### Keeping the bill bounded

`/chat` is open, so nothing stands between a stranger and the LLM bill except
server-side limits. Four layers, in order of what they stop.

A global daily ceiling (`ISRA_DAILY_CHAT_LIMIT`, default 200 answers per UTC day)
is the one that actually caps spend, because per-IP limits do nothing against a
bot pool. When it is reached, `/chat` still returns sources but stops calling the
model and says so. Set it to `0` to halt answering without a redeploy, or `-1` to
remove the cap.

Per-IP rate limits stop a single visitor hammering the demo. Over-limit requests
get `429` with `Retry-After`.

| Endpoint | Limit |
|---|---|
| `/chat` | 15 / hour |
| `/ingest` | 3 / hour |
| `/search` | 30 / min, shared with `/search/trace` |
| `/feedback` | 20 / min |
| `/startups` | 60 / min |

Requests are bounded. `question` and `query` cap at 600 characters, history at 10
turns, `top_k` at 10, completions at 1024 tokens.

A GCP billing budget is the backstop, since the daily counter lives in process
and a restart resets it.

Two things this depends on. The web app calls the API server-side, so the API
would otherwise see every visitor as one hosting egress IP. The proxy forwards
the caller's address and the API trusts it only when `ISRA_PROXY_SECRET` matches
on both sides. Set it, or per-IP limits collapse into one shared bucket. And the
limits are held in process, which is correct only at `--max-instances 1`. Scaling
past one instance makes them per-instance and they would need a shared store.

## Evaluation

Generated 2026-08-11 over 41 questions at top_k 5, judged by
`anthropic/claude-haiku-4.5`. Four question types, because one phrasing measures
one thing.

| Category | n | What it tests |
|---|---|---|
| `direct` | 12 | Plain entity lookup |
| `paraphrase` | 11 | Colloquial phrasing, misspellings, indirect description |
| `multi_hop` | 8 | Questions needing every one of several startups retrieved |
| `unanswerable` | 10 | Plausible questions the corpus cannot answer |

Retrieval numbers are in [the finding](#the-finding). Generation, on `vector`:

| Metric | Mean | Coverage |
|---|---|---|
| Faithfulness | 0.909 | 31/31 |
| Answer relevancy | 0.690 | 31/31 |
| Context precision | 0.332 | 31/31 |
| **Abstention** (unanswerable only) | **1.000** | 10/10 |

Abstention is the number worth pointing at. On all 10 questions the corpus cannot
answer, the model declined instead of inventing a fact, and said which source it
checked. The unanswerable set asks for facts absent from records that are
present, such as Flipkart's last funding round or Zomato's share price. That is
harder than asking about absent companies, and it survives the corpus growing.

Context precision is the weakest number and the reason fusion tuning is next.

### The numbers went down

An earlier report on 2026-08-08 recorded vector at hit@5 0.871, MRR 0.832 and
context precision 0.385. Six commits then changed the corpus. I replaced 32
content-free boilerplate descriptions with facts, swapped four hand-written
fixtures for real scraped articles, rejected four Wikipedia disambiguation pages
and normalized sector vocabulary. Retrieval measured worse afterwards.

My first hypothesis was wrong. The replacement stubs shared a clause, "which
places it among India's unicorns", byte-identical across 28 records and about a
quarter of each one, which looked like the same defect as the boilerplate it
replaced. Removing it moved almost nothing. recall@5 went 0.809 to 0.825, context
precision 0.313 to 0.332, and `hybrid` fell from 0.710 to 0.613. I kept the
change anyway, because filler repeated across records is wrong on its own terms,
but it does not explain the drop.

What remains is the corpus being genuinely different. Real Wikipedia leads are
longer and carry more tangential prose than a one-line stub, five more companies
compete for every query, and full-text ranking is sensitive to document length,
which is the most likely reason `hybrid` moved most. At n=41 a single question
flipping is worth 0.024 of hit@5, so several of these deltas are two or three
questions wide.

The corpus got more truthful, the metrics got slightly worse, and the ranking of
the three modes did not change.

## Deployment

The API runs on Cloud Run in `asia-south1`, the web app on Vercel, and Postgres
on Supabase through the session pooler, because Supabase now serves the direct
`db.<ref>` hostname over IPv6 only.

Build with [`infra/cloudbuild.yaml`](infra/cloudbuild.yaml) rather than `gcloud
builds submit --tag`. The Dockerfile uses `RUN --mount=type=cache`, which needs
BuildKit, and the default builder does not enable it.

Deploy with `--min-instances=0`, `--max-instances=1` and no load balancer. An
external HTTP load balancer bills around $18 a month whether or not anyone
visits, and it does not scale to zero. At `min-instances=0` with CPU throttling
on, Cloud Run bills only while a request runs, so the demo costs effectively
nothing. The cost is a cold start of about 30 seconds while the two BGE models
load, which a ten-minute keep-warm ping covers.

Environment variables are listed in [`.env.example`](.env.example). Two are worth
calling out. `ISRA_PROXY_SECRET` must match between the API and the web app or
per-IP limits collapse. `ISRA_ADMIN_KEY` gates `/ingest`, and leaving it unset
closes the endpoint rather than opening it.

## License

MIT
