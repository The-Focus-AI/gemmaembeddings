# gemmaembeddings

Local **EmbeddingGemma 2** (`embeddinggemma-2:latest`, 740M parameters) research lab, 5-part benchmark suite, and interactive **Swiss International Style** web studio built with **Bun**, **TypeScript**, **`pnpm`**, **`mise`**, **MuPDF WASM**, **PptxGenJS + JSZip**, and **`@libsql/client`** (embedded SQLite with native DiskANN `F32_BLOB` vector indexes + SQLite `FTS5` BM25 hybrid search), structured per [standards.thefocus.ai](https://standards.thefocus.ai).

Repository: [github.com/The-Focus-AI/gemmaembeddings](https://github.com/The-Focus-AI/gemmaembeddings)

## Architecture & Why `@libsql/client` (SQLite)

Google DeepMind's [`embeddinggemma-2`](https://ollama.com/library/embeddinggemma-2) couples a **270M text backbone** (100+ languages + source code), a **170M vision encoder**, and a **300M audio encoder** into a single **768-dimensional unit hypersphere**, trained with **Matryoshka Representation Learning (MRL)** (`768d -> 512d -> 256d -> 128d`).

Standard macOS system SQLite disables `sqlite3_load_extension`, making native C vector extensions brittle across laptops and Linux CI runners. `@libsql/client` (`file:data/embeddings.db`) keeps everything in one zero-daemon SQLite file:

1. **Native Matryoshka Vector Columns:** `F32_BLOB(768)`, `F32_BLOB(512)`, `F32_BLOB(256)`, and `F32_BLOB(128)` with built-in **DiskANN** cosine indexes (`libsql_vector_idx(..., 'metric=cosine')`) and `vector_top_k()`.
2. **Bimodal Multi-Page Document Tables:** `doc_bundles` + `doc_pages` store three distinct `768d` lenses per PDF page or PowerPoint slide—`emb_vis` (pure rasterized PNG), `emb_txt` (extracted text + hidden Presenter Speaker Notes), and `emb_fused` (`{ image, text }` bimodal).
3. **Unified Hybrid Reciprocal Rank Fusion (RRF):** Combines dense cosine similarity with SQLite `FTS5` (`bm25()`) across `items_fts` and `doc_pages_fts` so neither zero-overlap paraphrases nor 3 a.m. exact error codes (`ERR_UPSTREAM_RST_499`) fall through the cracks.

## Indexed Corpus (122 Searchable Units Across 8 Formats)

| Table / Collection | Count | Contents |
| --- | ---: | --- |
| `items` (`document`) | 3 | Full Markdown engineering docs (`ADR-014` Idempotency, `Postmortem #209` EU-West 502s, `RFC-008` Hybrid SQLite Search) |
| `items` (`visdoc`) | 3 | Zero-OCR bitmap PNG pages (`Invoice #4082`, `Redis SLO Breach Report`, `Q3 ARR Table`) with `content = ""` |
| `items` (`image`) | 5 | Procedural `160x160` visual scenes (`stop sign`, `ocean sunset`, `pine tree`, `bar chart`, `terminal code`) with `content = ""` |
| `items` (`audio`) | 3 | Playable `16 kHz` 16-bit mono PCM WAV clips (`emergency siren`, `ocean surf`, `ascending chime`) with `content = ""` |
| `items` (`code`) | 5 | TypeScript `TokenBucket`, Python jitter backoff, SQL `WITH RECURSIVE` CTE, Rust `RingBuffer`, Go worker pool |
| `items` (`text`) | 13 | Homonym traps (`Java` JVM vs coffee, `Mercury` orbit vs liquid metal), exact error runbooks, and EN/ES/JA/FR notes |
| `doc_pages` (`pdf`) | 76 | 3 landmark arXiv papers rasterized via MuPDF WASM: *Attention Is All You Need* (`15p`), *ColPali* (`26p`), *Matryoshka Representation Learning* (`35p`) |
| `doc_pages` (`pptx`) | 14 | 2 OpenXML `.pptx` decks: *TheFocus.AI Q4 Board Review* (`8 slides`, visual-only waterfall chart + confidential `$42M` Speaker Notes) & *Vision Acuity Field Guide* (`6 slides`) |

## Measured Benchmark Summary (`embeddinggemma-2:latest` on Apple Silicon)

Read the narrative walkthrough in [`docs/story.md`](docs/story.md) or run every experiment interactively via `mise run dev`.

| Experiment | Key Measured Finding |
| --- | --- |
| **1. Lexical vs Vector vs Hybrid RRF** (`15` text/doc/code/multilingual cases) | `FTS5 BM25` hits `73.3% Hit@1` (`0.767 MRR`, failing on ES/JA and zero-overlap paraphrases); `768d Vector` hits `93.3% Hit@1` (`100% Hit@3`, `0.967 MRR`); `Hybrid RRF` achieves `100.0% Hit@3` while locking in exact error tokens (`ERR_UPSTREAM_RST_499`). |
| **2. Task-Steered Prefixes A/B** (`task: search result \| query: ...`) | Task prefixes widen mean cosine margin over the runner-up distractor by **+25.5%** (`0.0984 -> 0.1235`), improving separation on **14 of 15** queries (up to `+0.0641` on code retrieval). |
| **3. Matryoshka (MRL) Truncation** (`768d -> 512d -> 256d -> 128d`) | Slicing `3x` smaller to **`256d`** (`1,024 B/vec`, `97.7 MB` per 100k vectors) reaches **`100.0% Hit@1` (`1.000 MRR`)** with only `0.0190` mean cosine drift; `128d` (`6x` smaller, `512 B/vec`) retains `86.7% Hit@1` and `100.0% Hit@3`. |
| **4. Zero-Caption Multimodal** (`VisDoc` + `Image` + `Audio`, `content = ""`) | **`11 / 11 = 100.0% Hit@1` (`1.000 MRR`)**: Scanned VisDocs `3/3` (`cos 0.758-0.848`), Visual Scenes `5/5` (`cos 0.722-0.768`), and `16 kHz` WAV Audio `3/3` (`cos 0.647-0.685`). |
| **5. Multi-Page PDFs (`76p`) & `.pptx` (`14` slides) + 4-DPI X-Ray** | Pure Vision PNG hits `#1` on **7/8** cases (beating PDF text parsers on *ColPali* Table 2 and *Matryoshka* Fig 1) but drops to `#4` on hidden `.pptx` Speaker Notes (`$42M Project Horizon LOI`), where **Fused Bimodal (`{ image, text }`)** + **Hybrid RRF** hit `#1`. 4-DPI acuity curves peak at `1.0x` (`612x792`, `~125 KB`), where dense tables jump `+0.114` cosine over `0.25x` thumbnails with zero gain at `1.75x`. |

## Precise Recipes

### 1. Bootstrap Tooling & Dependencies

```sh
mise trust
mise install
mise run install
```

### 2. Pull `embeddinggemma-2` in Ollama & Seed All 122 Units

```sh
mise run model:pull
mise run seed
mise run seed:docs
```

### 3. Launch the Interactive Web Experience (`http://127.0.0.1:3456`)

```sh
mise run dev
```

Open [http://127.0.0.1:3456](http://127.0.0.1:3456) to explore:

- **`⌕ Search All` (`#sec-search`):** Unified Freeform Cross-Document Matcher across all 122 items, PDF pages, and PowerPoint slides (press `/` anywhere to focus; attach a `PNG/JPEG` or `WAV` for reverse multimodal search; filter by scope, lens, and MRL dimension; preview full pages, slides, Speaker Notes, Markdown ADRs, and audio inline).
- **`00 Corpus & Docs` (`#sec-corpus`):** Browse all 32 unit items across 6 modalities and query any item's 768d cross-modal neighborhood.
- **`01–05` Story Chapters:** Live interactive playgrounds for Lexical vs Geometry, Cross-Domain Docs/Code/100+ Languages, Task-Prefix Margin $\Delta$, Matryoshka 96-bar Coordinate Slicer, and Zero-OCR VisDoc / Scene / WAV Gallery.
- **`06 PDFs & PowerPoints` (`#sec-papers`):** 35-page activation heatmaps, 3-way Vision vs Text vs Fused lens race, **4-DPI Visual Acuity X-Ray (`0.25x -> 1.75x`)**, and custom `.pdf` / `.pptx` upload (`POST /api/docs/upload`).
- **`07 Workbench` (`#sec-ch6`):** One-at-a-time 26-case stepper, single-experiment runners, and custom multimodal ingestion.

### 4. Freeform Omni-Search from the CLI

```sh
# Unified Hybrid RRF search across all 122 corpus items, PDF pages & PowerPoint slides
mise run search -- "Scaled Dot-Product Attention diagram and Attention(Q, K, V) equation"

# Match confidential Presenter Speaker Notes inside .pptx decks
mise run search -- --scope pptx "Project Horizon confidential $42M acquisition LOI"

# Pure Vision-Only PNG search across the 76 PDF pages (ignores PDF text layer)
mise run search -- --scope pdf --lens vision "ViDoRe benchmark table comparing ColPali"

# Search with 256d Matryoshka vectors or exact SQLite FTS5 keywords
mise run search -- --dim 256 "Nebula H200 GPU cluster invoice 4082"
mise run search -- --lens fts "ERR_UPSTREAM_RST_499"
```

### 5. Run Individual Test Cases or Quantitative Benchmarks

```sh
# List all 26 unit test cases across 6 modalities and run 1 case at a time
mise run cases
mise run case -- q-hom-1
mise run case -- vd-invoice

# Compare any 2 strings head-to-head across prefixes + 768d/512d/256d/128d
mise run compare -- "Java ZGC heap pause tuning" "Volcanic Arabica coffee in East Java"

# Run individual experiments or the full benchmark suites
mise run bench:hybrid
mise run bench:prefixes -- homonym
mise run bench:mrl -- code
mise run bench:multimodal
mise run bench:docs
mise run bench
```

### 6. Run Static Lint & Offline CI Tests (No Ollama or GPU Required)

```sh
mise run lint
mise run test
```

## Project Layout

- `src/ollama.ts` — Typed Ollama `/api/embed` multimodal client (`text`, `{ image }`, `{ audio }`, and bimodal `{ text, image }`)
- `src/store.ts` — `@libsql/client` schema, DiskANN `F32_BLOB(768|512|256|128)` indexes, `FTS5` virtual tables, `inspectDocLenses`, and unified `searchOmni` RRF engine
- `src/pdf_pptx.ts` — MuPDF WASM PDF page rasterizer, PptxGenJS sample deck builder, JSZip OpenXML `.pptx` slide + Speaker Notes parser, and 4-DPI Visual Acuity X-Ray runner
- `src/corpus.ts`, `src/images.ts`, `src/audio.ts` — 6-modality reference corpus, zero-OCR bitmap document renderer, procedural PNG scenes, and `16 kHz` PCM WAV synthesizer
- `src/experiments.ts` — Quantitative evaluation runners for Experiments 1–5
- `src/app.ts`, `src/server.ts`, `src/ui.ts` — `Bun.serve()` HTTP API and Swiss International Style interactive web lab
- `docs/story.md`, `docs/testing.md` — Narrative field guide and `STD-012` testing record
