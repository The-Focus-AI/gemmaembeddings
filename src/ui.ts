export interface UiBootInfo {
  model: string;
  ollamaBaseUrl: string;
  dbUrl: string;
}

export function renderPlaygroundHtml(boot: UiBootInfo): string {
  const safeModel = escapeHtml(boot.model);
  const safeOllama = escapeHtml(boot.ollamaBaseUrl);
  const safeDb = escapeHtml(boot.dbUrl);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <title>EmbeddingGemma 2 Lab · 768 Numbers for Everything · TheFocus.AI</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #fafaf9;
      --surface: #f5f5f4;
      --surface-elevated: #ffffff;
      --fg: #1c1917;
      --fg-body: rgba(28, 25, 23, 0.72);
      --fg-muted: rgba(28, 25, 23, 0.46);
      --rule: rgba(28, 25, 23, 0.14);
      --rule-strong: rgba(28, 25, 23, 0.28);
      --accent: #C8102E;
      --accent-60: rgba(200, 16, 46, 0.60);
      --accent-20: rgba(200, 16, 46, 0.20);
      --accent-10: rgba(200, 16, 46, 0.08);
      --font-sans: 'IBM Plex Sans', 'Helvetica Neue', Arial, system-ui, sans-serif;
      --font-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0c0a09;
        --surface: #171412;
        --surface-elevated: #1c1917;
        --fg: #f5f5f4;
        --fg-body: rgba(245, 245, 244, 0.72);
        --fg-muted: rgba(245, 245, 244, 0.46);
        --rule: rgba(245, 245, 244, 0.14);
        --rule-strong: rgba(245, 245, 244, 0.28);
        --accent: #e11d48;
        --accent-60: rgba(225, 29, 72, 0.65);
        --accent-20: rgba(225, 29, 72, 0.24);
        --accent-10: rgba(225, 29, 72, 0.11);
      }
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font-sans);
      font-size: 16px;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    :focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 0 clamp(20px, 4vw, 48px);
    }

    .tabular { font-variant-numeric: tabular-nums; }
    .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

    .kicker {
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: var(--fg-muted);
    }
    .kicker-accent { color: var(--accent); }

    h1, h2, h3, h4 {
      margin: 0;
      font-weight: 300;
      letter-spacing: -0.02em;
      color: var(--fg);
    }
    h1 { font-size: clamp(2.1rem, 4.4vw, 3.6rem); line-height: 1.06; }
    h2 { font-size: clamp(1.55rem, 2.8vw, 2.25rem); line-height: 1.15; }
    h3 { font-size: 1.125rem; font-weight: 500; line-height: 1.3; letter-spacing: -0.01em; }

    .prose {
      max-width: 60ch;
      color: var(--fg-body);
      font-size: 1rem;
      line-height: 1.68;
    }
    .prose p { margin: 0 0 1rem 0; }
    .prose p:last-child { margin-bottom: 0; }
    .prose strong { color: var(--fg); font-weight: 500; }
    .prose code {
      font-family: var(--font-mono);
      font-size: 0.86em;
      padding: 1px 5px;
      border: 1px solid var(--rule);
      background: var(--surface);
      color: var(--fg);
    }

    /* Sticky Chapter Nav */
    .top-bar {
      position: sticky;
      top: 0;
      z-index: 40;
      background: var(--bg);
      border-bottom: 1px solid var(--rule);
    }
    .nav-scroll {
      display: flex;
      align-items: center;
      gap: 4px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .nav-scroll::-webkit-scrollbar { display: none; }
    .nav-link {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      padding: 0 12px;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.04em;
      text-decoration: none;
      color: var(--fg-muted);
      border-bottom: 2px solid transparent;
      white-space: nowrap;
      transition: color 120ms ease, border-color 120ms ease;
    }
    .nav-link:hover { color: var(--fg); border-bottom-color: var(--rule-strong); }
    .nav-link.active { color: var(--fg); border-bottom-color: var(--accent); }
    .nav-num {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--accent);
      margin-right: 6px;
    }

    /* Swiss 12-col Grid Sections */
    .chapter {
      padding: clamp(48px, 6vw, 84px) 0;
      border-bottom: 1px solid var(--rule);
    }
    .grid-12 {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 24px;
    }
    .col-4 { grid-column: span 4; }
    .col-5 { grid-column: span 5; }
    .col-6 { grid-column: span 6; }
    .col-7 { grid-column: span 7; }
    .col-8 { grid-column: span 8; }
    .col-12 { grid-column: span 12; }

    @media (max-width: 980px) {
      .col-4, .col-5, .col-6, .col-7, .col-8 { grid-column: span 12; }
    }

    /* Controls — strictly rectilinear Swiss forms */
    button, .btn, select, input[type="text"], textarea {
      font-family: var(--font-sans);
      border-radius: 0;
      font-size: 13px;
    }
    button, .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 44px;
      padding: 8px 16px;
      border: 1px solid var(--rule-strong);
      background: transparent;
      color: var(--fg);
      font-weight: 500;
      cursor: pointer;
      transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
    }
    button:hover:not(:disabled) {
      background: var(--surface);
      border-color: var(--fg);
    }
    button:disabled { opacity: 0.4; cursor: not-allowed; }

    .btn-primary {
      background: var(--fg);
      color: var(--bg);
      border-color: var(--fg);
    }
    .btn-primary:hover:not(:disabled) {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }
    .btn-accent {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }
    .btn-accent:hover:not(:disabled) {
      opacity: 0.9;
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }
    .btn-chip {
      min-height: 44px;
      padding: 6px 13px;
      font-size: 12px;
      text-align: left;
      justify-content: flex-start;
      border: 1px solid var(--rule);
      background: var(--surface-elevated);
    }
    .btn-chip.active {
      border-color: var(--accent);
      background: var(--accent-10);
      color: var(--fg);
    }

    input[type="text"], select, textarea {
      min-height: 44px;
      width: 100%;
      padding: 9px 12px;
      border: 1px solid var(--rule-strong);
      background: var(--surface-elevated);
      color: var(--fg);
    }
    textarea { min-height: 92px; resize: vertical; font-family: var(--font-mono); font-size: 12px; }

    /* Panels & Tables */
    .panel {
      border: 1px solid var(--rule);
      background: var(--surface-elevated);
      padding: 20px;
    }
    .panel-subtle {
      border: 1px solid var(--rule);
      background: var(--surface);
      padding: 20px;
    }

    .tag {
      display: inline-block;
      padding: 2px 7px;
      font-family: var(--font-mono);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      border: 1px solid var(--rule);
      color: var(--fg-muted);
    }
    .tag-target {
      border-color: var(--accent);
      background: var(--accent-10);
      color: var(--accent);
      font-weight: 500;
    }

    /* Corpus List & Document Reader */
    .corpus-list {
      max-height: 640px;
      overflow-y: auto;
      border-top: 1px solid var(--rule);
    }
    .corpus-row {
      width: 100%;
      display: grid;
      grid-template-columns: 56px 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 12px 10px;
      min-height: 60px;
      border: 0;
      border-bottom: 1px solid var(--rule);
      background: transparent;
      text-align: left;
      cursor: pointer;
    }
    .corpus-row:hover { background: var(--surface); }
    .corpus-row.active {
      background: var(--accent-10);
      border-left: 3px solid var(--accent);
      padding-left: 7px;
    }
    .thumb-box {
      width: 52px;
      height: 42px;
      border: 1px solid var(--rule);
      background: var(--surface);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--fg-muted);
    }
    .thumb-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      image-rendering: pixelated;
    }

    /* Rendered Markdown Document Styling inside Reader */
    .doc-sheet {
      border: 1px solid var(--rule-strong);
      background: var(--surface-elevated);
      padding: clamp(20px, 3vw, 34px);
    }
    .md-render h1 {
      font-size: 1.45rem;
      font-weight: 500;
      padding-bottom: 12px;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--rule);
    }
    .md-render h2 {
      font-size: 0.95rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin: 22px 0 8px 0;
      color: var(--fg);
    }
    .md-render p, .md-render li {
      font-size: 0.95rem;
      line-height: 1.65;
      color: var(--fg-body);
    }
    .md-render ul, .md-render ol {
      margin: 8px 0 14px 20px;
      padding: 0;
    }
    .md-render li { margin-bottom: 6px; }
    .md-render code {
      font-family: var(--font-mono);
      font-size: 0.84em;
      padding: 1px 5px;
      background: var(--surface);
      border: 1px solid var(--rule);
      color: var(--fg);
    }
    pre.code-sheet {
      margin: 0;
      padding: 18px;
      background: var(--surface);
      border: 1px solid var(--rule);
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 12.5px;
      line-height: 1.58;
      color: var(--fg);
    }

    /* Score Bars */
    .bar-track {
      width: 100%;
      height: 6px;
      background: var(--surface);
      border: 1px solid var(--rule);
      position: relative;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      background: var(--fg);
      transition: width 200ms ease;
    }
    .bar-fill-accent { background: var(--accent); }

    /* 3-Column Race */
    .race-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }
    @media (max-width: 900px) {
      .race-grid { grid-template-columns: 1fr; }
    }
    .hit-card {
      padding: 12px;
      border: 1px solid var(--rule);
      background: var(--surface-elevated);
      margin-bottom: 8px;
      cursor: pointer;
    }
    .hit-card:hover { border-color: var(--fg); }
    .hit-card.is-expected {
      border-color: var(--accent);
      background: var(--accent-10);
    }

    /* 96-Bar Coordinate Ribbon */
    .vec-ribbon {
      display: grid;
      grid-template-columns: repeat(96, minmax(0, 1fr));
      gap: 2px;
      height: 76px;
      align-items: center;
      padding: 8px;
      border: 1px solid var(--rule);
      background: var(--surface);
    }
    .vec-bar {
      width: 100%;
      background: var(--fg);
      transition: opacity 160ms ease, background 160ms ease;
    }
    .vec-bar.neg { background: var(--accent-60); }
    .vec-bar.sliced { opacity: 0.11; }

    /* Sensory Cards (VisDoc, Scenes, Audio) */
    .sensory-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(265px, 1fr));
      gap: 16px;
    }
    .sensory-card {
      border: 1px solid var(--rule);
      background: var(--surface-elevated);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .sensory-card.winner {
      border: 2px solid var(--accent);
      background: var(--accent-10);
    }
    .sensory-media {
      width: 100%;
      aspect-ratio: 16 / 10;
      border: 1px solid var(--rule);
      background: var(--surface);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .sensory-media img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      image-rendering: pixelated;
    }
    audio {
      width: 100%;
      height: 38px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      padding: 10px 10px;
      border-bottom: 1px solid var(--rule);
      text-align: left;
    }
    th {
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--fg-muted);
    }

    .stat-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      border-top: 1px solid var(--rule);
      border-left: 1px solid var(--rule);
    }
    .stat-cell {
      padding: 14px 16px;
      border-right: 1px solid var(--rule);
      border-bottom: 1px solid var(--rule);
    }
    .stat-val {
      font-size: 1.4rem;
      font-weight: 300;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }

    /* PDF & PowerPoint Page Heatmap Strip & Acuity Grid */
    .page-heatmap {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(66px, 1fr));
      gap: 6px;
    }
    .hm-cell {
      min-height: 54px;
      padding: 6px;
      border: 1px solid var(--rule);
      background: var(--surface-elevated);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: stretch;
      cursor: pointer;
      text-align: left;
    }
    .hm-cell:hover { border-color: var(--fg); }
    .hm-cell.active {
      border: 2px solid var(--accent);
      background: var(--accent-10);
    }
    .acuity-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    @media (max-width: 820px) {
      .acuity-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    /* Freeform Omni-Search Matcher */
    .omni-search-bar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: stretch;
    }
    .omni-search-bar input[type="text"] {
      flex: 1 1 360px;
      min-height: 48px;
      font-size: 15px;
      padding: 10px 14px;
    }
    .omni-rollup-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 10px;
      margin-bottom: 20px;
    }
    .omni-rollup-card {
      min-height: 76px;
      padding: 12px 14px;
      border: 1px solid var(--rule);
      background: var(--surface-elevated);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: flex-start;
      gap: 6px;
      text-align: left;
      cursor: pointer;
    }
    .omni-rollup-card:hover { border-color: var(--fg); background: var(--surface); }
    .omni-rollup-card.active {
      border-color: var(--accent);
      background: var(--accent-10);
    }
    .omni-hit-list {
      max-height: 780px;
      overflow-y: auto;
      border-top: 1px solid var(--rule);
    }
    .omni-hit {
      width: 100%;
      display: grid;
      grid-template-columns: 54px 1fr;
      gap: 12px;
      align-items: flex-start;
      padding: 14px 12px;
      border: 0;
      border-bottom: 1px solid var(--rule);
      background: var(--surface-elevated);
      text-align: left;
      cursor: pointer;
    }
    .omni-hit:hover { background: var(--surface); }
    .omni-hit.active {
      background: var(--accent-10);
      border-left: 3px solid var(--accent);
      padding-left: 9px;
    }
    mark.omni-hl {
      background: var(--accent-10);
      color: var(--accent);
      font-weight: 500;
      padding: 0 2px;
    }
  </style>
