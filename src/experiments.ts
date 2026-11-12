import { buildSyntheticAudioClips } from "./audio.ts";
import {
  BENCHMARK_QUERIES,
  buildReferenceCorpus,
  CROSS_MODAL_QUERIES,
  type CrossModalQuery,
  type EvalQuery,
} from "./corpus.ts";
import { buildSyntheticScenes, buildVisualDocuments } from "./images.ts";
import {
  DOC_SHOWCASE_QUERIES,
  ensureSampleDecks,
  ensureSamplePapers,
  extractPdfBundle,
  extractPptxBundle,
  type ParsedDocBundle,
} from "./pdf_pptx.ts";
import {
  cosineSimilarity,
  MRL_DIMS,
  storageBytesForDim,
  truncateMrl,
  type MrlDim,
} from "./mrl.ts";
import type { Embedder, EmbedInputItem } from "./ollama.ts";
import { formatWithTaskPrefix } from "./prefixes.ts";
import type { CorpusItemInput, SearchHit, VectorStore } from "./store.ts";

export type ExperimentName = "hybrid" | "prefixes" | "mrl" | "multimodal";

export interface MethodSummary {
  method: "fts5_bm25" | "vector_768" | "hybrid_rrf";
  label: string;
  hitAt1: number;
  hitAt3: number;
  mrr: number;
  perQuery: Array<{
    queryId: string;
    intent: EvalQuery["intent"];
    query: string;
    expectedId: string;
    topHitId: string | null;
    rank: number | null;
  }>;
}

export interface PrefixAbRow {
  queryId: string;
  query: string;
  intent: EvalQuery["intent"];
  expectedId: string;
  rawRank: number | null;
  steeredRank: number | null;
  rawTargetCosine: number;
  steeredTargetCosine: number;
  rawMarginVsRunnerUp: number;
  steeredMarginVsRunnerUp: number;
}

export interface PrefixAbSummary {
  rawHitAt1: number;
  steeredHitAt1: number;
  rawMrr: number;
  steeredMrr: number;
  meanRawMargin: number;
  meanSteeredMargin: number;
  rows: PrefixAbRow[];
}

export interface MrlDimBenchmark {
  dim: MrlDim;
  compressionRatio: string;
  bytesPerVector: number;
  bytesFor100kVectorsMb: number;
  hitAt1: number;
  hitAt3: number;
  mrr: number;
  top3OverlapWith768: number;
  meanCosineDriftVs768: number;
  avgSearchLatencyMs: number;
}

export interface MultimodalBenchmark {
  hitAt1: number;
  mrr: number;
  byModality: Record<"image" | "visdoc" | "audio", { hitAt1: number; count: number }>;
  scenes: Array<{
    id: string;
    modality: "image" | "visdoc" | "audio";
    title: string;
    caption: string;
    dataUrl?: string;
    audioDataUrl?: string;
  }>;
  queries: Array<{
    id: string;
    targetModality: "image" | "visdoc" | "audio";
    query: string;
    expectedImageId: string;
    predictedImageId: string;
    correct: boolean;
    scoresByImageId: Record<string, number>;
  }>;
}

export interface SingleCaseDiagnostic {
  queryId: string;
  query: string;
  intent: string;
  notes: string;
  expectedIds: string[];
  distractorId?: string;
  formattedQuery: string;
  embedMs: number;
  methods: {
    fts5: SearchHit[];
    vector768: SearchHit[];
    hybridRrf: SearchHit[];
  };
  prefixCheck: {
    rawTopId: string | null;
    rawTargetCosine: number | null;
    steeredTopId: string | null;
    steeredTargetCosine: number | null;
  };
  mrlByDim: Array<{
    dim: MrlDim;
    rank: number | null;
    topHitId: string | null;
    topCosine: number | null;
  }>;
}

export interface FullBenchmarkReport {
  model: string;
  generatedAt: string;
  corpusCount: number;
  seedDurationMs: number;
  hybridComparison: MethodSummary[];
  prefixSteering: PrefixAbSummary;
  mrlTruncation: MrlDimBenchmark[];
  multimodal: MultimodalBenchmark;
}

export async function ensureCorpusSeeded(
  store: VectorStore,
  embedder: Embedder,
  forceReseed = false,
): Promise<number> {
  const stats = await store.stats();
  if (forceReseed || stats.totalItems < 30) {
    const seeded = await seedReferenceCorpus(store, embedder);
    return seeded.durationMs;
  }
  return 0;
}

