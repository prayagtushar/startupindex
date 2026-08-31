import asyncio
import json
import logging
import os
import re
import secrets
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from psycopg.rows import dict_row
from pydantic import BaseModel, Field

from isra_retrieval.pipeline import (
    RetrievalTrace,
    retrieve,
    retrieve_debug,
    retrieve_stages,
)
from isra_retrieval.db import get_conn

from src.budget import DailyBudget
from src.config import settings
from src.llm import stream_answer
from src.rate_limit import _RULES, RateLimiter, resolve_client

try:
    from langfuse import Langfuse

    _langfuse = (
        Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
        )
        if (settings.langfuse_public_key and settings.langfuse_secret_key)
        else None
    )
except Exception:
    logging.getLogger(__name__).warning("Langfuse init failed; tracing disabled", exc_info=True)
    _langfuse = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Flush any buffered traces on shutdown (SIGTERM on Cloud Run, etc.).
    if _langfuse:
        _langfuse.flush()


app = FastAPI(title="Indian Startup Research Assistant API", lifespan=lifespan)

# Set ISRA_CORS_ORIGINS to the deployed domain in production; locally allow everything.
_cors_origins = os.environ.get("ISRA_CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_rate_limiter = RateLimiter(rules=_RULES)

# Cloud Run appends one hop to X-Forwarded-For. Set 0 when running with no proxy in front.
_TRUSTED_PROXY_HOPS = int(os.environ.get("ISRA_TRUSTED_PROXY_HOPS", "1"))


# Shared with the Next.js proxy so it can name the real caller. Unset means ignore it.
_PROXY_SECRET = os.environ.get("ISRA_PROXY_SECRET") or None

# Guards the only write endpoint. Unset means /ingest is closed entirely.
_ADMIN_KEY = os.environ.get("ISRA_ADMIN_KEY") or None

# Answers per UTC day across everyone. 0 stops answering without a redeploy, -1 removes the cap.
_daily_chat_budget = DailyBudget(
    limit=int(os.environ.get("ISRA_DAILY_CHAT_LIMIT", "200"))
)


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    caller = resolve_client(
        proxy_client_ip=request.headers.get("x-isra-client-ip"),
        proxy_secret_header=request.headers.get("x-isra-proxy-secret"),
        proxy_secret=_PROXY_SECRET,
        forwarded_for=request.headers.get("x-forwarded-for"),
        peer=request.client.host if request.client else None,
        trusted_hops=_TRUSTED_PROXY_HOPS,
    )
    decision = _rate_limiter.check(caller, request.url.path)
    if not decision.allowed:
        return JSONResponse(
            status_code=429,
            content={
                "detail": (
                    f"Rate limit exceeded: {decision.limit} requests per "
                    f"{int(decision.window_seconds)}s. "
                    f"Retry in {decision.retry_after}s."
                )
            },
            headers={
                "Retry-After": str(decision.retry_after),
                "X-RateLimit-Limit": str(decision.limit),
                "X-RateLimit-Remaining": "0",
            },
        )

    response = await call_next(request)
    if decision.limit:
        response.headers["X-RateLimit-Limit"] = str(decision.limit)
        response.headers["X-RateLimit-Remaining"] = str(decision.remaining)
    return response


class HealthResponse(BaseModel):
    status: str

@app.get("/health", response_model=HealthResponse)
async def health():
    try:
        with get_conn() as conn:
            conn.execute("SELECT 1")
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return {"status": "ok"}

class SearchRequest(BaseModel):
    # Bounded like ChatRequest: both search endpoints are open and both run the cross-encoder.
    query: str = Field(..., min_length=1, max_length=600)
    top_k: int = Field(default=5, ge=1, le=10)
    mode: Literal["vector", "hybrid", "hybrid+rerank"] = "vector"

class SearchResult(BaseModel):
    id: int
    startup_name: str
    chunk_index: int
    text: str
    source_url: str
    score: float

class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]

