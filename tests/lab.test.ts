import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppHandler } from "../src/app.ts";
import { buildSyntheticAudioClips } from "../src/audio.ts";
import { buildSyntheticScenes, buildVisualDocuments } from "../src/images.ts";
import {
  createTinyTestPdfFile,
  ensureSampleDecks,
  extractPdfBundle,
  extractPptxBundle,
} from "../src/pdf_pptx.ts";
import { cosineSimilarity, l2Normalize, truncateMrl } from "../src/mrl.ts";
import type { EmbedBatchResult, Embedder, EmbedInputItem, OllamaHealth } from "../src/ollama.ts";
import { formatWithTaskPrefix } from "../src/prefixes.ts";
import { VectorStore } from "../src/store.ts";

/**
 * Deterministic offline semantic mock embedder that maps topic keywords and synthetic images
 * into orthogonal 768d concept subspaces so CI tests never require a network or live GPU daemon.
 */
class DeterministicTestEmbedder implements Embedder {
  readonly model = "embeddinggemma-2:deterministic-test";

  private conceptVector(input: EmbedInputItem): Float32Array {
    const vec = new Float32Array(768);
    const text =
      typeof input === "string"
        ? input.toLowerCase()
        : `${input.text ?? ""} img:${(input.image ?? "").slice(0, 48)} aud:${(input.audio ?? "").slice(0, 48)}`.toLowerCase();

    // Assign topic concepts to distinct coordinate blocks across 0..127 so MRL subspaces also preserve signal
    const rules: Array<[RegExp, number, number]> = [
      [/wal|simultaneous|concurrent|sqlite|journal_mode/, 0, 3.0],
      [/matryoshka|mrl|dimension|subspace|truncat/, 8, 3.0],
      [/jvm|zgc|heap|garbage|pause/, 16, 3.0],
      [/java/, 20, 1.4],
      [/arabica|coffee|volcanic/, 24, 3.0],
      [/mercury/, 32, 1.4],
      [/orbit|perihelion|relativity|planet/, 36, 3.0],
      [/barometer|amalgam|liquid|quicksilver/, 40, 3.0],
      [/err_upstream_rst_499|keepalive_timeout|socket/, 48, 3.2],
      [/idempotency|ledger|settlement/, 56, 3.2],
      [/tokenbucket|throttle|burst|refill/, 64, 3.2],
      [/jitter|backoff|429|503|retry/, 72, 3.2],
      [/recursive|org_tree|hierarchy|employees|cte/, 80, 3.2],
      [/ringbuffer|circular|push_overwrite/, 88, 3.2],
      [/solar|sales fundidas|molten salt|termosolar/, 96, 3.2],
      [/地震|新幹線|p-wave|earthquake|train|uredas/, 104, 3.2],
      [/levain|fermentation|sourdough|lactic/, 112, 3.2],
    ];

    for (const [pattern, offset, weight] of rules) {
      if (pattern.test(text)) {
        for (let k = 0; k < 4; k++) {
          vec[offset + k] = (vec[offset + k] ?? 0) + weight;
          // Mirror across higher MRL bands (128..768) with fine detail
          vec[128 + offset + k] = (vec[128 + offset + k] ?? 0) + weight * 0.6;
          vec[256 + offset + k] = (vec[256 + offset + k] ?? 0) + weight * 0.4;
          vec[512 + offset + k] = (vec[512 + offset + k] ?? 0) + weight * 0.3;
        }
      }
    }

    // Deterministic fallback hash so non-matching strings are still non-zero unit vectors
    for (let i = 0; i < text.length; i++) {
      const idx = (text.charCodeAt(i) * 31 + i * 17) % 768;
      vec[idx] = (vec[idx] ?? 0) + 0.05;
    }
    return l2Normalize(vec);
  }

  async embed(inputs: EmbedInputItem[]): Promise<EmbedBatchResult> {
    return {
      embeddings: inputs.map((item) => this.conceptVector(item)),
      durationMs: 0.5,
      model: this.model,
    };
  }

  async health(): Promise<OllamaHealth> {
    return {
      ok: true,
      baseUrl: "http://127.0.0.1:11434",
      model: this.model,
      version: "test",
      modelAvailable: true,
      installedModels: [this.model],
    };
  }
}

const tempDirs: string[] = [];

