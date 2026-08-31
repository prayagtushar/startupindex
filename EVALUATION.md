# Evaluation — Indian Startup Research Assistant

Generated: 2026-08-11T06:00:48+00:00 · questions: 41 · top_k: 5 · model: `anthropic/claude-haiku-4.5`

## Retrieval mode comparison

Scored on answerable questions only. `hit@k` requires every expected entity for multi-hop questions; `recall@k` gives partial credit.

| Mode | hit@k | recall@k | MRR |
|------|-------|----------|-----|
| vector | 0.839 | 0.825 | 0.756 |
| hybrid | 0.613 | 0.583 | 0.632 |
| hybrid+rerank | 0.774 | 0.755 | 0.748 |

### By question category

| Mode | direct | multi_hop | paraphrase |
|------|------|------|------|
| vector | 0.917 (n=12) | 0.500 (n=8) | 1.000 (n=11) |
| hybrid | 0.667 (n=12) | 0.250 (n=8) | 0.818 (n=11) |
| hybrid+rerank | 0.750 (n=12) | 0.500 (n=8) | 1.000 (n=11) |

## Generation quality

Scored on mode `vector` with a reference-free LLM-judge.

| Metric | Mean | Coverage |
|--------|------|----------|
| Faithfulness | 0.909 | 31/31 |
| Answer Relevancy | 0.690 | 31/31 |
| Context Precision | 0.332 | 31/31 |
| Abstention (unanswerable only) | 1.000 | 10/10 |