/**
 * Embeds and upserts the 6-modality reference corpus (text, document, code, image, visdoc, audio) into VectorStore.
 */
export async function seedReferenceCorpus(
  store: VectorStore,
  embedder: Embedder,
): Promise<{ count: number; durationMs: number }> {
  const started = performance.now();
  const rawDocs = buildReferenceCorpus();

  const inputs: EmbedInputItem[] = rawDocs.map((doc) => {
    if ((doc.modality === "image" || doc.modality === "visdoc") && doc.imageBase64) {
      return { image: doc.imageBase64 };
    }
    if (doc.modality === "audio" && doc.audioBase64) {
      return { audio: doc.audioBase64 };
    }
    return formatWithTaskPrefix(doc.content, "search_document", doc.title);
  });

  const batch = await embedder.embed(inputs);
  const toInsert: CorpusItemInput[] = rawDocs.map((doc, idx) => {
    const emb = batch.embeddings[idx];
    if (!emb) {
      throw new Error(`Missing embedding for corpus item ${doc.id}`);
    }
    return {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      modality: doc.modality,
      category: doc.category,
      language: doc.language,
      imageDataUrl: doc.imageDataUrl ?? null,
      audioDataUrl: doc.audioDataUrl ?? null,
      metadata: {
        seeded: true,
        groundTruthNote: doc.groundTruthNote ?? null,
      },
      embedding768: emb,
    };
  });

  await store.clear();
  await store.upsertMany(toInsert);
  return {
    count: toInsert.length,
    durationMs: performance.now() - started,
  };
}

function rankOfExpected(hitIds: string[], expectedIds: string[]): number | null {
  for (let i = 0; i < hitIds.length; i++) {
    if (expectedIds.includes(hitIds[i] ?? "")) {
      return i + 1;
    }
  }
  return null;
}

function summarizeRanks(ranks: Array<number | null>): {
  hitAt1: number;
  hitAt3: number;
  mrr: number;
} {
  if (ranks.length === 0) return { hitAt1: 0, hitAt3: 0, mrr: 0 };
  let h1 = 0;
  let h3 = 0;
  let rrSum = 0;
  for (const r of ranks) {
    if (r === 1) h1++;
    if (r !== null && r <= 3) h3++;
    if (r !== null) rrSum += 1 / r;
  }
  return {
    hitAt1: h1 / ranks.length,
    hitAt3: h3 / ranks.length,
    mrr: rrSum / ranks.length,
  };
}

function filterEvalQueries(filter?: string): readonly EvalQuery[] {
  if (!filter?.trim()) return BENCHMARK_QUERIES;
  const needle = filter.trim().toLowerCase();
  const matched = BENCHMARK_QUERIES.filter(
    (q) =>
      q.id.toLowerCase() === needle ||
      q.intent.toLowerCase() === needle ||
      q.query.toLowerCase().includes(needle) ||
      q.expectedIds.some((id) => id.toLowerCase().includes(needle)),
  );
  if (matched.length === 0) {
    throw new Error(
      `No benchmark query matched "${filter}". Valid IDs: ${BENCHMARK_QUERIES.map((q) => q.id).join(", ")}`,
    );
  }
  return matched;
}

function filterCrossModalQueries(filter?: string): readonly CrossModalQuery[] {
  if (!filter?.trim()) return CROSS_MODAL_QUERIES;
  const needle = filter.trim().toLowerCase();
  const matched = CROSS_MODAL_QUERIES.filter(
    (q) =>
      q.id.toLowerCase() === needle ||
      q.targetModality.toLowerCase() === needle ||
      q.query.toLowerCase().includes(needle) ||
      q.expectedId.toLowerCase().includes(needle),
  );
  if (matched.length === 0) {
    throw new Error(
      `No cross-modal query matched "${filter}". Valid IDs: ${CROSS_MODAL_QUERIES.map((q) => q.id).join(", ")}`,
    );
  }
  return matched;
}

function lexicalOnlyDocs() {
  return buildReferenceCorpus().filter(
    (d) => d.modality === "text" || d.modality === "document" || d.modality === "code",
  );
}

