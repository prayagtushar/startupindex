# Evaluation — StartupIndex

**The project is archived** (live deployment torn down 2026-08-22), but every
number here is reproducible offline: `evaluation.json` holds the raw run and the
harness needs no deployment.

Read the mode comparison first. **Plain vector search beats the full pipeline** —
0.839 hit@k against 0.774 for hybrid+rerank and 0.613 for hybrid. The
cross-encoder costs roughly 45× the rest of the pipeline combined and, on this
corpus, buys back ground that fusion lost rather than adding anything. That is
the headline finding, and it contradicts the design.

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

## How to read these

**Context Precision 0.332 is the weak number**, and it is the one to volunteer.
It says roughly two thirds of retrieved context is not used by the answer, which
at `top_k=5` on a 116-startup corpus means the retriever is padding. Faithfulness
0.909 says the generator is not inventing on top of that padding, which is the
more dangerous failure and the one that stayed contained.

**n=41 is small.** Several deltas between modes are two or three questions wide
and individually indistinguishable from noise. What survives is the direction
being consistent across every metric and the mode ranking being stable. Growing
the question set is the precondition for any stronger claim.

**Abstention 1.000 on 10 questions** means the model declined every unanswerable
question it was given. Ten is few enough that this should be read as "no observed
failures", not as a rate.