@app.post("/search", response_model=SearchResponse)
async def search(req: SearchRequest):
    span = None
    if _langfuse:
        span = _langfuse.start_observation(
            as_type="retriever",
            name="search",
            input={"query": req.query, "mode": req.mode},
        )

    try:
        chunks = await asyncio.to_thread(retrieve, req.query, req.top_k, req.mode)

        results = [
            SearchResult(
                id=c.id,
                startup_name=c.startup_name,
                chunk_index=c.chunk_index,
                text=c.text,
                source_url=c.source_url,
                score=c.score,
            )
            for c in chunks
        ]

        if span:
            # Root-observation output becomes the trace output automatically in v4.
            span.update(output={"results": [r.model_dump() for r in results]})

        return SearchResponse(query=req.query, results=results)
    finally:
        if span:
            span.end()

def _chunk_to_json(c) -> dict:
    return {
        "id": c.id,
        "startup_name": c.startup_name,
        "chunk_index": c.chunk_index,
        "text": c.text,
        "source_url": c.source_url,
        "score": c.score,
    }

async def _search_trace_stream(query: str, top_k: int, mode: str):
    """Emit one event per stage as it finishes, advanced in a worker thread so the loop keeps running."""
    span = None
    if _langfuse:
        span = _langfuse.start_observation(
            as_type="retriever",
            name="search_trace",
            input={"query": query, "mode": mode},
        )

    stages = retrieve_stages(query, top_k=top_k, mode=mode)
    finished = object()

    def advance():
        try:
            return next(stages)
        except StopIteration:
            return finished

    emitted: list[str] = []
    try:
        while True:
            event = await asyncio.to_thread(advance)
            if event is finished:
                break
            emitted.append(event["name"])
            payload = {
                "type": "stage",
                "name": event["name"],
                "elapsed_ms": round(event["elapsed_ms"], 1),
                "total": event["total"],
                "results": [_chunk_to_json(c) for c in event["results"]],
            }
            yield f"data: {json.dumps(payload)}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'stages': emitted})}\n\n"
        if span:
            span.update(output={"stages": emitted})
    except Exception as exc:
        logging.exception("search trace failed")
        yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
    finally:
        stages.close()
        if span:
            span.end()