export async function runHybridExperiment(
  store: VectorStore,
  embedder: Embedder,
  options?: { filter?: string },
): Promise<MethodSummary[]> {
  await ensureCorpusSeeded(store, embedder);
  const queries = filterEvalQueries(options?.filter);
  const steeredBatch = await embedder.embed(
    queries.map((q) => formatWithTaskPrefix(q.query, q.recommendedPrefix)),
  );

  const ftsPerQuery: MethodSummary["perQuery"] = [];
  const vecPerQuery: MethodSummary["perQuery"] = [];
  const hybPerQuery: MethodSummary["perQuery"] = [];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i]!;
    const qVec = steeredBatch.embeddings[i]!;

    const [ftsHits, vecHits, hybHits] = await Promise.all([
      store.searchFts(q.query, { limit: 10 }),
      store.searchVector(qVec, { dim: 768, limit: 10, useAnnIndex: false }),
      store.searchHybrid(q.query, qVec, { dim: 768, limit: 10 }),
    ]);

    ftsPerQuery.push({
      queryId: q.id,
      intent: q.intent,
      query: q.query,
      expectedId: q.expectedIds[0] ?? "",
      topHitId: ftsHits[0]?.id ?? null,
      rank: rankOfExpected(ftsHits.map((h) => h.id), q.expectedIds),
    });
    vecPerQuery.push({
      queryId: q.id,
      intent: q.intent,
      query: q.query,
      expectedId: q.expectedIds[0] ?? "",
      topHitId: vecHits[0]?.id ?? null,
      rank: rankOfExpected(vecHits.map((h) => h.id), q.expectedIds),
    });
    hybPerQuery.push({
      queryId: q.id,
      intent: q.intent,
      query: q.query,
      expectedId: q.expectedIds[0] ?? "",
      topHitId: hybHits[0]?.id ?? null,
      rank: rankOfExpected(hybHits.map((h) => h.id), q.expectedIds),
    });
  }

  return [
    {
      method: "fts5_bm25",
      label: "SQLite FTS5 (BM25 Only)",
      ...summarizeRanks(ftsPerQuery.map((r) => r.rank)),
      perQuery: ftsPerQuery,
    },
    {
      method: "vector_768",
      label: "libSQL Vector (768d Cosine)",
      ...summarizeRanks(vecPerQuery.map((r) => r.rank)),
      perQuery: vecPerQuery,
    },
    {
      method: "hybrid_rrf",
      label: "Hybrid RRF (Vector + FTS5)",
      ...summarizeRanks(hybPerQuery.map((r) => r.rank)),
      perQuery: hybPerQuery,
    },
  ];
}

export async function runPrefixExperiment(
  _store: VectorStore,
  embedder: Embedder,
  options?: { filter?: string },
): Promise<PrefixAbSummary> {
  const queries = filterEvalQueries(options?.filter);
  const rawDocs = lexicalOnlyDocs();

  const [rawBatch, steeredBatch, rawDocBatch, steeredDocBatch] = await Promise.all([
    embedder.embed(queries.map((q) => q.query)),
    embedder.embed(queries.map((q) => formatWithTaskPrefix(q.query, q.recommendedPrefix))),
    embedder.embed(rawDocs.map((d) => d.content)),
    embedder.embed(
      rawDocs.map((d) => formatWithTaskPrefix(d.content, "search_document", d.title)),
    ),
  ]);

  const prefixRows: PrefixAbRow[] = [];
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i]!;
    const rawQ = rawBatch.embeddings[i]!;
    const steeredQ = steeredBatch.embeddings[i]!;

    const rawScored = rawDocs
      .map((d, idx) => ({
        id: d.id,
        cos: cosineSimilarity(rawQ, rawDocBatch.embeddings[idx]!),
      }))
      .sort((a, b) => b.cos - a.cos);

    const steeredScored = rawDocs
      .map((d, idx) => ({
        id: d.id,
        cos: cosineSimilarity(steeredQ, steeredDocBatch.embeddings[idx]!),
      }))
      .sort((a, b) => b.cos - a.cos);

    const expectedSet = new Set(q.expectedIds);
    const expectedId = q.expectedIds[0] ?? "";
    const rawTarget = rawScored.find((s) => expectedSet.has(s.id))?.cos ?? 0;
    const steeredTarget = steeredScored.find((s) => expectedSet.has(s.id))?.cos ?? 0;

    const rawRunnerUp = q.distractorId
      ? (rawScored.find((s) => s.id === q.distractorId)?.cos ?? 0)
      : (rawScored.find((s) => !expectedSet.has(s.id))?.cos ?? 0);
    const steeredRunnerUp = q.distractorId
      ? (steeredScored.find((s) => s.id === q.distractorId)?.cos ?? 0)
      : (steeredScored.find((s) => !expectedSet.has(s.id))?.cos ?? 0);

    prefixRows.push({
      queryId: q.id,
      query: q.query,
      intent: q.intent,
      expectedId,
      rawRank: rankOfExpected(rawScored.map((s) => s.id), q.expectedIds),
      steeredRank: rankOfExpected(steeredScored.map((s) => s.id), q.expectedIds),
      rawTargetCosine: rawTarget,
      steeredTargetCosine: steeredTarget,
      rawMarginVsRunnerUp: rawTarget - rawRunnerUp,
      steeredMarginVsRunnerUp: steeredTarget - steeredRunnerUp,
    });
  }

  const rawPrefixAgg = summarizeRanks(prefixRows.map((r) => r.rawRank));
  const steeredPrefixAgg = summarizeRanks(prefixRows.map((r) => r.steeredRank));
  return {
    rawHitAt1: rawPrefixAgg.hitAt1,
    steeredHitAt1: steeredPrefixAgg.hitAt1,
    rawMrr: rawPrefixAgg.mrr,
    steeredMrr: steeredPrefixAgg.mrr,
    meanRawMargin:
      prefixRows.reduce((acc, r) => acc + r.rawMarginVsRunnerUp, 0) / prefixRows.length,
    meanSteeredMargin:
      prefixRows.reduce((acc, r) => acc + r.steeredMarginVsRunnerUp, 0) / prefixRows.length,
    rows: prefixRows,
  };
}

