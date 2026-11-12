import JSZip from "jszip";
import * as mupdf from "mupdf";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import PptxGenJS from "pptxgenjs";
import { cosineSimilarity } from "./mrl.ts";
import type { Embedder } from "./ollama.ts";
import { formatWithTaskPrefix } from "./prefixes.ts";

export type DocFormat = "pdf" | "pptx";
export type RetrievalLens = "vision" | "text" | "fused" | "hybrid";

export interface SamplePaperSpec {
  id: string;
  title: string;
  authors: string;
  filename: string;
  arxivUrl: string;
  summary: string;
}

export interface ExtractedPageOrSlide {
  pageNumber: number;
  pageTitle: string;
  extractedText: string;
  speakerNotes: string;
  pngBase64: string;
  previewDataUrl?: string;
  widthPx: number;
  heightPx: number;
}

export interface ParsedDocBundle {
  id: string;
  title: string;
  subtitle: string;
  filename: string;
  format: DocFormat;
  filePath: string;
  fileSizeBytes: number;
  pageCount: number;
  pages: ExtractedPageOrSlide[];
}

export interface AcuityPoint {
  scale: number;
  label: string;
  widthPx: number;
  heightPx: number;
  pngBytes: number;
  cosineSimilarity: number;
  dataUrl: string;
}

export const SAMPLE_PAPERS: readonly SamplePaperSpec[] = [
  {
    id: "pdf-attention",
    title: "Attention Is All You Need (NeurIPS 2017)",
    authors: "Vaswani et al. · arXiv:1706.03762 · 15 pages",
    filename: "attention-1706.03762.pdf",
    arxivUrl: "https://arxiv.org/pdf/1706.03762.pdf",
    summary:
      "Introduces the Transformer encoder-decoder architecture, Scaled Dot-Product & Multi-Head Attention block diagrams (pp. 3–4), sinusoidal positional encodings (p. 6), and WMT 2014 BLEU tables (p. 8).",
  },
  {
    id: "pdf-colpali",
    title: "ColPali: Efficient Document Retrieval with Vision Language Models",
    authors: "Faysse et al. · arXiv:2407.01449 · 26 pages",
    filename: "colpali-2407.01449.pdf",
    arxivUrl: "https://arxiv.org/pdf/2407.01449.pdf",
    summary:
      "Demonstrates direct visual page-image indexing vs. brittle PDF OCR/layout pipelines across the ViDoRe multimodal document retrieval benchmark.",
  },
  {
    id: "pdf-matryoshka",
    title: "Matryoshka Representation Learning (NeurIPS 2022)",
    authors: "Kusupati et al. · arXiv:2205.13147 · 35 pages",
    filename: "matryoshka-2205.13147.pdf",
    arxivUrl: "https://arxiv.org/pdf/2205.13147.pdf",
    summary:
      "Full 35-page paper + appendices proving nested coarse-to-fine coordinate prefixes across classification, retrieval, and adaptive cascade search.",
  },
] as const;

export interface DocShowcaseQuery {
  id: string;
  docId: string;
  expectedPage: number;
  label: string;
  query: string;
  storyNote: string;
}

