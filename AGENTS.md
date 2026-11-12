# Project agent guide

This project follows TheFocus.AI standards (`The-Focus-AI/standards` @ `7d7689f8d2e20cae11bdcef51b90ac1fe40a9b32`).
Agents should optimize for durable, maintainable changes; keep tooling reproducible; and write down decisions that future agents need.

## Project overview and stack

`gemmaembeddings` is a local research and benchmark lab for Google DeepMind's multimodal
`embeddinggemma-2` (`740M` total parameters, `768d` unified vector space across text, code, and images)
running on Ollama, paired with an embedded SQLite vector + full-text store via `@libsql/client`.

- **Package manager:** `pnpm` (`10.34.9`, frozen lockfile in CI/install)
- **Runtime & test runner:** `bun` (`1.4.4`, `Bun.serve()`, `bun test`) + `node` (`22` for `npx skills experimental_install` and `markdownlint-cli2`)
- **Vector & full-text database:** `@libsql/client` local SQLite file (`file:data/embeddings.db`) using native `F32_BLOB(768|512|256|128)`, `libsql_vector_idx` (DiskANN cosine index), `vector_top_k`, and SQLite `FTS5` (`bm25`) fused with Reciprocal Rank Fusion (RRF)
- **Model runtime (documented local hardware exception):** Local or container `ollama` daemon (`http://127.0.0.1:11434`) serving `embeddinggemma-2:latest`. Offline deterministic tests (`mise run test`) and static checks (`mise run lint`) run cleanly in any cloud workspace or CI runner without Ollama or GPU access.
- **Deployment target:** Non-deploying local research and benchmark repository (`mise run deploy` exits non-zero with the explicit reason).

## First files to read

When starting work, inspect these files in order:

1. `AGENTS.md` — this project-specific guide.
2. `README.md` — developer overview, recipes, and benchmark documentation.
3. `handbook/work.md` in `The-Focus-AI/standards` — issue states, the frontier, claiming, and what an agent comments.
4. `docs/testing.md` — blocking checks, benchmark thresholds, and release/alerting status.
5. `mise.toml` — pinned tools, environment loading, and runnable tasks.
6. `skills-lock.json` — locked agent skills for reproducible setup.

## Product maturity

- Maturity: not yet assessed.
- Owner approval and date: not yet recorded.
- Rationale: not yet recorded.

Ask the project owner to approve `alpha`, `client-testing`, or `production` under
`handbook/release.md` and replace these placeholders. Do not assume `alpha` or infer maturity.

## Secret-file preflight

Before running setup or creating credential files (`handbook/development.md`, `handbook/secrets.md`):

- Ensure `.gitignore` excludes `.fnox/`, `.env`, `.env.*`, and any project-specific credential files. Keep `.env.example` trackable with placeholders only.
- Check each intended secret path separately with `git check-ignore -q -- <path>` and `git ls-files -- <path>` before writing it.
- No cloud API keys or secrets are required for local Ollama + libSQL execution.

## Required operating rules

- Bootstrap with `mise trust`, `mise install`, and `mise run install`.
  The `install` task runs `pnpm install --frozen-lockfile` and `npx -y skills experimental_install`.
- Use `mise` for project tools and runtimes (`mise use --pin`). Never use global `npm install -g`, `pip install`, or `brew install` for project tooling.
- Always use `pnpm` for package management.
- Keep required tasks working: `mise run install`, `mise run dev`, `mise run lint`, `mise run test`, and `mise run deploy`.
- Additional lab tasks:
  - `mise run model:pull` — pull `embeddinggemma-2:latest` via Ollama
  - `mise run seed` — seed 32 items across `document`, `visdoc`, `image`, `audio`, `code`, and `text` into `data/embeddings.db`
  - `mise run seed:docs` — download/generate and index 76 arXiv PDF pages + 14 PowerPoint `.pptx` slides across Vision, Text, and Fused lenses
  - `mise run bench` / `mise run bench:docs` — run quantitative experiments against Ollama + libSQL
  - `mise run search -- <query>` — run unified freeform hybrid/fused/vision/fts omni-search across all 122 indexed units from the CLI
- Keep `mise run lint` and `mise run test` offline and credential-free.

## Issue tracking

- GitHub repository: `The-Focus-AI/gemmaembeddings` (`gh issue` / `gh pr` following `handbook/work.md`).