export async function runMrlExperiment(
  store: VectorStore,
  embedder: Embedder,
  options?: { filter?: string },
): Promise<MrlDimBenchmark[]> {
  await ensureCorpusSeeded(store, embedder);
  const queries = filterEvalQueries(options?.filter);
  const rawDocs = lexicalOnlyDocs();

  const [steeredBatch, steeredDocBatch] = await Promise.all([
    embedder.embed(queries.map((q) => formatWithTaskPrefix(q.query, q.recommendedPrefix))),
    embedder.embed(
      rawDocs.map((d) => formatWithTaskPrefix(d.content, "search_document", d.title)),
    ),
  ]);

  const baselineTop3ByQuery: string[][] = [];
  const mrlTruncation: MrlDimBenchmark[] = [];

  for (const dim of MRL_DIMS) {
    const ranks: Array<number | null> = [];
    let overlapSum = 0;
    let driftSum = 0;
    let driftPairs = 0;
    const t0 = performance.now();

    for (let i = 0; i < queries.length; i++) {
      const q = queries[i]!;
      const qVec768 = steeredBatch.embeddings[i]!;
      const qVecDim = truncateMrl(qVec768, dim);

      const hits = await store.searchVector(qVecDim, {
        dim,
        limit: 10,
        useAnnIndex: true,
      });
      const hitIds = hits.map((h) => h.id);
      ranks.push(rankOfExpected(hitIds, q.expectedIds));

      const top3 = hitIds.slice(0, 3);
      if (dim === 768) {
        baselineTop3ByQuery.push(top3);
        overlapSum += 1;
      } else {
        const base3 = new Set(baselineTop3ByQuery[i] ?? []);
        const shared = top3.filter((id) => base3.has(id)).length;
        overlapSum += shared / Math.max(base3.size, 1);
      }

      for (let j = 0; j < steeredDocBatch.embeddings.length; j++) {
        const d768 = steeredDocBatch.embeddings[j]!;
        const dDim = truncateMrl(d768, dim);
        driftSum += Math.abs(cosineSimilarity(qVec768, d768) - cosineSimilarity(qVecDim, dDim));
        driftPairs++;
      }
    }

    const elapsedMs = performance.now() - t0;
    const agg = summarizeRanks(ranks);
    const ratio = (768 / dim).toFixed(dim === 512 ? 1 : 0);

    mrlTruncation.push({
      dim,
      compressionRatio: `1:${ratio}`,
      bytesPerVector: storageBytesForDim(dim, 1),
      bytesFor100kVectorsMb:
        Math.round((storageBytesForDim(dim, 100_000) / (1024 * 1024)) * 10) / 10,
      hitAt1: agg.hitAt1,
      hitAt3: agg.hitAt3,
      mrr: agg.mrr,
      top3OverlapWith768: overlapSum / queries.length,
      meanCosineDriftVs768: driftPairs > 0 ? driftSum / driftPairs : 0,
      avgSearchLatencyMs: elapsedMs / queries.length,
    });
  }

  return mrlTruncation;
}