export const DOC_SHOWCASE_QUERIES: readonly DocShowcaseQuery[] = [
  {
    id: "dq-attn-arch",
    docId: "pdf-attention",
    expectedPage: 3,
    label: "Attention PDF · Fig 1 Architecture (p.3)",
    query:
      "diagram of encoder decoder Transformer model architecture with multi-head attention and positional encoding",
    storyNote:
      "Vision-Only PNG reads Figure 1's encoder-decoder wiring diagram directly from pixels on Page 3.",
  },
  {
    id: "dq-attn-heads",
    docId: "pdf-attention",
    expectedPage: 4,
    label: "Attention PDF · Fig 2 Multi-Head Block (p.4)",
    query: "Scaled Dot-Product Attention and Multi-Head Attention block diagram figure",
    storyNote:
      "Page 4 contains the side-by-side MatMul -> Scale -> Mask -> SoftMax diagram; Vision-Only separates Page 4 by +0.09 cosine.",
  },
  {
    id: "dq-attn-pos",
    docId: "pdf-attention",
    expectedPage: 6,
    label: "Attention PDF · Sinusoidal Math (p.6)",
    query:
      "sinusoidal positional encoding wavelengths sine and cosine functions of different frequencies",
    storyNote:
      "PDF text extraction mangles LaTeX subscripts (PE_pos,2i), so Vision-Only and Fused Image+Text outperform raw extracted text!",
  },
  {
    id: "dq-colpali-vidore",
    docId: "pdf-colpali",
    expectedPage: 7,
    label: "ColPali PDF · Table 2 ViDoRe Results (p.7)",
    query:
      "Table 2 ViDoRe benchmark evaluation results comparing ColPali against Unstructured OCR captioning and SigLIP",
    storyNote:
      "Scans 26 dense two-column pages to pinpoint Table 2 (ViDoRe benchmark results) on Page 7.",
  },
  {
    id: "dq-mrl-curve",
    docId: "pdf-matryoshka",
    expectedPage: 2,
    label: "Matryoshka 35p PDF · Fig 1 Core Idea (p.2)",
    query:
      "Figure 1 core idea of Matryoshka Representation Learning coarse-to-fine nested dimension ImageNet-1K",
    storyNote:
      "Searches across all 35 pages (including 20+ appendix pages of tables and proofs) to find Figure 1 on Page 2.",
  },
  {
    id: "dq-pptx-chart",
    docId: "deck-q4-board",
    expectedPage: 3,
    label: "Board PPTX · Visual-Only Chart ($4,800 vs $140)",
    query:
      "How much does Pinecone Enterprise cost per month ($4,800) compared to Managed Qdrant ($1,950) and $140 libSQL?",
    storyNote:
      "Slide 3 embeds vendor names and dollar figures ONLY inside a PNG chart (zero XML text)! Text-Only misses; Vision-Only reads the chart at #1.",
  },
  {
    id: "dq-pptx-notes",
    docId: "deck-q4-board",
    expectedPage: 7,
    label: "Board PPTX · Hidden Speaker Notes ($42M LOI)",
    query:
      "Project Horizon confidential acquisition LOI $42M cash cap and retention pool",
    storyNote:
      "Stored exclusively in Presenter Speaker Notes (notesSlide7.xml)—invisible on the slide image! Vision-Only is blind; Text & Fused hit #1.",
  },
  {
    id: "dq-pptx-acuity",
    docId: "deck-vision-guide",
    expectedPage: 3,
    label: "Vision Field Guide PPTX · DPI Acuity",
    query:
      "why 0.25x thumbnail resolution blurs LaTeX subscripts while 1.35x DPI reads dense tables",
    storyNote:
      "Matches Slide 3 of the Vision Encoders PowerPoint deck explaining patch acuity.",
  },
] as const;

function cleanSlideLine(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function inferPageHeading(extractedText: string, fallbackPageNum: number): string {
  const lines = extractedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 4 && !/^\d+$/.test(l));
  const candidate =
    lines.find((l) => /^(\d+(\.\d+)*\s+[A-Z]|Figure\s+\d+|Table\s+\d+|Abstract|Introduction|Conclusion|References)/.test(l)) ??
    lines[0] ??
    `Page ${fallbackPageNum}`;
  return candidate.length > 76 ? `${candidate.slice(0, 73)}…` : candidate;
}

function renderHtmlToPng(
  html: string,
  layoutWidthPt: number,
  layoutHeightPt: number,
  scale = 1.5,
): { pngBytes: Uint8Array; widthPx: number; heightPx: number } {
  const doc = mupdf.Document.openDocument(Buffer.from(html, "utf8"), "slide.html");
  doc.layout(layoutWidthPt, layoutHeightPt, 13);
  const page = doc.loadPage(0);
  const pix = page.toPixmap(
    mupdf.Matrix.scale(scale, scale),
    mupdf.ColorSpace.DeviceRGB,
    false,
    true,
  );
  const pngBytes = pix.asPNG();
  return {
    pngBytes,
    widthPx: pix.getWidth(),
    heightPx: pix.getHeight(),
  };
}

/**
 * Renders a PDF page on demand from disk at any scale (thumbnail 0.35, reader 1.5, acuity 0.25..1.75).
 */
export function renderPdfPagePngFromFile(
  filePath: string,
  pageNumber: number,
  scale = 1.4,
): { pngBytes: Uint8Array; widthPx: number; heightPx: number } {
  const buf = readFileSync(filePath);
  const doc = mupdf.Document.openDocument(buf, "application/pdf");
  const total = doc.countPages();
  const clamped = Math.min(Math.max(pageNumber, 1), Math.max(total, 1));
  const page = doc.loadPage(clamped - 1);
  const pix = page.toPixmap(
    mupdf.Matrix.scale(scale, scale),
    mupdf.ColorSpace.DeviceRGB,
    false,
    true,
  );
  return {
    pngBytes: pix.asPNG(),
    widthPx: pix.getWidth(),
    heightPx: pix.getHeight(),
  };
}

