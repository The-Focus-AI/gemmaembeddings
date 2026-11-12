# 768 Numbers for Everything: What We Are Testing in EmbeddingGemma 2

This document tells the story behind each experiment in `gemmaembeddings`—what failure mode or capability each benchmark isolates, why naive approaches break down, and how **EmbeddingGemma 2** (`740M` parameters, `768d` shared multimodal space) paired with **SQLite (`@libsql/client`)** solves it locally.

Launch the live interactive version of this story with:

```sh
mise run dev
```

Then open [http://127.0.0.1:3456](http://127.0.0.1:3456).

---

## Prologue: Six Modalities in One SQLite File

For decades, local search meant building an inverted keyword index: split documents into words, count term frequencies (`BM25`), and match exact strings. Keyword search is fast and exact, but brittle—it matches *spelling*, not *meaning*, and it is completely blind to un-captioned images, scanned pages, and sound.

Modern dense embedding models invert the problem. Every multi-section **Architecture Decision Record (`document`)**, short note (`text`), source code file (`code`), **zero-OCR scanned PNG page (`visdoc`)**, visual scene (`image`), or **16 kHz PCM WAV clip (`audio`)** is projected onto the surface of a **768-dimensional unit hypersphere**. Distance on that sphere (cosine similarity) measures conceptual proximity across all six modalities at once.

In this lab, both worlds live inside a single portable SQLite file (`data/embeddings.db`, `32` seeded items across `6` modalities):

- **Dense geometry:** `F32_BLOB(768)`, `F32_BLOB(512)`, `F32_BLOB(256)`, and `F32_BLOB(128)` columns indexed with **libSQL DiskANN** (`libsql_vector_idx`).
- **Lexical precision:** **SQLite FTS5** (`bm25()`) virtual tables fused with vector rankings via **Reciprocal Rank Fusion (RRF)**.

---

## Chapter 01 — When Words Lie (and When Words Are All You Have)

**What we are testing:** The boundary between lexical keyword matching (`SQLite FTS5`), dense semantic retrieval (`libSQL Vector`), and fused `Hybrid RRF`.

We test three classic failure modes side by side:

1. **The Zero-Overlap Paraphrase (`q-sem-1`, `q-sem-2`):**
   A developer asks *"how to allow simultaneous database reads while writing without locking readers."* The target SQLite note discusses `PRAGMA journal_mode=WAL` and *"concurrent snapshots."* Almost no content words overlap, yet vector search ranks `doc-sqlite-wal` `#1` (`cos = 0.7651`).
2. **The Homonym Trap (`q-hom-1`, `q-hom-2`):**
   Words like **Java** (JVM garbage collector vs. volcanic Arabica coffee in East Java) and **Mercury** (perihelion orbit precession vs. liquid quicksilver barometers) share identical surface tokens. Keyword matchers pull in both; the `768d` embedding space cleanly separates computer systems from agriculture and astrophysics from chemistry.
3. **The 3 A.M. Error-Code Needle (`q-lex-1`, `q-lex-2`):**
   Suppose two incident runbooks have nearly identical prose—one for `ERR_UPSTREAM_RST_499` and one for `ERR_UPSTREAM_RST_524`—or require an exact header name (`X-Focus-Idempotency-Token`). Pure semantic embeddings see two almost indistinguishable proxy socket articles, whereas **SQLite FTS5** locks onto `ERR_UPSTREAM_RST_499` with surgical precision, and **Hybrid RRF** combines `vec #1` + `fts #1` at the top.

---

## Chapter 02 — Structured Documents, Code, and 100+ Languages

**What we are testing:** Cross-domain alignment between natural-language English questions, multi-section Markdown engineering documents (`ADR-014`, `Postmortem #209`, `RFC-008`), raw source code (`TypeScript`, `Python`, `SQL`, `Rust`), and un-translated notes in Spanish, Japanese, and French.

- **Document QA (`q-doc-1`, `q-doc-2`):** Real engineering answers sit buried inside multi-section documents—like *“what HTTP status is returned if a retried settlement token has a different payload hash?”* (`HTTP 422 Unprocessable Entity` in `ADR-014`) or *“why did Envoy 65s timeout vs Bun 60s timeout cause checkout 502 failures?”* (`Postmortem #209`).
- **Natural language to implementation (`q-code-1` .. `q-code-4`):** Source code rarely contains the English words a developer searches for. A `TokenBucket` class (`this.tokens -= cost`) never mentions *"throttle"*; a `WITH RECURSIVE org_tree` SQL CTE never mentions *"tree traversal"*; a Rust `RingBuffer` never says *"circular queue."* EmbeddingGemma 2 achieves `100%` `Hit@1` across all four code tasks.
- **Cross-lingual retrieval (`q-multi-1` .. `q-multi-3`):** Searching in English for *"automatic bullet train emergency braking triggered by P-wave earthquake sensors"* gets **zero** hits in `FTS5`, because the target document (`doc-ja-shinkansen`) is written entirely in Japanese (`新幹線の早期地震検知システム`). In EmbeddingGemma 2's shared `768d` space, the English query lands directly on the Japanese note at Rank `#1`—and does the same for Spanish molten-salt solar storage and French sourdough fermentation.

---

## Chapter 03 — Steering Geometry with Task Instructions

**What we are testing:** Asymmetric vs. symmetric vector geometry using EmbeddingGemma 2's `task:` instruction prefixes (`src/prefixes.ts`).

*"Similarity"* is ambiguous without intent:

- Two questions (`"Why is my heap growing?"` and `"How do I debug memory pauses?"`) are **symmetrically similar** paraphrases (`task: sentence similarity | query: …`).
- A short search query (`"java memory heap pause latency"`) and a technical runbook paragraph are **asymmetrically related** (`task: search result | query: …` paired with `title: … | text: …`).

Our A/B benchmark embeds the entire corpus and query set twice—once completely raw and once with task-steered prefixes—measuring not just `Hit@1`, but the **cosine margin $\Delta$** between the true answer and the closest distractor. Task steering widens mean distractor separation by **+22.6%** (`0.1130 → 0.1385`).

---

## Chapter 04 — The Russian Nesting Doll Inside Every Vector (Matryoshka MRL)

**What we are testing:** Storage compression vs. retrieval recall when slicing `768d` vectors down to `512d`, `256d`, and `128d` (`src/mrl.ts`).

In standard embeddings, coordinates `0..767` are entangled: dropping the last `512` floats ruins cosine geometry. EmbeddingGemma 2 is trained with **Matryoshka Representation Learning (MRL)** so leading coordinate prefixes form coarse-to-fine nested subspaces:

- **`768d` (`3,072 B/vec`, `1:1`):** Full fidelity (`293 MB` per `100k` vectors, `100%` `Hit@1`).
- **`512d` (`2,048 B/vec`, `1:1.5`):** `97.4%` Top-3 overlap with `768d` and only `0.0059` mean cosine drift (`100%` `Hit@1`).
- **`256d` (`1,024 B/vec`, `1:3`):** **3x smaller** (`97.7 MB` per `100k` vectors) while preserving **`100%` `Hit@1` (`MRR = 1.000`)** and `0.0182` cosine drift.
- **`128d` (`512 B/vec`, `1:6`):** **6x smaller** (`48.8 MB` per `100k` vectors), retaining `84.6%` `Hit@1` and `100%` `Hit@3`.

Crucially, after slicing to `k` floats, the prefix vector must be **L2-renormalized** back onto the unit sphere (`truncateMrl`).

---

## Chapter 05 — Seeing Pages, Scenes, and Sound Without Captions

**What we are testing:** Whether `embeddinggemma-2:latest` (`270M` text backbone + `170M` vision encoder + `300M` audio encoder) maps **scanned document images (`visdoc`)**, **pure visual scenes (`image`)**, **raw PCM WAV audio (`audio`)**, and natural-language text into the exact same `768d` vector space with zero text metadata.

Every sensory item is stored in SQLite with `content = ""` and skipped by `FTS5` so keyword search cannot cheat:

1. **Zero-OCR Scanned Visual Documents (`visdoc`, `3` PNG pages in `src/images.ts`):** `340x216` bitmap-rendered scans of **Invoice #4082 (`$1,420.00` Nebula H200 GPUs)**, **Redis SLO Breach (`840 ms` P99)**, and **Q3 ARR Executive Table (`$18.4M ARR`, `128% NRR`)**. Ollama receives only `{ image: base64Png }` and reads pixel typography directly into `768d` space.
2. **Pure Visual Scenes (`image`, `5` PNG canvases in `src/images.ts`):** Procedurally rendered `160x160` scenes (stop sign, ocean sunset, pine tree, rising bar chart, dark code terminal) with zero text drawn in the pixels.
3. **Acoustic 16 kHz WAV Clips (`audio`, `3` playable `2.4s` WAVs in `src/audio.ts`):** Pure PCM waveforms (two-tone emergency siren, ocean surf static, ascending C-major chime melody) embedded via `{ audio: base64Wav }`.

Querying all 11 sensory items from plain English questions achieves **`100%` `Hit@1` (`11/11`, `MRR = 1.000`)** across scanned pages, visual scenes, and sound.

---

## Chapter 06 — Big PDF Papers & PowerPoint Decks: Seeing How the Model Sees

**What we are testing:** How EmbeddingGemma 2 perceives dense multi-page academic PDFs (`76` total pages across *Attention Is All You Need* `15 pp`, *ColPali* `26 pp`, and *Matryoshka Representation Learning* `35 pp`) and OpenXML PowerPoint slide decks (`.pptx`, `14` slides across two executive/architecture decks) across **three parallel lenses** (`src/pdf_pptx.ts`):

1. **Lens 1 — Pure Vision PNG (`{ image: pagePng }` via the `170M` Vision Encoder):**
   MuPDF WASM rasterizes every PDF page (`1.35x` DPI) and `16:9` PowerPoint slide (`960x540`, compositing embedded `ppt/media/*` chart images). Vision-only embeddings hit **Rank `#1` on 7 of 8 cases**—outperforming text-only extraction on *ColPali* Table 2 (`p.7`), *Matryoshka* Figure 1 (`p.2` of `35`), sinusoidal LaTeX equations (`p.6` of *Attention*, where `pdftotext` mangles subscripts), and graphical PowerPoint bar charts (`Pinecone $4,800/mo vs. libSQL $140/mo` on Slide 3, where XML `<a:t>` text contains zero numbers).
2. **Lens 2 — Extracted Text + Hidden Speaker Notes (`mupdf` structured text / `.pptx` `slide*.xml` + `notesSlide*.xml`):**
   On Slide 7 of the Board `.pptx`, confidential M&A terms (`Project Horizon $42M LOI`) live exclusively in **Presenter Speaker Notes** (`ppt/notesSlides/notesSlide7.xml`), invisible on the rendered slide canvas. Vision-only drops to `#4`, whereas Extracted Text and Fused bimodal embeddings rank Slide 7 `#1`.
3. **Lens 3 — Resolution Acuity X-Ray (`0.25x` Thumbnail Blur → `0.50x` → `1.00x` → `1.75x` High-Acuity):**
   Live per-page experiment rendering any PDF page or slide at four pixel resolutions side-by-side (`POST /api/docs/acuity`) to measure the exact sharpness threshold where equations, axis labels, and dense tables become legible to the `170M` vision encoder.
