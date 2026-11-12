import { loadConfig } from "./config.ts";
import { BENCHMARK_QUERIES, CROSS_MODAL_QUERIES } from "./corpus.ts";
import {
  runDocsLensesBenchmark,
  runFullBenchmark,
  runHybridExperiment,
  runMrlExperiment,
  runMultimodalExperiment,
  runPrefixExperiment,
  runSingleCaseDiagnostic,
  seedReferenceCorpus,
  seedSamplePapersAndDecks,
  type MethodSummary,
  type MrlDimBenchmark,
  type MultimodalBenchmark,
  type PrefixAbSummary,
} from "./experiments.ts";
import { cosineSimilarity, isMrlDim, MRL_DIMS, truncateMrl, type MrlDim } from "./mrl.ts";
import { OllamaEmbedder } from "./ollama.ts";
import { formatWithTaskPrefix, type TaskPrefixMode } from "./prefixes.ts";
import { VectorStore, type OmniLens, type OmniScope } from "./store.ts";

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`.padStart(6);
}

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s.padEnd(len);
}

function printHybrid(hybridComparison: MethodSummary[]): void {
  console.log("=== Experiment 1: Hybrid Search vs Vector vs SQLite FTS5 BM25 ===");
  console.log(`${pad("Method", 32)} | Hit@1  | Hit@3  |  MRR`);
  console.log("-".repeat(60));
  for (const m of hybridComparison) {
    console.log(
      `${pad(m.label, 32)} | ${pct(m.hitAt1)} | ${pct(m.hitAt3)} | ${m.mrr.toFixed(3)}`,
    );
  }
  const vec = hybridComparison.find((m) => m.method === "vector_768");
  const fts = hybridComparison.find((m) => m.method === "fts5_bm25");
  const hyb = hybridComparison.find((m) => m.method === "hybrid_rrf");
  if (vec && fts && hyb) {
    console.log("\nPer-query ranks (FTS5 / Vector / Hybrid):");
    for (let i = 0; i < vec.perQuery.length; i++) {
      const q = vec.perQuery[i]!;
      const rFts = fts.perQuery[i]?.rank ?? "-";
      const rVec = q.rank ?? "-";
      const rHyb = hyb.perQuery[i]?.rank ?? "-";
      console.log(
        `  [${pad(q.queryId, 9)} | ${pad(q.intent, 14)}] FTS=#${pad(String(rFts), 2)} Vec=#${pad(String(rVec), 2)} Hyb=#${pad(String(rHyb), 2)} | "${q.query}"`,
      );
    }
  }
}

function printPrefixes(prefixSteering: PrefixAbSummary): void {
  console.log("=== Experiment 2: Task-Steered Instruction Prefix A/B Test ===");
  console.log(
    `Raw Unprefixed : Hit@1=${pct(prefixSteering.rawHitAt1)} | MRR=${prefixSteering.rawMrr.toFixed(3)} | Mean Margin Δ=${prefixSteering.meanRawMargin.toFixed(4)}`,
  );
  console.log(
    `Task-Steered   : Hit@1=${pct(prefixSteering.steeredHitAt1)} | MRR=${prefixSteering.steeredMrr.toFixed(3)} | Mean Margin Δ=${prefixSteering.meanSteeredMargin.toFixed(4)}\n`,
  );
  for (const r of prefixSteering.rows) {
    const diff = r.steeredMarginVsRunnerUp - r.rawMarginVsRunnerUp;
    const sign = diff >= 0 ? "+" : "";
    console.log(
      `  [${pad(r.queryId, 9)}] raw=#${r.rawRank ?? "-"} (Δ=${r.rawMarginVsRunnerUp.toFixed(4)}) -> steered=#${r.steeredRank ?? "-"} (Δ=${r.steeredMarginVsRunnerUp.toFixed(4)}, ${sign}${diff.toFixed(4)}) | "${r.query}"`,
    );
  }
}

function printMrl(mrlTruncation: MrlDimBenchmark[]): void {
  console.log("=== Experiment 3: Matryoshka (MRL) Dimension Truncation (libSQL DiskANN) ===");
  console.log(
    "Dim  | Ratio | Bytes/Vec | 100k Vecs | Hit@1  | Hit@3  |  MRR  | Top3 Overlap | Cos Drift",
  );
  console.log("-".repeat(92));
  for (const m of mrlTruncation) {
    console.log(
      `${pad(`${m.dim}d`, 4)} | ${pad(m.compressionRatio, 5)} | ${pad(`${m.bytesPerVector} B`, 9)} | ${pad(`${m.bytesFor100kVectorsMb} MB`, 9)} | ${pct(m.hitAt1)} | ${pct(m.hitAt3)} | ${m.mrr.toFixed(3)} |   ${pct(m.top3OverlapWith768)}     |  ${m.meanCosineDriftVs768.toFixed(4)}`,
    );
  }
}

