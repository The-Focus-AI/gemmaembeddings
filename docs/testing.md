# Testing

This file is the repository's testing and release record (`handbook/release.md`).

## Checks

| Check | Workflow / Runner | Trigger | Class | Fingerprint | Owner |
| --- | --- | --- | --- | --- | --- |
| `lint` (`tsc --noEmit` + `markdownlint-cli2`) | `.github/workflows/ci.yml` (`check`) | `pull_request`, `push` (`main`) | blocking | `fp:ci:ci.yml:check` | repo |
| `test` (`bun test`) | `.github/workflows/ci.yml` (`check`) | `pull_request`, `push` (`main`) | blocking | `fp:ci:ci.yml:check` | repo |
| `bench` (`mise run bench`) | Local Ollama (`embeddinggemma-2:latest`) | manual / pre-review | advisory (local model) | `fp:eval:bench:embeddinggemma-2` | repo |

`mise run lint` and `mise run test` run offline without network or GPU dependencies:

- `tests/lab.test.ts` exercises Matryoshka (`768d`/`512d`/`256d`/`128d`) slicing and L2 renormalization, EmbeddingGemma 2 task-steered prompt formatting, programmatic PNG scene generation, `@libsql/client` `F32_BLOB` DiskANN vector indexing, SQLite `FTS5` BM25 search, Reciprocal Rank Fusion (RRF), and all HTTP endpoints in `src/app.ts`.
- Branch protection is not configured until a GitHub remote is created and an authorized owner enables required status checks.

## Preview verification

N/A for cloud PR previews: this is a non-deploying local research lab (`mise run deploy` fails closed by design).
Local web UI (`Bun.serve()` at `http://127.0.0.1:3456`) is verified via HTTP handler integration tests in `tests/lab.test.ts` and live smoke checks against `/api/status`, `/api/seed`, `/api/search`, `/api/matrix`, and `/api/bench`.

## Benchmarks and thresholds

Live evaluation corpus (`src/corpus.ts`) and runner (`src/experiments.ts`, invoked via `mise run bench` against `embeddinggemma-2:latest`):

1. **Hybrid Search vs Vector vs FTS5 (`15` queries across multi-section documents, semantic paraphrases, homonyms, exact tokens, code, and cross-lingual):** evaluates `Hit@1`, `Hit@3`, and `MRR`.
2. **Task-Steered Instruction Prefixes A/B:** compares unprefixed embeddings vs EmbeddingGemma 2 `task:` instruction prefixes (`Hit@1`, `MRR`, and cosine margin $\Delta$ over distractors).
3. **Matryoshka Representation Learning (MRL) Truncation:** evaluates `768d`, `512d`, `256d`, and `128d` DiskANN indexes in libSQL (`Hit@1`, `MRR`, Top-3 overlap vs `768d`, mean cosine drift, and byte footprint).
4. **Zero-Caption Multimodal Retrieval (`11` sensory queries across `5` visual PNG scenes, `3` zero-OCR scanned `VisDoc` PNG pages, and `3` `16 kHz` PCM WAV audio clips):** evaluates `Hit@1` and `MRR` overall and per sensory modality.
5. **Multi-Page PDF Papers & PowerPoint Decks (`mise run bench:docs`, `76` PDF pages + `14` `.pptx` slides):** compares `Vision-Only PNG`, `Extracted Text + Speaker Notes`, `Fused Bimodal`, and `Hybrid RRF` across diagrams, LaTeX equations, visual-only charts, and hidden presenter notes.

Owner-ratified production gating thresholds: not yet recorded (research benchmark repo).

## Sign-off gates

N/A — non-deploying local research repository (`mise run deploy` exits `1` with explicit reason).

## Alerting

Not configured — open gap if pushed to a remote default branch with active GitHub Actions CI (`handbook/release.md`).