@app.post("/search/trace")
async def search_trace(req: SearchRequest):
    """Server-sent events, one per retrieval stage. Inherits /search's limit by prefix."""
    return StreamingResponse(
        _search_trace_stream(req.query, req.top_k, req.mode),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class ChatRequest(BaseModel):
    # /chat is open to anyone, so these caps bound the prompt a single call can produce.
    question: str = Field(..., min_length=1, max_length=600)
    history: list[HistoryTurn] | None = Field(default=None, max_length=10)
    top_k: int = Field(default=5, ge=1, le=10)
    mode: Literal["vector", "hybrid", "hybrid+rerank"] = "vector"
    trace: bool = False

_CITATION_RE = re.compile(r"\[Source\s+(\d+)\]")

def _extract_citations(answer: str, sources: list[dict]) -> list[dict]:
    cited = set()
    for match in _CITATION_RE.finditer(answer):
        try:
            idx = int(match.group(1)) - 1
        except ValueError:
            continue
        if 0 <= idx < len(sources):
            cited.add(idx)
    return [sources[i] for i in sorted(cited)]

def _trace_to_json(trace: RetrievalTrace) -> dict:
    return {
        "mode": trace["mode"],
        "latency_ms": trace["latency_ms"],
        "stages": [
            {
                "name": stage["name"],
                "results": [
                    {
                        "id": c.id,
                        "startup_name": c.startup_name,
                        "chunk_index": c.chunk_index,
                        "text": c.text,
                        "source_url": c.source_url,
                        "score": c.score,
                    }
                    for c in stage["results"]
                ],
            }
            for stage in trace["stages"]
        ],
    }

async def _chat_stream(
    question: str, top_k: int, mode: str, history: list[dict] | None = None, trace: bool = False
):
    def chunks_from_trace(trace_result: RetrievalTrace):
        if mode == "vector":
            stage_name = "vector"
        elif mode == "hybrid":
            stage_name = "fusion"
        else:
            stage_name = "rerank"
        for stage in trace_result["stages"]:
            if stage["name"] == stage_name:
                results = stage["results"]
                if stage_name != "rerank":
                    results = results[:top_k]
                return results
        return []

    chunks = None
    if trace and settings.enable_retrieval_trace:
        try:
            trace_result = await asyncio.to_thread(
                retrieve_debug, question, top_k, mode
            )
            yield f"data: {json.dumps({'type': 'trace', 'trace': _trace_to_json(trace_result)})}\n\n"
            chunks = chunks_from_trace(trace_result)
        except Exception:
            logging.exception("Retrieval trace failed")

    if chunks is None:
        try:
            chunks = await asyncio.to_thread(retrieve, question, top_k, mode)
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
            return

    sources = [
        {
            "id": c.id,
            "startup_name": c.startup_name,
            "chunk_index": c.chunk_index,
            "text": c.text,
            "source_url": c.source_url,
            "score": c.score,
        }
        for c in chunks
    ]
    yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

    # Sources are free to serve, so they go out even when the answer budget is gone.
    spend = _daily_chat_budget.try_spend()
    if not spend.allowed:
        hours = max(1, round(spend.resets_in_seconds / 3600))
        yield (
            "data: "
            + json.dumps(
                {
                    "type": "error",
                    "message": (
                        "The public demo has reached today's answer limit. "
                        f"It resets in about {hours}h. Search and the retrieval "
                        "lab are unaffected — they don't call the model."
                    ),
                }
            )
            + "\n\n"
        )
        return

    answer = ""
    try:
        async for token in stream_answer(question, chunks, history=history):
            answer += token
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
    except Exception as exc:
        yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
        return

    citations = _extract_citations(answer, sources)
    yield f"data: {json.dumps({'type': 'done', 'answer': answer, 'citations': citations})}\n\n"

@app.post("/chat")
async def chat(req: ChatRequest):
    history = [{"role": h.role, "content": h.content} for h in (req.history or [])]
    stream = _chat_stream(req.question, req.top_k, req.mode, history, req.trace)

    if _langfuse:
        span = _langfuse.start_observation(
            name="chat",
            input={"question": req.question, "mode": req.mode, "history": history},
        )

        # Bind the inner generator to its own name: `stream` is rebound below and would self-consume.
        inner = stream

        async def _wrapped():
            answer = ""
            try:
                async for event in inner:
                    yield event
                    try:
                        data = json.loads(event.removeprefix("data: "))
                    except Exception:
                        continue
                    if data.get("type") == "token":
                        answer += data.get("content", "")
                    elif data.get("type") == "done":
                        span.update(output={"answer": answer, "citations": data.get("citations", [])})
            finally:
                span.end()

        stream = _wrapped()

    return StreamingResponse(stream, media_type="text/event-stream")

class FeedbackRequest(BaseModel):
    query: str
    answer: str | None = None
    thumbs: bool
    comment: str | None = None

@app.post("/feedback")
async def feedback(req: FeedbackRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO feedback (query, answer, thumbs, comment) VALUES (%s, %s, %s, %s)",
                (req.query, req.answer, req.thumbs, req.comment),
            )
            conn.commit()
    return {"status": "ok"}

class StartupOut(BaseModel):
    id: int
    name: str
    normalized_name: str | None = None
    one_liner: str | None = None
    description: str
    sectors: list[str] = []
    tags: list[str] = []
    founders: list[str] = []
    founded_year: int | None = None
    headquarters: str | None = None
    fundings: float | None = None
    source_url: str

class StartupsResponse(BaseModel):
    total: int
    startups: list[StartupOut]

_STARTUP_COLUMNS = (
    "id, name, normalized_name, one_liner, description, "
    "sectors, tags, founders, founded_year, headquarters, fundings, source_url"
)

@app.get("/startups", response_model=StartupsResponse)
async def list_startups(
    limit: int = Query(24, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: str | None = None,
    sector: str | None = None,
):
    conditions: list[str] = []
    params: list = []
    if q:
        conditions.append("(name ILIKE %s OR one_liner ILIKE %s OR description ILIKE %s)")
        like = f"%{q}%"
        params += [like, like, like]
    if sector:
        conditions.append("%s = ANY(sectors)")
        params.append(sector)
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(f"SELECT COUNT(*) AS n FROM startups{where}", params)
            total = cur.fetchone()["n"]
            cur.execute(
                f"SELECT {_STARTUP_COLUMNS} FROM startups{where}"
                " ORDER BY name ASC NULLS LAST, id ASC LIMIT %s OFFSET %s",
                [*params, limit, offset],
            )
            rows = cur.fetchall()

    items = [
        StartupOut(
            id=r["id"],
            name=r["name"] or "",
            normalized_name=r["normalized_name"],
            one_liner=r["one_liner"],
            description=r["description"] or "",
            sectors=r["sectors"] or [],
            tags=r["tags"] or [],
            founders=r["founders"] or [],
            founded_year=r["founded_year"],
            headquarters=r["headquarters"],
            fundings=r["fundings"],
            source_url=r["source_url"],
        )
        for r in rows
    ]
    return StartupsResponse(total=total, startups=items)

_INGEST_DIR = Path(__file__).resolve().parents[2] / "ingest"
_ingest_running = False

class IngestRequest(BaseModel):
    limit: int | None = None
    refresh: bool = True


def _ingest_env() -> dict[str, str]:
    # The ingest subprocess reads plain DATABASE_URL; deployed containers only get the ISRA_ one.
    return {
        **os.environ,
        "PYTHONPATH": str(_INGEST_DIR),
        "DATABASE_URL": settings.database_url,
    }


async def _ingest_stream(limit: int | None, refresh: bool):
    global _ingest_running
    cmd = [sys.executable, "-m", "src", "--progress"]
    if refresh:
        cmd.append("--no-cache")
    if limit is not None:
        cmd += ["--limit", str(limit)]
    env = _ingest_env()

    proc = None
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(_INGEST_DIR),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        assert proc.stdout is not None
        async for raw in proc.stdout:
            line = raw.decode(errors="replace").strip()
            if not line:
                continue
            try:
                json.loads(line)
            except ValueError:
                continue
            yield f"data: {line}\n\n"
        await proc.wait()
        if proc.returncode != 0:
            tail = ""
            if proc.stderr is not None:
                tail = (await proc.stderr.read()).decode(errors="replace")[-500:]
            msg = tail.strip() or f"Ingest exited with code {proc.returncode}."
            yield f"data: {json.dumps({'type': 'error', 'message': msg})}\n\n"
    except Exception as exc:
        yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
    finally:
        if proc is not None and proc.returncode is None:
            proc.terminate()
        _ingest_running = False

@app.post("/ingest")
async def ingest(req: IngestRequest, x_isra_admin_key: str | None = Header(default=None)):
    global _ingest_running

    # The one write endpoint. An unset key refuses everything, so a missed config fails closed.
    if not _ADMIN_KEY or not x_isra_admin_key or not secrets.compare_digest(
        x_isra_admin_key, _ADMIN_KEY
    ):
        raise HTTPException(
            status_code=401,
            detail="Ingesting data needs the admin key. Reading is open to everyone.",
        )

    if _ingest_running:
        body = json.dumps(
            {"type": "error", "message": "An ingest is already running."}
        )
        return StreamingResponse(
            iter([f"data: {body}\n\n"]), media_type="text/event-stream"
        )
    _ingest_running = True
    return StreamingResponse(
        _ingest_stream(req.limit, req.refresh), media_type="text/event-stream"
    )
