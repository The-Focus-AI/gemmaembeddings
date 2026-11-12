import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BENCHMARK_QUERIES, CROSS_MODAL_QUERIES } from "./corpus.ts";
import {
  indexParsedDocBundle,
  runDocsLensesBenchmark,
  runFullBenchmark,
  runHybridExperiment,
  runMrlExperiment,
  runMultimodalExperiment,
  runPrefixExperiment,
  runSingleCaseDiagnostic,
  seedReferenceCorpus,
  seedSamplePapersAndDecks,
  type ExperimentName,
} from "./experiments.ts";
import {
  cosineSimilarity,
  isMrlDim,
  MRL_DIMS,
  truncateMrl,
  type MrlDim,
} from "./mrl.ts";
import {
  stripDataUrlPrefix,
  type Embedder,
  type EmbedInputItem,
} from "./ollama.ts";
import {
  DOC_SHOWCASE_QUERIES,
  extractPdfBundle,
  extractPptxBundle,
  renderPdfPagePngFromFile,
  rescalePngDataUrl,
  runPageVisualAcuityXray,
} from "./pdf_pptx.ts";
import { formatWithTaskPrefix, type TaskPrefixMode } from "./prefixes.ts";
import type { Modality, OmniLens, OmniScope, VectorStore } from "./store.ts";
import { renderPlaygroundHtml } from "./ui.ts";