/**
 * Scales an existing PNG data URL via MuPDF PDFDocument rasterization to simulate lower/higher DPI acuity on `.pptx` slides.
 */
export function rescalePngDataUrl(
  dataUrl: string,
  scaleFactor: number,
): { pngBytes: Uint8Array; widthPx: number; heightPx: number } {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const rawPng = Buffer.from(b64, "base64");
  const mImg = new mupdf.Image(rawPng);
  const baseW = mImg.getWidth();
  const baseH = mImg.getHeight();
  const rel = Math.max(0.16, Math.min(1.25, scaleFactor / 1.4));

  const pdf = new mupdf.PDFDocument();
  const imgObj = pdf.addImage(mImg);
  const pageObj = pdf.addPage(
    [0, 0, baseW, baseH],
    0,
    { XObject: { Im0: imgObj } },
    `q ${baseW} 0 0 ${baseH} 0 0 cm /Im0 Do Q`,
  );
  pdf.insertPage(-1, pageObj);
  const pix = pdf
    .loadPage(0)
    .toPixmap(mupdf.Matrix.scale(rel, rel), mupdf.ColorSpace.DeviceRGB, false, true);
  return {
    pngBytes: pix.asPNG(),
    widthPx: pix.getWidth(),
    heightPx: pix.getHeight(),
  };
}

function compositeSlideWithMediaPng(
  baseSlidePng: Uint8Array,
  slideW: number,
  slideH: number,
  mediaImages: Buffer[],
): Uint8Array {
  if (mediaImages.length === 0) return baseSlidePng;
  const pdf = new mupdf.PDFDocument();
  const xobjects: Record<string, mupdf.PDFObject> = {
    Bg: pdf.addImage(new mupdf.Image(baseSlidePng)),
  };
  let stream = `q ${slideW} 0 0 ${slideH} 0 0 cm /Bg Do Q\n`;

  const firstMedia = mediaImages[0];
  if (firstMedia) {
    const mImg = new mupdf.Image(firstMedia);
    xobjects.M0 = pdf.addImage(mImg);
    const maxW = slideW - 96;
    const maxH = Math.round(slideH * 0.62);
    const ratio = Math.min(maxW / mImg.getWidth(), maxH / mImg.getHeight());
    const drawW = Math.round(mImg.getWidth() * ratio);
    const drawH = Math.round(mImg.getHeight() * ratio);
    const x = 48;
    // PDF origin (0,0) is bottom-left!
    const y = Math.max(32, slideH - 165 - drawH);
    stream += `q ${drawW} 0 0 ${drawH} ${x} ${y} cm /M0 Do Q\n`;
  }

  const pageObj = pdf.addPage([0, 0, slideW, slideH], 0, { XObject: xobjects }, stream);
  pdf.insertPage(-1, pageObj);
  return pdf
    .loadPage(0)
    .toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false, true)
    .asPNG();
}

/**
 * Parses all pages of a PDF file into structured text + rasterized PNGs for multimodal embedding.
 */
export function extractPdfBundle(
  filePath: string,
  meta: { id: string; title: string; subtitle: string; renderScale?: number; maxPages?: number },
): ParsedDocBundle {
  const buf = readFileSync(filePath);
  const fileSizeBytes = statSync(filePath).size;
  const doc = mupdf.Document.openDocument(buf, "application/pdf");
  const rawCount = doc.countPages();
  const pageCount = meta.maxPages ? Math.min(rawCount, meta.maxPages) : rawCount;
  const scale = meta.renderScale ?? 1.35;

  const pages: ExtractedPageOrSlide[] = [];
  for (let idx = 0; idx < pageCount; idx++) {
    const page = doc.loadPage(idx);
    const pix = page.toPixmap(
      mupdf.Matrix.scale(scale, scale),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    );
    const pngBytes = pix.asPNG();
    const rawText = page.toStructuredText("preserve-whitespace").asText();
    const extractedText = rawText.trim();

    pages.push({
      pageNumber: idx + 1,
      pageTitle: inferPageHeading(extractedText, idx + 1),
      extractedText,
      speakerNotes: "",
      pngBase64: Buffer.from(pngBytes).toString("base64"),
      widthPx: pix.getWidth(),
      heightPx: pix.getHeight(),
    });
  }

  return {
    id: meta.id,
    title: meta.title,
    subtitle: meta.subtitle,
    filename: basename(filePath),
    format: "pdf",
    filePath,
    fileSizeBytes,
    pageCount,
    pages,
  };
}