/**
 * Experiment 4: Multimodal Cross-Modal Retrieval across Visual Scenes, Scanned VisDocs, and WAV Audio.
 */
export async function runMultimodalExperiment(
  store: VectorStore,
  embedder: Embedder,
  options?: { filter?: string },
): Promise<MultimodalBenchmark> {
  await ensureCorpusSeeded(store, embedder);
  const scenes = buildSyntheticScenes(160);
  const visDocs = buildVisualDocuments();
  const audioClips = buildSyntheticAudioClips();

  const queries = filterCrossModalQueries(options?.filter);
  const cmBatch = await embedder.embed(
    queries.map((q) =>
      formatWithTaskPrefix(q.query, q.recommendedPrefix ?? "search_query"),
    ),
  );

  const cmRanks: Array<number | null> = [];
  const cmRows: MultimodalBenchmark["queries"] = [];
  const modStats: Record<"image" | "visdoc" | "audio", { hits: number; count: number }> = {
    image: { hits: 0, count: 0 },
    visdoc: { hits: 0, count: 0 },
    audio: { hits: 0, count: 0 },
  };

  for (let i = 0; i < queries.length; i++) {
    const cq = queries[i]!;
    const qVec = cmBatch.embeddings[i]!;
    const hits = await store.searchVector(qVec, {
      dim: 768,
      modality: cq.targetModality,
      limit: 10,
      useAnnIndex: false,
    });
    const scoresByImageId: Record<string, number> = {};
    for (const h of hits) {
      scoresByImageId[h.id] = h.cosineSimilarity ?? 0;
    }
    const predicted = hits[0]?.id ?? "";
    const rank = rankOfExpected(hits.map((h) => h.id), [cq.expectedId]);
    const correct = predicted === cq.expectedId;
    cmRanks.push(rank);
    modStats[cq.targetModality].count += 1;
    if (correct) modStats[cq.targetModality].hits += 1;

    cmRows.push({
      id: cq.id,
      targetModality: cq.targetModality,
      query: cq.query,
      expectedImageId: cq.expectedId,
      predictedImageId: predicted,
      correct,
      scoresByImageId,
    });
  }

  const cmAgg = summarizeRanks(cmRanks);
  return {
    hitAt1: cmAgg.hitAt1,
    mrr: cmAgg.mrr,
    byModality: {
      image: {
        hitAt1: modStats.image.count ? modStats.image.hits / modStats.image.count : 0,
        count: modStats.image.count,
      },
      visdoc: {
        hitAt1: modStats.visdoc.count ? modStats.visdoc.hits / modStats.visdoc.count : 0,
        count: modStats.visdoc.count,
      },
      audio: {
        hitAt1: modStats.audio.count ? modStats.audio.hits / modStats.audio.count : 0,
        count: modStats.audio.count,
      },
    },
    scenes: [
      ...scenes.map((s) => ({
        id: s.id,
        modality: "image" as const,
        title: s.title,
        caption: s.groundTruthCaption,
        dataUrl: s.dataUrl,
      })),
      ...visDocs.map((v) => ({
        id: v.id,
        modality: "visdoc" as const,
        title: v.title,
        caption: v.groundTruthSummary,
        dataUrl: v.dataUrl,
      })),
      ...audioClips.map((a) => ({
        id: a.id,
        modality: "audio" as const,
        title: a.title,
        caption: a.groundTruthDescription,
        audioDataUrl: a.audioDataUrl,
      })),
    ],
    queries: cmRows,
  };
}