</head>
<body>

  <!-- Sticky Navigation Bar -->
  <header class="top-bar">
    <div class="container" style="display:flex; align-items:center; justify-content:space-between; gap:16px;">
      <nav class="nav-scroll" aria-label="Story chapters">
        <a class="nav-link active" href="#sec-search"><span class="nav-num">⌕</span>Search All</a>
        <a class="nav-link" href="#sec-corpus"><span class="nav-num">00</span>Corpus &amp; Docs</a>
        <a class="nav-link" href="#sec-ch1"><span class="nav-num">01</span>Words vs Geometry</a>
        <a class="nav-link" href="#sec-ch2"><span class="nav-num">02</span>Docs, Code &amp; Langs</a>
        <a class="nav-link" href="#sec-ch3"><span class="nav-num">03</span>Task Prefixes</a>
        <a class="nav-link" href="#sec-ch4"><span class="nav-num">04</span>Matryoshka MRL</a>
        <a class="nav-link" href="#sec-ch5"><span class="nav-num">05</span>VisDocs, Scenes &amp; Audio</a>
        <a class="nav-link" href="#sec-papers"><span class="nav-num">06</span>PDFs &amp; PowerPoints</a>
        <a class="nav-link" href="#sec-ch6"><span class="nav-num">07</span>Workbench</a>
      </nav>
      <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
        <span id="live-dot" class="mono" style="font-size:11px; color:var(--fg-muted);">Checking Ollama…</span>
      </div>
    </div>
  </header>

  <main class="container">
    <!-- Editorial Masthead -->
    <section class="chapter" style="padding-top: clamp(40px, 5vw, 68px);">
      <div class="grid-12">
        <div class="col-8">
          <div class="kicker kicker-accent" style="margin-bottom:14px;">TheFocus.AI · Multimodal Vector Field Guide</div>
          <h1>768 Numbers for Everything</h1>
          <p class="prose" style="margin-top:20px; font-size:1.12rem;">
            An interactive laboratory exploring what Google DeepMind’s <strong>EmbeddingGemma 2</strong>
            (<code>${safeModel}</code>, 740M parameters) actually learns when text notes, full architecture documents,
            source code, scanned invoices, visual scenes, multi-page PDF papers, PowerPoint decks, and raw WAV audio
            are projected onto a single <strong>768-dimensional SQLite hypersphere</strong>.
          </p>
        </div>
        <div class="col-4" style="display:flex; flex-direction:column; justify-content:space-between; gap:16px;">
          <div class="panel-subtle">
            <div class="kicker" style="margin-bottom:8px;">Local Runtime Stack</div>
            <div class="mono" style="font-size:12px; color:var(--fg-body); line-height:1.7;">
              <div>Model: <strong>${safeModel}</strong></div>
              <div>Daemon: ${safeOllama}</div>
              <div>SQLite: ${safeDb}</div>
              <div>Index: DiskANN + SQLite FTS5 RRF</div>
            </div>
            <div style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
              <button id="btn-reseed" type="button">Re-seed 32-Item Corpus</button>
              <a class="btn" href="#sec-ch6" style="text-decoration:none;">Jump to Suite →</a>
            </div>
          </div>
        </div>
      </div>

      <div id="stat-strip" class="stat-strip" style="margin-top:32px;">
        <div class="stat-cell"><div class="kicker">SQLite Unit Corpus</div><div id="st-total" class="stat-val tabular">—</div></div>
        <div class="stat-cell"><div class="kicker">PDF &amp; PPTX Pages</div><div id="st-pdf-pages" class="stat-val tabular" style="color:var(--accent);">—</div></div>
        <div class="stat-cell"><div class="kicker">Full Documents</div><div id="st-doc" class="stat-val tabular">—</div></div>
        <div class="stat-cell"><div class="kicker">Scanned VisDocs</div><div id="st-visdoc" class="stat-val tabular">—</div></div>
        <div class="stat-cell"><div class="kicker">Visual Scenes</div><div id="st-image" class="stat-val tabular">—</div></div>
        <div class="stat-cell"><div class="kicker">Audio WAVs</div><div id="st-audio" class="stat-val tabular">—</div></div>
        <div class="stat-cell"><div class="kicker">Code &amp; 100+ Langs</div><div id="st-code-text" class="stat-val tabular">—</div></div>
      </div>
    </section>

    <!-- FREEFORM OMNI-SEARCH MATCHER ACROSS ALL DOCUMENTS -->
    <section id="sec-search" class="chapter">
      <div class="grid-12" style="margin-bottom:24px;">
        <div class="col-5">
          <div class="kicker kicker-accent" style="margin-bottom:8px;">Search All · Freeform Cross-Document Matcher</div>
          <h2>Match Anything Across Every PDF, Slide Deck, Document &amp; Modality</h2>
        </div>
        <div class="col-7">
          <div class="prose">
            <p>
              Type any freeform question, LaTeX equation fragment, error code, Spanish/Japanese phrase—or attach a
              PNG/WAV file—to query <strong>all indexed records simultaneously</strong>: 76 arXiv PDF pages, 14
              PowerPoint slides (including hidden Presenter Speaker Notes), Markdown ADRs &amp; postmortems, zero-OCR
              scanned invoices, visual scenes, audio clips, and source code. Press <code>/</code> anywhere on the page
              to focus the matcher.
            </p>
          </div>
        </div>
      </div>

      <div class="panel" style="margin-bottom:20px;">
        <form id="omni-form" class="omni-search-bar" style="margin-bottom:14px;">
          <input
            id="omni-input"
            type="text"
            value="Scaled Dot-Product Attention diagram and Attention(Q, K, V) equation"
            placeholder="Search across all PDFs, PowerPoint slides, ADRs, scanned invoices, code, and audio (press / to focus)…"
            aria-label="Freeform search across all documents"
          />
          <label class="btn" for="omni-file" id="omni-file-label" style="flex-shrink:0;" title="Optional: attach a PNG/JPEG image or WAV clip for reverse multimodal search">
            + Image / WAV
          </label>
          <input id="omni-file" type="file" accept="image/*,audio/wav,audio/*" style="display:none;" />
          <button id="omni-clear-file" type="button" style="display:none; flex-shrink:0;">✕ Clear Media</button>
          <button id="omni-submit" type="submit" class="btn-accent" style="min-height:48px; padding:10px 22px; flex-shrink:0;">
            Match Across All
          </button>
        </form>

        <div class="kicker" style="margin-bottom:8px;">Try Cross-Corpus Prompts (Spans arXiv PDFs, Hidden PPTX Notes, Markdown ADRs &amp; Zero-OCR Scans)</div>
        <div id="omni-presets" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
          <button type="button" class="btn-chip active" data-oq="Scaled Dot-Product Attention diagram and Attention(Q, K, V) equation">Attention(Q,K,V) Diagram &amp; Equation</button>
          <button type="button" class="btn-chip" data-oq="Project Horizon confidential $42M acquisition LOI">Hidden Slide Note: $42M Project Horizon LOI</button>
          <button type="button" class="btn-chip" data-oq="Pinecone $4,800 vs $140 embedded libSQL monthly vector cost chart">Chart Slide: $4,800 Pinecone vs $140 libSQL</button>
          <button type="button" class="btn-chip" data-oq="what HTTP status is returned if a retried settlement token has a different SHA-256 payload hash?">ADR-014: HTTP 422 SHA-256 Mismatch</button>
          <button type="button" class="btn-chip" data-oq="Nebula H200 GPU cluster invoice INV-2026-4082 total amount">Zero-OCR Scan: Nebula H200 Invoice</button>
          <button type="button" class="btn-chip" data-oq="ViDoRe benchmark table comparing ColPali with Unstructured OCR">ColPali ViDoRe Benchmark Table</button>
          <button type="button" class="btn-chip" data-oq="Matryoshka Representation Learning nested coarse-to-fine subspaces">Matryoshka Nested Subspaces Paper</button>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding-top:14px; border-top:1px solid var(--rule);">
          <div id="omni-scopes" style="display:flex; flex-wrap:wrap; gap:6px;" role="tablist" aria-label="Document scope filter">
            <button type="button" class="btn-chip active" data-scope="all">Everything</button>
            <button type="button" class="btn-chip" data-scope="all_docs">All Docs (PDF + PPTX + ADR + Scans)</button>
            <button type="button" class="btn-chip" data-scope="pdf">PDF Papers</button>
            <button type="button" class="btn-chip" data-scope="pptx">PowerPoints</button>
            <button type="button" class="btn-chip" data-scope="markdown">Markdown &amp; Notes</button>
            <button type="button" class="btn-chip" data-scope="sensory">VisDocs, Scenes &amp; WAV</button>
            <button type="button" class="btn-chip" data-scope="code">Source Code</button>
          </div>

          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <select id="omni-lens" style="width:auto; min-width:215px;" aria-label="Matcher lens">
              <option value="hybrid">Lens: Hybrid RRF (Fused + FTS5)</option>
              <option value="fused">Lens: Semantic Cosine (Bimodal)</option>
              <option value="vision">Lens: Pure Vision / Sensory Only</option>
              <option value="fts">Lens: Exact Keyword (SQLite FTS5)</option>
            </select>
            <select id="omni-dim" style="width:auto; min-width:118px;" aria-label="Matryoshka dimension">
              <option value="768">768d Full</option>
              <option value="512">512d MRL</option>
              <option value="256">256d MRL</option>
              <option value="128">128d MRL</option>
            </select>
          </div>
        </div>

        <div id="omni-meta" class="mono" style="margin-top:12px; font-size:11px; color:var(--fg-muted);"></div>
      </div>

      <!-- Document-Level Rollup Cards -->
      <div id="omni-rollup-wrap" style="display:none;">
        <div class="kicker" style="margin-bottom:8px;">Top Matched Documents, Papers &amp; Slide Decks (Click Any Card to Jump to Best Page)</div>
        <div id="omni-rollup" class="omni-rollup-grid"></div>
      </div>

      <!-- Unified Hit List + Live Inline Document / Page / Slide Reader -->
      <div class="grid-12">
        <div class="col-5">
          <div class="kicker" style="margin-bottom:8px;" id="omni-hits-kicker">Ranked Cross-Document Matches</div>
          <div id="omni-hits" class="omni-hit-list" aria-label="Freeform search results"></div>
        </div>
        <div class="col-7">
          <div id="omni-preview" class="doc-sheet">
            <div class="kicker">Matching across all documents…</div>
          </div>
        </div>
      </div>
    </section>

    <!-- SECTION 00: SIX-MODALITY CORPUS & DOCUMENT READER -->
    <section id="sec-corpus" class="chapter">
      <div class="grid-12" style="margin-bottom:28px;">
        <div class="col-5">
          <div class="kicker kicker-accent" style="margin-bottom:8px;">00 · Corpus Atlas &amp; Document Inspector</div>
          <h2>Six Modalities in One SQLite Table</h2>
        </div>
        <div class="col-7">
          <div class="prose">
            <p>
              Before running a single benchmark, inspect what lives inside <code>data/embeddings.db</code>.
              Every record—whether a multi-section <strong>Architecture Decision Record</strong>, a
              <strong>zero-OCR scanned PNG invoice</strong>, a <strong>16 kHz PCM WAV sound</strong>, or a
              <strong>Rust data structure</strong>—occupies the exact same <code>F32_BLOB(768)</code> column.
              Select any item below to read the full document, play its audio, or query its cross-modal neighbors.
            </p>
          </div>
        </div>
      </div>

      <div id="corpus-filters" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px;" role="tablist" aria-label="Filter corpus by modality">
        <button type="button" class="btn-chip active" data-mod="all">All Modalities (32)</button>
        <button type="button" class="btn-chip" data-mod="document">Documents · ADRs &amp; Postmortems (3)</button>
        <button type="button" class="btn-chip" data-mod="visdoc">Scanned VisDocs · PNG Pages (3)</button>
        <button type="button" class="btn-chip" data-mod="image">Visual Scenes · Pixel PNGs (5)</button>
        <button type="button" class="btn-chip" data-mod="audio">Audio · 16kHz WAVs (3)</button>
        <button type="button" class="btn-chip" data-mod="code">Source Code (5)</button>
        <button type="button" class="btn-chip" data-mod="text">Notes &amp; Multilingual (13)</button>
      </div>

      <div class="grid-12">
        <div class="col-5">
          <div id="corpus-list" class="corpus-list" aria-label="Corpus items"></div>
        </div>
        <div class="col-7">
          <div id="inspector-pane" class="doc-sheet">
            <div class="kicker">Loading corpus inspector…</div>
          </div>
        </div>
      </div>
    </section>

    <!-- CHAPTER 01: WHEN WORDS LIE (LEXICAL VS VECTOR VS HYBRID RRF) -->
    <section id="sec-ch1" class="chapter">
      <div class="grid-12" style="margin-bottom:28px;">
        <div class="col-5">
          <div class="kicker kicker-accent" style="margin-bottom:8px;">Chapter 01 · Experiment 1</div>
          <h2>When Words Lie—and When Exact Words Are All You Have</h2>
          <div class="prose" style="margin-top:16px;">
            <p>
              Traditional full-text search (<code>SQLite FTS5 BM25</code>) counts shared words. It fails silently
              when a developer asks about <em>“simultaneous reads while writing”</em> and the documentation says
              <code>PRAGMA journal_mode=WAL</code>. Worse, it gets fooled by homonyms: the token <strong>Java</strong>
              matches both JVM garbage collectors and volcanic Arabica coffee estates.
            </p>
            <p>
              Yet pure vector embeddings have an Achilles’ heel of their own: at 3:00 a.m., when two runbooks have
              nearly identical prose except for error token <code>ERR_UPSTREAM_RST_499</code> vs. <code>524</code>,
              dense geometry blurs them together. <strong>Reciprocal Rank Fusion (RRF)</strong> fuses both engines
              inside SQLite so neither blind spot wins.
            </p>
          </div>
        </div>

        <div class="col-7">
          <div class="panel-subtle" style="margin-bottom:16px;">
            <div class="kicker" style="margin-bottom:10px;">Click a Failure Mode to Race All 3 Engines Live</div>
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;" id="ch1-presets">
              <button type="button" class="btn-chip active" data-q="how to allow simultaneous database reads while writing without locking readers" data-exp="doc-sqlite-wal" data-dist="" data-pfx="search_query">Zero-Overlap Paraphrase (WAL)</button>
              <button type="button" class="btn-chip" data-q="java memory heap pause latency" data-exp="doc-jvm-gc" data-dist="doc-java-coffee" data-pfx="search_query">Homonym Trap (Java JVM vs Coffee)</button>
              <button type="button" class="btn-chip" data-q="mercury solar orbit relativity shift" data-exp="doc-mercury-planet" data-dist="doc-mercury-metal" data-pfx="search_query">Homonym Trap (Mercury Orbit vs Metal)</button>
              <button type="button" class="btn-chip" data-q="ERR_UPSTREAM_RST_499" data-exp="doc-err-socket" data-dist="doc-err-socket-524" data-pfx="search_query">3 A.M. Exact Token (499 vs 524)</button>
            </div>
            <form id="ch1-form" style="display:flex; gap:8px;">
              <input id="ch1-input" type="text" value="how to allow simultaneous database reads while writing without locking readers" aria-label="Chapter 1 live query" />
              <button type="submit" class="btn-primary" style="flex-shrink:0;">Race Engines</button>
            </form>
            <div id="ch1-meta" class="mono" style="margin-top:8px; font-size:11px; color:var(--fg-muted);"></div>
          </div>

          <div id="ch1-race" class="race-grid"></div>
        </div>
      </div>
    </section>

    <!-- CHAPTER 02: DOCUMENTS, CODE & 100+ LANGUAGES -->
    <section id="sec-ch2" class="chapter">
      <div class="grid-12" style="margin-bottom:24px;">
        <div class="col-5">
          <div class="kicker kicker-accent" style="margin-bottom:8px;">Chapter 02 · Cross-Domain Alignment</div>
          <h2>Structured Documents, Source Code &amp; 100+ Languages</h2>
          <div class="prose" style="margin-top:16px;">
            <p>
              Real engineering knowledge isn’t stored in single sentences. Decisions live inside multi-section
              <strong>ADRs and Incident Postmortems</strong>, behavior lives inside <strong>TypeScript, Python, SQL, and Rust</strong>
              files that never mention English buzzwords, and global notes may be written in <strong>Japanese, Spanish, or French</strong>.
            </p>
            <p>
              Try asking an architectural question or describing an algorithm in plain English below: notice how
              <code>FTS5</code> returns zero hits on Japanese or SQL syntax, while the <code>768d</code> vector lands
              directly on the right document or function.
            </p>
          </div>

          <div style="display:flex; flex-direction:column; gap:8px; margin-top:20px;" id="ch2-presets">
            <button type="button" class="btn-chip active" data-q="what HTTP status is returned if a retried settlement token has a different payload hash?" data-exp="doc-adr-014" data-pfx="question_answering">
              <span><strong>Document QA · ADR-014:</strong> Payload hash mismatch HTTP status</span>
            </button>
            <button type="button" class="btn-chip" data-q="why did Envoy 65s timeout vs Bun 60s timeout cause checkout 502 failures in eu-west-1?" data-exp="doc-postmortem-209" data-pfx="question_answering">
              <span><strong>Document QA · Postmortem #209:</strong> Envoy 65s vs Bun 60s desync</span>
            </button>
            <button type="button" class="btn-chip" data-q="traverse manager employee tree hierarchy with depth in SQL" data-exp="code-sql-cte" data-pfx="code_query">
              <span><strong>English → SQL Code:</strong> Manager hierarchy tree traversal</span>
            </button>
            <button type="button" class="btn-chip" data-q="fixed capacity circular queue overwriting oldest element" data-exp="code-rs-ringbuf" data-pfx="code_query">
              <span><strong>English → Rust Code:</strong> Circular overwrite ring buffer</span>
            </button>
            <button type="button" class="btn-chip" data-q="automatic bullet train emergency braking triggered by P-wave earthquake sensors" data-exp="doc-ja-shinkansen" data-pfx="search_query">
              <span><strong>English → Japanese (日本語):</strong> Shinkansen P-wave braking</span>
            </button>
            <button type="button" class="btn-chip" data-q="storing daytime solar heat in molten salt tanks to generate power at night" data-exp="doc-es-solar" data-pfx="search_query">
              <span><strong>English → Spanish (Español):</strong> Molten-salt solar storage</span>
            </button>
          </div>
        </div>

        <div class="col-7">
          <div id="ch2-stage" class="doc-sheet">
            <div class="kicker">Select a cross-domain query to inspect the retrieved document…</div>
          </div>
        </div>
      </div>
    </section>

    <!-- CHAPTER 03: STEERING GEOMETRY WITH TASK PREFIXES -->
    <section id="sec-ch3" class="chapter">
      <div class="grid-12">
        <div class="col-5">
          <div class="kicker kicker-accent" style="margin-bottom:8px;">Chapter 03 · Experiment 2</div>
          <h2>Steering Geometry with Task Instructions</h2>
          <div class="prose" style="margin-top:16px;">
            <p>
              “Similarity” is ill-defined until you state the task. Two questions can be <strong>symmetrically</strong>
              similar paraphrases, whereas a short search query and a 200-word incident postmortem are
              <strong>asymmetrically</strong> related as question-and-evidence.
            </p>
            <p>
              EmbeddingGemma 2 prepends lightweight control instructions—such as
              <code>task: search result | query: …</code> paired with <code>title: … | text: …</code>—rotating the
              embedding subspace to widen the <strong>cosine margin Δ</strong> between the true answer and tempting distractors.
            </p>
          </div>
        </div>

        <div class="col-7">
          <div class="panel" id="ch3-ab-box">
            <div class="kicker" style="margin-bottom:8px;">Live Task-Prefix Margin Tug-of-War (Driven by Active Story Query)</div>
            <div id="ch3-prompt-view" class="mono" style="font-size:12px; padding:10px; background:var(--surface); border:1px solid var(--rule); margin-bottom:16px;"></div>
            <div id="ch3-bars"></div>
          </div>

          <div class="panel-subtle" style="margin-top:16px;">
            <div class="kicker" style="margin-bottom:10px;">Ad-Hoc Two-String Geometry Comparator (Raw vs Symmetric vs Asymmetric)</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
              <input id="cmp-a" type="text" value="what HTTP status is returned when an idempotency token payload hash mismatches?" aria-label="Text A" />
              <input id="cmp-b" type="text" value="Payload SHA-256 mismatches under the same token immediately return HTTP 422 Unprocessable Entity." aria-label="Text B" />
            </div>
            <button id="btn-cmp" type="button">Compare Pair Across Prefixes &amp; MRL</button>
            <div id="cmp-out" style="margin-top:12px;"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- CHAPTER 04: MATRYOSHKA REPRESENTATION LEARNING -->
    <section id="sec-ch4" class="chapter">
      <div class="grid-12">
        <div class="col-5">
          <div class="kicker kicker-accent" style="margin-bottom:8px;">Chapter 04 · Experiment 3</div>
          <h2>The Russian Nesting Doll Inside Every Vector</h2>
          <div class="prose" style="margin-top:16px;">
            <p>
              Normally, the 768 floats of an embedding are entangled: slicing off the back two-thirds destroys cosine
              angles. <strong>Matryoshka Representation Learning (MRL)</strong> trains nested coarse-to-fine prefixes
              at <code>768d</code>, <code>512d</code>, <code>256d</code>, and <code>128d</code>.
            </p>
            <p>
              Slice the live coordinate ribbon on the right and re-normalize onto the unit sphere: at
              <strong>256 dimensions (1,024 bytes/item)</strong>, index RAM drops <strong>3×</strong> while preserving
              near-identical DiskANN rankings inside SQLite.
            </p>
          </div>
        </div>

        <div class="col-7">
          <div class="panel">
            <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
              <div class="kicker">Live 768d Coordinate Fingerprint (96 Sampled Axes · Active Query)</div>
              <div id="mrl-active-label" class="mono" style="font-size:12px; color:var(--accent);">768d · 3,072 B/vec (1:1)</div>
            </div>

            <div id="mrl-dim-btns" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
              <button type="button" class="btn-chip active" data-dim="768">768d · Full (3,072 B)</button>
              <button type="button" class="btn-chip" data-dim="512">512d · 1.5× Smaller (2,048 B)</button>
              <button type="button" class="btn-chip" data-dim="256">256d · 3× Smaller (1,024 B)</button>
              <button type="button" class="btn-chip" data-dim="128">128d · 6× Smaller (512 B)</button>
            </div>

            <div id="vec-ribbon" class="vec-ribbon" aria-label="Vector coordinate bars"></div>
            <div id="mrl-table-wrap" style="margin-top:16px;"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- CHAPTER 05: ZERO-OCR VISDOCS, VISUAL SCENES & PLAYABLE AUDIO -->
    <section id="sec-ch5" class="chapter">
      <div class="grid-12" style="margin-bottom:24px;">
        <div class="col-5">
          <div class="kicker kicker-accent" style="margin-bottom:8px;">Chapter 05 · Experiment 4 · True Multimodal Space</div>
          <h2>Reading Scanned Pages, Scenes &amp; Sound Without Captions</h2>
          <div class="prose" style="margin-top:16px;">
            <p>
              EmbeddingGemma 2 couples its <code>270M</code> text backbone with a <code>170M</code> vision encoder and
              a <code>300M</code> audio encoder. Every item below was stored in SQLite with <strong>empty text
              (<code>content = ""</code>)</strong> and excluded from <code>FTS5</code>—so keyword search is completely blind.
            </p>
            <p>
              Test three distinct sensory capabilities live:
              <strong>Scanned Visual Documents</strong> (pixel-rendered invoices &amp; SLO tables read with zero OCR),
              <strong>Procedural Visual Scenes</strong>, and <strong>Playable 16 kHz WAV Audio</strong>.
            </p>
          </div>
        </div>

        <div class="col-7">
          <div class="panel-subtle">
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;" id="ch5-tabs">
              <button type="button" class="btn-chip active" data-smod="visdoc">Scanned VisDocs · Zero OCR (3)</button>
              <button type="button" class="btn-chip" data-smod="image">Visual Scenes · Pixels (5)</button>
              <button type="button" class="btn-chip" data-smod="audio">Playable Audio · 16kHz WAV (3)</button>
              <button type="button" class="btn-chip" data-smod="all">All 11 Sensory Items</button>
            </div>

            <div class="kicker" style="margin-bottom:8px;">Try a Cross-Modal Prompt (or Type Your Own Question)</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;" id="ch5-prompts">
              <button type="button" class="btn-chip active" data-smod="visdoc" data-q="How much was paid on invoice 4082 for Nebula H200 GPU nodes?">Invoice #4082 GPU total?</button>
              <button type="button" class="btn-chip" data-smod="visdoc" data-q="What was the Redis Cache P99 latency in milliseconds during the SLO breach?">Redis P99 SLO latency?</button>
              <button type="button" class="btn-chip" data-smod="visdoc" data-q="What is the Q3 annual recurring revenue ARR and net retention percentage?">Q3 ARR &amp; retention?</button>
              <button type="button" class="btn-chip" data-smod="image" data-q="red octagonal warning stop sign with white bar">Stop sign scene</button>
              <button type="button" class="btn-chip" data-smod="image" data-q="bright yellow orange sun setting over blue ocean waves">Ocean sunset scene</button>
              <button type="button" class="btn-chip" data-smod="image" data-q="dark computer terminal window with green source code lines">Terminal code scene</button>
              <button type="button" class="btn-chip" data-smod="audio" data-q="loud alternating high-low emergency alarm siren">Emergency siren WAV</button>
              <button type="button" class="btn-chip" data-smod="audio" data-q="continuous wind static ocean waves white noise">Ocean surf WAV</button>
              <button type="button" class="btn-chip" data-smod="audio" data-q="musical ascending bell chime melody notes">Ascending chime WAV</button>
            </div>

            <form id="ch5-form" style="display:flex; gap:8px;">
              <input id="ch5-input" type="text" value="How much was paid on invoice 4082 for Nebula H200 GPU nodes?" aria-label="Sensory query" />
              <button type="submit" class="btn-accent" style="flex-shrink:0;">Score Media</button>
            </form>
          </div>
        </div>
      </div>

      <div id="ch5-gallery" class="sensory-grid"></div>
    </section>

    <!-- CHAPTER 06: BIG PDF PAPERS & POWERPOINT DECKS — SEEING HOW THE MODEL SEES -->
    <section id="sec-papers" class="chapter">
      <div class="grid-12" style="margin-bottom:24px;">
        <div class="col-5">
          <div class="kicker kicker-accent" style="margin-bottom:8px;">Chapter 06 · Experiment 5 · PDFs &amp; PowerPoint Decks</div>
          <h2>Big PDF Papers &amp; Slide Decks: Seeing How the Model Sees</h2>
          <div class="prose" style="margin-top:16px;">
            <p>
              What actually happens when you feed a <strong>35-page NeurIPS PDF paper</strong> or an
              <strong>8-slide executive PowerPoint (<code>.pptx</code>)</strong> into EmbeddingGemma 2?
              Every page and slide below is indexed three ways inside SQLite so you can compare what each “eye” perceives:
            </p>
            <p>
              <strong>1. Pure Vision PNG (<code>{ image }</code>):</strong> Reads multi-column layouts, Transformer
              wiring diagrams, sinusoidal LaTeX equations where text parsers mangle subscripts, and graphical PowerPoint
              charts that have zero XML text—yet is completely blind to hidden <strong>Presenter Speaker Notes</strong>.<br/>
              <strong>2. Extracted Text + Notes:</strong> Catches hidden Speaker Notes and tiny 6pt footnote strings,
              but goes blind on graphical charts and figures.<br/>
              <strong>3. Fused Bimodal (<code>{ image, text }</code>):</strong> Combines pixels, text, and notes in one <code>768d</code> vector.
            </p>
          </div>
        </div>

        <div class="col-7">
          <div class="panel-subtle" style="margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
              <div class="kicker">Indexed Multi-Page PDFs &amp; PowerPoint (.pptx) Decks</div>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <a id="doc-download-link" class="btn" href="/api/docs/pdf-attention/download" style="min-height:36px; padding:4px 12px; font-size:12px; text-decoration:none;">Download Active .pdf / .pptx ↓</a>
                <button id="btn-seed-docs" type="button" style="min-height:36px; padding:4px 12px; font-size:12px;">Index / Refresh Sample PDFs &amp; Decks</button>
              </div>
            </div>

            <div id="doc-shelf" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px;"></div>

            <div class="kicker" style="margin-bottom:8px;">Curated “See What Each Eye Sees” Queries</div>
            <div id="doc-presets" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;"></div>

            <form id="doc-search-form" style="display:flex; gap:8px;">
              <input id="doc-query-input" type="text" value="Scaled Dot-Product Attention and Multi-Head Attention block diagram figure" aria-label="PDF and PowerPoint query" />
              <button type="submit" class="btn-accent" style="flex-shrink:0;">X-Ray Pages</button>
            </form>
            <div id="doc-story-note" class="mono" style="margin-top:8px; font-size:11px; color:var(--fg-body);"></div>
          </div>

          <!-- Upload Any .pdf or .pptx -->
          <form id="doc-upload-form" class="panel" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; padding:12px 16px;">
            <div style="font-size:12px;">
              <strong>Upload Your Own <code>.pdf</code> Paper or <code>.pptx</code> Deck:</strong>
              <input id="doc-upload-file" type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" required style="margin-left:8px; font-size:12px;" />
            </div>
            <button type="submit" class="btn-primary" style="min-height:38px; padding:6px 14px;">Rasterize &amp; Index File</button>
            <div id="doc-upload-status" class="mono" style="width:100%; font-size:11px; color:var(--fg-muted);"></div>
          </form>
        </div>
      </div>

      <!-- Full-Document Page/Slide Heatmap Strip -->
      <div class="panel" style="margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
          <div class="kicker" id="heatmap-title">Page-by-Page Activation Strip (Click Any Page or Slide to Inspect)</div>
          <div class="mono" style="font-size:11px; color:var(--fg-muted);">
            <span style="color:var(--accent);">■</span> Vision-Only PNG Cosine &nbsp;·&nbsp; <span>■</span> Extracted Text + Notes Cosine
          </div>
        </div>
        <div id="doc-heatmap" class="page-heatmap"></div>
      </div>

      <!-- 3-Lens Comparison Race -->
      <div id="doc-lens-race" class="race-grid" style="margin-bottom:24px;"></div>

      <!-- Split Page/Slide X-Ray Viewer + 4-DPI Visual Acuity X-Ray -->
      <div class="grid-12">
        <div class="col-6">
          <div class="doc-sheet">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; padding-bottom:12px; margin-bottom:14px; border-bottom:1px solid var(--rule);">
              <div>
                <div class="kicker kicker-accent" id="xray-visual-kicker">Visual Eye · 170M Vision Encoder Input</div>
                <h3 id="xray-page-heading" style="margin-top:4px;">Page Preview</h3>
              </div>
              <div style="display:flex; gap:6px;">
                <button id="btn-prev-page" type="button" style="min-height:38px; padding:4px 12px;">← Prev</button>
                <button id="btn-next-page" type="button" style="min-height:38px; padding:4px 12px;">Next →</button>
              </div>
            </div>
            <div style="background:var(--surface); border:1px solid var(--rule); padding:12px; text-align:center;">
              <img id="xray-page-img" src="" alt="Rendered PDF page or PowerPoint slide" style="max-width:100%; max-height:660px; height:auto; border:1px solid var(--rule-strong);" />
            </div>
          </div>
        </div>

        <div class="col-6">
          <div class="doc-sheet" style="margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; padding-bottom:12px; margin-bottom:12px; border-bottom:1px solid var(--rule);">
              <div>
                <div class="kicker">Resolution Acuity X-Ray · How Sharp Must Pixels Be?</div>
                <div style="font-size:13px; color:var(--fg-body); margin-top:2px;">Renders this exact page/slide at 4 DPIs (<code>0.25× → 1.75×</code>) and scores each PNG live.</div>
              </div>
              <button id="btn-run-acuity" type="button" class="btn-accent" style="min-height:38px;">Run 4-DPI Acuity X-Ray</button>
            </div>
            <div id="acuity-output">
              <div class="mono" style="font-size:12px; color:var(--fg-muted);">Click “Run 4-DPI Acuity X-Ray” to see how thumbnail blur vs. crisp 1.75× rendering changes cosine similarity on this page.</div>
            </div>
          </div>

          <div class="panel-subtle">
            <div class="kicker" style="margin-bottom:8px;">Parser Eye · Raw Extracted Text &amp; Hidden PowerPoint Speaker Notes</div>
            <div id="xray-notes-box" style="display:none; margin-bottom:12px; padding:12px; border:2px solid var(--accent); background:var(--accent-10); font-size:12.5px;"></div>
            <pre id="xray-text-layer" class="code-sheet" style="max-height:340px; overflow-y:auto; white-space:pre-wrap;"></pre>
          </div>
        </div>
      </div>
    </section>

    <!-- CHAPTER 07: ONE-AT-A-TIME CASE STEPPER, FULL BENCHMARK & CUSTOM INGEST -->
    <section id="sec-ch6" class="chapter" style="border-bottom:0;">
      <div class="grid-12" style="margin-bottom:28px;">
        <div class="col-6">
          <div class="kicker kicker-accent" style="margin-bottom:8px;">Chapter 07 · Quantitative Verification</div>
          <h2>26-Case Step-by-Step Inspector &amp; Full Lab Suite</h2>
        </div>
        <div class="col-6">
          <div class="prose">
            <p>
              Step through all <strong>26 individual evaluation cases</strong> one at a time, run a single experiment
              in isolation, execute the full 4-part quantitative benchmark, or ingest your own custom document,
              image, or WAV clip into SQLite.
            </p>
          </div>
        </div>
      </div>

      <div class="grid-12">
        <!-- Single Case Stepper -->
        <div class="col-7">
          <div class="panel" style="margin-bottom:20px;">
            <div class="kicker" style="margin-bottom:10px;">One-at-a-Time Case Diagnostic (26 Cases Across 6 Modalities)</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
              <button id="case-prev" type="button">← Prev</button>
              <select id="case-select" style="flex:1; min-width:220px;" aria-label="Select individual test case"></select>
              <button id="case-next" type="button">Next →</button>
              <button id="case-run" type="button" class="btn-primary">Run Case</button>
            </div>
            <div id="case-output" class="mono" style="font-size:12px; color:var(--fg-body);">
              Select any case above and click “Run Case” to inspect FTS5, Vector, Hybrid RRF, Prefix Δ, and MRL 768d→128d ranks.
            </div>
          </div>

          <div class="panel">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
              <div class="kicker">Quantitative Benchmark Runner</div>
              <div style="display:flex; flex-wrap:wrap; gap:6px;">
                <button type="button" class="exp-btn" data-exp="hybrid">Exp 1 · Hybrid</button>
                <button type="button" class="exp-btn" data-exp="prefixes">Exp 2 · Prefixes</button>
                <button type="button" class="exp-btn" data-exp="mrl">Exp 3 · MRL</button>
                <button type="button" class="exp-btn" data-exp="multimodal">Exp 4 · Multimodal</button>
                <button id="btn-bench-all" type="button" class="btn-accent">Run All 4</button>
              </div>
            </div>
            <div id="bench-output" style="font-size:13px; color:var(--fg-body);">
              Click an individual experiment or “Run All 4” to compute live Hit@1, MRR, Margin Δ, and MRL drift against Ollama + libSQL.
            </div>
          </div>
        </div>

        <!-- Custom Multimodal Ingest -->
        <div class="col-5">
          <div class="panel-subtle">
            <div class="kicker" style="margin-bottom:10px;">Ingest Custom Document, Code, Image or WAV into SQLite</div>
            <form id="ingest-form" style="display:flex; flex-direction:column; gap:10px;">
              <input id="ing-title" type="text" placeholder="Title (e.g., ADR-019 or Diagram Scan)" required />
              <select id="ing-mod" aria-label="Modality">
                <option value="document">document (Markdown ADR / RFC / Spec)</option>
                <option value="text">text (Short note)</option>
                <option value="code">code (Source snippet)</option>
                <option value="visdoc">visdoc (Scanned document PNG)</option>
                <option value="image">image (Visual scene PNG/JPEG)</option>
                <option value="audio">audio (16kHz WAV clip)</option>
              </select>
              <textarea id="ing-content" placeholder="Markdown document body, note text, or source code (optional when uploading PNG/WAV)…"></textarea>
              <div style="font-size:12px; color:var(--fg-muted);">
                Optional PNG/JPEG or WAV file:
                <input id="ing-file" type="file" accept="image/*,audio/wav,audio/*" style="margin-top:6px; display:block;" />
              </div>
              <button type="submit" class="btn-primary">Embed 768d→128d &amp; Save to libSQL</button>
              <div id="ing-status" class="mono" style="font-size:11px; color:var(--fg-muted);"></div>
            </form>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer class="container" style="padding:32px clamp(20px, 4vw, 48px) 56px; border-top:1px solid var(--rule); display:flex; justify-content:space-between; flex-wrap:wrap; gap:12px;">
    <div class="kicker">TheFocus.AI · EmbeddingGemma 2 Local Multimodal Lab</div>
    <div class="mono" style="font-size:11px; color:var(--fg-muted);">CLI: mise run cases · mise run case -- q-doc-1 · mise run bench</div>
  </footer>

  <script type="module">
    const state = {
      items: [],
      cases: [],
      activeModFilter: "all",
      selectedItemId: "doc-adr-014",
      lastStory: null,
      activeMrlDim: 768,
      activeSensoryMod: "visdoc",
      sensoryScores: {},
      activeSensoryQuery: "",
      docBundles: [],
      docShowcase: [],
      activeDocId: "pdf-attention",
      activeDocPages: [],
      activePageNumber: 4,
      lastDocInspect: null,
      omniScope: "all",
      omniLens: "hybrid",
      omniDim: 768,
      omniImageDataUrl: null,
      omniAudioDataUrl: null,
      omniFileName: "",
      omniHits: [],
      omniRollup: [],
      omniSelectedUid: null,
      omniLastQuery: "",
      docPagesCache: {},
    };

    const $ = (id) => document.getElementById(id);

    function esc(str) {
      return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    // Lightweight safe Markdown renderer for full corpus documents
    function renderMarkdown(md) {
      const lines = String(md ?? "").split("\\n");
      let html = "";
      let inList = false;
      const inlineFmt = (s) =>
        esc(s)
          .replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>")
          .replace(/\`([^\`]+)\`/g, "<code>$1</code>");

      for (const raw of lines) {
        const line = raw.trimEnd();
        if (line.startsWith("# ")) {
          if (inList) { html += "</ul>"; inList = false; }
          html += "<h1>" + inlineFmt(line.slice(2)) + "</h1>";
        } else if (line.startsWith("## ")) {
          if (inList) { html += "</ul>"; inList = false; }
          html += "<h2>" + inlineFmt(line.slice(3)) + "</h2>";
        } else if (/^([-*]|\\d+\\.)\\s+/.test(line)) {
          if (!inList) { html += "<ul>"; inList = true; }
          html += "<li>" + inlineFmt(line.replace(/^([-*]|\\d+\\.)\\s+/, "")) + "</li>";
        } else if (line.trim() === "") {
          if (inList) { html += "</ul>"; inList = false; }
        } else {
          if (inList) { html += "</ul>"; inList = false; }
          html += "<p>" + inlineFmt(line) + "</p>";
        }
      }
      if (inList) html += "</ul>";
      return '<div class="md-render">' + html + "</div>";
    }

    async function api(path, opts) {
      const res = await fetch(path, opts);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
      return data;
    }

    async function refreshStatusAndCorpus() {
      const [status, itemsRes, casesRes] = await Promise.all([
        api("/api/status"),
        api("/api/items"),
        api("/api/cases"),
      ]);

      // Auto-seed if empty or older schema had fewer than 30 items
      if (status.store.totalItems < 30 && status.ollama.ok && status.ollama.modelAvailable) {
        $("live-dot").textContent = "Seeding 6-modality corpus…";
        await api("/api/seed", { method: "POST" });
        return refreshStatusAndCorpus();
      }

      state.items = itemsRes.items || [];
      state.cases = casesRes.cases || [];

      const ok = status.ollama.ok && status.ollama.modelAvailable;
      const totalSearchable = status.store.totalItems + (status.store.docPagesCount ?? 0);
      $("live-dot").innerHTML = ok
        ? '<span style="color:var(--accent);">●</span> Ollama Ready · ' + totalSearchable + " searchable units"
        : "○ Ollama Offline (run: mise run model:pull)";

      const bm = status.store.byModality || {};
      $("st-total").textContent = String(status.store.totalItems);
      $("st-pdf-pages").textContent = String(status.store.docPagesCount ?? 0);
      $("st-doc").textContent = String(bm.document ?? 0);
      $("st-visdoc").textContent = String(bm.visdoc ?? 0);
      $("st-image").textContent = String(bm.image ?? 0);
      $("st-audio").textContent = String(bm.audio ?? 0);
      $("st-code-text").textContent = String((bm.code ?? 0) + (bm.text ?? 0));

      renderCorpusFilterCounts();
      renderOmniScopeCounts();
      renderCorpusList();
      renderInspector(state.selectedItemId);
      populateCaseSelect();
      renderSensoryGallery();
    }

    function renderCorpusFilterCounts() {
      const counts = { all: state.items.length };
      for (const it of state.items) counts[it.modality] = (counts[it.modality] || 0) + 1;
      const labels = {
        all: "All Modalities",
        document: "Documents · ADRs & Postmortems",
        visdoc: "Scanned VisDocs · PNG Pages",
        image: "Visual Scenes · Pixel PNGs",
        audio: "Audio · 16kHz WAVs",
        code: "Source Code",
        text: "Notes & Multilingual",
      };
      document.querySelectorAll("#corpus-filters button").forEach((btn) => {
        const m = btn.dataset.mod;
        btn.textContent = labels[m] + " (" + (counts[m] || 0) + ")";
        btn.classList.toggle("active", m === state.activeModFilter);
      });
    }

    function renderCorpusList() {
      const filtered = state.activeModFilter === "all"
        ? state.items
        : state.items.filter((i) => i.modality === state.activeModFilter);

      const scores = state.lastStory?.allVectorScores || {};
      $("corpus-list").innerHTML = filtered.map((item) => {
        let thumb = '<span class="mono">' + esc(item.modality.slice(0, 4).toUpperCase()) + "</span>";
        if (item.imageDataUrl) {
          thumb = '<img src="' + esc(item.imageDataUrl) + '" alt="' + esc(item.title) + '" />';
        } else if (item.modality === "audio") {
          thumb = '<span class="mono" style="color:var(--accent);">▶ WAV</span>';
        }
        const cos = scores[item.id];
        const cosBadge = typeof cos === "number"
          ? '<span class="mono" style="font-size:11px; color:var(--fg-muted);">' + cos.toFixed(3) + "</span>"
          : '<span class="tag">' + esc(item.language) + "</span>";

        return '<button type="button" class="corpus-row ' + (item.id === state.selectedItemId ? "active" : "") + '" data-item-id="' + esc(item.id) + '">' +
          '<div class="thumb-box">' + thumb + "</div>" +
          '<div style="min-width:0;">' +
            '<div style="font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + esc(item.title) + "</div>" +
            '<div class="mono" style="font-size:11px; color:var(--fg-muted);">' + esc(item.id) + " · " + esc(item.category) + "</div>" +
          "</div>" +
          "<div>" + cosBadge + "</div>" +
        "</button>";
      }).join("");

      document.querySelectorAll("#corpus-list .corpus-row").forEach((row) => {
        row.addEventListener("click", () => {
          state.selectedItemId = row.dataset.itemId;
          renderCorpusList();
          renderInspector(state.selectedItemId);
        });
      });
    }

    function renderItemBodyHtml(item) {
      if (item.modality === "document") {
        return renderMarkdown(item.content);
      }
      if (item.modality === "code") {
        return '<pre class="code-sheet"><code>' + esc(item.content) + "</code></pre>";
      }
      if (item.modality === "visdoc" || item.modality === "image") {
        const gt = item.metadata?.groundTruthNote
          ? '<div style="margin-top:12px; padding:10px 12px; border:1px solid var(--rule); background:var(--surface); font-size:12px; color:var(--fg-body);">' +
              '<span class="kicker">Lab Ground-Truth Verification Note (Never Sent to SQLite FTS5 or Ollama):</span><br/>' +
              esc(item.metadata.groundTruthNote) +
            "</div>"
          : "";
        return '<div style="border:1px solid var(--rule); background:var(--surface); padding:16px; text-align:center;">' +
          '<img src="' + esc(item.imageDataUrl) + '" alt="' + esc(item.title) + '" style="max-width:100%; width:' + (item.modality === "visdoc" ? "520px" : "260px") + '; height:auto; image-rendering:pixelated; border:1px solid var(--rule-strong);" />' +
          '<div class="mono" style="margin-top:10px; font-size:11px; color:var(--fg-muted);">SQLite content = "" · Embedded purely via { image: base64Png }</div>' +
        "</div>" + gt;
      }
      if (item.modality === "audio") {
        const gt = item.metadata?.groundTruthNote
          ? '<div style="margin-top:12px; padding:10px 12px; border:1px solid var(--rule); background:var(--surface); font-size:12px; color:var(--fg-body);">' +
              '<span class="kicker">Acoustic Ground-Truth Note (Not Indexed in SQLite Text):</span><br/>' +
              esc(item.metadata.groundTruthNote) +
            "</div>"
          : "";
        return '<div style="border:1px solid var(--rule); background:var(--surface); padding:20px;">' +
          '<div class="kicker" style="margin-bottom:10px;">16 kHz 16-bit Mono PCM WAV · Embedded via 300M Audio Encoder</div>' +
          '<audio controls preload="metadata" src="' + esc(item.audioDataUrl) + '"></audio>' +
          '<div class="mono" style="margin-top:8px; font-size:11px; color:var(--fg-muted);">SQLite content = "" · Embedded purely via { audio: base64Wav }</div>' +
        "</div>" + gt;
      }
      return '<div class="prose" style="font-size:1.04rem;"><p>' + esc(item.content) + "</p></div>";
    }

    function renderInspector(itemId) {
      const item = state.items.find((i) => i.id === itemId) || state.items[0];
      if (!item) return;
      state.selectedItemId = item.id;

      $("inspector-pane").innerHTML =
        '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; padding-bottom:14px; margin-bottom:18px; border-bottom:1px solid var(--rule);">' +
          "<div>" +
            '<div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">' +
              '<span class="tag tag-target">' + esc(item.modality) + "</span>" +
              '<span class="tag">' + esc(item.language) + "</span>" +
              '<span class="mono" style="font-size:11px; color:var(--fg-muted);">' + esc(item.id) + "</span>" +
            "</div>" +
            "<h3>" + esc(item.title) + "</h3>" +
          "</div>" +
          '<button id="btn-find-similar" type="button">Find Cross-Modal Neighbors →</button>' +
        "</div>" +
        renderItemBodyHtml(item) +
        '<div id="similar-drawer" style="margin-top:20px;"></div>';

      $("btn-find-similar")?.addEventListener("click", async () => {
        const drawer = $("similar-drawer");
        drawer.innerHTML = '<div class="mono" style="font-size:12px; color:var(--fg-muted);">Querying 768d cosine neighborhood across all 6 modalities…</div>';
        try {
          const res = await api("/api/items/similar", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: item.id, limit: 6 }),
          });
          drawer.innerHTML =
            '<div class="kicker" style="margin-bottom:10px; padding-top:14px; border-top:1px solid var(--rule);">Nearest Neighbors on the 768d Sphere (Click Any Item to Inspect)</div>' +
            '<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap:8px;">' +
              res.neighbors.map((n) =>
                '<button type="button" class="btn-chip sim-jump" data-jump="' + esc(n.id) + '" style="display:flex; flex-direction:column; align-items:flex-start; gap:3px; padding:10px;">' +
                  '<div style="display:flex; justify-content:space-between; width:100%;">' +
                    '<span class="tag">' + esc(n.modality) + "</span>" +
                    '<span class="mono" style="font-size:11px; color:var(--accent);">cos ' + (n.cosineSimilarity ?? 0).toFixed(4) + "</span>" +
                  "</div>" +
                  '<div style="font-weight:500; font-size:12px; margin-top:4px;">' + esc(n.title) + "</div>" +
                "</button>"
              ).join("") +
            "</div>";
          drawer.querySelectorAll(".sim-jump").forEach((b) => {
            b.addEventListener("click", () => {
              state.selectedItemId = b.dataset.jump;
              renderCorpusList();
              renderInspector(state.selectedItemId);
            });
          });
        } catch (err) {
          drawer.innerHTML = '<div style="color:var(--accent); font-size:12px;">' + esc(err.message) + "</div>";
        }
      });
    }

    function jumpToInspector(itemId) {
      if (!itemId) return;
      state.selectedItemId = itemId;
      renderCorpusList();
      renderInspector(itemId);
      $("sec-corpus").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Chapter 01 + 03 + 04 unified live inspection
    async function runStoryInspect(opts) {
      $("ch1-meta").textContent = "Embedding query & racing SQLite FTS5, libSQL 768d Vector, Hybrid RRF, Prefixes & MRL…";
      try {
        const data = await api("/api/story/inspect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(opts),
        });
        state.lastStory = data;
        $("ch1-meta").textContent =
          'Prompt: "' + data.formattedQuery + '" · Ollama embed: ' + data.embedMs.toFixed(1) + " ms";

        renderCh1Race(data, opts.expectedId);
        renderCh3PrefixAb(data);
        renderCh4Mrl(data);
        renderCorpusList();
        return data;
      } catch (err) {
        $("ch1-meta").textContent = "Error: " + err.message;
      }
    }

    function renderCh1Race(data, expectedId) {
      const cols = [
        { title: "SQLite FTS5 (BM25)", sub: "Exact lexical word tokens", hits: data.fts5, metric: (h) => "BM25 " + h.score.toFixed(2) },
        { title: "libSQL Vector (768d)", sub: "Dense semantic cosine", hits: data.vector768, metric: (h) => "cos " + (h.cosineSimilarity ?? 0).toFixed(4) },
        { title: "Hybrid RRF (k=12)", sub: "Vector + FTS5 rank fusion", hits: data.hybridRrf, metric: (h) => "RRF " + h.score.toFixed(4) },
      ];

      $("ch1-race").innerHTML = cols.map((col) => {
        const body = col.hits.length === 0
          ? '<div style="padding:18px 12px; border:1px dashed var(--rule-strong); font-size:12px; color:var(--fg-muted);">0 lexical matches — query shares no indexed keywords with corpus.</div>'
          : col.hits.slice(0, 3).map((h, idx) => {
              const isExp = expectedId && h.id === expectedId;
              return '<div class="hit-card ' + (isExp ? "is-expected" : "") + '" data-inspect="' + esc(h.id) + '">' +
                '<div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:4px;">' +
                  '<span class="mono" style="font-size:11px; font-weight:500;">#' + (idx + 1) + " · " + esc(h.modality) + "</span>" +
                  '<span class="mono" style="font-size:11px; color:' + (isExp ? "var(--accent)" : "var(--fg-muted)") + ';">' + col.metric(h) + "</span>" +
                "</div>" +
                '<div style="font-size:13px; font-weight:500; line-height:1.35;">' + esc(h.title) + "</div>" +
                '<div class="mono" style="font-size:10px; color:var(--fg-muted); margin-top:4px;">' + esc(h.id) + (isExp ? " · ★ TARGET" : "") + " · Click to read</div>" +
              "</div>";
            }).join("");

        return "<div>" +
          '<div style="padding-bottom:8px; margin-bottom:10px; border-bottom:1px solid var(--rule-strong);">' +
            '<div style="font-size:13px; font-weight:600;">' + col.title + "</div>" +
            '<div class="mono" style="font-size:11px; color:var(--fg-muted);">' + col.sub + "</div>" +
          "</div>" +
          body +
        "</div>";
      }).join("");

      document.querySelectorAll("#ch1-race .hit-card").forEach((card) => {
        card.addEventListener("click", () => jumpToInspector(card.dataset.inspect));
      });
    }

    // Chapter 02 Cross-Domain Document & Code Stage
    async function runCh2Stage(query, expectedId, prefix) {
      const stage = $("ch2-stage");
      stage.innerHTML = '<div class="mono" style="font-size:12px; color:var(--fg-muted);">Running cross-domain retrieval against Ollama + SQLite…</div>';
      const data = await runStoryInspect({ query, expectedId, prefix });
      if (!data) return;

      const topHit = data.vector768[0];
      const fullItem = state.items.find((i) => i.id === (topHit?.id || expectedId));
      const ftsCount = data.fts5.length;

      stage.innerHTML =
        '<div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px; padding-bottom:14px; margin-bottom:16px; border-bottom:1px solid var(--rule);">' +
          "<div>" +
            '<div class="kicker">Query → Retrieved ' + esc(fullItem?.modality || "item") + "</div>" +
            '<div style="font-size:14px; font-weight:500; margin-top:4px;">“' + esc(query) + '”</div>' +
          "</div>" +
          '<div class="mono" style="font-size:11px; text-align:right;">' +
            '<div>FTS5 BM25: <strong>' + (ftsCount === 0 ? "0 hits" : "#" + (data.fts5.findIndex((x) => x.id === expectedId) + 1 || "miss")) + "</strong></div>" +
            '<div style="color:var(--accent);">768d Vector: <strong>#1 (' + ((topHit?.cosineSimilarity ?? 0).toFixed(4)) + ")</strong></div>" +
          "</div>" +
        "</div>" +
        (fullItem
          ? '<div style="margin-bottom:10px; display:flex; align-items:center; gap:8px;">' +
              '<span class="tag tag-target">' + esc(fullItem.modality) + " · " + esc(fullItem.language) + "</span>" +
              "<strong>" + esc(fullItem.title) + "</strong>" +
            "</div>" +
            renderItemBodyHtml(fullItem)
          : "");
    }

    // Chapter 03 Prefix A/B Margin Bars
    function renderCh3PrefixAb(data) {
      const ab = data.prefixAb;
      $("ch3-prompt-view").textContent = "Steered input → " + data.formattedQuery;
      const pctBar = (v) => Math.max(0, Math.min(100, Math.round(v * 100)));
      const deltaGain = ab.steeredMargin - ab.rawMargin;
      const sign = deltaGain >= 0 ? "+" : "";

      $("ch3-bars").innerHTML =
        '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">' +
          "<div>" +
            '<div class="kicker" style="margin-bottom:8px;">A · Raw Unprefixed Query</div>' +
            '<div style="font-size:12px; margin-bottom:4px; display:flex; justify-content:space-between;"><span>Target (<code>' + esc(ab.targetId) + '</code>)</span><span class="mono">' + ab.rawTargetCos.toFixed(4) + "</span></div>" +
            '<div class="bar-track" style="margin-bottom:10px;"><div class="bar-fill" style="width:' + pctBar(ab.rawTargetCos) + '%"></div></div>' +
            '<div style="font-size:12px; margin-bottom:4px; display:flex; justify-content:space-between;"><span>Distractor (<code>' + esc(ab.distractorId) + '</code>)</span><span class="mono">' + ab.rawDistractorCos.toFixed(4) + "</span></div>" +
            '<div class="bar-track"><div class="bar-fill" style="opacity:0.4; width:' + pctBar(ab.rawDistractorCos) + '%"></div></div>' +
            '<div class="mono" style="margin-top:10px; font-size:12px;">Separation Δ = <strong>' + ab.rawMargin.toFixed(4) + "</strong></div>" +
          "</div>" +
          "<div>" +
            '<div class="kicker kicker-accent" style="margin-bottom:8px;">B · Task-Steered Instruction</div>' +
            '<div style="font-size:12px; margin-bottom:4px; display:flex; justify-content:space-between;"><span>Target (<code>' + esc(ab.targetId) + '</code>)</span><span class="mono">' + ab.steeredTargetCos.toFixed(4) + "</span></div>" +
            '<div class="bar-track" style="margin-bottom:10px;"><div class="bar-fill bar-fill-accent" style="width:' + pctBar(ab.steeredTargetCos) + '%"></div></div>' +
            '<div style="font-size:12px; margin-bottom:4px; display:flex; justify-content:space-between;"><span>Distractor (<code>' + esc(ab.distractorId) + '</code>)</span><span class="mono">' + ab.steeredDistractorCos.toFixed(4) + "</span></div>" +
            '<div class="bar-track"><div class="bar-fill" style="opacity:0.4; width:' + pctBar(ab.steeredDistractorCos) + '%"></div></div>' +
            '<div class="mono" style="margin-top:10px; font-size:12px; color:var(--accent);">Separation Δ = <strong>' + ab.steeredMargin.toFixed(4) + "</strong> (" + sign + deltaGain.toFixed(4) + ")</div>" +
          "</div>" +
        "</div>";
    }

    // Chapter 04 Matryoshka Ribbon & Table
    function renderCh4Mrl(data) {
      if (!data) return;
      const keepBars = Math.round((state.activeMrlDim / 768) * 96);
      const maxAbs = Math.max(...data.vectorPreview96.map((v) => Math.abs(v)), 0.05);

      $("vec-ribbon").innerHTML = data.vectorPreview96.map((v, idx) => {
        const h = Math.max(8, Math.round((Math.abs(v) / maxAbs) * 58));
        const cls = "vec-bar " + (v < 0 ? "neg " : "") + (idx >= keepBars ? "sliced" : "");
        return '<div class="' + cls + '" style="height:' + h + 'px" title="coord ' + (idx * 8) + ": " + v.toFixed(4) + '"></div>';
      }).join("");

      const activeRow = data.mrl.find((m) => m.dim === state.activeMrlDim) || data.mrl[0];
      $("mrl-active-label").textContent =
        activeRow.dim + "d · " + activeRow.bytesPerVec + " B/vec (" + activeRow.ratio + " · " + activeRow.mbPer100k + " MB / 100k items)";

      $("mrl-table-wrap").innerHTML =
        "<table><thead><tr><th>Subspace</th><th>Bytes/Vec</th><th>100k Footprint</th><th>DiskANN Top-1 Hit</th><th>Top-1 Cosine</th><th>Drift vs 768d</th></tr></thead><tbody>" +
        data.mrl.map((m) => {
          const top = m.topHits[0];
          const isSel = m.dim === state.activeMrlDim;
          return '<tr style="' + (isSel ? "background:var(--accent-10); font-weight:500;" : "") + '">' +
            '<td class="mono">' + m.dim + "d (" + m.ratio + ")</td>" +
            '<td class="mono">' + m.bytesPerVec + " B</td>" +
            '<td class="mono">' + m.mbPer100k + " MB</td>" +
            "<td>" + esc(top?.id || "—") + "</td>" +
            '<td class="mono">' + ((top?.cosineSimilarity ?? 0).toFixed(4)) + "</td>" +
            '<td class="mono">' + m.top1Drift.toFixed(4) + "</td>" +
          "</tr>";
        }).join("") +
        "</tbody></table>";
    }

    // Chapter 05 Sensory Arena (VisDocs, Visual Scenes, Playable WAV Audio)
    async function scoreSensoryQuery(query) {
      state.activeSensoryQuery = query;
      const prefix = query.includes("?") ? "question_answering" : "search_query";
      const res = await api("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, mode: "vector_exact", prefix, dim: 768, limit: 40 }),
      });
      const map = {};
      for (const h of res.hits) map[h.id] = h.cosineSimilarity ?? 0;
      state.sensoryScores = map;
      renderSensoryGallery();
    }

    function renderSensoryGallery() {
      const sensoryItems = state.items.filter((i) =>
        state.activeSensoryMod === "all"
          ? i.modality === "visdoc" || i.modality === "image" || i.modality === "audio"
          : i.modality === state.activeSensoryMod,
      );

      const scored = sensoryItems
        .map((it) => ({ item: it, cos: state.sensoryScores[it.id] ?? null }))
        .sort((a, b) => (b.cos ?? -1) - (a.cos ?? -1));

      const bestId = scored[0]?.cos !== null ? scored[0]?.item.id : null;

      $("ch5-gallery").innerHTML = scored.map(({ item, cos }, idx) => {
        const isWin = item.id === bestId && cos !== null;
        let media = "";
        if (item.modality === "visdoc" || item.modality === "image") {
          media = '<div class="sensory-media"><img src="' + esc(item.imageDataUrl) + '" alt="' + esc(item.title) + '" /></div>';
        } else {
          media = '<div class="sensory-media" style="flex-direction:column; padding:14px; gap:8px;">' +
            '<div class="mono" style="font-size:11px; color:var(--fg-muted);">16kHz PCM WAV · 2.4s</div>' +
            '<audio controls preload="metadata" src="' + esc(item.audioDataUrl) + '"></audio>' +
          "</div>";
        }
        const pct = cos !== null ? Math.max(4, Math.min(100, Math.round(cos * 100))) : 0;

        return '<div class="sensory-card ' + (isWin ? "winner" : "") + '">' +
          '<div style="display:flex; justify-content:space-between; align-items:center;">' +
            '<span class="tag ' + (isWin ? "tag-target" : "") + '">' + (isWin ? "★ #1 MATCH · " : "#" + (idx + 1) + " · ") + esc(item.modality) + "</span>" +
            '<span class="mono" style="font-size:12px; font-weight:500; color:' + (isWin ? "var(--accent)" : "var(--fg)") + ';">' + (cos !== null ? "cos " + cos.toFixed(4) : "—") + "</span>" +
          "</div>" +
          media +
          "<div>" +
            '<div style="font-size:14px; font-weight:500;">' + esc(item.title) + "</div>" +
            '<div class="mono" style="font-size:11px; color:var(--fg-muted);">' + esc(item.id) + ' · SQLite text=""</div>' +
          "</div>" +
          '<div class="bar-track"><div class="bar-fill ' + (isWin ? "bar-fill-accent" : "") + '" style="width:' + pct + '%"></div></div>' +
          '<button type="button" class="inspect-jump" data-id="' + esc(item.id) + '" style="min-height:38px; font-size:12px;">Inspect Full Item</button>' +
        "</div>";
      }).join("");

      document.querySelectorAll("#ch5-gallery .inspect-jump").forEach((b) => {
        b.addEventListener("click", () => jumpToInspector(b.dataset.id));
      });
    }

    // Chapter 06 Case Stepper & Suite
    function populateCaseSelect() {
      const sel = $("case-select");
      const cur = sel.value;
      sel.innerHTML = state.cases.map((c, idx) =>
        '<option value="' + esc(c.id) + '">' +
          String(idx + 1).padStart(2, "0") + ". [" + esc(c.id) + " · " + esc(c.intent) + "] " + esc(c.query.slice(0, 58)) +
        "</option>"
      ).join("");
      if (cur && state.cases.some((c) => c.id === cur)) sel.value = cur;
    }

    async function runSelectedCase() {
      const caseId = $("case-select").value;
      $("case-output").textContent = "Running diagnostic for " + caseId + "…";
      try {
        const d = await api("/api/bench/case", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ caseId }),
        });
        const exp = d.expectedIds[0] || "";
        const fmtHits = (arr) => arr.length === 0
          ? "(0 hits)"
          : arr.slice(0, 3).map((h, i) => "#" + (i + 1) + " " + h.id + (h.id === exp ? " ★" : "") + (h.cosineSimilarity !== null ? " (" + h.cosineSimilarity.toFixed(3) + ")" : "")).join(" · ");

        $("case-output").innerHTML =
          '<div style="padding:12px; border:1px solid var(--rule); background:var(--surface);">' +
            '<div><strong>Case:</strong> ' + esc(d.queryId) + " (" + esc(d.intent) + ") · Expected: <code>" + esc(exp) + "</code> · Embed: " + d.embedMs.toFixed(1) + " ms</div>" +
            '<div style="margin-top:4px;"><strong>Query:</strong> “' + esc(d.query) + '”</div>' +
            '<div style="margin-top:10px;"><strong>FTS5 BM25 :</strong> ' + esc(fmtHits(d.methods.fts5)) + "</div>" +
            '<div><strong>Vector 768:</strong> ' + esc(fmtHits(d.methods.vector768)) + "</div>" +
            '<div><strong>Hybrid RRF:</strong> ' + esc(fmtHits(d.methods.hybridRrf)) + "</div>" +
            '<div style="margin-top:10px;"><strong>Prefix Check:</strong> raw cos=' + (d.prefixCheck.rawTargetCosine?.toFixed(4) ?? "n/a") + " → steered cos=" + (d.prefixCheck.steeredTargetCosine?.toFixed(4) ?? "n/a") + "</div>" +
            '<div style="margin-top:6px;"><strong>MRL Ranks:</strong> ' + d.mrlByDim.map((m) => m.dim + "d=#" + (m.rank ?? "miss")).join(" · ") + "</div>" +
          "</div>";
      } catch (err) {
        $("case-output").textContent = "Error: " + err.message;
      }
    }

    function fmtPct(v) { return (v * 100).toFixed(1) + "%"; }

    function renderBenchReport(r) {
      let html = "";
      if (r.hybridComparison) {
        html += '<div style="margin-bottom:18px;"><div class="kicker" style="margin-bottom:6px;">Exp 1 · Hybrid RRF vs Vector vs SQLite FTS5 (15 Text/Doc/Code Queries)</div>' +
          "<table><thead><tr><th>Engine</th><th>Hit@1</th><th>Hit@3</th><th>MRR</th></tr></thead><tbody>" +
          r.hybridComparison.map((m) =>
            "<tr><td>" + esc(m.label) + '</td><td class="mono">' + fmtPct(m.hitAt1) + '</td><td class="mono">' + fmtPct(m.hitAt3) + '</td><td class="mono">' + m.mrr.toFixed(3) + "</td></tr>"
          ).join("") + "</tbody></table></div>";
      }
      if (r.prefixSteering) {
        const p = r.prefixSteering;
        html += '<div style="margin-bottom:18px;"><div class="kicker" style="margin-bottom:6px;">Exp 2 · Task-Prefix Instruction Steering</div>' +
          "<table><thead><tr><th>Mode</th><th>Hit@1</th><th>MRR</th><th>Mean Distractor Margin Δ</th></tr></thead><tbody>" +
          '<tr><td>Raw Unprefixed</td><td class="mono">' + fmtPct(p.rawHitAt1) + '</td><td class="mono">' + p.rawMrr.toFixed(3) + '</td><td class="mono">' + p.meanRawMargin.toFixed(4) + "</td></tr>" +
          '<tr><td>Task-Steered</td><td class="mono">' + fmtPct(p.steeredHitAt1) + '</td><td class="mono">' + p.steeredMrr.toFixed(3) + '</td><td class="mono" style="color:var(--accent); font-weight:500;">' + p.meanSteeredMargin.toFixed(4) + "</td></tr>" +
          "</tbody></table></div>";
      }
      if (r.mrlTruncation) {
        html += '<div style="margin-bottom:18px;"><div class="kicker" style="margin-bottom:6px;">Exp 3 · Matryoshka (MRL) Truncation on libSQL DiskANN</div>' +
          "<table><thead><tr><th>Dim</th><th>Ratio</th><th>100k RAM</th><th>Hit@1</th><th>MRR</th><th>Cos Drift</th></tr></thead><tbody>" +
          r.mrlTruncation.map((m) =>
            '<tr><td class="mono">' + m.dim + 'd</td><td class="mono">' + m.compressionRatio + '</td><td class="mono">' + m.bytesFor100kVectorsMb + ' MB</td><td class="mono">' + fmtPct(m.hitAt1) + '</td><td class="mono">' + m.mrr.toFixed(3) + '</td><td class="mono">' + m.meanCosineDriftVs768.toFixed(4) + "</td></tr>"
          ).join("") + "</tbody></table></div>";
      }
      if (r.multimodal) {
        const mm = r.multimodal;
        html += '<div><div class="kicker" style="margin-bottom:6px;">Exp 4 · Zero-Caption Multimodal Retrieval (11 Sensory Queries)</div>' +
          '<div class="mono" style="font-size:12px; padding:10px; border:1px solid var(--rule); background:var(--surface);">' +
            "Overall Hit@1: <strong>" + fmtPct(mm.hitAt1) + "</strong> (MRR " + mm.mrr.toFixed(3) + ") · " +
            "VisDocs: <strong>" + fmtPct(mm.byModality.visdoc.hitAt1) + "</strong> · " +
            "Scenes: <strong>" + fmtPct(mm.byModality.image.hitAt1) + "</strong> · " +
            "Audio WAVs: <strong>" + fmtPct(mm.byModality.audio.hitAt1) + "</strong>" +
          "</div></div>";
      }
      $("bench-output").innerHTML = html;
    }

    // Wire Event Listeners
    document.querySelectorAll("#corpus-filters button").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.activeModFilter = btn.dataset.mod;
        renderCorpusFilterCounts();
        renderCorpusList();
      });
    });

    document.querySelectorAll("#ch1-presets button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#ch1-presets button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        $("ch1-input").value = btn.dataset.q;
        runStoryInspect({
          query: btn.dataset.q,
          expectedId: btn.dataset.exp || undefined,
          distractorId: btn.dataset.dist || undefined,
          prefix: btn.dataset.pfx || "search_query",
        });
      });
    });

    $("ch1-form").addEventListener("submit", (e) => {
      e.preventDefault();
      runStoryInspect({ query: $("ch1-input").value, prefix: "search_query" });
    });

    document.querySelectorAll("#ch2-presets button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#ch2-presets button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        runCh2Stage(btn.dataset.q, btn.dataset.exp, btn.dataset.pfx);
      });
    });

    $("btn-cmp").addEventListener("click", async () => {
      const a = $("cmp-a").value.trim();
      const b = $("cmp-b").value.trim();
      if (!a || !b) return;
      $("cmp-out").innerHTML = '<span class="mono" style="font-size:11px;">Computing cosine matrices…</span>';
      const [raw, sym] = await Promise.all([
        api("/api/matrix", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [a, b], prefix: "none" }) }),
        api("/api/matrix", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [a, b], prefix: "similarity" }) }),
      ]);
      $("cmp-out").innerHTML =
        "<table><thead><tr><th>Framing</th><th>768d</th><th>512d</th><th>256d</th><th>128d</th></tr></thead><tbody>" +
        '<tr><td>Raw (none)</td><td class="mono">' + raw.matricesByDim["768"][0][1].toFixed(4) + '</td><td class="mono">' + raw.matricesByDim["512"][0][1].toFixed(4) + '</td><td class="mono">' + raw.matricesByDim["256"][0][1].toFixed(4) + '</td><td class="mono">' + raw.matricesByDim["128"][0][1].toFixed(4) + "</td></tr>" +
        '<tr><td>Symmetric (similarity)</td><td class="mono">' + sym.matricesByDim["768"][0][1].toFixed(4) + '</td><td class="mono">' + sym.matricesByDim["512"][0][1].toFixed(4) + '</td><td class="mono">' + sym.matricesByDim["256"][0][1].toFixed(4) + '</td><td class="mono">' + sym.matricesByDim["128"][0][1].toFixed(4) + "</td></tr>" +
        "</tbody></table>";
    });

    document.querySelectorAll("#mrl-dim-btns button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#mrl-dim-btns button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.activeMrlDim = Number(btn.dataset.dim);
        renderCh4Mrl(state.lastStory);
      });
    });

    document.querySelectorAll("#ch5-tabs button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#ch5-tabs button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.activeSensoryMod = btn.dataset.smod;
        renderSensoryGallery();
      });
    });

    document.querySelectorAll("#ch5-prompts button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#ch5-prompts button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.activeSensoryMod = btn.dataset.smod;
        document.querySelectorAll("#ch5-tabs button").forEach((b) =>
          b.classList.toggle("active", b.dataset.smod === state.activeSensoryMod),
        );
        $("ch5-input").value = btn.dataset.q;
        scoreSensoryQuery(btn.dataset.q);
      });
    });

    $("ch5-form").addEventListener("submit", (e) => {
      e.preventDefault();
      scoreSensoryQuery($("ch5-input").value);
    });

    $("case-prev").addEventListener("click", () => {
      const sel = $("case-select");
      sel.selectedIndex = (sel.selectedIndex - 1 + sel.options.length) % sel.options.length;
      runSelectedCase();
    });
    $("case-next").addEventListener("click", () => {
      const sel = $("case-select");
      sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
      runSelectedCase();
    });
    $("case-run").addEventListener("click", runSelectedCase);

    document.querySelectorAll(".exp-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const exp = btn.dataset.exp;
        $("bench-output").innerHTML = '<span class="mono">Running ' + esc(exp) + " experiment…</span>";
        const res = await api("/api/bench/one", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ experiment: exp }),
        });
        renderBenchReport(res);
      });
    });

    $("btn-bench-all").addEventListener("click", async () => {
      $("bench-output").innerHTML = '<span class="mono">Running all 4 quantitative experiments against Ollama + libSQL…</span>';
      const res = await api("/api/bench", { method: "POST" });
      renderBenchReport(res);
      await refreshStatusAndCorpus();
    });

    $("btn-reseed").addEventListener("click", async () => {
      $("btn-reseed").disabled = true;
      $("live-dot").textContent = "Re-seeding 32-item corpus…";
      try {
        await api("/api/seed", { method: "POST" });
        await refreshStatusAndCorpus();
      } finally {
        $("btn-reseed").disabled = false;
      }
    });

    $("ingest-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = $("ing-title").value.trim();
      const modality = $("ing-mod").value;
      const content = $("ing-content").value;
      const file = $("ing-file").files?.[0];

      let imageDataUrl = null;
      let audioDataUrl = null;
      if (file) {
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        if (file.type.startsWith("audio/")) audioDataUrl = dataUrl;
        else imageDataUrl = dataUrl;
      }

      $("ing-status").textContent = "Embedding & storing in SQLite…";
      try {
        const res = await api("/api/items", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, modality, content, imageDataUrl, audioDataUrl }),
        });
        $("ing-status").textContent = "Saved " + res.id + " (" + res.embedMs.toFixed(1) + " ms)";
        state.selectedItemId = res.id;
        await refreshStatusAndCorpus();
      } catch (err) {
        $("ing-status").textContent = "Error: " + err.message;
      }
    });

    // Boot sequence
    async function loadDocsLibrary() {
      const docsRes = await api("/api/docs");
      state.docBundles = docsRes.bundles || [];
      state.docShowcase = docsRes.showcaseQueries || [];

      renderDocShelf();
      renderDocPresets();
      renderOmniScopeCounts();

      if (state.docBundles.length > 0) {
        if (!state.docBundles.some((b) => b.id === state.activeDocId)) {
          state.activeDocId = state.docBundles[0].id;
        }
        await loadDocPages(state.activeDocId, state.activePageNumber);
      }
    }

    function renderDocShelf() {
      if (state.docBundles.length === 0) {
        $("doc-shelf").innerHTML =
          '<span class="mono" style="font-size:12px; color:var(--fg-muted);">No PDFs/decks indexed yet — click “Index / Refresh Sample PDFs & Decks”.</span>';
        return;
      }
      $("doc-shelf").innerHTML =
        state.docBundles
          .map((b) => {
            const badge = b.format === "pdf" ? "PDF · " + b.pageCount + "p" : "PPTX · " + b.pageCount + " slides";
            return (
              '<button type="button" class="btn-chip ' +
              (b.id === state.activeDocId ? "active" : "") +
              '" data-doc-id="' +
              esc(b.id) +
              '">' +
              '<span class="mono" style="color:var(--accent); margin-right:6px;">[' +
              esc(badge) +
              "]</span> " +
              esc(b.title) +
              "</button>"
            );
          })
          .join("") +
        '<button type="button" class="btn-chip ' +
        (state.activeDocId === "all" ? "active" : "") +
        '" data-doc-id="all">Search All (' +
        state.docBundles.reduce((s, b) => s + b.pageCount, 0) +
        " pages/slides)</button>";

      document.querySelectorAll("#doc-shelf button").forEach((btn) => {
        btn.addEventListener("click", async () => {
          state.activeDocId = btn.dataset.docId;
          renderDocShelf();
          if (state.activeDocId !== "all") {
            await loadDocPages(state.activeDocId, 1);
          }
          await runDocInspect($("doc-query-input").value);
        });
      });
    }

    function renderDocPresets() {
      $("doc-presets").innerHTML = state.docShowcase
        .map(
          (q, idx) =>
            '<button type="button" class="btn-chip ' +
            (idx === 1 ? "active" : "") +
            '" data-dq-idx="' +
            idx +
            '">' +
            esc(q.label) +
            "</button>",
        )
        .join("");

      document.querySelectorAll("#doc-presets button").forEach((btn) => {
        btn.addEventListener("click", async () => {
          document.querySelectorAll("#doc-presets button").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          const spec = state.docShowcase[Number(btn.dataset.dqIdx)];
          if (!spec) return;
          state.activeDocId = spec.docId;
          state.activePageNumber = spec.expectedPage;
          $("doc-query-input").value = spec.query;
          $("doc-story-note").textContent = "★ What this tests: " + spec.storyNote;
          renderDocShelf();
          await loadDocPages(spec.docId, spec.expectedPage);
          await runDocInspect(spec.query);
        });
      });
    }

    async function loadDocPages(docId, pageNum = 1) {
      if (!docId || docId === "all") return;
      const res = await api("/api/docs/" + encodeURIComponent(docId) + "/pages");
      state.activeDocPages = res.pages || [];
      $("doc-download-link").href = "/api/docs/" + encodeURIComponent(docId) + "/download";
      $("doc-download-link").textContent =
        "Download " + (res.bundle.format === "pdf" ? ".pdf (" + (res.bundle.fileSizeBytes / (1024 * 1024)).toFixed(1) + " MB)" : ".pptx") + " ↓";
      selectActivePage(pageNum);
    }

    function selectActivePage(pageNum) {
      if (state.activeDocPages.length === 0) return;
      const clamped = Math.min(Math.max(1, pageNum), state.activeDocPages.length);
      state.activePageNumber = clamped;
      const page = state.activeDocPages.find((p) => p.pageNumber === clamped) || state.activeDocPages[0];
      const bundle = state.docBundles.find((b) => b.id === state.activeDocId);
      const unit = bundle?.format === "pptx" ? "Slide" : "Page";

      $("xray-visual-kicker").textContent =
        "Visual Eye · " + (bundle?.title || state.activeDocId) + " · " + unit + " " + page.pageNumber + " / " + state.activeDocPages.length;
      $("xray-page-heading").textContent = unit + " " + page.pageNumber + " — " + page.pageTitle;
      $("xray-page-img").src = page.imageUrl;

      if (page.speakerNotes && page.speakerNotes.trim().length > 0) {
        $("xray-notes-box").style.display = "block";
        $("xray-notes-box").innerHTML =
          '<div class="kicker kicker-accent" style="margin-bottom:4px;">Hidden PowerPoint Presenter Speaker Notes (Invisible to Vision-Only PNG!)</div>' +
          esc(page.speakerNotes);
      } else {
        $("xray-notes-box").style.display = "none";
      }

      $("xray-text-layer").textContent =
        page.extractedText && page.extractedText.trim().length > 0
          ? page.extractedText
          : "(Zero XML/PDF text characters on this page — pure visual pixels only)";

      document.querySelectorAll("#doc-heatmap .hm-cell").forEach((cell) => {
        cell.classList.toggle("active", Number(cell.dataset.pnum) === clamped);
      });
    }

    async function runDocInspect(query) {
      if (!query?.trim() || state.docBundles.length === 0) return;
      const res = await api("/api/docs/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, docId: state.activeDocId }),
      });
      state.lastDocInspect = res;
      renderDocHeatmap(res);
      renderDocLensRace(res);
    }

    function renderDocHeatmap(res) {
      const hm = res.heatmap || [];
      const hmBundle = state.docBundles.find((b) => b.id === res.heatmapDocId);
      const unit = hmBundle?.format === "pptx" ? "Slide" : "p.";
      $("heatmap-title").textContent =
        (hmBundle ? hmBundle.title : "Document") +
        " — Per-Page Vision vs. Text Activation (" +
        hm.length +
        " " +
        (hmBundle?.format === "pptx" ? "slides" : "pages") +
        ")";

      const maxCos = Math.max(...hm.flatMap((c) => [c.visCos, c.txtCos]), 0.75);
      const minCos = Math.min(...hm.flatMap((c) => [c.visCos, c.txtCos]), 0.35);
      const norm = (v) => Math.max(6, Math.min(100, Math.round(((v - minCos) / Math.max(maxCos - minCos, 0.08)) * 100)));

      $("doc-heatmap").innerHTML = hm
        .map((c) => {
          const isAct = res.heatmapDocId === state.activeDocId && c.pageNumber === state.activePageNumber;
          return (
            '<button type="button" class="hm-cell ' +
            (isAct ? "active" : "") +
            '" data-doc="' +
            esc(res.heatmapDocId) +
            '" data-pnum="' +
            c.pageNumber +
            '" title="' +
            esc(c.pageTitle) +
            " | Vision=" +
            c.visCos.toFixed(3) +
            " Text=" +
            c.txtCos.toFixed(3) +
            '">' +
            '<div style="display:flex; justify-content:space-between; width:100%; font-size:10px;" class="mono">' +
              "<strong>" + unit + c.pageNumber + "</strong>" +
              (c.hasSpeakerNotes ? '<span style="color:var(--accent);">NOTE</span>' : "") +
            "</div>" +
            '<div style="width:100%; margin-top:6px; display:flex; flex-direction:column; gap:3px;">' +
              '<div class="bar-track" style="height:5px;"><div class="bar-fill bar-fill-accent" style="width:' + norm(c.visCos) + '%"></div></div>' +
              '<div class="bar-track" style="height:5px;"><div class="bar-fill" style="opacity:0.55; width:' + norm(c.txtCos) + '%"></div></div>' +
            "</div>" +
            "</button>"
          );
        })
        .join("");

      document.querySelectorAll("#doc-heatmap .hm-cell").forEach((cell) => {
        cell.addEventListener("click", async () => {
          const dId = cell.dataset.doc;
          const pNum = Number(cell.dataset.pnum);
          if (dId !== state.activeDocId) {
            state.activeDocId = dId;
            renderDocShelf();
            await loadDocPages(dId, pNum);
          } else {
            selectActivePage(pNum);
          }
        });
      });
    }

    function renderDocLensRace(res) {
      const cols = [
        { title: "1 · Pure Vision PNG ({ image })", sub: "170M vision encoder · Zero text or notes", hits: res.visionTop, val: (h) => h.visCos },
        { title: "2 · Extracted Text + Notes", sub: "PDF/XML parser · Blind to charts/diagrams", hits: res.textTop, val: (h) => h.txtCos },
        { title: "3 · Fused Bimodal ({ image, text })", sub: "Pixels + text + speaker notes combined", hits: res.fusedTop, val: (h) => h.fusedCos },
      ];

      $("doc-lens-race").innerHTML = cols
        .map(
          (col) =>
            "<div>" +
            '<div style="padding-bottom:8px; margin-bottom:10px; border-bottom:1px solid var(--rule-strong);">' +
              '<div style="font-size:13px; font-weight:600;">' + col.title + "</div>" +
              '<div class="mono" style="font-size:11px; color:var(--fg-muted);">' + col.sub + "</div>" +
            "</div>" +
            col.hits
              .slice(0, 3)
              .map(
                (h, idx) =>
                  '<div class="hit-card ' +
                  (idx === 0 ? "is-expected" : "") +
                  '" data-doc="' +
                  esc(h.docId) +
                  '" data-pnum="' +
                  h.pageNumber +
                  '" style="display:grid; grid-template-columns:46px 1fr; gap:10px; align-items:center;">' +
                    '<div class="thumb-box" style="width:46px; height:56px;"><img src="' + esc(h.thumbUrl) + '" alt="Page thumbnail" style="image-rendering:auto; object-fit:contain;" /></div>' +
                    '<div style="min-width:0;">' +
                      '<div style="display:flex; justify-content:space-between; font-size:11px;" class="mono">' +
                        "<span>#" + (idx + 1) + " · " + (h.format === "pptx" ? "Slide " : "Page ") + h.pageNumber + "</span>" +
                        '<span style="color:' + (idx === 0 ? "var(--accent)" : "var(--fg-muted)") + ';">cos ' + col.val(h).toFixed(4) + "</span>" +
                      "</div>" +
                      '<div style="font-size:12.5px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;">' + esc(h.pageTitle) + "</div>" +
                      '<div class="mono" style="font-size:10px; color:var(--fg-muted);">' + esc(h.docTitle.slice(0, 34)) + (h.hasSpeakerNotes ? " · ★ SPEAKER NOTES" : "") + "</div>" +
                    "</div>" +
                  "</div>",
              )
              .join("") +
            "</div>",
        )
        .join("");

      document.querySelectorAll("#doc-lens-race .hit-card").forEach((card) => {
        card.addEventListener("click", async () => {
          const dId = card.dataset.doc;
          const pNum = Number(card.dataset.pnum);
          if (dId !== state.activeDocId) {
            state.activeDocId = dId;
            renderDocShelf();
            await loadDocPages(dId, pNum);
          } else {
            selectActivePage(pNum);
          }
        });
      });
    }

    $("doc-search-form").addEventListener("submit", (e) => {
      e.preventDefault();
      $("doc-story-note").textContent = "";
      runDocInspect($("doc-query-input").value);
    });

    $("btn-prev-page").addEventListener("click", () => selectActivePage(state.activePageNumber - 1));
    $("btn-next-page").addEventListener("click", () => selectActivePage(state.activePageNumber + 1));

    $("btn-run-acuity").addEventListener("click", async () => {
      if (!state.activeDocId || state.activeDocId === "all") return;
      const query = $("doc-query-input").value.trim() || "Transformer architecture diagram";
      $("acuity-output").innerHTML =
        '<div class="mono" style="font-size:12px; color:var(--fg-muted);">Rendering 0.25×, 0.50×, 1.00×, and 1.75× PNGs &amp; scoring with Ollama…</div>';
      try {
        const res = await api("/api/docs/acuity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            docId: state.activeDocId,
            pageNumber: state.activePageNumber,
            query,
          }),
        });
        const bestCos = Math.max(...res.points.map((p) => p.cosineSimilarity));
        $("acuity-output").innerHTML =
          '<div class="mono" style="font-size:11px; color:var(--fg-muted); margin-bottom:10px;">Query: “' +
          esc(res.query) +
          "” · 4-image vision batch: " +
          res.embedMs.toFixed(0) +
          " ms</div>" +
          '<div class="acuity-grid">' +
          res.points
            .map((pt) => {
              const isPeak = Math.abs(pt.cosineSimilarity - bestCos) < 0.0005;
              const pct = Math.max(8, Math.min(100, Math.round(pt.cosineSimilarity * 100)));
              return (
                '<div style="border:1px solid ' +
                (isPeak ? "var(--accent)" : "var(--rule)") +
                '; padding:8px; background:var(--surface-elevated);">' +
                  '<div class="mono" style="font-size:10px; font-weight:600; color:' +
                  (isPeak ? "var(--accent)" : "var(--fg)") +
                  ';">' +
                  esc(pt.label) +
                  "</div>" +
                  '<div style="margin:6px 0; height:120px; background:var(--surface); border:1px solid var(--rule); display:flex; align-items:center; justify-content:center; overflow:hidden;">' +
                    '<img src="' + esc(pt.dataUrl) + '" alt="' + esc(pt.label) + '" style="max-width:100%; max-height:100%; image-rendering:pixelated;" />' +
                  "</div>" +
                  '<div class="mono" style="font-size:10.5px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:4px; margin-bottom:4px;">' +
                    '<span style="color:var(--fg-muted);">' + pt.widthPx + "×" + pt.heightPx + "</span>" +
                    "<strong>" + pt.cosineSimilarity.toFixed(4) + "</strong>" +
                  "</div>" +
                  '<div class="bar-track"><div class="bar-fill ' +
                  (isPeak ? "bar-fill-accent" : "") +
                  '" style="width:' +
                  pct +
                  '%"></div></div>' +
                  '<div class="mono" style="font-size:10px; color:var(--fg-muted); margin-top:4px;">' +
                  (pt.pngBytes / 1024).toFixed(1) +
                  " KB PNG</div>" +
                "</div>"
              );
            })
            .join("") +
          "</div>";
      } catch (err) {
        $("acuity-output").innerHTML =
          '<div style="color:var(--accent); font-size:12px;">' + esc(err.message) + "</div>";
      }
    });

    $("btn-seed-docs").addEventListener("click", async () => {
      $("btn-seed-docs").disabled = true;
      $("doc-story-note").textContent =
        "Rasterizing & embedding 76 PDF pages + 14 PowerPoint slides across Vision, Text & Fused lenses (~45s first run)…";
      try {
        await api("/api/docs/seed", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ force: false }),
        });
        await refreshStatusAndCorpus();
        await loadDocsLibrary();
        await runDocInspect($("doc-query-input").value);
        $("doc-story-note").textContent = "All sample PDF papers and PowerPoint decks indexed!";
      } finally {
        $("btn-seed-docs").disabled = false;
      }
    });

    $("doc-upload-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = $("doc-upload-file").files?.[0];
      if (!f) return;
      const fd = new FormData();
      fd.append("file", f);
      $("doc-upload-status").textContent =
        "Uploading, rasterizing pages/slides via MuPDF, and embedding Vision + Text + Fused…";
      try {
        const res = await fetch("/api/docs/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        $("doc-upload-status").textContent =
          "Indexed " + data.bundle.title + " (" + data.pageCount + " pages/slides in " + (data.durationMs / 1000).toFixed(1) + "s)";
        state.activeDocId = data.docId;
        state.activePageNumber = 1;
        await refreshStatusAndCorpus();
        await loadDocsLibrary();
        await runDocInspect($("doc-query-input").value);
        await runOmniSearch();
      } catch (err) {
        $("doc-upload-status").textContent = "Error: " + err.message;
      }
    });

    // --- Freeform Omni-Search Matcher Across All 122 Units ---
    function renderOmniScopeCounts() {
      const mCounts = {};
      for (const it of state.items) mCounts[it.modality] = (mCounts[it.modality] || 0) + 1;
      const pdfPages = state.docBundles
        .filter((b) => b.format === "pdf")
        .reduce((s, b) => s + b.pageCount, 0);
      const pptxSlides = state.docBundles
        .filter((b) => b.format === "pptx")
        .reduce((s, b) => s + b.pageCount, 0);
      const totalItems = state.items.length;
      const allCount = totalItems + pdfPages + pptxSlides;
      const allDocsCount = pdfPages + pptxSlides + (mCounts.document || 0) + (mCounts.visdoc || 0);
      const mdCount = (mCounts.document || 0) + (mCounts.text || 0);
      const sensoryCount = (mCounts.visdoc || 0) + (mCounts.image || 0) + (mCounts.audio || 0);
      const codeCount = mCounts.code || 0;

      const scopeLabels = {
        all: "Everything (" + allCount + ")",
        all_docs: "All Docs (" + allDocsCount + ")",
        pdf: "PDF Papers (" + pdfPages + "p)",
        pptx: "PowerPoints (" + pptxSlides + ")",
        markdown: "Markdown & Notes (" + mdCount + ")",
        sensory: "VisDocs, Scenes & WAV (" + sensoryCount + ")",
        code: "Source Code (" + codeCount + ")",
      };

      document.querySelectorAll("#omni-scopes button").forEach((btn) => {
        const sc = btn.dataset.scope;
        if (scopeLabels[sc]) btn.textContent = scopeLabels[sc];
        btn.classList.toggle("active", sc === state.omniScope);
      });
    }

    function highlightSnippet(rawText, rawQuery) {
      const src = String(rawText ?? "");
      if (!src) return "";
      const words = String(rawQuery ?? "")
        .toLowerCase()
        .replace(/[^\\p{L}\\p{N}_$-]+/gu, " ")
        .split(/\\s+/)
        .filter((w) => w.length >= 3)
        .sort((a, b) => b.length - a.length)
        .slice(0, 8);
      if (words.length === 0) return esc(src);

      const lower = src.toLowerCase();
      let pos = 0;
      let out = "";
      while (pos < src.length) {
        let bestIdx = -1;
        let bestLen = 0;
        for (const w of words) {
          const idx = lower.indexOf(w, pos);
          if (idx !== -1 && (bestIdx === -1 || idx < bestIdx || (idx === bestIdx && w.length > bestLen))) {
            bestIdx = idx;
            bestLen = w.length;
          }
        }
        if (bestIdx === -1) {
          out += esc(src.slice(pos));
          break;
        }
        if (bestIdx > pos) {
          out += esc(src.slice(pos, bestIdx));
        }
        out += '<mark class="omni-hl">' + esc(src.slice(bestIdx, bestIdx + bestLen)) + "</mark>";
        pos = bestIdx + bestLen;
      }
      return out;
    }

    async function getCachedDocPages(docId) {
      if (!docId) return [];
      if (state.docPagesCache[docId]) return state.docPagesCache[docId];
      const res = await api("/api/docs/" + encodeURIComponent(docId) + "/pages");
      state.docPagesCache[docId] = res.pages || [];
      return state.docPagesCache[docId];
    }

    async function runOmniSearch() {
      const query = $("omni-input").value.trim();
      if (!query && !state.omniImageDataUrl && !state.omniAudioDataUrl) return;
      state.omniLastQuery = query;
      $("omni-meta").textContent = "Embedding query & matching across SQLite items, PDF pages, and PowerPoint slides…";

      try {
        const res = await api("/api/omni-search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            query,
            imageDataUrl: state.omniImageDataUrl,
            audioDataUrl: state.omniAudioDataUrl,
            scope: state.omniScope,
            lens: state.omniLens,
            dim: state.omniDim,
            limit: 18,
          }),
        });

        state.omniHits = res.hits || [];
        state.omniRollup = res.rollup || [];

        const mediaTag = state.omniFileName ? " + [" + state.omniFileName + "]" : "";
        $("omni-meta").textContent =
          "Matched " +
          res.hits.length +
          " of " +
          res.totalCandidates +
          " candidate units · lens=" +
          res.lens +
          " · " +
          res.dim +
          "d · Ollama embed " +
          res.embedMs.toFixed(1) +
          " ms · SQLite fusion " +
          res.searchMs.toFixed(1) +
          " ms" +
          mediaTag +
          (res.formattedQuery ? " · Prompt: " + res.formattedQuery : "");

        $("omni-hits-kicker").textContent =
          "Ranked Cross-Document Matches (" + res.hits.length + " shown of " + res.totalCandidates + " candidates)";

        renderOmniRollup();
        renderOmniHits();

        if (state.omniHits.length > 0) {
          await selectOmniHit(state.omniHits[0].uid);
        } else {
          $("omni-preview").innerHTML =
            '<div class="mono" style="font-size:12px; color:var(--fg-muted);">No matches found for this filter/lens. Try switching Lens to Hybrid RRF or Scope to Everything.</div>';
        }
      } catch (err) {
        $("omni-meta").textContent = "Search error: " + err.message;
      }
    }

    function renderOmniRollup() {
      const wrap = $("omni-rollup-wrap");
      const box = $("omni-rollup");
      if (!state.omniRollup || state.omniRollup.length === 0) {
        wrap.style.display = "none";
        box.innerHTML = "";
        return;
      }
      wrap.style.display = "block";
      box.innerHTML = state.omniRollup
        .map((g) => {
          const targetUid = g.docId ? "page:" + g.bestItemId : "item:" + g.bestItemId;
          const isAct = state.omniSelectedUid === targetUid;
          const pagesStr = g.topPages.map((p) => p.label).join(", ");
          const cosStr = g.bestCosine !== null ? "cos " + g.bestCosine.toFixed(4) : "fts match";
          return (
            '<button type="button" class="omni-rollup-card ' +
            (isAct ? "active" : "") +
            '" data-ruid="' +
            esc(targetUid) +
            '">' +
              '<div style="display:flex; justify-content:space-between; width:100%; gap:8px; align-items:center;">' +
                '<span class="tag tag-target">' + esc(g.kindBadge) + "</span>" +
                '<span class="mono" style="font-size:11px; color:var(--fg-muted);">' + esc(cosStr) + "</span>" +
              "</div>" +
              '<div style="font-size:13px; font-weight:600; line-height:1.3;">' + esc(g.title) + "</div>" +
              '<div class="mono" style="font-size:11px; color:var(--fg-muted);">' +
                (g.docId ? g.hitCount + (g.hitCount === 1 ? " hit · " : " hits · ") + esc(pagesStr) : esc(g.bestItemId)) +
              "</div>" +
            "</button>"
          );
        })
        .join("");

      document.querySelectorAll("#omni-rollup .omni-rollup-card").forEach((card) => {
        card.addEventListener("click", () => {
          selectOmniHit(card.dataset.ruid);
        });
      });
    }

    function renderOmniHits() {
      if (state.omniHits.length === 0) {
        $("omni-hits").innerHTML =
          '<div style="padding:18px; font-size:12px;" class="mono">0 matching documents/pages.</div>';
        return;
      }

      $("omni-hits").innerHTML = state.omniHits
        .map((h, idx) => {
          const isAct = h.uid === state.omniSelectedUid;
          let thumbHtml = '<span class="mono">' + esc(h.modalityBadge.slice(0, 4)) + "</span>";
          if (h.thumbUrl) {
            const isDocPage = h.sourceKind === "pdf_page" || h.sourceKind === "pptx_slide";
            thumbHtml =
              '<img src="' +
              esc(h.thumbUrl) +
              '" alt="' +
              esc(h.title) +
              '" style="image-rendering:' +
              (isDocPage ? "auto" : "pixelated") +
              '; object-fit:contain;" />';
          } else if (h.audioDataUrl) {
            thumbHtml = '<span class="mono" style="color:var(--accent);">▶ WAV</span>';
          }

          const cosPart =
            h.cosineSimilarity !== null ? "cos " + h.cosineSimilarity.toFixed(4) : "";
          const ftsPart = h.ftsRank !== null ? "fts #" + h.ftsRank : "";
          const scoreLine = [cosPart, ftsPart].filter(Boolean).join(" · ");

          const snippetHtml = highlightSnippet(h.snippet, state.omniLastQuery);

          return (
            '<button type="button" class="omni-hit ' +
            (isAct ? "active" : "") +
            '" data-huid="' +
            esc(h.uid) +
            '">' +
              '<div class="thumb-box" style="width:52px; height:58px;">' + thumbHtml + "</div>" +
              '<div style="min-width:0; width:100%;">' +
                '<div style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:4px;">' +
                  '<div style="display:flex; gap:6px; align-items:center;">' +
                    '<span class="mono" style="font-size:11px; font-weight:600; color:var(--accent);">#' + (idx + 1) + "</span>" +
                    '<span class="tag ' + (idx === 0 ? "tag-target" : "") + '">' + esc(h.modalityBadge) + "</span>" +
                    (h.hasSpeakerNotes ? '<span class="tag" style="border-color:var(--accent); color:var(--accent);">★ Notes</span>' : "") +
                  "</div>" +
                  '<span class="mono" style="font-size:11px; color:var(--fg-muted);">' + esc(scoreLine) + "</span>" +
                "</div>" +
                '<div style="font-size:13.5px; font-weight:600; line-height:1.3;">' + esc(h.title) + "</div>" +
                '<div class="mono" style="font-size:10.5px; color:var(--fg-muted); margin-top:2px;">' + esc(h.parentTitle) + "</div>" +
                '<div style="font-size:12px; color:var(--fg-body); line-height:1.45; margin-top:6px; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">' +
                  snippetHtml +
                "</div>" +
              "</div>" +
            "</button>"
          );
        })
        .join("");

      document.querySelectorAll("#omni-hits .omni-hit").forEach((row) => {
        row.addEventListener("click", () => {
          selectOmniHit(row.dataset.huid);
        });
      });
    }

    async function selectOmniHit(uid) {
      const hit = state.omniHits.find((h) => h.uid === uid) || state.omniHits[0];
      if (!hit) return;
      state.omniSelectedUid = hit.uid;

      document.querySelectorAll("#omni-hits .omni-hit").forEach((el) => {
        el.classList.toggle("active", el.dataset.huid === hit.uid);
      });
      document.querySelectorAll("#omni-rollup .omni-rollup-card").forEach((el) => {
        el.classList.toggle("active", el.dataset.ruid === hit.uid);
      });

      const pane = $("omni-preview");

      if (hit.sourceKind === "pdf_page" || hit.sourceKind === "pptx_slide") {
        const unitLabel = hit.sourceKind === "pptx_slide" ? "Slide" : "Page";
        const lensStats = [
          hit.cosineSimilarity !== null ? "Matched cos " + hit.cosineSimilarity.toFixed(4) : null,
          hit.visCos !== null ? "Vision PNG " + hit.visCos.toFixed(4) : null,
          hit.txtCos !== null ? "Extracted Text " + hit.txtCos.toFixed(4) : null,
          hit.ftsRank !== null ? "FTS5 #" + hit.ftsRank : null,
        ]
          .filter(Boolean)
          .join(" · ");

        pane.innerHTML =
          '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; padding-bottom:14px; margin-bottom:16px; border-bottom:1px solid var(--rule);">' +
            "<div>" +
              '<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:6px;">' +
                '<span class="tag tag-target">' + esc(hit.modalityBadge) + "</span>" +
                '<span class="mono" style="font-size:11px; color:var(--fg-muted);">' + esc(hit.parentTitle) + "</span>" +
              "</div>" +
              "<h3>" + esc(unitLabel + " " + hit.pageNumber + " — " + hit.title) + "</h3>" +
              '<div class="mono" style="font-size:11px; color:var(--fg-muted); margin-top:4px;">' + esc(lensStats) + "</div>" +
            "</div>" +
            '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
              '<a class="btn" href="/api/docs/' + encodeURIComponent(hit.docId) + '/download" style="text-decoration:none;">Download File ↓</a>' +
              '<button id="omni-jump-xray" type="button" class="btn-primary">Open in 4-DPI X-Ray Studio →</button>' +
            "</div>" +
          "</div>" +
          (hit.hasSpeakerNotes
            ? '<div style="margin-bottom:14px; padding:12px 14px; border-left:3px solid var(--accent); background:var(--accent-10); font-size:12.5px; color:var(--fg);">' +
                '<div class="kicker kicker-accent" style="margin-bottom:4px;">Matched PowerPoint Presenter Speaker Notes</div>' +
                highlightSnippet(hit.speakerNotes, state.omniLastQuery) +
              "</div>"
            : "") +
          '<div style="border:1px solid var(--rule); background:var(--surface); padding:14px; text-align:center;">' +
            '<img id="omni-page-img" src="' + esc(hit.fullImageUrl) + '" alt="' + esc(hit.title) + '" style="max-width:100%; max-height:540px; height:auto; border:1px solid var(--rule-strong); background:#fff;" />' +
          "</div>" +
          '<div style="margin-top:14px;">' +
            '<div class="kicker" style="margin-bottom:6px;">Extracted Page / Slide Text Layer (Highlighted Match Context)</div>' +
            '<div id="omni-page-text" class="mono" style="font-size:11.5px; line-height:1.65; color:var(--fg-body); max-height:220px; overflow-y:auto; white-space:pre-wrap; padding:12px; border:1px solid var(--rule); background:var(--surface);">' +
              highlightSnippet(hit.snippet, state.omniLastQuery) +
            "</div>" +
          "</div>";

        $("omni-jump-xray")?.addEventListener("click", async () => {
          state.activeDocId = hit.docId;
          state.activePageNumber = hit.pageNumber || 1;
          if ($("omni-input").value.trim()) {
            $("doc-query-input").value = $("omni-input").value.trim();
          }
          renderDocShelf();
          await loadDocPages(hit.docId, state.activePageNumber);
          await runDocInspect($("doc-query-input").value);
          document.getElementById("sec-papers")?.scrollIntoView({ behavior: "smooth" });
        });

        try {
          const pages = await getCachedDocPages(hit.docId);
          const fullPage = pages.find((p) => p.pageNumber === hit.pageNumber);
          const textBox = $("omni-page-text");
          if (fullPage && textBox && state.omniSelectedUid === hit.uid) {
            textBox.innerHTML = fullPage.extractedText?.trim()
              ? highlightSnippet(fullPage.extractedText, state.omniLastQuery)
              : "(Zero XML/PDF text characters on this page — matched purely via 170M vision encoder pixels)";
          }
        } catch {
          // Keep snippet fallback if page list fetch fails
        }
        return;
      }

      // Corpus item (document, visdoc, image, audio, code, text)
      const item = state.items.find((i) => i.id === hit.id);
      if (!item) {
        pane.innerHTML = '<div class="mono">' + esc(hit.title) + "</div>";
        return;
      }

      const statsLine = [
        hit.cosineSimilarity !== null ? "cos " + hit.cosineSimilarity.toFixed(4) : null,
        hit.vectorRank !== null ? "vec #" + hit.vectorRank : null,
        hit.ftsRank !== null ? "fts #" + hit.ftsRank : null,
      ]
        .filter(Boolean)
        .join(" · ");

      pane.innerHTML =
        '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; padding-bottom:14px; margin-bottom:16px; border-bottom:1px solid var(--rule);">' +
          "<div>" +
            '<div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">' +
              '<span class="tag tag-target">' + esc(hit.modalityBadge) + "</span>" +
              '<span class="mono" style="font-size:11px; color:var(--fg-muted);">' + esc(item.id) + " · " + esc(statsLine) + "</span>" +
            "</div>" +
            "<h3>" + esc(item.title) + "</h3>" +
          "</div>" +
          '<button id="omni-jump-corpus" type="button">Open in Corpus Inspector →</button>' +
        "</div>" +
        renderItemBodyHtml(item);

      $("omni-jump-corpus")?.addEventListener("click", () => {
        state.selectedItemId = item.id;
        renderCorpusList();
        renderInspector(item.id);
        document.getElementById("sec-corpus")?.scrollIntoView({ behavior: "smooth" });
      });
    }

    $("omni-form").addEventListener("submit", (e) => {
      e.preventDefault();
      document.querySelectorAll("#omni-presets button").forEach((b) => b.classList.remove("active"));
      runOmniSearch();
    });

    document.querySelectorAll("#omni-presets button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#omni-presets button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        $("omni-input").value = btn.dataset.oq;
        runOmniSearch();
      });
    });

    document.querySelectorAll("#omni-scopes button").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.omniScope = btn.dataset.scope;
        renderOmniScopeCounts();
        runOmniSearch();
      });
    });

    $("omni-lens").addEventListener("change", () => {
      state.omniLens = $("omni-lens").value;
      runOmniSearch();
    });

    $("omni-dim").addEventListener("change", () => {
      state.omniDim = Number($("omni-dim").value);
      runOmniSearch();
    });

    $("omni-file").addEventListener("change", async () => {
      const f = $("omni-file").files?.[0];
      if (!f) return;
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      state.omniFileName = f.name;
      if (f.type.startsWith("audio/")) {
        state.omniAudioDataUrl = dataUrl;
        state.omniImageDataUrl = null;
      } else {
        state.omniImageDataUrl = dataUrl;
        state.omniAudioDataUrl = null;
      }
      $("omni-file-label").textContent = "Attached: " + f.name.slice(0, 20);
      $("omni-clear-file").style.display = "inline-flex";
      runOmniSearch();
    });

    $("omni-clear-file").addEventListener("click", () => {
      $("omni-file").value = "";
      state.omniImageDataUrl = null;
      state.omniAudioDataUrl = null;
      state.omniFileName = "";
      $("omni-file-label").textContent = "+ Image / WAV";
      $("omni-clear-file").style.display = "none";
      if ($("omni-input").value.trim()) runOmniSearch();
    });

    document.addEventListener("keydown", (e) => {
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName || "")
      ) {
        e.preventDefault();
        const inp = $("omni-input");
        inp.focus();
        inp.select();
      }
    });

    await Promise.all([refreshStatusAndCorpus(), loadDocsLibrary()]);
    await Promise.allSettled([
      runOmniSearch(),
      state.docBundles.length > 0
        ? runDocInspect("Scaled Dot-Product Attention and Multi-Head Attention block diagram figure")
        : Promise.resolve(),
      runCh2Stage(
        "what HTTP status is returned if a retried settlement token has a different payload hash?",
        "doc-adr-014",
        "question_answering",
      ),
      runStoryInspect({
        query: "how to allow simultaneous database reads while writing without locking readers",
        expectedId: "doc-sqlite-wal",
        prefix: "search_query",
      }),
      scoreSensoryQuery("How much was paid on invoice 4082 for Nebula H200 GPU nodes?"),
    ]);
  </script>
</body>
</html>`;
}

function escapeHtml(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