function printMultimodal(multimodal: MultimodalBenchmark): void {
  console.log(
    "=== Experiment 4: Cross-Modal Retrieval (Visual Scenes + Scanned VisDocs + Audio WAVs) ===",
  );
  console.log(
    `Overall Hit@1=${pct(multimodal.hitAt1)} | MRR=${multimodal.mrr.toFixed(3)} | Scenes=${pct(multimodal.byModality.image.hitAt1)} (${multimodal.byModality.image.count}) | VisDocs=${pct(multimodal.byModality.visdoc.hitAt1)} (${multimodal.byModality.visdoc.count}) | Audio=${pct(multimodal.byModality.audio.hitAt1)} (${multimodal.byModality.audio.count})`,
  );
  for (const q of multimodal.queries) {
    const bestScore = q.scoresByImageId[q.predictedImageId] ?? 0;
    console.log(
      `  ${q.correct ? "✓" : "✗"} [${pad(q.id, 10)} | ${pad(q.targetModality, 6)}] "${q.query}" -> ${q.predictedImageId} (cos=${bestScore.toFixed(4)}, expected=${q.expectedImageId})`,
    );
  }
}

async function ensureModelReady(embedder: OllamaEmbedder, modelName: string): Promise<void> {
  const health = await embedder.health();
  if (!health.ok || !health.modelAvailable) {
    throw new Error(
      `Ollama model ${modelName} unavailable (${health.error ?? "run: mise run model:pull"})`,
    );
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const sub = args[0] ?? "help";
  const config = loadConfig();
  const store = new VectorStore(config.dbUrl);
  await store.init();

  const embedder = new OllamaEmbedder({
    baseUrl: config.ollamaBaseUrl,
    model: config.embeddingModel,
  });

  try {
    if (sub === "cases") {
      console.log("Available one-at-a-time test cases (run: mise run case -- <id>):\n");
      for (const q of BENCHMARK_QUERIES) {
        console.log(`  ${pad(q.id, 10)} [${pad(q.intent, 14)}] -> ${pad(q.expectedIds[0] ?? "", 20)} | "${q.query}"`);
      }
      for (const q of CROSS_MODAL_QUERIES) {
        console.log(`  ${pad(q.id, 10)} [${pad(`mm:${q.targetModality}`, 14)}] -> ${pad(q.expectedId, 20)} | "${q.query}"`);
      }
      return;
    }

    if (sub === "case") {
      await ensureModelReady(embedder, config.embeddingModel);
      const caseId = args[1] ?? "q-sem-1";
      const d = await runSingleCaseDiagnostic(store, embedder, caseId);
      const expected = d.expectedIds[0] ?? "";
      console.log(`=== Case ${d.queryId} (${d.intent}) ===`);
      console.log(`Query            : "${d.query}"`);
      console.log(`Formatted Prompt : "${d.formattedQuery}"`);
      console.log(`Expected Target  : ${expected} (${d.notes})`);
      console.log(`Ollama Embed     : ${d.embedMs.toFixed(1)}ms\n`);

      console.log("1) Retrieval Engine Top-3:");
      for (const [label, hits] of [
        ["FTS5 BM25 ", d.methods.fts5],
        ["Vector 768", d.methods.vector768],
        ["Hybrid RRF", d.methods.hybridRrf],
      ] as const) {
        const summary =
          hits.length === 0
            ? "(0 hits)"
            : hits
                .slice(0, 3)
                .map(
                  (h, i) =>
                    `#${i + 1} ${h.id}${h.id === expected ? "✓" : ""}${h.cosineSimilarity !== null ? `(${h.cosineSimilarity.toFixed(3)})` : ""}`,
                )
                .join(", ");
        console.log(`   ${label}: ${summary}`);
      }

      console.log("\n2) Task-Prefix Steering on Target:");
      console.log(
        `   Raw cosine to ${expected}     : ${d.prefixCheck.rawTargetCosine?.toFixed(4) ?? "n/a"} (top1=${d.prefixCheck.rawTopId ?? "-"})`,
      );
      console.log(
        `   Steered cosine to ${expected} : ${d.prefixCheck.steeredTargetCosine?.toFixed(4) ?? "n/a"} (top1=${d.prefixCheck.steeredTopId ?? "-"})`,
      );

      console.log("\n3) Matryoshka (MRL) Truncation on This Case:");
      for (const m of d.mrlByDim) {
        console.log(
          `   ${pad(`${m.dim}d`, 4)}: expected rank=#${m.rank ?? "miss"} | top1=${m.topHitId ?? "-"} (cos=${m.topCosine?.toFixed(4) ?? "-"})`,
        );
      }
      return;
    }

    if (sub === "compare") {
      await ensureModelReady(embedder, config.embeddingModel);
      const textA = args[1];
      const textB = args[2];
      if (!textA || !textB) {
        console.error('Usage: mise run compare -- "<text A>" "<text B>"');
        process.exitCode = 2;
        return;
      }
      const [rawRes, simRes, searchRes] = await Promise.all([
        embedder.embed([textA, textB]),
        embedder.embed([
          formatWithTaskPrefix(textA, "similarity"),
          formatWithTaskPrefix(textB, "similarity"),
        ]),
        embedder.embed([
          formatWithTaskPrefix(textA, "search_query"),
          formatWithTaskPrefix(textB, "search_document"),
        ]),
      ]);

      console.log(`Text A: "${textA}"`);
      console.log(`Text B: "${textB}"\n`);
      console.log("Mode                              |  768d  |  512d  |  256d  |  128d");
      console.log("-".repeat(70));
      for (const [label, pair] of [
        ["Raw (unprefixed)", rawRes.embeddings],
        ["Symmetric (task: similarity)", simRes.embeddings],
        ["Asymmetric (query -> document)", searchRes.embeddings],
      ] as const) {
        const cols = MRL_DIMS.map((dim) =>
          cosineSimilarity(truncateMrl(pair[0]!, dim), truncateMrl(pair[1]!, dim)).toFixed(4),
        );
        console.log(`${pad(label, 33)} | ${cols.join(" | ")}`);
      }
      return;
    }

    if (sub === "seed") {
      await ensureModelReady(embedder, config.embeddingModel);
      console.log(`Seeding reference corpus using ${config.embeddingModel} into ${config.dbUrl}...`);
      const res = await seedReferenceCorpus(store, embedder);
      const stats = await store.stats();
      console.log(
        `Seeded ${res.count} items in ${res.durationMs.toFixed(0)}ms (document=${stats.byModality.document}, text=${stats.byModality.text}, code=${stats.byModality.code}, image=${stats.byModality.image}, visdoc=${stats.byModality.visdoc}, audio=${stats.byModality.audio}).`,
      );
      return;
    }

    if (sub === "search") {
      let lens: OmniLens = "hybrid";
      let scope: OmniScope = "all";
      let dim: MrlDim = 768;
      let prefix: TaskPrefixMode | null = null;
      let limit = 8;
      const queryParts: string[] = [];

      for (let i = 1; i < args.length; i++) {
        const arg = args[i]!;
        if ((arg === "--mode" || arg === "--lens") && args[i + 1]) {
          const val = args[++i]!;
          lens = val === "vector" ? "fused" : (val as OmniLens);
        } else if (arg === "--scope" && args[i + 1]) {
          scope = args[++i] as OmniScope;
        } else if (arg === "--dim" && args[i + 1]) {
          const parsed = Number.parseInt(args[++i]!, 10);
          if (isMrlDim(parsed)) dim = parsed;
        } else if (arg === "--prefix" && args[i + 1]) {
          prefix = args[++i] as TaskPrefixMode;
        } else if (arg === "--limit" && args[i + 1]) {
          limit = Math.min(Math.max(Number.parseInt(args[++i]!, 10) || 8, 1), 40);
        } else {
          queryParts.push(arg);
        }
      }

      const query = queryParts.join(" ").trim();
      if (!query) {
        console.error(
          "Usage: mise run search -- [--scope all|all_docs|pdf|pptx|markdown|sensory|code] [--lens hybrid|fused|vision|fts] [--dim 768|512|256|128] [--limit 8] <query>",
        );
        process.exitCode = 2;
        return;
      }

      const stats = await store.stats();
      if (stats.totalItems === 0) {
        console.log("Database is empty; seeding reference corpus first...");
        await seedReferenceCorpus(store, embedder);
      }

      const chosenPrefix: TaskPrefixMode =
        prefix ?? (query.includes("?") ? "question_answering" : "search_query");

      let qVec: Float32Array | null = null;
      let embedMs = 0;
      if (lens !== "fts") {
        await ensureModelReady(embedder, config.embeddingModel);
        const formatted = formatWithTaskPrefix(query, chosenPrefix);
        const batch = await embedder.embed([formatted]);
        qVec = batch.embeddings[0]!;
        embedMs = batch.durationMs;
      }

      const t0 = performance.now();
      const res = await store.searchOmni(query, qVec, { scope, lens, dim, limit });
      const searchMs = performance.now() - t0;

      console.log(
        `\nOmni-Search (scope=${scope}, lens=${lens}, ${dim}d, candidates=${res.totalCandidates}, embed=${embedMs.toFixed(1)}ms, sql=${searchMs.toFixed(1)}ms) for "${query}":`,
      );
      if (res.rollup.length > 0) {
        const topBundles = res.rollup
          .slice(0, 4)
          .map((g) => `${g.title} (${g.topPages.map((p) => p.label).join(",")})`)
          .join(" · ");
        console.log(`Top Bundles: ${topBundles}\n`);
      }
      for (let i = 0; i < res.hits.length; i++) {
        const h = res.hits[i]!;
        const cosStr =
          h.cosineSimilarity !== null ? `cos=${h.cosineSimilarity.toFixed(4)}` : "cos=n/a   ";
        const ranks = `vec=${pad(String(h.vectorRank ?? "-"), 3)} fts=${pad(String(h.ftsRank ?? "-"), 2)}`;
        console.log(
          `  #${pad(String(i + 1), 2)} [${cosStr} | ${ranks}] [${pad(h.modalityBadge, 16)}] ${h.title} (${h.parentTitle})`,
        );
        if (h.snippet) {
          console.log(`      ${h.snippet.slice(0, 118)}`);
        }
      }
      return;
    }

    if (sub === "bench:hybrid") {
      await ensureModelReady(embedder, config.embeddingModel);
      const res = await runHybridExperiment(store, embedder, { filter: args[1] });
      printHybrid(res);
      return;
    }

    if (sub === "bench:prefixes") {
      await ensureModelReady(embedder, config.embeddingModel);
      const res = await runPrefixExperiment(store, embedder, { filter: args[1] });
      printPrefixes(res);
      return;
    }

    if (sub === "bench:mrl") {
      await ensureModelReady(embedder, config.embeddingModel);
      const res = await runMrlExperiment(store, embedder, { filter: args[1] });
      printMrl(res);
      return;
    }

    if (sub === "bench:multimodal") {
      await ensureModelReady(embedder, config.embeddingModel);
      const res = await runMultimodalExperiment(store, embedder, { filter: args[1] });
      printMultimodal(res);
      return;
    }

    if (sub === "seed:docs") {
      await ensureModelReady(embedder, config.embeddingModel);
      const force = args.includes("--force");
      const res = await seedSamplePapersAndDecks(store, embedder, {
        force,
        log: (m) => console.log(m),
      });
      console.log(
        `\nIndexed ${res.bundlesIndexed} new PDF/PPTX bundles (${res.totalPages} total pages/slides in SQLite) in ${(res.durationMs / 1000).toFixed(1)}s.`,
      );
      return;
    }

    if (sub === "bench:docs") {
      await ensureModelReady(embedder, config.embeddingModel);
      const rows = await runDocsLensesBenchmark(store, embedder);
      console.log(
        "=== Experiment 5: Multi-Page PDFs (76 pp) & PowerPoint Decks (14 slides) — Vision vs Text vs Fused ===",
      );
      console.log(
        `${pad("Case", 42)} | Target | Vision |  Text  | Fused  | Hybrid`,
      );
      console.log("-".repeat(88));
      for (const r of rows) {
        const fmt = (rk: number | null) => (rk ? `#${rk}`.padStart(6) : "  miss");
        console.log(
          `${pad(r.label, 42)} |  p.${pad(String(r.expectedPage), 3)} | ${fmt(r.visRank)} | ${fmt(r.txtRank)} | ${fmt(r.fusedRank)} | ${fmt(r.hybridRank)}`,
        );
      }
      return;
    }

    if (sub === "bench") {
      await ensureModelReady(embedder, config.embeddingModel);
      console.log(`Running 4-part EmbeddingGemma 2 benchmark (${config.embeddingModel})...\n`);
      const report = await runFullBenchmark(store, embedder, { reseed: true });
      printHybrid(report.hybridComparison);
      console.log("");
      printPrefixes(report.prefixSteering);
      console.log("");
      printMrl(report.mrlTruncation);
      console.log("");
      printMultimodal(report.multimodal);
      return;
    }

    console.log(`Commands (one-at-a-time & full suite):
  mise run cases                        List all 26 individual test case IDs across 6 modalities
  mise run case -- <id>                 Run 1 single test case across FTS5, Vector, Hybrid, Prefixes & MRL
  mise run compare -- "<a>" "<b>"       Compare 2 strings head-to-head across prefixes & MRL dims
  mise run bench:hybrid [-- <filter>]   Run Experiment 1 only (Hybrid RRF vs Vector vs FTS5)
  mise run bench:prefixes [-- <filter>] Run Experiment 2 only (Raw vs Task-Steered Prefixes)
  mise run bench:mrl [-- <filter>]      Run Experiment 3 only (768d/512d/256d/128d Matryoshka)
  mise run bench:multimodal [-- <id>]   Run Experiment 4 only (Image Scenes + Scanned VisDocs + Audio WAVs)
  mise run search -- <query>            Run ad-hoc hybrid/vector/fts search
  mise run bench                        Run all 4 experiments together
  mise run dev                          Start interactive Bun.serve() web lab`);
  } finally {
    store.close();
  }
}

await main();