export async function runSingleCaseDiagnostic(
  store: VectorStore,
  embedder: Embedder,
  caseId: string,
): Promise<SingleCaseDiagnostic> {
  await ensureCorpusSeeded(store, embedder);

  const cm = CROSS_MODAL_QUERIES.find((q) => q.id === caseId);
  if (cm) {
    const formattedQuery = formatWithTaskPrefix(
      cm.query,
      cm.recommendedPrefix ?? "search_query",
    );
    const [steeredBatch, rawBatch] = await Promise.all([
      embedder.embed([formattedQuery]),
      embedder.embed([cm.query]),
    ]);
    const qVec = steeredBatch.embeddings[0]!;
    const rawVec = rawBatch.embeddings[0]!;
    const [vecHits, rawHits] = await Promise.all([
      store.searchVector(qVec, {
        dim: 768,
        modality: cm.targetModality,
        limit: 5,
        useAnnIndex: false,
      }),
      store.searchVector(rawVec, {
        dim: 768,
        modality: cm.targetModality,
        limit: 5,
        useAnnIndex: false,
      }),
    ]);

    const mrlByDim: SingleCaseDiagnostic["mrlByDim"] = [];
    for (const dim of MRL_DIMS) {
      const hits = await store.searchVector(truncateMrl(qVec, dim), {
        dim,
        modality: cm.targetModality,
        limit: 5,
        useAnnIndex: false,
      });
      mrlByDim.push({
        dim,
        rank: rankOfExpected(hits.map((h) => h.id), [cm.expectedId]),
        topHitId: hits[0]?.id ?? null,
        topCosine: hits[0]?.cosineSimilarity ?? null,
      });
    }

    return {
      queryId: cm.id,
      query: cm.query,
      intent: `multimodal_${cm.targetModality}`,
      notes: `Cross-modal text query matched against pure ${cm.targetModality} embeddings`,
      expectedIds: [cm.expectedId],
      formattedQuery,
      embedMs: steeredBatch.durationMs,
      methods: {
        fts5: [],
        vector768: vecHits,
        hybridRrf: vecHits,
      },
      prefixCheck: {
        rawTopId: rawHits[0]?.id ?? null,
        rawTargetCosine:
          rawHits.find((h) => h.id === cm.expectedId)?.cosineSimilarity ?? null,
        steeredTopId: vecHits[0]?.id ?? null,
        steeredTargetCosine:
          vecHits.find((h) => h.id === cm.expectedId)?.cosineSimilarity ?? null,
      },
      mrlByDim,
    };
  }

  const eq = BENCHMARK_QUERIES.find((q) => q.id === caseId) ?? BENCHMARK_QUERIES[0]!;
  const formattedQuery = formatWithTaskPrefix(eq.query, eq.recommendedPrefix);
  const [steeredBatch, rawBatch] = await Promise.all([
    embedder.embed([formattedQuery]),
    embedder.embed([eq.query]),
  ]);
  const qVec = steeredBatch.embeddings[0]!;
  const rawVec = rawBatch.embeddings[0]!;

  const [fts5, vector768, hybridRrf, rawVecHits] = await Promise.all([
    store.searchFts(eq.query, { limit: 5 }),
    store.searchVector(qVec, { dim: 768, limit: 5, useAnnIndex: false }),
    store.searchHybrid(eq.query, qVec, { dim: 768, limit: 5 }),
    store.searchVector(rawVec, { dim: 768, limit: 10, useAnnIndex: false }),
  ]);

  const mrlByDim: SingleCaseDiagnostic["mrlByDim"] = [];
  for (const dim of MRL_DIMS) {
    const hits = await store.searchVector(truncateMrl(qVec, dim), {
      dim,
      limit: 5,
      useAnnIndex: true,
    });
    mrlByDim.push({
      dim,
      rank: rankOfExpected(hits.map((h) => h.id), eq.expectedIds),
      topHitId: hits[0]?.id ?? null,
      topCosine: hits[0]?.cosineSimilarity ?? null,
    });
  }

  const targetId = eq.expectedIds[0] ?? "";
  const fullSteeredHits = await store.searchVector(qVec, {
    dim: 768,
    limit: 10,
    useAnnIndex: false,
  });

  return {
    queryId: eq.id,
    query: eq.query,
    intent: eq.intent,
    notes: eq.notes,
    expectedIds: eq.expectedIds,
    distractorId: eq.distractorId,
    formattedQuery,
    embedMs: steeredBatch.durationMs,
    methods: { fts5, vector768, hybridRrf },
    prefixCheck: {
      rawTopId: rawVecHits[0]?.id ?? null,
      rawTargetCosine: rawVecHits.find((h) => h.id === targetId)?.cosineSimilarity ?? null,
      steeredTopId: fullSteeredHits[0]?.id ?? null,
      steeredTargetCosine:
        fullSteeredHits.find((h) => h.id === targetId)?.cosineSimilarity ?? null,
    },
    mrlByDim,
  };
}

