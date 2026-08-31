import json
from pathlib import Path

from src.generation_eval import GenerationReport
from src.retrieval_eval import ModeResult

_GEN_METRICS = [
    ("faithfulness", "Faithfulness"),
    ("answer_relevancy", "Answer Relevancy"),
    ("context_precision", "Context Precision"),
    ("abstention", "Abstention (unanswerable only)"),
]


def _fmt(x: float | None) -> str:
    return f"{x:.3f}" if x is not None else "n/a"


def render_markdown(
    meta: dict, mode_results: list[ModeResult], gen: GenerationReport | None
) -> str:
    lines: list[str] = []
    lines.append("# Evaluation — Indian Startup Research Assistant")
    lines.append("")
    lines.append(
        f"Generated: {meta['generated_at']} · questions: {meta['n']} · "
        f"top_k: {meta['top_k']} · model: `{meta['model']}`"
    )
    lines.append("")

    lines.append("## Retrieval mode comparison")
    lines.append("")
    lines.append(
        "Scored on answerable questions only. `hit@k` requires every expected "
        "entity for multi-hop questions; `recall@k` gives partial credit."
    )
    lines.append("")
    lines.append("| Mode | hit@k | recall@k | MRR |")
    lines.append("|------|-------|----------|-----|")
    for r in mode_results:
        lines.append(
            f"| {r.mode} | {r.hit_at_k:.3f} | {r.recall_at_k:.3f} | {r.mrr:.3f} |"
        )
    lines.append("")

    categories = sorted({c for r in mode_results for c in r.by_category})
    if categories:
        lines.append("### By question category")
        lines.append("")
        header = "| Mode | " + " | ".join(categories) + " |"
        lines.append(header)
        lines.append("|------|" + "|".join(["------"] * len(categories)) + "|")
        for r in mode_results:
            cells = []
            for category in categories:
                cat = r.by_category.get(category)
                cells.append(
                    f"{cat.hit_at_k:.3f} (n={cat.n})" if cat else "n/a"
                )
            lines.append(f"| {r.mode} | " + " | ".join(cells) + " |")
        lines.append("")

    lines.append("## Generation quality")
    lines.append("")
    if gen is None:
        lines.append(
            "_Generation scoring skipped (--no-generation or missing API key)._"
        )
    else:
        lines.append(f"Scored on mode `{gen.mode}` with a reference-free LLM-judge.")
        lines.append("")
        lines.append("| Metric | Mean | Coverage |")
        lines.append("|--------|------|----------|")
        for attr, label in _GEN_METRICS:
            scored, total = gen.coverage(attr)
            lines.append(f"| {label} | {_fmt(gen.mean(attr))} | {scored}/{total} |")
    lines.append("")
    return "\n".join(lines)


def build_json(
    meta: dict, mode_results: list[ModeResult], gen: GenerationReport | None
) -> dict:
    out: dict = {
        "meta": meta,
        "retrieval": [
            {
                "mode": r.mode,
                "hit_at_k": r.hit_at_k,
                "recall_at_k": r.recall_at_k,
                "mrr": r.mrr,
                "n": r.n,
                "by_category": {
                    name: {
                        "hit_at_k": c.hit_at_k,
                        "recall_at_k": c.recall_at_k,
                        "mrr": c.mrr,
                        "n": c.n,
                    }
                    for name, c in r.by_category.items()
                },
            }
            for r in mode_results
        ],
        "generation": None,
    }
    if gen is not None:
        out["generation"] = {
            "mode": gen.mode,
            "means": {a: gen.mean(a) for a, _ in _GEN_METRICS},
            "coverage": {a: list(gen.coverage(a)) for a, _ in _GEN_METRICS},
            "items": [
                {
                    "question": i.question,
                    "answer": i.answer,
                    "faithfulness": i.faithfulness,
                    "answer_relevancy": i.answer_relevancy,
                    "context_precision": i.context_precision,
                    "abstention": i.abstention,
                }
                for i in gen.items
            ],
        }
    return out


def write_report(
    out_path: Path,
    meta: dict,
    mode_results: list[ModeResult],
    gen: GenerationReport | None,
) -> Path:
    out_path.write_text(render_markdown(meta, mode_results, gen))
    sidecar = out_path.parent / "evaluation.json"
    sidecar.write_text(json.dumps(build_json(meta, mode_results, gen), indent=2))
    return out_path