export interface AppDependencies {
  store: VectorStore;
  embedder: Embedder;
  ollamaBaseUrl: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function createAppHandler(deps: AppDependencies) {
  const { store, embedder, ollamaBaseUrl } = deps;

  return async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;

    try {
      if (req.method === "GET" && pathname === "/") {
        return new Response(
          renderPlaygroundHtml({
            model: embedder.model,
            ollamaBaseUrl,
            dbUrl: store.dbUrl,
          }),
          { headers: { "content-type": "text/html; charset=utf-8" } },
        );
      }

      if (req.method === "GET" && pathname === "/api/status") {
        const [ollama, storeStats] = await Promise.all([
          embedder.health(),
          store.stats(),
        ]);
        return jsonResponse({ ollama, store: storeStats });
      }

      if (req.method === "GET" && pathname === "/api/cases") {
        const cases = [
          ...BENCHMARK_QUERIES.map((q) => ({
            id: q.id,
            intent: q.intent,
            query: q.query,
            expectedId: q.expectedIds[0] ?? "",
            notes: q.notes,
          })),
          ...CROSS_MODAL_QUERIES.map((q) => ({
            id: q.id,
            intent: `multimodal_${q.targetModality}`,
            query: q.query,
            expectedId: q.expectedId,
            notes: `Cross-modal text query -> pure ${q.targetModality} embedding`,
          })),
        ];
        return jsonResponse({ cases });
      }

      if (req.method === "GET" && pathname === "/api/items") {
        const mod = url.searchParams.get("modality") as Modality | null;
        const items = await store.listItems(mod ?? undefined);
        return jsonResponse({ items });
      }

      if (req.method === "POST" && pathname === "/api/items/similar") {
        const body = (await req.json()) as { id?: string; limit?: number };
        const id = (body.id ?? "").trim();
        if (!id) {
          return jsonResponse({ error: "Item id is required" }, 400);
        }
        const vec = await store.getItemVector(id);
        if (!vec) {
          return jsonResponse({ error: `Item not found: ${id}` }, 404);
        }
        const limit = Math.min(Math.max(body.limit ?? 8, 2), 24);
        const rawNeighbors = await store.searchVector(vec, {
          dim: 768,
          limit: limit + 1,
          useAnnIndex: false,
        });
        const neighbors = rawNeighbors.filter((h) => h.id !== id).slice(0, limit);
        return jsonResponse({ id, neighbors });
      }

      if (req.method === "POST" && pathname === "/api/seed") {
        const result = await seedReferenceCorpus(store, embedder);
        const stats = await store.stats();
        return jsonResponse({ ...result, stats });
      }

      if (req.method === "POST" && pathname === "/api/items") {
        const body = (await req.json()) as {
          id?: string;
          title?: string;
          content?: string;
          modality?: Modality;
          category?: string;
          language?: string;
          imageDataUrl?: string | null;
          audioDataUrl?: string | null;
        };
        const id = (body.id ?? `item-${Date.now()}`).trim();
        const title = (body.title ?? "Untitled").trim();
        const content = body.content ?? "";
        const modality: Modality =
          body.modality ??
          (body.audioDataUrl ? "audio" : body.imageDataUrl ? "image" : "text");

        let embedInput: EmbedInputItem;
        if (body.audioDataUrl) {
          const b64 = stripDataUrlPrefix(body.audioDataUrl);
          embedInput = content.trim() ? { text: content.trim(), audio: b64 } : { audio: b64 };
        } else if (body.imageDataUrl) {
          const b64 = stripDataUrlPrefix(body.imageDataUrl);
          embedInput = content.trim() ? { text: content.trim(), image: b64 } : { image: b64 };
        } else {
          if (!content.trim()) {
            return jsonResponse(
              { error: "Provide content, imageDataUrl, or audioDataUrl" },
              400,
            );
          }
          embedInput = formatWithTaskPrefix(content, "search_document", title);
        }

        const batch = await embedder.embed([embedInput]);
        const vec = batch.embeddings[0];
        if (!vec) {
          return jsonResponse({ error: "Failed to compute 768d embedding" }, 500);
        }

        await store.upsertMany([
          {
            id,
            title,
            content,
            modality,
            category: body.category ?? "custom",
            language: body.language ?? "en",
            imageDataUrl: body.imageDataUrl ?? null,
            audioDataUrl: body.audioDataUrl ?? null,
            embedding768: vec,
          },
        ]);

        return jsonResponse({ ok: true, id, embedMs: batch.durationMs });
      }

      if (req.method === "POST" && pathname === "/api/search") {
        const body = (await req.json()) as {
          query?: string;
          imageDataUrl?: string | null;
          audioDataUrl?: string | null;
          mode?: "hybrid" | "vector" | "vector_exact" | "fts";
          prefix?: TaskPrefixMode;
          dim?: number;
          modality?: Modality;
          limit?: number;
        };

        const mode = body.mode ?? "hybrid";
        const prefix: TaskPrefixMode = body.prefix ?? "search_query";
        const dim: MrlDim = isMrlDim(body.dim ?? 768) ? (body.dim as MrlDim) : 768;
        const limit = Math.min(Math.max(body.limit ?? 8, 1), 50);
        const queryText = (body.query ?? "").trim();

        if (mode === "fts") {
          const t0 = performance.now();
          const hits = await store.searchFts(queryText, {
            limit,
            modality: body.modality,
          });
          return jsonResponse({
            mode,
            dim,
            formattedQuery: queryText,
            embedMs: 0,
            searchMs: performance.now() - t0,
            hits,
          });
        }

        let embedInput: EmbedInputItem;
        let formattedQuery = "";
        if (body.audioDataUrl) {
          const b64 = stripDataUrlPrefix(body.audioDataUrl);
          formattedQuery = queryText ? formatWithTaskPrefix(queryText, prefix) : "";
          embedInput = formattedQuery ? { text: formattedQuery, audio: b64 } : { audio: b64 };
        } else if (body.imageDataUrl) {
          const b64 = stripDataUrlPrefix(body.imageDataUrl);
          formattedQuery = queryText ? formatWithTaskPrefix(queryText, prefix) : "";
          embedInput = formattedQuery ? { text: formattedQuery, image: b64 } : { image: b64 };
        } else {
          if (!queryText) {
            return jsonResponse(
              { error: "Provide a query text, image, or audio clip" },
              400,
            );
          }
          formattedQuery = formatWithTaskPrefix(queryText, prefix);
          embedInput = formattedQuery;
        }

        const embBatch = await embedder.embed([embedInput]);
        const queryVec = embBatch.embeddings[0]!;

        const tSearch = performance.now();
        const hits =
          mode === "hybrid" && queryText.length > 0
            ? await store.searchHybrid(queryText, queryVec, {
                dim,
                limit,
                modality: body.modality,
              })
            : await store.searchVector(queryVec, {
                dim,
                limit,
                modality: body.modality,
                useAnnIndex: mode !== "vector_exact",
              });

        return jsonResponse({
          mode,
          dim,
          formattedQuery,
          embedMs: embBatch.durationMs,
          searchMs: performance.now() - tSearch,
          hits,
        });
      }

      if (req.method === "POST" && pathname === "/api/omni-search") {
        const body = (await req.json()) as {
          query?: string;
          imageDataUrl?: string | null;
          audioDataUrl?: string | null;
          scope?: OmniScope;
          lens?: OmniLens;
          prefix?: TaskPrefixMode;
          dim?: number;
          limit?: number;
        };

        const validScopes = new Set<OmniScope>([
          "all",
          "all_docs",
          "pdf",
          "pptx",
          "markdown",
          "sensory",
          "code",
        ]);
        const validLenses = new Set<OmniLens>(["hybrid", "fused", "vision", "fts"]);
        const scope: OmniScope = validScopes.has(body.scope as OmniScope)
          ? (body.scope as OmniScope)
          : "all";
        const lens: OmniLens = validLenses.has(body.lens as OmniLens)
          ? (body.lens as OmniLens)
          : "hybrid";
        const dim: MrlDim = isMrlDim(body.dim ?? 768) ? (body.dim as MrlDim) : 768;
        const limit = Math.min(Math.max(body.limit ?? 16, 1), 60);
        const queryText = (body.query ?? "").trim();

        const prefix: TaskPrefixMode =
          body.prefix ?? (queryText.includes("?") ? "question_answering" : "search_query");

        if (lens === "fts") {
          if (!queryText) {
            return jsonResponse({ error: "Provide query text for FTS5 lexical search" }, 400);
          }
          const t0 = performance.now();
          const res = await store.searchOmni(queryText, null, {
            scope,
            lens: "fts",
            dim,
            limit,
          });
          return jsonResponse({
            query: queryText,
            formattedQuery: queryText,
            scope,
            lens,
            dim,
            embedMs: 0,
            searchMs: performance.now() - t0,
            ...res,
          });
        }

        let embedInput: EmbedInputItem;
        let formattedQuery = "";
        if (body.audioDataUrl) {
          const b64 = stripDataUrlPrefix(body.audioDataUrl);
          formattedQuery = queryText ? formatWithTaskPrefix(queryText, prefix) : "";
          embedInput = formattedQuery ? { text: formattedQuery, audio: b64 } : { audio: b64 };
        } else if (body.imageDataUrl) {
          const b64 = stripDataUrlPrefix(body.imageDataUrl);
          formattedQuery = queryText ? formatWithTaskPrefix(queryText, prefix) : "";
          embedInput = formattedQuery ? { text: formattedQuery, image: b64 } : { image: b64 };
        } else {
          if (!queryText) {
            return jsonResponse(
              { error: "Provide a query text, image, or audio clip" },
              400,
            );
          }
          formattedQuery = formatWithTaskPrefix(queryText, prefix);
          embedInput = formattedQuery;
        }

        const embBatch = await embedder.embed([embedInput]);
        const queryVec = embBatch.embeddings[0]!;
        const tSearch = performance.now();
        const res = await store.searchOmni(queryText, queryVec, {
          scope,
          lens,
          dim,
          limit,
        });

        return jsonResponse({
          query: queryText,
          formattedQuery,
          scope,
          lens,
          dim,
          embedMs: embBatch.durationMs,
          searchMs: performance.now() - tSearch,
          ...res,
        });
      }

      if (req.method === "POST" && pathname === "/api/matrix") {
        const body = (await req.json()) as {
          items?: string[];
          prefix?: TaskPrefixMode;
        };
        const items = (body.items ?? []).map((s) => s.trim()).filter(Boolean);
        if (items.length < 2) {
          return jsonResponse({ error: "Supply at least 2 non-empty lines" }, 400);
        }
        const prefix: TaskPrefixMode = body.prefix ?? "similarity";
        const formatted = items.map((line) => formatWithTaskPrefix(line, prefix));
        const batch = await embedder.embed(formatted);

        const matricesByDim: Record<string, number[][]> = {};
        const driftVs768: Record<string, number> = {};

        for (const dim of MRL_DIMS) {
          const vecs = batch.embeddings.map((v) => truncateMrl(v, dim));
          const mat = vecs.map((va) => vecs.map((vb) => cosineSimilarity(va, vb)));
          matricesByDim[String(dim)] = mat;

          if (dim === 768) {
            driftVs768["768"] = 0;
          } else {
            const baseMat = matricesByDim["768"]!;
            let sum = 0;
            let cnt = 0;
            for (let i = 0; i < items.length; i++) {
              for (let j = i + 1; j < items.length; j++) {
                sum += Math.abs((baseMat[i]?.[j] ?? 0) - (mat[i]?.[j] ?? 0));
                cnt++;
              }
            }
            driftVs768[String(dim)] = cnt > 0 ? sum / cnt : 0;
          }
        }

        return jsonResponse({
          items,
          prefix,
          durationMs: batch.durationMs,
          matricesByDim,
          driftVs768,
        });
      }

      if (req.method === "POST" && pathname === "/api/story/inspect") {
        const body = (await req.json()) as {
          query?: string;
          prefix?: TaskPrefixMode;
          modality?: Modality;
          expectedId?: string;
          distractorId?: string;
        };
        const query = (body.query ?? "").trim();
        if (!query) {
          return jsonResponse({ error: "Query is required" }, 400);
        }
        const prefix: TaskPrefixMode = body.prefix ?? "search_query";
        const formattedQuery = formatWithTaskPrefix(query, prefix);

        const stats = await store.stats();
        if (stats.totalItems < 30) {
          await seedReferenceCorpus(store, embedder);
        }

        const [steeredBatch, rawBatch] = await Promise.all([
          embedder.embed([formattedQuery]),
          embedder.embed([query]),
        ]);
        const steeredVec = steeredBatch.embeddings[0]!;
        const rawVec = rawBatch.embeddings[0]!;

        // 96 representative coordinate bars across 0..767 (each step = 8 dims)
        const vectorPreview96: number[] = [];
        for (let b = 0; b < 96; b++) {
          vectorPreview96.push(Number((steeredVec[b * 8] ?? 0).toFixed(5)));
        }

        const [fts5, vectorAll, hybridRrf, rawHits] = await Promise.all([
          store.searchFts(query, { limit: 4, modality: body.modality }),
          store.searchVector(steeredVec, { dim: 768, limit: 40, useAnnIndex: false }),
          store.searchHybrid(query, steeredVec, {
            dim: 768,
            limit: 4,
            modality: body.modality,
          }),
          store.searchVector(rawVec, { dim: 768, limit: 40, useAnnIndex: false }),
        ]);

        const vectorFiltered = body.modality
          ? vectorAll.filter((h) => h.modality === body.modality)
          : vectorAll;
        const rawFiltered = body.modality
          ? rawHits.filter((h) => h.modality === body.modality)
          : rawHits;

        const allVectorScores: Record<string, number> = {};
        for (const h of vectorAll) {
          allVectorScores[h.id] = h.cosineSimilarity ?? 0;
        }

        const targetId = body.expectedId || vectorFiltered[0]?.id || "";
        const distractorId =
          body.distractorId ||
          vectorFiltered.find((h) => h.id !== targetId)?.id ||
          "";

        const rawTargetCos =
          rawHits.find((h) => h.id === targetId)?.cosineSimilarity ?? 0;
        const steeredTargetCos =
          vectorAll.find((h) => h.id === targetId)?.cosineSimilarity ?? 0;
        const rawDistractorCos =
          rawHits.find((h) => h.id === distractorId)?.cosineSimilarity ?? 0;
        const steeredDistractorCos =
          vectorAll.find((h) => h.id === distractorId)?.cosineSimilarity ?? 0;

        const mrl = [];
        const baseTopCos = vectorFiltered[0]?.cosineSimilarity ?? 0;
        for (const dim of MRL_DIMS) {
          const hits = await store.searchVector(truncateMrl(steeredVec, dim), {
            dim,
            limit: 4,
            modality: body.modality,
            useAnnIndex: !body.modality,
          });
          mrl.push({
            dim,
            ratio: dim === 512 ? "1:1.5" : `1:${768 / dim}`,
            bytesPerVec: dim * 4,
            mbPer100k: Math.round(((dim * 4 * 100_000) / (1024 * 1024)) * 10) / 10,
            topHits: hits,
            top1Drift: Math.abs(baseTopCos - (hits[0]?.cosineSimilarity ?? 0)),
          });
        }

        return jsonResponse({
          query,
          formattedQuery,
          embedMs: steeredBatch.durationMs,
          vectorPreview96,
          allVectorScores,
          fts5,
          vector768: vectorFiltered.slice(0, 4),
          hybridRrf,
          prefixAb: {
            targetId,
            distractorId,
            rawTargetCos,
            steeredTargetCos,
            rawDistractorCos,
            steeredDistractorCos,
            rawMargin: rawTargetCos - rawDistractorCos,
            steeredMargin: steeredTargetCos - steeredDistractorCos,
            rawTopHits: rawFiltered.slice(0, 3),
            steeredTopHits: vectorFiltered.slice(0, 3),
          },
          mrl,
        });
      }

      if (req.method === "POST" && pathname === "/api/bench/case") {
        const body = (await req.json()) as { caseId?: string };
        const diag = await runSingleCaseDiagnostic(store, embedder, body.caseId ?? "q-sem-1");
        return jsonResponse(diag);
      }

      if (req.method === "POST" && pathname === "/api/bench/one") {
        const body = (await req.json()) as {
          experiment?: ExperimentName;
          filter?: string;
        };
        const exp = body.experiment ?? "hybrid";
        const started = performance.now();
        if (exp === "hybrid") {
          const hybridComparison = await runHybridExperiment(store, embedder, {
            filter: body.filter,
          });
          return jsonResponse({
            experiment: exp,
            durationMs: performance.now() - started,
            hybridComparison,
          });
        }
        if (exp === "prefixes") {
          const prefixSteering = await runPrefixExperiment(store, embedder, {
            filter: body.filter,
          });
          return jsonResponse({
            experiment: exp,
            durationMs: performance.now() - started,
            prefixSteering,
          });
        }
        if (exp === "mrl") {
          const mrlTruncation = await runMrlExperiment(store, embedder, {
            filter: body.filter,
          });
          return jsonResponse({
            experiment: exp,
            durationMs: performance.now() - started,
            mrlTruncation,
          });
        }
        if (exp === "multimodal") {
          const multimodal = await runMultimodalExperiment(store, embedder, {
            filter: body.filter,
          });
          return jsonResponse({
            experiment: exp,
            durationMs: performance.now() - started,
            multimodal,
          });
        }
        return jsonResponse({ error: `Unknown experiment: ${String(exp)}` }, 400);
      }

      if (req.method === "POST" && pathname === "/api/bench") {
        const report = await runFullBenchmark(store, embedder, { reseed: true });
        return jsonResponse(report);
      }

      // --- Multi-Page PDF Papers & PowerPoint (.pptx) Endpoints ---
      if (req.method === "GET" && pathname === "/api/docs") {
        const bundles = await store.listDocBundles();
        return jsonResponse({
          bundles,
          showcaseQueries: DOC_SHOWCASE_QUERIES,
        });
      }

      if (req.method === "POST" && pathname === "/api/docs/seed") {
        const body = (await req.json().catch(() => ({}))) as { force?: boolean };
        const result = await seedSamplePapersAndDecks(store, embedder, {
          force: body.force ?? false,
        });
        const bundles = await store.listDocBundles();
        return jsonResponse({ ...result, bundles });
      }

      if (req.method === "POST" && pathname === "/api/docs/bench") {
        const rows = await runDocsLensesBenchmark(store, embedder);
        return jsonResponse({ rows });
      }

      const pagesListMatch = pathname.match(/^\/api\/docs\/([^/]+)\/pages$/);
      if (req.method === "GET" && pagesListMatch) {
        const docId = decodeURIComponent(pagesListMatch[1]!);
        const [bundle, rawPages] = await Promise.all([
          store.getDocBundle(docId),
          store.getDocPages(docId),
        ]);
        if (!bundle) {
          return jsonResponse({ error: `Document not found: ${docId}` }, 404);
        }
        const pages = rawPages.map((p) => ({
          id: p.id,
          pageNumber: p.pageNumber,
          pageTitle: p.pageTitle,
          extractedText: p.extractedText,
          speakerNotes: p.speakerNotes,
          widthPx: p.widthPx,
          heightPx: p.heightPx,
          imageUrl: `/api/docs/${encodeURIComponent(docId)}/page/${p.pageNumber}.png?scale=1.4`,
          thumbUrl: `/api/docs/${encodeURIComponent(docId)}/page/${p.pageNumber}.png?scale=0.32`,
        }));
        return jsonResponse({ bundle, pages });
      }

      const pagePngMatch = pathname.match(/^\/api\/docs\/([^/]+)\/page\/(\d+)\.png$/);
      if (req.method === "GET" && pagePngMatch) {
        const docId = decodeURIComponent(pagePngMatch[1]!);
        const pageNum = Number.parseInt(pagePngMatch[2]!, 10);
        const scale = Math.min(
          Math.max(Number.parseFloat(url.searchParams.get("scale") ?? "1.35") || 1.35, 0.18),
          2.25,
        );
        const bundle = await store.getDocBundle(docId);
        if (!bundle) {
          return jsonResponse({ error: `Document not found: ${docId}` }, 404);
        }
        if (bundle.format === "pdf") {
          if (!existsSync(bundle.filePath)) {
            return jsonResponse({ error: `PDF file missing on disk: ${bundle.filePath}` }, 404);
          }
          const { pngBytes } = renderPdfPagePngFromFile(bundle.filePath, pageNum, scale);
          return new Response(Buffer.from(pngBytes), {
            headers: {
              "content-type": "image/png",
              "cache-control": "public, max-age=3600",
            },
          });
        }
        const slidePage = await store.getDocPage(docId, pageNum);
        if (!slidePage?.previewDataUrl) {
          return jsonResponse({ error: `Slide preview not found` }, 404);
        }
        if (Math.abs(scale - 1.4) < 0.25) {
          const b64 = stripDataUrlPrefix(slidePage.previewDataUrl);
          return new Response(Buffer.from(b64, "base64"), {
            headers: {
              "content-type": "image/png",
              "cache-control": "public, max-age=3600",
            },
          });
        }
        const { pngBytes } = rescalePngDataUrl(slidePage.previewDataUrl, scale);
        return new Response(Buffer.from(pngBytes), {
          headers: {
            "content-type": "image/png",
            "cache-control": "public, max-age=3600",
          },
        });
      }

      const downloadMatch = pathname.match(/^\/api\/docs\/([^/]+)\/download$/);
      if (req.method === "GET" && downloadMatch) {
        const docId = decodeURIComponent(downloadMatch[1]!);
        const bundle = await store.getDocBundle(docId);
        if (!bundle || !existsSync(bundle.filePath)) {
          return jsonResponse({ error: `File not found for ${docId}` }, 404);
        }
        const mime =
          bundle.format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        return new Response(readFileSync(bundle.filePath), {
          headers: {
            "content-type": mime,
            "content-disposition": `attachment; filename="${bundle.filename}"`,
          },
        });
      }

      if (req.method === "POST" && pathname === "/api/docs/inspect") {
        const body = (await req.json()) as {
          query?: string;
          docId?: string;
        };
        const query = (body.query ?? "").trim();
        if (!query) {
          return jsonResponse({ error: "Query is required" }, 400);
        }
        const prefix = query.includes("?") ? "question_answering" : "search_query";
        const formattedQuery = formatWithTaskPrefix(query, prefix);
        const embBatch = await embedder.embed([formattedQuery]);
        const qVec = embBatch.embeddings[0]!;

        const scopedDocId =
          body.docId && body.docId !== "all" ? body.docId : undefined;
        const lenses = await store.inspectDocLenses(query, qVec, {
          docId: scopedDocId,
          limit: 6,
        });
        const mapHit = (h: (typeof lenses.visionTop)[number]) => ({
          id: h.id,
          docId: h.docId,
          docTitle: h.docTitle,
          format: h.format,
          pageNumber: h.pageNumber,
          pageTitle: h.pageTitle,
          hasSpeakerNotes: h.speakerNotes.trim().length > 0,
          visCos: h.visCos,
          txtCos: h.txtCos,
          fusedCos: h.fusedCos,
          ftsRank: h.ftsRank,
          score: h.score,
          thumbUrl: `/api/docs/${encodeURIComponent(h.docId)}/page/${h.pageNumber}.png?scale=0.35`,
        });

        return jsonResponse({
          query,
          formattedQuery,
          embedMs: embBatch.durationMs,
          visionTop: lenses.visionTop.map(mapHit),
          textTop: lenses.textTop.map(mapHit),
          fusedTop: lenses.fusedTop.map(mapHit),
          hybridTop: lenses.hybridTop.map(mapHit),
          heatmapDocId: lenses.heatmapDocId,
          heatmap: lenses.heatmap,
        });
      }

      if (req.method === "POST" && pathname === "/api/docs/acuity") {
        const body = (await req.json()) as {
          docId?: string;
          pageNumber?: number;
          query?: string;
        };
        const docId = (body.docId ?? "").trim();
        const pageNumber = Math.max(1, Number(body.pageNumber ?? 1));
        const query = (body.query ?? "").trim();
        if (!docId || !query) {
          return jsonResponse({ error: "docId and query are required" }, 400);
        }
        const [bundle, page] = await Promise.all([
          store.getDocBundle(docId),
          store.getDocPage(docId, pageNumber),
        ]);
        if (!bundle || !page) {
          return jsonResponse({ error: `Page not found: ${docId} p.${pageNumber}` }, 404);
        }
        const acuity = await runPageVisualAcuityXray(embedder, {
          format: bundle.format,
          filePath: bundle.filePath,
          pageNumber,
          slidePreviewDataUrl: page.previewDataUrl,
          query,
        });
        return jsonResponse(acuity);
      }

      if (req.method === "POST" && pathname === "/api/docs/upload") {
        const form = await req.formData();
        const file = form.get("file");
        if (!(file instanceof File)) {
          return jsonResponse({ error: "Multipart form field 'file' (.pdf or .pptx) is required" }, 400);
        }
        const origName = file.name || "uploaded.pdf";
        const lower = origName.toLowerCase();
        if (!lower.endsWith(".pdf") && !lower.endsWith(".pptx")) {
          return jsonResponse({ error: "Only .pdf and .pptx files are supported" }, 400);
        }
        const safeName = origName.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const uploadsDir = "data/uploads";
        mkdirSync(uploadsDir, { recursive: true });
        const targetPath = join(uploadsDir, `${Date.now()}-${safeName}`);
        writeFileSync(targetPath, new Uint8Array(await file.arrayBuffer()));

        const customTitle = String(form.get("title") ?? "").trim() || origName;
        const docId = `${lower.endsWith(".pdf") ? "pdf" : "deck"}-${Date.now().toString(36)}`;
        const parsed = lower.endsWith(".pdf")
          ? extractPdfBundle(targetPath, {
              id: docId,
              title: customTitle,
              subtitle: `Uploaded PDF · ${origName}`,
              maxPages: 60,
            })
          : await extractPptxBundle(targetPath, {
              id: docId,
              title: customTitle,
              subtitle: `Uploaded PowerPoint · ${origName}`,
            });

        const indexed = await indexParsedDocBundle(store, embedder, parsed);
        const bundle = await store.getDocBundle(docId);
        return jsonResponse({ ...indexed, bundle });
      }

      return jsonResponse({ error: `Not found: ${req.method} ${pathname}` }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonResponse({ error: message }, 500);
    }
  };
}