export async function runFullBenchmark(
  store: VectorStore,
  embedder: Embedder,
  options?: { reseed?: boolean },
): Promise<FullBenchmarkReport> {
  const seedDurationMs = await ensureCorpusSeeded(store, embedder, options?.reseed ?? false);
  const [hybridComparison, prefixSteering, mrlTruncation, multimodal] = await Promise.all([
    runHybridExperiment(store, embedder),
    runPrefixExperiment(store, embedder),
    runMrlExperiment(store, embedder),
    runMultimodalExperiment(store, embedder),
  ]);
  const finalStats = await store.stats();

  return {
    model: embedder.model,
    generatedAt: new Date().toISOString(),
    corpusCount: finalStats.totalItems,
    seedDurationMs,
    hybridComparison,
    prefixSteering,
    mrlTruncation,
    multimodal,
  };
}

/**
 * Embeds every page/slide of a parsed PDF or PPTX bundle across 3 lenses (Vision PNG, Extracted Text+Notes, Fused Bimodal)
 * in batches of 8 pages and saves to `doc_bundles` / `doc_pages`.
 */
export async function indexParsedDocBundle(
  store: VectorStore,
  embedder: Embedder,
  parsed: ParsedDocBundle,
  onProgress?: (donePages: number, totalPages: number) => void,
): Promise<{ docId: string; pageCount: number; durationMs: number }> {
  const started = performance.now();
  const indexedPages: Array<{
    pageNumber: number;
    pageTitle: string;
    extractedText: string;
    speakerNotes: string;
    previewDataUrl?: string | null;
    widthPx: number;
    heightPx: number;
    embVis: Float32Array;
    embTxt: Float32Array;
    embFused: Float32Array;
  }> = [];

  const chunkSize = 8;
  for (let start = 0; start < parsed.pages.length; start += chunkSize) {
    const slice = parsed.pages.slice(start, start + chunkSize);

    const visInputs: EmbedInputItem[] = slice.map((p) => ({ image: p.pngBase64 }));
    const txtInputs: EmbedInputItem[] = slice.map((p) => {
      const combined = [
        p.extractedText.trim(),
        p.speakerNotes.trim() ? `Speaker Notes:\n${p.speakerNotes.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 3200);
      return formatWithTaskPrefix(
        combined || p.pageTitle,
        "search_document",
        `${parsed.title} — Page ${p.pageNumber}`,
      );
    });
    const fusedInputs: EmbedInputItem[] = slice.map((p) => {
      const combined = [
        p.extractedText.trim().slice(0, 1400),
        p.speakerNotes.trim() ? `Speaker Notes: ${p.speakerNotes.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      return {
        image: p.pngBase64,
        text: formatWithTaskPrefix(
          combined || p.pageTitle,
          "search_document",
          `${parsed.title} — p.${p.pageNumber}`,
        ),
      };
    });

    const [visBatch, txtBatch, fusedBatch] = await Promise.all([
      embedder.embed(visInputs),
      embedder.embed(txtInputs),
      embedder.embed(fusedInputs),
    ]);

    for (let i = 0; i < slice.length; i++) {
      const p = slice[i]!;
      indexedPages.push({
        pageNumber: p.pageNumber,
        pageTitle: p.pageTitle,
        extractedText: p.extractedText,
        speakerNotes: p.speakerNotes,
        previewDataUrl: p.previewDataUrl ?? null,
        widthPx: p.widthPx,
        heightPx: p.heightPx,
        embVis: visBatch.embeddings[i]!,
        embTxt: txtBatch.embeddings[i]!,
        embFused: fusedBatch.embeddings[i]!,
      });
    }
    onProgress?.(Math.min(start + slice.length, parsed.pages.length), parsed.pages.length);
  }

  await store.upsertDocBundle(
    {
      id: parsed.id,
      title: parsed.title,
      subtitle: parsed.subtitle,
      filename: parsed.filename,
      format: parsed.format,
      filePath: parsed.filePath,
      fileSizeBytes: parsed.fileSizeBytes,
      pageCount: parsed.pageCount,
    },
    indexedPages,
  );

  return {
    docId: parsed.id,
    pageCount: parsed.pageCount,
    durationMs: performance.now() - started,
  };
}

/**
 * Ensures all 3 multi-page arXiv PDF papers (76 pages total) and 2 PowerPoint `.pptx` decks (14 slides total)
 * are downloaded/generated and indexed across all 3 lenses (`emb_vis`, `emb_txt`, `emb_fused`).
 */
export async function seedSamplePapersAndDecks(
  store: VectorStore,
  embedder: Embedder,
  options?: { force?: boolean; log?: (msg: string) => void },
): Promise<{ bundlesIndexed: number; totalPages: number; durationMs: number }> {
  const started = performance.now();
  const existing = new Set((await store.listDocBundles()).map((b) => b.id));
  const [papers, decks] = await Promise.all([
    ensureSamplePapers("data/papers"),
    ensureSampleDecks("data/decks"),
  ]);

  let bundlesIndexed = 0;
  let totalPages = 0;

  for (const { spec, filePath } of papers) {
    if (!options?.force && existing.has(spec.id)) {
      const b = await store.getDocBundle(spec.id);
      totalPages += b?.pageCount ?? 0;
      continue;
    }
    options?.log?.(`Rasterizing & indexing PDF: ${spec.title}...`);
    const parsed = extractPdfBundle(filePath, {
      id: spec.id,
      title: spec.title,
      subtitle: spec.authors,
    });
    await indexParsedDocBundle(store, embedder, parsed, (done, tot) =>
      options?.log?.(`  [${spec.id}] embedded ${done}/${tot} pages (Vision + Text + Fused)`),
    );
    bundlesIndexed++;
    totalPages += parsed.pageCount;
  }

  for (const deck of decks) {
    if (!options?.force && existing.has(deck.id)) {
      const b = await store.getDocBundle(deck.id);
      totalPages += b?.pageCount ?? 0;
      continue;
    }
    options?.log?.(`Parsing & indexing PowerPoint: ${deck.title}...`);
    const parsed = await extractPptxBundle(deck.filePath, {
      id: deck.id,
      title: deck.title,
      subtitle: deck.subtitle,
    });
    await indexParsedDocBundle(store, embedder, parsed, (done, tot) =>
      options?.log?.(`  [${deck.id}] embedded ${done}/${tot} slides (Vision + Text + Fused)`),
    );
    bundlesIndexed++;
    totalPages += parsed.pageCount;
  }

  return {
    bundlesIndexed,
    totalPages,
    durationMs: performance.now() - started,
  };
}

export async function runDocsLensesBenchmark(
  store: VectorStore,
  embedder: Embedder,
): Promise<
  Array<{
    id: string;
    label: string;
    docId: string;
    expectedPage: number;
    query: string;
    storyNote: string;
    visRank: number | null;
    txtRank: number | null;
    fusedRank: number | null;
    hybridRank: number | null;
    visTopPage: number | null;
    txtTopPage: number | null;
    fusedTopPage: number | null;
  }>
> {
  await seedSamplePapersAndDecks(store, embedder);
  const qBatch = await embedder.embed(
    DOC_SHOWCASE_QUERIES.map((q) => formatWithTaskPrefix(q.query, "question_answering")),
  );

  const out = [];
  for (let i = 0; i < DOC_SHOWCASE_QUERIES.length; i++) {
    const q = DOC_SHOWCASE_QUERIES[i]!;
    const res = await store.inspectDocLenses(q.query, qBatch.embeddings[i]!, {
      docId: q.docId,
      limit: 50,
    });
    const findRank = (arr: Array<{ pageNumber: number }>) => {
      const idx = arr.findIndex((p) => p.pageNumber === q.expectedPage);
      return idx >= 0 ? idx + 1 : null;
    };
    out.push({
      id: q.id,
      label: q.label,
      docId: q.docId,
      expectedPage: q.expectedPage,
      query: q.query,
      storyNote: q.storyNote,
      visRank: findRank(res.visionTop),
      txtRank: findRank(res.textTop),
      fusedRank: findRank(res.fusedTop),
      hybridRank: findRank(res.hybridTop),
      visTopPage: res.visionTop[0]?.pageNumber ?? null,
      txtTopPage: res.textTop[0]?.pageNumber ?? null,
      fusedTopPage: res.fusedTop[0]?.pageNumber ?? null,
    });
  }
  return out;
}