function createTempStore(): VectorStore {
  const dir = mkdtempSync(join(tmpdir(), "gemma-emb-test-"));
  tempDirs.push(dir);
  return new VectorStore(`file:${join(dir, "test.db")}`);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("Matryoshka (MRL) vector operations & task prefixes", () => {
  test("truncateMrl slices to 512/256/128 and re-normalizes to unit length", () => {
    const raw = Array.from({ length: 768 }, (_, i) => Math.sin(i * 0.13) + 0.5);
    for (const dim of [768, 512, 256, 128] as const) {
      const truncated = truncateMrl(raw, dim);
      expect(truncated.length).toBe(dim);
      const norm = Math.sqrt(truncated.reduce((acc, v) => acc + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 5);
    }
    expect(cosineSimilarity(truncateMrl(raw, 256), truncateMrl(raw, 256))).toBeCloseTo(1.0, 5);
  });

  test("formatWithTaskPrefix applies EmbeddingGemma 2 task templates", () => {
    expect(formatWithTaskPrefix("sqlite wal", "search_query")).toBe(
      "task: search result | query: sqlite wal",
    );
    expect(formatWithTaskPrefix("token bucket", "code_query")).toBe(
      "task: code retrieval | query: token bucket",
    );
    expect(formatWithTaskPrefix("body text", "search_document", "My Doc")).toBe(
      "title: My Doc | text: body text",
    );
    expect(formatWithTaskPrefix("raw text", "none")).toBe("raw text");
  });

  test("buildSyntheticScenes, buildVisualDocuments, and buildSyntheticAudioClips generate valid PNG/WAV headers", () => {
    const scenes = buildSyntheticScenes(64);
    expect(scenes.length).toBe(5);
    for (const scene of scenes) {
      const bytes = Buffer.from(scene.pngBase64, "base64");
      expect(bytes[0]).toBe(0x89);
      expect(bytes[1]).toBe(0x50);
      expect(bytes[2]).toBe(0x4e);
      expect(bytes[3]).toBe(0x47);
      expect(scene.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    }

    const visDocs = buildVisualDocuments();
    expect(visDocs.length).toBe(3);
    for (const vd of visDocs) {
      const bytes = Buffer.from(vd.pngBase64, "base64");
      expect(bytes[0]).toBe(0x89);
      expect(bytes[1]).toBe(0x50);
      expect(vd.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    }

    const clips = buildSyntheticAudioClips();
    expect(clips.length).toBe(3);
    for (const clip of clips) {
      const bytes = Buffer.from(clip.wavBase64, "base64");
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
      expect(clip.audioDataUrl.startsWith("data:audio/wav;base64,")).toBe(true);
    }
  });
});

describe("libSQL VectorStore (DiskANN F32_BLOB + FTS5 BM25 + Hybrid RRF)", () => {
  test("indexes 768/512/256/128d vectors and executes ANN, FTS5, and Hybrid RRF queries", async () => {
    const store = createTempStore();
    await store.init();
    const embedder = new DeterministicTestEmbedder();

    const texts = [
      {
        id: "wal",
        title: "SQLite WAL Mode",
        content: "PRAGMA journal_mode=WAL allows concurrent readers with a writer.",
        modality: "text" as const,
        category: "db",
      },
      {
        id: "err-499",
        title: "Socket Reset Runbook",
        content: "Troubleshooting exact error token ERR_UPSTREAM_RST_499 on proxy.",
        modality: "text" as const,
        category: "ops",
      },
      {
        id: "bucket",
        title: "tokenBucket.ts",
        content: "export class TokenBucket { consume() {} }",
        modality: "code" as const,
        category: "ts",
      },
    ];

    const embs = await embedder.embed(texts.map((t) => t.content));
    await store.upsertMany(
      texts.map((t, i) => ({
        ...t,
        embedding768: embs.embeddings[i]!,
      })),
    );

    const stats = await store.stats();
    expect(stats.totalItems).toBe(3);
    expect(stats.mrlFootprintBytes[768]).toBe(3 * 768 * 4);
    expect(stats.mrlFootprintBytes[128]).toBe(3 * 128 * 4);

    // Semantic vector query across all 4 MRL dimensions
    const qEmb = (await embedder.embed(["how to enable simultaneous database reads"])).embeddings[0]!;
    for (const dim of [768, 512, 256, 128] as const) {
      const vecHits = await store.searchVector(qEmb, { dim, limit: 3 });
      expect(vecHits[0]?.id).toBe("wal");
    }

    // Exact keyword FTS5 BM25 query
    const ftsHits = await store.searchFts("ERR_UPSTREAM_RST_499");
    expect(ftsHits.length).toBe(1);
    expect(ftsHits[0]?.id).toBe("err-499");

    // Hybrid RRF fuses both vector rank and FTS5 rank
    const qErrEmb = (await embedder.embed(["ERR_UPSTREAM_RST_499 proxy socket"])).embeddings[0]!;
    const hybridHits = await store.searchHybrid("ERR_UPSTREAM_RST_499", qErrEmb, { dim: 256 });
    expect(hybridHits[0]?.id).toBe("err-499");
    expect(hybridHits[0]?.vectorRank).toBe(1);
    expect(hybridHits[0]?.ftsRank).toBe(1);

    // Regression check: repeated clear() + upsertMany() rebuilds DiskANN shadow tables cleanly
    await store.clear();
    await store.upsertMany(
      texts.map((t, i) => ({
        ...t,
        embedding768: embs.embeddings[i]!,
      })),
    );
    expect((await store.stats()).totalItems).toBe(3);

    store.close();
  });

  test("HTTP app handler serves playground HTML, seeds corpus, searches, and computes MRL matrix", async () => {
    const store = createTempStore();
    await store.init();
    const embedder = new DeterministicTestEmbedder();
    const handler = createAppHandler({
      store,
      embedder,
      ollamaBaseUrl: "http://127.0.0.1:11434",
    });

    const homeRes = await handler(new Request("http://localhost/"));
    expect(homeRes.status).toBe(200);
    const homeHtml = await homeRes.text();
    expect(homeHtml).toContain("EmbeddingGemma 2 Lab");
    const scriptMatch = homeHtml.match(/<script type="module">([\s\S]*?)<\/script>/);
    expect(scriptMatch).not.toBeNull();
    expect(() =>
      new Bun.Transpiler({ loader: "js" }).transformSync(scriptMatch![1]!),
    ).not.toThrow();

    const seedRes = await handler(new Request("http://localhost/api/seed", { method: "POST" }));
    expect(seedRes.status).toBe(200);
    const seedJson = (await seedRes.json()) as { count: number };
    expect(seedJson.count).toBeGreaterThanOrEqual(20);

    const searchRes = await handler(
      new Request("http://localhost/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: "ERR_UPSTREAM_RST_499",
          mode: "hybrid",
          prefix: "search_query",
          dim: 256,
        }),
      }),
    );
    expect(searchRes.status).toBe(200);
    const searchJson = (await searchRes.json()) as { hits: Array<{ id: string }> };
    expect(searchJson.hits[0]?.id).toBe("doc-err-socket");

    const matrixRes = await handler(
      new Request("http://localhost/api/matrix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: [
            "SQLite WAL concurrent readers",
            "simultaneous database reads with journal_mode=WAL",
            "Arabica coffee harvest in Java",
          ],
          prefix: "similarity",
        }),
      }),
    );
    expect(matrixRes.status).toBe(200);
    const matrixJson = (await matrixRes.json()) as {
      matricesByDim: Record<string, number[][]>;
    };
    const m768 = matrixJson.matricesByDim["768"]!;
    expect(m768[0]![1]!).toBeGreaterThan(m768[0]![2]!);

    // One-at-a-time & interactive story endpoints: /api/cases, /api/story/inspect, /api/items/similar, /api/bench/case
    const casesRes = await handler(new Request("http://localhost/api/cases"));
    expect(casesRes.status).toBe(200);
    const casesJson = (await casesRes.json()) as { cases: Array<{ id: string }> };
    expect(casesJson.cases.length).toBe(26);

    const storyRes = await handler(
      new Request("http://localhost/api/story/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: "how to allow simultaneous database reads while writing",
          expectedId: "doc-sqlite-wal",
        }),
      }),
    );
    expect(storyRes.status).toBe(200);
    const storyJson = (await storyRes.json()) as {
      vectorPreview96: number[];
      mrl: Array<{ dim: number }>;
    };
    expect(storyJson.vectorPreview96.length).toBe(96);
    expect(storyJson.mrl.length).toBe(4);

    const simRes = await handler(
      new Request("http://localhost/api/items/similar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "doc-adr-014", limit: 4 }),
      }),
    );
    expect(simRes.status).toBe(200);
    const simJson = (await simRes.json()) as { neighbors: Array<{ id: string }> };
    expect(simJson.neighbors.length).toBe(4);

    const singleCaseRes = await handler(
      new Request("http://localhost/api/bench/case", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId: "q-hom-1" }),
      }),
    );
    expect(singleCaseRes.status).toBe(200);
    const singleCaseJson = (await singleCaseRes.json()) as {
      queryId: string;
      mrlByDim: Array<{ dim: number; rank: number | null }>;
    };
    expect(singleCaseJson.queryId).toBe("q-hom-1");
    expect(singleCaseJson.mrlByDim.length).toBe(4);

    const oneExpRes = await handler(
      new Request("http://localhost/api/bench/one", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ experiment: "hybrid", filter: "q-sem-1" }),
      }),
    );
    expect(oneExpRes.status).toBe(200);

    // Regression check: calling /api/seed a second time cleanly rebuilds DiskANN indexes
    const reseedRes = await handler(new Request("http://localhost/api/seed", { method: "POST" }));
    expect(reseedRes.status).toBe(200);

    store.close();
  });

  test("rasterizes & indexes offline PDF papers and PowerPoint .pptx decks across Vision, Text, Fused, and 4-DPI Acuity", async () => {
    const store = createTempStore();
    await store.init();
    const embedder = new DeterministicTestEmbedder();
    const handler = createAppHandler({
      store,
      embedder,
      ollamaBaseUrl: "http://127.0.0.1:11434",
    });

    const dir = mkdtempSync(join(tmpdir(), "gemma-docs-test-"));
    tempDirs.push(dir);
    const pdfPath = join(dir, "tiny.pdf");
    createTinyTestPdfFile(pdfPath);

    const parsedPdf = extractPdfBundle(pdfPath, {
      id: "pdf-tiny",
      title: "Tiny 2-Page Paper",
      subtitle: "Offline Test PDF",
    });
    expect(parsedPdf.pageCount).toBe(2);
    expect(parsedPdf.pages[0]?.extractedText).toContain("Transformer Attention");
    expect(Buffer.from(parsedPdf.pages[0]!.pngBase64, "base64")[0]).toBe(0x89);

    const decks = await ensureSampleDecks(join(dir, "decks"));
    expect(decks.length).toBe(2);
    const boardDeck = await extractPptxBundle(decks[0]!.filePath, {
      id: "deck-board-test",
      title: decks[0]!.title,
    });
    expect(boardDeck.pageCount).toBe(8);
    expect(boardDeck.pages[6]?.speakerNotes).toContain("Project Horizon");

    // Upload the offline PDF via /api/docs/upload and inspect 3 lenses + 4-DPI acuity
    const fd = new FormData();
    fd.append(
      "file",
      new File([await Bun.file(pdfPath).arrayBuffer()], "tiny.pdf", {
        type: "application/pdf",
      }),
    );
    const upRes = await handler(
      new Request("http://localhost/api/docs/upload", { method: "POST", body: fd }),
    );
    expect(upRes.status).toBe(200);
    const upJson = (await upRes.json()) as { docId: string; pageCount: number };
    expect(upJson.pageCount).toBe(2);

    const inspectRes = await handler(
      new Request("http://localhost/api/docs/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          docId: upJson.docId,
          query: "Matryoshka nested dimensions 256d",
        }),
      }),
    );
    expect(inspectRes.status).toBe(200);
    const inspectJson = (await inspectRes.json()) as { heatmap: Array<{ pageNumber: number }> };
    expect(inspectJson.heatmap.length).toBe(2);

    const acuityRes = await handler(
      new Request("http://localhost/api/docs/acuity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          docId: upJson.docId,
          pageNumber: 2,
          query: "Matryoshka nested dimensions",
        }),
      }),
    );
    expect(acuityRes.status).toBe(200);
    const acuityJson = (await acuityRes.json()) as { points: Array<{ scale: number }> };
    expect(acuityJson.points.length).toBe(4);

    // Seed unit corpus too and verify /api/omni-search spans BOTH corpus items AND PDF/PPTX doc_pages
    await handler(new Request("http://localhost/api/seed", { method: "POST" }));

    const omniHybridRes = await handler(
      new Request("http://localhost/api/omni-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: "Matryoshka nested dimensions 256d",
          scope: "all",
          lens: "hybrid",
          dim: 256,
          limit: 10,
        }),
      }),
    );
    expect(omniHybridRes.status).toBe(200);
    const omniHybrid = (await omniHybridRes.json()) as {
      totalCandidates: number;
      hits: Array<{ sourceKind: string; id: string }>;
      rollup: Array<{ groupKey: string }>;
    };
    expect(omniHybrid.totalCandidates).toBeGreaterThanOrEqual(34);
    expect(omniHybrid.hits.length).toBeGreaterThan(0);
    expect(omniHybrid.rollup.length).toBeGreaterThan(0);

    const omniPdfOnlyRes = await handler(
      new Request("http://localhost/api/omni-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: "Matryoshka",
          scope: "pdf",
          lens: "fts",
        }),
      }),
    );
    expect(omniPdfOnlyRes.status).toBe(200);
    const omniPdfOnly = (await omniPdfOnlyRes.json()) as {
      hits: Array<{ sourceKind: string; pageNumber: number | null }>;
    };
    expect(omniPdfOnly.hits.length).toBe(1);
    expect(omniPdfOnly.hits[0]?.sourceKind).toBe("pdf_page");
    expect(omniPdfOnly.hits[0]?.pageNumber).toBe(2);

    store.close();
  });
});