function decodeXmlEntities(xmlText: string): string {
  return xmlText
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function extractXmlParagraphs(xml: string): string[] {
  const paragraphs: string[] = [];
  const pMatches = xml.match(/<a:p\b[\s\S]*?<\/a:p>/g) ?? [];
  for (const pBlock of pMatches) {
    const runs = [...pBlock.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) =>
      decodeXmlEntities(m[1] ?? ""),
    );
    const joined = cleanSlideLine(runs.join(""));
    if (joined.length > 0) {
      paragraphs.push(joined);
    }
  }
  return paragraphs;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Parses ANY OpenXML `.pptx` PowerPoint file via JSZip:
 * - Extracts slide text runs (`ppt/slides/slide*.xml`)
 * - Extracts hidden presenter speaker notes (`ppt/notesSlides/notesSlide*.xml`)
 * - Extracts embedded slide chart/diagram images (`ppt/media/*`)
 * - Rasterizes each slide into a crisp 16:9 PNG (`960x540`) WITHOUT speaker notes, matching real Slide Show view!
 */
export async function extractPptxBundle(
  filePath: string,
  meta: { id: string; title?: string; subtitle?: string },
): Promise<ParsedDocBundle> {
  const buf = readFileSync(filePath);
  const fileSizeBytes = statSync(filePath).size;
  const zip = await JSZip.loadAsync(buf);

  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const na = Number.parseInt(a.match(/slide(\d+)\.xml/)?.[1] ?? "0", 10);
      const nb = Number.parseInt(b.match(/slide(\d+)\.xml/)?.[1] ?? "0", 10);
      return na - nb;
    });

  const pages: ExtractedPageOrSlide[] = [];

  for (let i = 0; i < slidePaths.length; i++) {
    const slidePath = slidePaths[i]!;
    const slideNum = i + 1;
    const slideXml = (await zip.file(slidePath)?.async("string")) ?? "";
    const paragraphs = extractXmlParagraphs(slideXml);
    const slideTitle = paragraphs[0] ?? `Slide ${slideNum}`;
    const bodyLines = paragraphs.slice(1);

    // Check hidden presenter speaker notes in ppt/notesSlides/notesSlide{N}.xml
    const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`;
    let speakerNotes = "";
    if (zip.file(notesPath)) {
      const notesXml = (await zip.file(notesPath)?.async("string")) ?? "";
      const noteLines = extractXmlParagraphs(notesXml).filter(
        (line) => !/^\d+$/.test(line),
      );
      speakerNotes = noteLines.join("\n");
    }

    // Check slide relationships for embedded images/charts (ppt/slides/_rels/slide{N}.xml.rels)
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    const embeddedMediaBuffers: Buffer[] = [];
    if (zip.file(relsPath)) {
      const relsXml = (await zip.file(relsPath)?.async("string")) ?? "";
      const targets = [...relsXml.matchAll(/Target="\.\.\/media\/([^"]+)"/g)].map(
        (m) => `ppt/media/${m[1]}`,
      );
      for (const mediaPath of targets) {
        const mediaFile = zip.file(mediaPath);
        if (mediaFile && /\.(png|jpe?g)$/i.test(mediaPath)) {
          embeddedMediaBuffers.push(await mediaFile.async("nodebuffer"));
        }
      }
    }

    // Render 16:9 Slide Show visual PNG (note: speakerNotes are intentionally NOT drawn on the slide!)
    const bulletsHtml = bodyLines
      .map(
        (line) =>
          `<div style="margin:0 0 8px 0;padding-left:12px;border-left:3px solid #C8102E;font-size:13px;line-height:1.42;color:#292524;">${escapeHtml(line)}</div>`,
      )
      .join("");

    const slideHtml = `<html><body style="margin:0;padding:26px 32px;background:#fafaf9;color:#1c1917;font-family:Helvetica,Arial,sans-serif;">
      <div style="border-top:5px solid #C8102E;padding-top:12px;">
        <div style="font-size:9px;letter-spacing:2px;color:#C8102E;font-weight:bold;">${escapeHtml((meta.title ?? basename(filePath)).toUpperCase())} · SLIDE ${String(slideNum).padStart(2, "0")} / ${String(slidePaths.length).padStart(2, "0")}</div>
        <h1 style="font-size:21px;margin:6px 0 14px 0;color:#1c1917;font-weight:bold;">${escapeHtml(slideTitle)}</h1>
        ${bulletsHtml}
      </div>
    </body></html>`;

    const rendered = renderHtmlToPng(slideHtml, 640, 360, 1.5);
    const compositedPng = compositeSlideWithMediaPng(
      rendered.pngBytes,
      rendered.widthPx,
      rendered.heightPx,
      embeddedMediaBuffers,
    );
    const pngBase64 = Buffer.from(compositedPng).toString("base64");

    pages.push({
      pageNumber: slideNum,
      pageTitle: slideTitle,
      extractedText: paragraphs.join("\n"),
      speakerNotes,
      pngBase64,
      previewDataUrl: `data:image/png;base64,${pngBase64}`,
      widthPx: rendered.widthPx,
      heightPx: rendered.heightPx,
    });
  }

  const resolvedTitle = meta.title ?? pages[0]?.pageTitle ?? basename(filePath);
  return {
    id: meta.id,
    title: resolvedTitle,
    subtitle:
      meta.subtitle ?? `PowerPoint (.pptx) · ${pages.length} slides`,
    filename: basename(filePath),
    format: "pptx",
    filePath,
    fileSizeBytes,
    pageCount: pages.length,
    pages,
  };
}

function buildCostWaterfallChartDataUrl(): string {
  const chartHtml = `<html><body style="margin:0;padding:18px 22px;background:#ffffff;font-family:Helvetica,Arial,sans-serif;color:#1c1917;">
    <div style="font-size:11px;font-weight:bold;letter-spacing:1px;color:#57534e;margin-bottom:12px;">MONTHLY 10M-VECTOR INFRASTRUCTURE COST (USD / MONTH)</div>
    <div style="margin-bottom:12px;">
      <div style="font-size:12px;font-weight:bold;margin-bottom:3px;">Pinecone Enterprise Pod Cluster — $4,800 / month</div>
      <div style="width:460px;height:22px;background:#44403c;"></div>
    </div>
    <div style="margin-bottom:12px;">
      <div style="font-size:12px;font-weight:bold;margin-bottom:3px;">Managed Qdrant Cloud Cluster — $1,950 / month</div>
      <div style="width:195px;height:22px;background:#78716c;"></div>
    </div>
    <div>
      <div style="font-size:12px;font-weight:bold;color:#C8102E;margin-bottom:3px;">Embedded libSQL 256d Matryoshka DiskANN — $140 / month (-97% Spend)</div>
      <div style="width:24px;height:22px;background:#C8102E;"></div>
    </div>
  </body></html>`;
  const { pngBytes } = renderHtmlToPng(chartHtml, 540, 195, 1.5);
  return `data:image/png;base64,${Buffer.from(pngBytes).toString("base64")}`;
}

/**
 * Generates two rich, realistic OpenXML `.pptx` PowerPoint decks in `data/decks/` if not present.
 */
export async function ensureSampleDecks(
  decksDir = "data/decks",
): Promise<Array<{ id: string; title: string; subtitle: string; filePath: string }>> {
  mkdirSync(decksDir, { recursive: true });

  const boardPath = join(decksDir, "q4-infra-board-deck.pptx");
  if (!existsSync(boardPath)) {
    const pres = new PptxGenJS();
    pres.layout = "LAYOUT_16x9";
    pres.title = "TheFocus.AI Q4 Infrastructure & Retrieval Board Review";

    const addHeader = (slide: PptxGenJS.Slide, title: string) => {
      slide.addText(title, {
        x: 0.5,
        y: 0.35,
        w: 9.0,
        h: 0.6,
        fontSize: 22,
        bold: true,
        color: "1C1917",
      });
    };

    // Slide 1
    const s1 = pres.addSlide();
    addHeader(s1, "TheFocus.AI Q4 Infrastructure & Multimodal Retrieval Review");
    s1.addText(
      "Architecture & Economics Readout · Moving 50M Document & Slide Embeddings onto Local Matryoshka SQLite",
      { x: 0.5, y: 1.2, w: 8.8, h: 1.0, fontSize: 15, color: "44403C" },
    );

    // Slide 2
    const s2 = pres.addSlide();
    addHeader(s2, "Q4 Executive KPI & Retrieval Latency Scorecard");
    s2.addText(
      [
        { text: "• Annual Recurring Revenue (ARR): $18.4M (+44% YoY), Net Dollar Retention 128%\n" },
        { text: "• Hybrid RRF p99 Search Latency: 11.4 ms across text, code, PDFs, and slides\n" },
        { text: "• GPU Embedding Throughput: 64% unit-cost drop using local EmbeddingGemma 2 (740M)" },
      ],
      { x: 0.5, y: 1.2, w: 8.8, h: 2.2, fontSize: 14, color: "1C1917" },
    );

    // Slide 3 — Visual-only embedded chart! XML text intentionally omits vendors & dollar amounts!
    const s3 = pres.addSlide();
    addHeader(s3, "Monthly Vector Cluster Infrastructure Spend");
    s3.addImage({
      data: buildCostWaterfallChartDataUrl(),
      x: 0.5,
      y: 1.15,
      w: 8.2,
      h: 3.0,
    });

    // Slide 4
    const s4 = pres.addSlide();
    addHeader(s4, "Three-Tier Matryoshka SQLite Storage Topology");
    s4.addText(
      [
        { text: "• Tier 1 (Hot RAM): 256d truncated F32_BLOB(256) DiskANN cosine graph (1,024 B/item, 3x smaller)\n" },
        { text: "• Tier 2 (NVMe Rerank): Full 768d exact cosine rescoring on top-32 candidates\n" },
        { text: "• Tier 3 (Lexical Guardrail): SQLite FTS5 BM25 fused via Reciprocal Rank Fusion (k = 12)" },
      ],
      { x: 0.5, y: 1.2, w: 8.8, h: 2.4, fontSize: 14, color: "1C1917" },
    );

    // Slide 5
    const s5 = pres.addSlide();
    addHeader(s5, "Zero-OCR PDF & PowerPoint Ingestion Pipeline");
    s5.addText(
      [
        { text: "• MuPDF WASM rasterizes every PDF page and slide at 1.35x DPI (~826x1069 px)\n" },
        { text: "• EmbeddingGemma 2's 170M vision encoder embeds figures, flowcharts, and LaTeX math directly\n" },
        { text: "• Eliminates 4-stage OCR + table-reconstruction brittle pipelines" },
      ],
      { x: 0.5, y: 1.2, w: 8.8, h: 2.4, fontSize: 14, color: "1C1917" },
    );

    // Slide 6
    const s6 = pres.addSlide();
    addHeader(s6, "EU-West Checkout 502 Reliability Remediation");
    s6.addText(
      [
        { text: "• Root cause: Envoy 65s upstream idle_timeout exceeded Bun 60s origin keep-alive\n" },
        { text: "• CI policy gate now enforces origin_keepalive >= proxy_idle + 10s\n" },
        { text: "• Zero ERR_UPSTREAM_RST_499 socket resets across 1.4B requests since October rollout" },
      ],
      { x: 0.5, y: 1.2, w: 8.8, h: 2.4, fontSize: 14, color: "1C1917" },
    );

    // Slide 7 — Neutral slide canvas, confidential M&A details ONLY in Presenter Speaker Notes!
    const s7 = pres.addSlide();
    addHeader(s7, "2027 Enterprise Packaging & Tier Matrix");
    s7.addText(
      [
        { text: "• Team Tier: Up to 500k local multimodal documents and slide decks\n" },
        { text: "• Enterprise Tier: Air-gapped VPC deployment, SAML SSO, custom retention policies\n" },
        { text: "• Strategic Partnership Track: Joint OEM distribution under evaluation" },
      ],
      { x: 0.5, y: 1.2, w: 8.8, h: 2.2, fontSize: 14, color: "1C1917" },
    );
    s7.addNotes(
      "CONFIDENTIAL BOARD SPEAKER NOTE: Project Horizon acquisition LOI is capped at $42M cash plus an $8M engineering retention pool. Diligence room closes November 30; do not circulate outside executive session.",
    );

    // Slide 8
    const s8 = pres.addSlide();
    addHeader(s8, "H1 2027 Engineering Roadmap & Release Gates");
    s8.addText(
      [
        { text: "• Q1: Quantized int8 + 256d Matryoshka hybrid mobile sync\n" },
        { text: "• Q2: Streaming audio + slide-deck live meeting recall\n" },
        { text: "• Blocking CI gates: deterministic recall harness + latency budget < 15ms" },
      ],
      { x: 0.5, y: 1.2, w: 8.8, h: 2.2, fontSize: 14, color: "1C1917" },
    );

    const out = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
    writeFileSync(boardPath, out);
  }

  const guidePath = join(decksDir, "vision-encoders-field-guide.pptx");
  if (!existsSync(guidePath)) {
    const pres = new PptxGenJS();
    pres.layout = "LAYOUT_16x9";
    pres.title = "Seeing How Models See: Visual Acuity in PDF & Slide Embeddings";

    const slidesData: Array<{ title: string; bullets: string[]; notes?: string }> = [
      {
        title: "Seeing How Models See: Visual Document & Slide Acuity",
        bullets: [
          "• A practical field guide to testing vision vs. text embeddings on dense PDFs and PowerPoint decks",
          "• Tested locally with EmbeddingGemma 2 (740M) + MuPDF WASM + libSQL",
        ],
      },
      {
        title: "Three Encoders Sharing One 768d Unit Hypersphere",
        bullets: [
          "• 270M Text Backbone: 100+ languages, source code ASTs, Markdown, and XML speaker notes",
          "• 170M Vision Encoder: Reads page layouts, architecture block diagrams, charts, and LaTeX equations",
          "• 300M Audio Encoder: Maps 16 kHz PCM waveforms into the identical cosine space",
        ],
      },
      {
        title: "Resolution vs. Visual Acuity: Why DPI Determines Recall",
        bullets: [
          "• At 0.25x thumbnail scale (~150px), headlines survive but LaTeX subscripts and 8pt table cells blur into noise",
          "• At 1.0x–1.35x scale (~825px), multi-column text, axis labels, and block arrows snap into sharp focus",
          "• Beyond 2.0x scale, vision patch downsampling yields diminishing cosine gains while tripling PNG bytes",
        ],
      },
      {
        title: "Single-Vector 768d Pages vs. Multi-Vector ColPali Patch Grids",
        bullets: [
          "• Single 768d vector (EmbeddingGemma 2): 3,072 bytes/page (1,024 B at 256d MRL) — ultra-fast SQLite DiskANN",
          "• Multi-vector late interaction (ColPali): ~1,030 patch vectors/page (~256 KB/page) — finer needle granularity at 85x storage",
        ],
      },
      {
        title: "Where Vision Wins vs. Where Extracted Text Wins",
        bullets: [
          "• Vision wins: Architecture figures, graphical bar charts without alt-text, garbled LaTeX math ligatures",
          "• Extracted Text wins: Hidden PowerPoint Presenter Speaker Notes, exact 16-char error hashes in 6pt footnotes",
          "• Fused { image, text } + Hybrid RRF captures both signals in a single index",
        ],
      },
      {
        title: "Recommended Production Recipe for PDFs & Slide Decks",
        bullets: [
          "• Index each PDF page / PPTX slide as its own atomic multimodal unit with parent doc_id metadata",
          "• Store Vision + Fused 768d/256d vectors alongside SQLite FTS5 over extracted text and speaker notes",
        ],
      },
    ];

    for (const sd of slidesData) {
      const s = pres.addSlide();
      s.addText(sd.title, {
        x: 0.5,
        y: 0.35,
        w: 9.0,
        h: 0.6,
        fontSize: 21,
        bold: true,
        color: "1C1917",
      });
      s.addText(sd.bullets.join("\n"), {
        x: 0.5,
        y: 1.2,
        w: 8.8,
        h: 2.6,
        fontSize: 14,
        color: "1C1917",
      });
      if (sd.notes) s.addNotes(sd.notes);
    }

    const out = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
    writeFileSync(guidePath, out);
  }

  return [
    {
      id: "deck-q4-board",
      title: "TheFocus.AI Q4 Board Review (.pptx)",
      subtitle: "PowerPoint Deck · 8 slides · Includes Visual-Only Chart & Hidden Speaker Notes",
      filePath: boardPath,
    },
    {
      id: "deck-vision-guide",
      title: "Seeing How Models See: Vision Acuity Field Guide (.pptx)",
      subtitle: "PowerPoint Deck · 6 slides · DPI Acuity, ColPali vs Dense 768d, Production Recipes",
      filePath: guidePath,
    },
  ];
}

/**
 * Ensures the 3 landmark arXiv PDF papers are present in `data/papers/`, downloading any missing file.
 */
export async function ensureSamplePapers(
  papersDir = "data/papers",
): Promise<Array<{ spec: SamplePaperSpec; filePath: string }>> {
  mkdirSync(papersDir, { recursive: true });
  const ready: Array<{ spec: SamplePaperSpec; filePath: string }> = [];

  for (const spec of SAMPLE_PAPERS) {
    const filePath = join(papersDir, spec.filename);
    if (!existsSync(filePath) || statSync(filePath).size < 10_000) {
      const res = await fetch(spec.arxivUrl, { redirect: "follow" });
      if (!res.ok) {
        throw new Error(`Failed to download ${spec.arxivUrl}: HTTP ${res.status}`);
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      writeFileSync(filePath, bytes);
    }
    ready.push({ spec, filePath });
  }
  return ready;
}

/**
 * Runs a live 4-step Visual Acuity X-Ray (`0.25x`, `0.5x`, `1.0x`, `1.75x`) on any PDF page or PPTX slide,
 * returning the actual rendered PNGs at each resolution alongside their EmbeddingGemma 2 cosine scores.
 */
export async function runPageVisualAcuityXray(
  embedder: Embedder,
  options: {
    format: DocFormat;
    filePath: string;
    pageNumber: number;
    slidePreviewDataUrl?: string | null;
    query: string;
  },
): Promise<{ query: string; formattedQuery: string; embedMs: number; points: AcuityPoint[] }> {
  const scales: Array<{ scale: number; label: string }> = [
    { scale: 0.25, label: "0.25× Thumbnail Blur" },
    { scale: 0.5, label: "0.50× Low-DPI" },
    { scale: 1.0, label: "1.00× Standard Page" },
    { scale: 1.75, label: "1.75× High-Acuity" },
  ];

  const rendered = scales.map(({ scale, label }) => {
    const r =
      options.format === "pdf"
        ? renderPdfPagePngFromFile(options.filePath, options.pageNumber, scale)
        : rescalePngDataUrl(options.slidePreviewDataUrl ?? "", scale);
    const b64 = Buffer.from(r.pngBytes).toString("base64");
    return {
      scale,
      label,
      widthPx: r.widthPx,
      heightPx: r.heightPx,
      pngBytes: r.pngBytes.byteLength,
      b64,
      dataUrl: `data:image/png;base64,${b64}`,
    };
  });

  const prefix = options.query.includes("?") ? "question_answering" : "search_query";
  const formattedQuery = formatWithTaskPrefix(options.query, prefix);

  const batch = await embedder.embed([
    formattedQuery,
    ...rendered.map((r) => ({ image: r.b64 })),
  ]);
  const qVec = batch.embeddings[0]!;

  const points: AcuityPoint[] = rendered.map((r, i) => ({
    scale: r.scale,
    label: r.label,
    widthPx: r.widthPx,
    heightPx: r.heightPx,
    pngBytes: r.pngBytes,
    cosineSimilarity: cosineSimilarity(qVec, batch.embeddings[i + 1]!),
    dataUrl: r.dataUrl,
  }));

  return {
    query: options.query,
    formattedQuery,
    embedMs: batch.durationMs,
    points,
  };
}

/**
 * Creates a tiny deterministic 2-page PDF in memory for offline CI unit tests (no network required).
 */
export function createTinyTestPdfFile(targetPath: string): void {
  const pdfDoc = new mupdf.PDFDocument();
  const fontObj = pdfDoc.addSimpleFont(new mupdf.Font("Helvetica"));
  const pages = [
    "BT /F1 18 Tf 48 760 Td (Page 1: Transformer Attention Architecture) Tj 0 -28 Td /F1 12 Tf (Multi-head self-attention connects encoder and decoder stacks.) Tj ET",
    "BT /F1 18 Tf 48 760 Td (Page 2: Matryoshka Nested Vector Dimensions) Tj 0 -28 Td /F1 12 Tf (Truncating 768d embeddings to 256d cuts RAM 3x.) Tj ET",
  ];
  for (const stream of pages) {
    const pageObj = pdfDoc.addPage(
      [0, 0, 595, 842],
      0,
      { Font: { F1: fontObj } },
      stream,
    );
    pdfDoc.insertPage(-1, pageObj);
  }
  writeFileSync(targetPath, pdfDoc.saveToBuffer("compress").asUint8Array());
}
