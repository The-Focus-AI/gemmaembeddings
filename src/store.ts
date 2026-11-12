import { createClient, type Client, type InValue } from "@libsql/client";
import { mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import {
  cosineSimilarity,
  MRL_DIMS,
  storageBytesForDim,
  toVector32Json,
  truncateMrl,
  type MrlDim,
} from "./mrl.ts";

export const ALL_MODALITIES = [
  "text",
  "document",
  "code",
  "image",
  "visdoc",
  "audio",
] as const;
export type Modality = (typeof ALL_MODALITIES)[number];

export interface CorpusItemInput {
  id: string;
  title: string;
  content: string;
  modality: Modality;
  category: string;
  language?: string;
  imageDataUrl?: string | null;
  audioDataUrl?: string | null;
  metadata?: Record<string, unknown>;
  embedding768: Float32Array;
}

export interface StoredItem {
  id: string;
  title: string;
  content: string;
  modality: Modality;
  category: string;
  language: string;
  imageDataUrl: string | null;
  audioDataUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SearchHit extends StoredItem {
  score: number;
  cosineSimilarity: number | null;
  vectorRank: number | null;
  ftsRank: number | null;
  ftsBm25: number | null;
  ftsExactMatch?: boolean;
}

export interface StoreStats {
  dbUrl: string;
  fileSizeBytes: number | null;
  totalItems: number;
  docBundlesCount: number;
  docPagesCount: number;
  byModality: Record<Modality, number>;
  mrlFootprintBytes: Record<MrlDim, number>;
}

export interface StoredDocBundle {
  id: string;
  title: string;
  subtitle: string;
  filename: string;
  format: "pdf" | "pptx";
  filePath: string;
  fileSizeBytes: number;
  pageCount: number;
  createdAt: string;
}

export interface StoredDocPage {
  id: string;
  docId: string;
  docTitle: string;
  format: "pdf" | "pptx";
  pageNumber: number;
  pageTitle: string;
  extractedText: string;
  speakerNotes: string;
  previewDataUrl: string | null;
  widthPx: number;
  heightPx: number;
}

export interface DocPageHit extends StoredDocPage {
  score: number;
  visCos: number;
  txtCos: number;
  fusedCos: number;
  ftsRank: number | null;
}

export interface DocHeatmapCell {
  pageNumber: number;
  pageTitle: string;
  hasSpeakerNotes: boolean;
  textChars: number;
  visCos: number;
  txtCos: number;
  fusedCos: number;
  ftsRank: number | null;
}

export type OmniScope =
  | "all"
  | "all_docs"
  | "pdf"
  | "pptx"
  | "markdown"
  | "sensory"
  | "code";

export type OmniLens = "hybrid" | "fused" | "vision" | "fts";

export interface OmniSearchHit {
  uid: string;
  sourceKind: "corpus_item" | "pdf_page" | "pptx_slide";
  modalityBadge: string;
  id: string;
  docId: string | null;
  pageNumber: number | null;
  totalPages: number | null;
  title: string;
  parentTitle: string;
  snippet: string;
  speakerNotes: string;
  hasSpeakerNotes: boolean;
  thumbUrl: string | null;
  fullImageUrl: string | null;
  audioDataUrl: string | null;
  score: number;
  cosineSimilarity: number | null;
  visCos: number | null;
  txtCos: number | null;
  vectorRank: number | null;
  ftsRank: number | null;
}

export interface OmniBundleRollup {
  groupKey: string;
  title: string;
  kindBadge: string;
  docId: string | null;
  bestPageNumber: number | null;
  bestItemId: string;
  bestCosine: number | null;
  bestScore: number;
  hitCount: number;
  topPages: Array<{ label: string; pageNumber: number | null; itemId: string; cos: number | null }>;
}

const FTS_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in",
  "into", "is", "it", "no", "not", "of", "on", "or", "over", "that", "the",
  "their", "then", "there", "these", "they", "this", "to", "under", "up",
  "was", "what", "when", "where", "while", "who", "why", "with", "without",
]);

function sanitizeFtsTokens(raw: string): string[] {
  const allTokens = raw
    .replace(/[^\p{L}\p{N}_-]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  const meaningful = allTokens.filter((t) => !FTS_STOPWORDS.has(t.toLowerCase()));
  const chosen = meaningful.length > 0 ? meaningful : allTokens;
  return chosen.map((t) => `"${t.replaceAll('"', "")}"`);
}

export class VectorStore {
  readonly client: Client;
  readonly dbUrl: string;

  constructor(dbUrl: string) {
    this.dbUrl = dbUrl;
    if (dbUrl.startsWith("file:") && !dbUrl.includes(":memory:")) {
      const filePath = dbUrl.slice("file:".length);
      if (filePath && filePath !== ":memory:") {
        mkdirSync(dirname(filePath), { recursive: true });
      }
    }
    this.client = createClient({ url: dbUrl });
  }

  async init(): Promise<void> {
    const existing = await this.client.execute(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'`,
    );
    const tableSql = String(existing.rows[0]?.sql ?? "");
    if (tableSql && (!tableSql.includes("audio_data_url") || !tableSql.includes("'visdoc'"))) {
      await this.dropAllTables();
    }

    await this.client.executeMultiple(`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        modality TEXT NOT NULL CHECK (modality IN ('text', 'document', 'code', 'image', 'visdoc', 'audio')),
        category TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en',
        image_data_url TEXT,
        audio_data_url TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ),
        emb_768 F32_BLOB(768) NOT NULL,
        emb_512 F32_BLOB(512) NOT NULL,
        emb_256 F32_BLOB(256) NOT NULL,
        emb_128 F32_BLOB(128) NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_items_emb_768 ON items (libsql_vector_idx(emb_768, 'metric=cosine'));
      CREATE INDEX IF NOT EXISTS idx_items_emb_512 ON items (libsql_vector_idx(emb_512, 'metric=cosine'));
      CREATE INDEX IF NOT EXISTS idx_items_emb_256 ON items (libsql_vector_idx(emb_256, 'metric=cosine'));
      CREATE INDEX IF NOT EXISTS idx_items_emb_128 ON items (libsql_vector_idx(libsql_vector_idx_noop));
    `.replace(
      "CREATE INDEX IF NOT EXISTS idx_items_emb_128 ON items (libsql_vector_idx(libsql_vector_idx_noop));",
      "CREATE INDEX IF NOT EXISTS idx_items_emb_128 ON items (libsql_vector_idx(emb_128, 'metric=cosine'));",
    ));

    await this.client.executeMultiple(`
      CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
        id UNINDEXED,
        title,
        content,
        category,
        tokenize = 'unicode61'
      );

      CREATE TABLE IF NOT EXISTS doc_bundles (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        filename TEXT NOT NULL,
        format TEXT NOT NULL CHECK (format IN ('pdf', 'pptx')),
        file_path TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL DEFAULT 0,
        page_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%fZ', 'now') )
      );

      CREATE TABLE IF NOT EXISTS doc_pages (
        id TEXT PRIMARY KEY,
        doc_id TEXT NOT NULL,
        page_number INTEGER NOT NULL,
        format TEXT NOT NULL CHECK (format IN ('pdf', 'pptx')),
        page_title TEXT NOT NULL,
        extracted_text TEXT NOT NULL DEFAULT '',
        speaker_notes TEXT NOT NULL DEFAULT '',
        preview_data_url TEXT,
        width_px INTEGER NOT NULL DEFAULT 0,
        height_px INTEGER NOT NULL DEFAULT 0,
        emb_vis F32_BLOB(768) NOT NULL,
        emb_txt F32_BLOB(768) NOT NULL,
        emb_fused F32_BLOB(768) NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_doc_pages_doc ON doc_pages (doc_id, page_number);

      CREATE VIRTUAL TABLE IF NOT EXISTS doc_pages_fts USING fts5(
        id UNINDEXED,
        doc_id UNINDEXED,
        page_title,
        extracted_text,
        speaker_notes,
        tokenize = 'unicode61'
      );
    `);
  }

  private async dropAllTables(): Promise<void> {
    await this.client.executeMultiple(`
      DROP INDEX IF EXISTS idx_items_emb_768;
      DROP INDEX IF EXISTS idx_items_emb_512;
      DROP INDEX IF EXISTS idx_items_emb_256;
      DROP INDEX IF EXISTS idx_items_emb_128;
      DROP TABLE IF EXISTS items;
      DROP TABLE IF EXISTS items_fts;
    `);
  }

  async clear(): Promise<void> {
    await this.dropAllTables();
    await this.init();
  }

  async upsertMany(items: CorpusItemInput[]): Promise<void> {
    if (items.length === 0) return;
    const statements: Array<{ sql: string; args: InValue[] }> = [];
    for (const item of items) {
      if (item.embedding768.length !== 768) {
        throw new Error(
          `Item ${item.id} expected 768d vector, received ${item.embedding768.length}d`,
        );
      }
      const v768 = toVector32Json(truncateMrl(item.embedding768, 768));
      const v512 = toVector32Json(truncateMrl(item.embedding768, 512));
      const v256 = toVector32Json(truncateMrl(item.embedding768, 256));
      const v128 = toVector32Json(truncateMrl(item.embedding768, 128));

      statements.push({
        sql: `
          INSERT INTO items (
            id, title, content, modality, category, language, image_data_url, audio_data_url, metadata,
            emb_768, emb_512, emb_256, emb_128
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?,
            vector32(?), vector32(?), vector32(?), vector32(?)
          )
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            content = excluded.content,
            modality = excluded.modality,
            category = excluded.category,
            language = excluded.language,
            image_data_url = excluded.image_data_url,
            audio_data_url = excluded.audio_data_url,
            metadata = excluded.metadata,
            emb_768 = excluded.emb_768,
            emb_512 = excluded.emb_512,
            emb_256 = excluded.emb_256,
            emb_128 = excluded.emb_128
        `,
        args: [
          item.id,
          item.title,
          item.content,
          item.modality,
          item.category,
          item.language ?? "en",
          item.imageDataUrl ?? null,
          item.audioDataUrl ?? null,
          JSON.stringify(item.metadata ?? {}),
          v768,
          v512,
          v256,
          v128,
        ],
      });
      statements.push({
        sql: `DELETE FROM items_fts WHERE id = ?`,
        args: [item.id],
      });
      // Only index lexical content for text/document/code modalities so pure sensory items cannot cheat via titles
      const isPureSensory =
        item.modality === "image" || item.modality === "visdoc" || item.modality === "audio";
      if (!isPureSensory && (item.content.trim().length > 0 || item.title.trim().length > 0)) {
        statements.push({
          sql: `INSERT INTO items_fts (id, title, content, category) VALUES (?, ?, ?, ?)`,
          args: [item.id, item.title, item.content, item.category],
        });
      }
    }
    await this.client.batch(statements, "write");
  }

  async getItemVector(id: string): Promise<Float32Array | null> {
    const res = await this.client.execute({
      sql: `SELECT vector_extract(emb_768) AS vec_json FROM items WHERE id = ?`,
      args: [id],
    });
    const raw = res.rows[0]?.vec_json;
    if (typeof raw !== "string") return null;
    const arr = JSON.parse(raw) as number[];
    return new Float32Array(arr);
  }

  async listItems(modality?: Modality): Promise<StoredItem[]> {
    const res = modality
      ? await this.client.execute({
          sql: `SELECT id, title, content, modality, category, language, image_data_url, audio_data_url, metadata, created_at
                FROM items WHERE modality = ? ORDER BY id ASC`,
          args: [modality],
        })
      : await this.client.execute(
          `SELECT id, title, content, modality, category, language, image_data_url, audio_data_url, metadata, created_at
           FROM items ORDER BY
             CASE modality
               WHEN 'document' THEN 1
               WHEN 'visdoc' THEN 2
               WHEN 'image' THEN 3
               WHEN 'audio' THEN 4
               WHEN 'code' THEN 5
               ELSE 6
             END, id ASC`,
        );

    return res.rows.map((r) => this.mapStoredRow(r));
  }

  async searchVector(
    queryVector: Float32Array,
    options?: {
      dim?: MrlDim;
      limit?: number;
      modality?: Modality;
      useAnnIndex?: boolean;
    },
  ): Promise<SearchHit[]> {
    const dim = options?.dim ?? 768;
    const limit = options?.limit ?? 10;
    const useAnn = options?.useAnnIndex ?? true;
    const col = `emb_${dim}`;
    const idxName = `idx_items_emb_${dim}`;
    const truncated =
      queryVector.length === dim ? queryVector : truncateMrl(queryVector, dim);
    const vecJson = toVector32Json(truncated);

    const annFetchK = options?.modality ? Math.max(limit * 8, 64) : limit;

    const result = useAnn
      ? await this.client.execute({
          sql: `
            SELECT
              i.id, i.title, i.content, i.modality, i.category, i.language,
              i.image_data_url, i.audio_data_url, i.metadata, i.created_at,
              vector_distance_cos(i.${col}, vector32(?)) AS cos_dist
            FROM vector_top_k('${idxName}', vector32(?), ?) AS top_k
            JOIN items i ON i.rowid = top_k.id
            ${options?.modality ? "WHERE i.modality = ?" : ""}
            ORDER BY cos_dist ASC
            LIMIT ?
          `,
          args: options?.modality
            ? [vecJson, vecJson, annFetchK, options.modality, limit]
            : [vecJson, vecJson, annFetchK, limit],
        })
      : await this.client.execute({
          sql: `
            SELECT
              i.id, i.title, i.content, i.modality, i.category, i.language,
              i.image_data_url, i.audio_data_url, i.metadata, i.created_at,
              vector_distance_cos(i.${col}, vector32(?)) AS cos_dist
            FROM items i
            ${options?.modality ? "WHERE i.modality = ?" : ""}
            ORDER BY cos_dist ASC
            LIMIT ?
          `,
          args: options?.modality
            ? [vecJson, options.modality, limit]
            : [vecJson, limit],
        });

    return result.rows.map((row, i) => {
      const dist = Number(row.cos_dist ?? 1);
      const cosine = 1 - dist;
      return {
        ...this.mapStoredRow(row),
        score: cosine,
        cosineSimilarity: cosine,
        vectorRank: i + 1,
        ftsRank: null,
        ftsBm25: null,
      };
    });
  }

  async searchFts(
    queryText: string,
    options?: { limit?: number; modality?: Modality },
  ): Promise<SearchHit[]> {
    const limit = options?.limit ?? 10;
    const tokens = sanitizeFtsTokens(queryText);
    if (tokens.length === 0) return [];

    const runMatch = async (ftsExpr: string) =>
      this.client.execute({
        sql: `
          SELECT
            i.id, i.title, i.content, i.modality, i.category, i.language,
            i.image_data_url, i.audio_data_url, i.metadata, i.created_at,
            bm25(items_fts, 2.0, 1.0, 0.5) AS bm25_raw
          FROM items_fts
          JOIN items i ON i.id = items_fts.id
          WHERE items_fts MATCH ?
          ${options?.modality ? "AND i.modality = ?" : ""}
          ORDER BY bm25_raw ASC
          LIMIT ?
        `,
        args: options?.modality
          ? [ftsExpr, options.modality, limit]
          : [ftsExpr, limit],
      });

    let exactMatch = true;
    let result = await runMatch(tokens.join(" AND "));
    if (result.rows.length === 0 && tokens.length > 1) {
      exactMatch = false;
      result = await runMatch(tokens.join(" OR "));
    }

    return result.rows.map((row, i) => {
      const bm25Score = -Number(row.bm25_raw ?? 0);
      return {
        ...this.mapStoredRow(row),
        score: bm25Score,
        cosineSimilarity: null,
        vectorRank: null,
        ftsRank: i + 1,
        ftsBm25: bm25Score,
        ftsExactMatch: exactMatch,
      };
    });
  }

  async searchHybrid(
    queryText: string,
    queryVector: Float32Array,
    options?: {
      dim?: MrlDim;
      limit?: number;
      modality?: Modality;
      rrfK?: number;
      vectorWeight?: number;
      ftsWeight?: number;
    },
  ): Promise<SearchHit[]> {
    const limit = options?.limit ?? 10;
    const candidatePool = Math.max(limit * 3, 25);
    const rrfK = options?.rrfK ?? 12;
    const vectorWeight = options?.vectorWeight ?? 1.0;
    const ftsWeight = options?.ftsWeight ?? 0.85;

    const [vecHits, ftsHits] = await Promise.all([
      this.searchVector(queryVector, {
        dim: options?.dim ?? 768,
        limit: candidatePool,
        modality: options?.modality,
      }),
      this.searchFts(queryText, {
        limit: candidatePool,
        modality: options?.modality,
      }),
    ]);

    const merged = new Map<string, SearchHit>();

    for (const hit of vecHits) {
      const rrf = vectorWeight / (rrfK + (hit.vectorRank ?? candidatePool));
      merged.set(hit.id, {
        ...hit,
        score: rrf,
      });
    }

    for (const hit of ftsHits) {
      const effectiveFtsWeight = hit.ftsExactMatch === false ? ftsWeight * 0.25 : ftsWeight;
      const ftsRrf = effectiveFtsWeight / (rrfK + (hit.ftsRank ?? candidatePool));
      const existing = merged.get(hit.id);
      if (existing) {
        existing.ftsRank = hit.ftsRank;
        existing.ftsBm25 = hit.ftsBm25;
        existing.score += ftsRrf;
      } else {
        merged.set(hit.id, {
          ...hit,
          score: ftsRrf,
        });
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.cosineSimilarity ?? -1) - (a.cosineSimilarity ?? -1);
      })
      .slice(0, limit);
  }

  async stats(): Promise<StoreStats> {
    const [res, bundleCntRes, pageCntRes] = await Promise.all([
      this.client.execute(`SELECT modality, COUNT(*) AS cnt FROM items GROUP BY modality`),
      this.client.execute(`SELECT COUNT(*) AS cnt FROM doc_bundles`),
      this.client.execute(`SELECT COUNT(*) AS cnt FROM doc_pages`),
    ]);
    const byModality: Record<Modality, number> = {
      text: 0,
      document: 0,
      code: 0,
      image: 0,
      visdoc: 0,
      audio: 0,
    };
    let totalItems = 0;
    for (const row of res.rows) {
      const m = String(row.modality) as Modality;
      const c = Number(row.cnt ?? 0);
      if (m in byModality) {
        byModality[m] = c;
      }
      totalItems += c;
    }

    let fileSizeBytes: number | null = null;
    if (this.dbUrl.startsWith("file:") && !this.dbUrl.includes(":memory:")) {
      const p = this.dbUrl.slice("file:".length);
      try {
        fileSizeBytes = statSync(p).size;
      } catch {
        fileSizeBytes = null;
      }
    }

    const mrlFootprintBytes = Object.fromEntries(
      MRL_DIMS.map((d) => [d, storageBytesForDim(d, totalItems)]),
    ) as Record<MrlDim, number>;

    return {
      dbUrl: this.dbUrl,
      fileSizeBytes,
      totalItems,
      docBundlesCount: Number(bundleCntRes.rows[0]?.cnt ?? 0),
      docPagesCount: Number(pageCntRes.rows[0]?.cnt ?? 0),
      byModality,
      mrlFootprintBytes,
    };
  }

  async upsertDocBundle(
    bundle: {
      id: string;
      title: string;
      subtitle: string;
      filename: string;
      format: "pdf" | "pptx";
      filePath: string;
      fileSizeBytes: number;
      pageCount: number;
    },
    pages: Array<{
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
    }>,
  ): Promise<void> {
    const statements: Array<{ sql: string; args: InValue[] }> = [
      {
        sql: `
          INSERT INTO doc_bundles (id, title, subtitle, filename, format, file_path, file_size_bytes, page_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            subtitle = excluded.subtitle,
            filename = excluded.filename,
            format = excluded.format,
            file_path = excluded.file_path,
            file_size_bytes = excluded.file_size_bytes,
            page_count = excluded.page_count
        `,
        args: [
          bundle.id,
          bundle.title,
          bundle.subtitle,
          bundle.filename,
          bundle.format,
          bundle.filePath,
          bundle.fileSizeBytes,
          bundle.pageCount,
        ],
      },
      { sql: `DELETE FROM doc_pages WHERE doc_id = ?`, args: [bundle.id] },
      { sql: `DELETE FROM doc_pages_fts WHERE doc_id = ?`, args: [bundle.id] },
    ];

    for (const p of pages) {
      const pageId = `${bundle.id}:p${p.pageNumber}`;
      statements.push({
        sql: `
          INSERT INTO doc_pages (
            id, doc_id, page_number, format, page_title, extracted_text, speaker_notes,
            preview_data_url, width_px, height_px, emb_vis, emb_txt, emb_fused
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, vector32(?), vector32(?), vector32(?))
        `,
        args: [
          pageId,
          bundle.id,
          p.pageNumber,
          bundle.format,
          p.pageTitle,
          p.extractedText,
          p.speakerNotes,
          p.previewDataUrl ?? null,
          p.widthPx,
          p.heightPx,
          toVector32Json(truncateMrl(p.embVis, 768)),
          toVector32Json(truncateMrl(p.embTxt, 768)),
          toVector32Json(truncateMrl(p.embFused, 768)),
        ],
      });
      if (p.extractedText.trim() || p.speakerNotes.trim() || p.pageTitle.trim()) {
        statements.push({
          sql: `INSERT INTO doc_pages_fts (id, doc_id, page_title, extracted_text, speaker_notes) VALUES (?, ?, ?, ?, ?)`,
          args: [pageId, bundle.id, p.pageTitle, p.extractedText, p.speakerNotes],
        });
      }
    }

    await this.client.batch(statements, "write");
  }

  async listDocBundles(): Promise<StoredDocBundle[]> {
    const res = await this.client.execute(
      `SELECT id, title, subtitle, filename, format, file_path, file_size_bytes, page_count, created_at
       FROM doc_bundles
       ORDER BY CASE format WHEN 'pdf' THEN 1 ELSE 2 END, id ASC`,
    );
    return res.rows.map((r) => ({
      id: String(r.id ?? ""),
      title: String(r.title ?? ""),
      subtitle: String(r.subtitle ?? ""),
      filename: String(r.filename ?? ""),
      format: String(r.format ?? "pdf") as "pdf" | "pptx",
      filePath: String(r.file_path ?? ""),
      fileSizeBytes: Number(r.file_size_bytes ?? 0),
      pageCount: Number(r.page_count ?? 0),
      createdAt: String(r.created_at ?? ""),
    }));
  }

  async getDocBundle(docId: string): Promise<StoredDocBundle | null> {
    const res = await this.client.execute({
      sql: `SELECT id, title, subtitle, filename, format, file_path, file_size_bytes, page_count, created_at
            FROM doc_bundles WHERE id = ?`,
      args: [docId],
    });
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: String(r.id ?? ""),
      title: String(r.title ?? ""),
      subtitle: String(r.subtitle ?? ""),
      filename: String(r.filename ?? ""),
      format: String(r.format ?? "pdf") as "pdf" | "pptx",
      filePath: String(r.file_path ?? ""),
      fileSizeBytes: Number(r.file_size_bytes ?? 0),
      pageCount: Number(r.page_count ?? 0),
      createdAt: String(r.created_at ?? ""),
    };
  }

  async getDocPages(docId: string): Promise<StoredDocPage[]> {
    const res = await this.client.execute({
      sql: `
        SELECT p.id, p.doc_id, b.title AS doc_title, p.format, p.page_number, p.page_title,
               p.extracted_text, p.speaker_notes, p.preview_data_url, p.width_px, p.height_px
        FROM doc_pages p
        JOIN doc_bundles b ON b.id = p.doc_id
        WHERE p.doc_id = ?
        ORDER BY p.page_number ASC
      `,
      args: [docId],
    });
    return res.rows.map((r) => this.mapDocPageRow(r));
  }

  async getDocPage(docId: string, pageNumber: number): Promise<StoredDocPage | null> {
    const res = await this.client.execute({
      sql: `
        SELECT p.id, p.doc_id, b.title AS doc_title, p.format, p.page_number, p.page_title,
               p.extracted_text, p.speaker_notes, p.preview_data_url, p.width_px, p.height_px
        FROM doc_pages p
        JOIN doc_bundles b ON b.id = p.doc_id
        WHERE p.doc_id = ? AND p.page_number = ?
      `,
      args: [docId, pageNumber],
    });
    const r = res.rows[0];
    return r ? this.mapDocPageRow(r) : null;
  }

  /**
   * Evaluates Vision-only (`emb_vis`), Text-only (`emb_txt`), Fused (`emb_fused`), and Hybrid RRF
   * across PDF pages & PowerPoint slides, plus a complete per-page heatmap for the active document.
   */
  async inspectDocLenses(
    queryText: string,
    queryVector: Float32Array,
    options?: { docId?: string; limit?: number },
  ): Promise<{
    visionTop: DocPageHit[];
    textTop: DocPageHit[];
    fusedTop: DocPageHit[];
    hybridTop: DocPageHit[];
    heatmapDocId: string | null;
    heatmap: DocHeatmapCell[];
  }> {
    const limit = options?.limit ?? 5;
    const vecJson = toVector32Json(truncateMrl(queryVector, 768));

    const rowsRes = await this.client.execute({
      sql: `
        SELECT
          p.id, p.doc_id, b.title AS doc_title, p.format, p.page_number, p.page_title,
          p.extracted_text, p.speaker_notes, p.preview_data_url, p.width_px, p.height_px,
          vector_distance_cos(p.emb_vis, vector32(?)) AS dist_vis,
          vector_distance_cos(p.emb_txt, vector32(?)) AS dist_txt,
          vector_distance_cos(p.emb_fused, vector32(?)) AS dist_fused
        FROM doc_pages p
        JOIN doc_bundles b ON b.id = p.doc_id
        ${options?.docId ? "WHERE p.doc_id = ?" : ""}
      `,
      args: options?.docId
        ? [vecJson, vecJson, vecJson, options.docId]
        : [vecJson, vecJson, vecJson],
    });

    // Optional lexical FTS5 ranks
    const ftsRankById = new Map<string, number>();
    const tokens = sanitizeFtsTokens(queryText);
    if (tokens.length > 0) {
      const runFts = async (expr: string) =>
        this.client.execute({
          sql: `
            SELECT id, bm25(doc_pages_fts, 2.0, 1.0, 1.4) AS bm25_raw
            FROM doc_pages_fts
            WHERE doc_pages_fts MATCH ?
            ${options?.docId ? "AND doc_id = ?" : ""}
            ORDER BY bm25_raw ASC
            LIMIT 30
          `,
          args: options?.docId ? [expr, options.docId] : [expr],
        });
      let ftsRes = await runFts(tokens.join(" AND "));
      if (ftsRes.rows.length === 0 && tokens.length > 1) {
        ftsRes = await runFts(tokens.join(" OR "));
      }
      ftsRes.rows.forEach((r, idx) => {
        ftsRankById.set(String(r.id), idx + 1);
      });
    }

    const allScored: DocPageHit[] = rowsRes.rows.map((r) => {
      const visCos = 1 - Number(r.dist_vis ?? 1);
      const txtCos = 1 - Number(r.dist_txt ?? 1);
      const fusedCos = 1 - Number(r.dist_fused ?? 1);
      const base = this.mapDocPageRow(r);
      return {
        ...base,
        score: fusedCos,
        visCos,
        txtCos,
        fusedCos,
        ftsRank: ftsRankById.get(base.id) ?? null,
      };
    });

    const visionTop = [...allScored]
      .sort((a, b) => b.visCos - a.visCos)
      .slice(0, limit)
      .map((h) => ({ ...h, score: h.visCos }));

    const textTop = [...allScored]
      .sort((a, b) => b.txtCos - a.txtCos)
      .slice(0, limit)
      .map((h) => ({ ...h, score: h.txtCos }));

    const fusedSorted = [...allScored].sort((a, b) => b.fusedCos - a.fusedCos);
    const fusedTop = fusedSorted.slice(0, limit);

    const hybridTop = fusedSorted
      .map((h, idx) => {
        const vecRrf = 1 / (12 + idx + 1);
        const ftsRrf = h.ftsRank !== null ? 0.65 / (12 + h.ftsRank) : 0;
        return { ...h, score: vecRrf + ftsRrf };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const heatmapDocId = options?.docId ?? fusedTop[0]?.docId ?? visionTop[0]?.docId ?? null;
    let heatmapRows = allScored.filter((h) => h.docId === heatmapDocId);
    if (heatmapDocId && !options?.docId && heatmapRows.length === 0) {
      heatmapRows = [];
    }
    const heatmap: DocHeatmapCell[] = heatmapRows
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .map((h) => ({
        pageNumber: h.pageNumber,
        pageTitle: h.pageTitle,
        hasSpeakerNotes: h.speakerNotes.trim().length > 0,
        textChars: h.extractedText.length,
        visCos: h.visCos,
        txtCos: h.txtCos,
        fusedCos: h.fusedCos,
        ftsRank: h.ftsRank,
      }));

    return {
      visionTop,
      textTop,
      fusedTop,
      hybridTop,
      heatmapDocId,
      heatmap,
    };
  }

  private mapDocPageRow(r: Record<string, unknown>): StoredDocPage {
    return {
      id: String(r.id ?? ""),
      docId: String(r.doc_id ?? ""),
      docTitle: String(r.doc_title ?? ""),
      format: String(r.format ?? "pdf") as "pdf" | "pptx",
      pageNumber: Number(r.page_number ?? 1),
      pageTitle: String(r.page_title ?? ""),
      extractedText: String(r.extracted_text ?? ""),
      speakerNotes: String(r.speaker_notes ?? ""),
      previewDataUrl: r.preview_data_url ? String(r.preview_data_url) : null,
      widthPx: Number(r.width_px ?? 0),
      heightPx: Number(r.height_px ?? 0),
    };
  }

  close(): void {
    this.client.close();
  }

  /**
   * Freeform unified matcher across ALL documents in SQLite:
   * - 32 corpus items (`document`, `text`, `code`, `visdoc`, `image`, `audio`)
   * - All multi-page PDF pages (`doc_pages` where `format='pdf'`)
   * - All PowerPoint slides + speaker notes (`doc_pages` where `format='pptx'`)
   */
  async searchOmni(
    queryText: string,
    queryVector768: Float32Array | null,
    options?: {
      scope?: OmniScope;
      lens?: OmniLens;
      dim?: MrlDim;
      limit?: number;
    },
  ): Promise<{
    totalCandidates: number;
    hits: OmniSearchHit[];
    rollup: OmniBundleRollup[];
  }> {
    const scope: OmniScope = options?.scope ?? "all";
    const lens: OmniLens = options?.lens ?? "hybrid";
    const dim: MrlDim = options?.dim ?? 768;
    const limit = Math.min(Math.max(options?.limit ?? 16, 1), 60);

    const includeItems = scope !== "pdf" && scope !== "pptx";
    const includeDocs =
      scope === "all" || scope === "all_docs" || scope === "pdf" || scope === "pptx";

    const rawTokens = queryText
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_-]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 2 && !FTS_STOPWORDS.has(t));

    const makeSnippet = (body: string, notes = ""): string => {
      const combined = [
        notes.trim() ? `[Speaker Notes] ${notes.trim()}` : "",
        body.trim(),
      ]
        .filter(Boolean)
        .join(" — ")
        .replace(/\s+/g, " ");
      if (!combined) return "(Visual / acoustic embedding — zero text layer)";
      if (rawTokens.length > 0) {
        const lower = combined.toLowerCase();
        const foundIdx = rawTokens
          .map((tok) => lower.indexOf(tok))
          .filter((idx) => idx >= 0)
          .sort((a, b) => a - b)[0];
        if (foundIdx !== undefined) {
          const start = Math.max(0, foundIdx - 65);
          const slice = combined.slice(start, start + 210);
          return `${start > 0 ? "…" : ""}${slice}${start + 210 < combined.length ? "…" : ""}`;
        }
      }
      return combined.length > 200 ? `${combined.slice(0, 197)}…` : combined;
    };

    // 1) Collect FTS5 lexical ranks across both tables if queryText is non-empty
    const ftsMap = new Map<string, { bm25: number; exact: boolean }>();
    const ftsTokens = sanitizeFtsTokens(queryText);
    if (ftsTokens.length > 0) {
      const runItemFts = async (expr: string) =>
        includeItems
          ? this.client.execute({
              sql: `SELECT id, bm25(items_fts, 2.0, 1.0, 0.5) AS b FROM items_fts WHERE items_fts MATCH ? ORDER BY b ASC LIMIT 40`,
              args: [expr],
            })
          : { rows: [] };
      const runPageFts = async (expr: string) =>
        includeDocs
          ? this.client.execute({
              sql: `SELECT id, bm25(doc_pages_fts, 2.0, 1.0, 1.4) AS b FROM doc_pages_fts WHERE doc_pages_fts MATCH ? ORDER BY b ASC LIMIT 60`,
              args: [expr],
            })
          : { rows: [] };

      let [iExact, pExact] = await Promise.all([
        runItemFts(ftsTokens.join(" AND ")),
        runPageFts(ftsTokens.join(" AND ")),
      ]);
      let isExact = true;
      if (iExact.rows.length + pExact.rows.length === 0 && ftsTokens.length > 1) {
        isExact = false;
        [iExact, pExact] = await Promise.all([
          runItemFts(ftsTokens.join(" OR ")),
          runPageFts(ftsTokens.join(" OR ")),
        ]);
      }
      for (const r of iExact.rows) {
        ftsMap.set(`item:${String(r.id)}`, { bm25: -Number(r.b ?? 0), exact: isExact });
      }
      for (const r of pExact.rows) {
        ftsMap.set(`page:${String(r.id)}`, { bm25: -Number(r.b ?? 0), exact: isExact });
      }
    }

    const qTrunc = queryVector768 ? truncateMrl(queryVector768, dim) : null;
    const candidates: OmniSearchHit[] = [];

    // 2) Gather matching `items` rows
    if (includeItems) {
      let itemFilterSql = "";
      if (scope === "all_docs") itemFilterSql = `WHERE modality IN ('document', 'visdoc')`;
      else if (scope === "markdown") itemFilterSql = `WHERE modality IN ('document', 'text')`;
      else if (scope === "sensory") itemFilterSql = `WHERE modality IN ('visdoc', 'image', 'audio')`;
      else if (scope === "code") itemFilterSql = `WHERE modality = 'code'`;

      const embCol = `emb_${dim}`;
      const itemsRes = await this.client.execute(
        `SELECT id, title, content, modality, category, language, image_data_url, audio_data_url, vector_extract(${embCol}) AS vj
         FROM items ${itemFilterSql}`,
      );

      for (const r of itemsRes.rows) {
        const mod = String(r.modality) as Modality;
        if (lens === "vision" && mod !== "visdoc" && mod !== "image" && mod !== "audio") {
          continue;
        }
        const id = String(r.id);
        const uid = `item:${id}`;
        let cos: number | null = null;
        if (qTrunc && typeof r.vj === "string") {
          const itemVec = new Float32Array(JSON.parse(r.vj) as number[]);
          cos = cosineSimilarity(qTrunc, itemVec);
        }
        const ftsEntry = ftsMap.get(uid);
        if (lens === "fts" && !ftsEntry) continue;

        candidates.push({
          uid,
          sourceKind: "corpus_item",
          modalityBadge: `${mod.toUpperCase()}${r.language && r.language !== "en" && r.language !== mod ? ` · ${String(r.language).toUpperCase()}` : ""}`,
          id,
          docId: null,
          pageNumber: null,
          totalPages: null,
          title: String(r.title ?? id),
          parentTitle: `Corpus · ${mod}`,
          snippet: makeSnippet(String(r.content ?? "")),
          speakerNotes: "",
          hasSpeakerNotes: false,
          thumbUrl: r.image_data_url ? String(r.image_data_url) : null,
          fullImageUrl: r.image_data_url ? String(r.image_data_url) : null,
          audioDataUrl: r.audio_data_url ? String(r.audio_data_url) : null,
          score: cos ?? ftsEntry?.bm25 ?? 0,
          cosineSimilarity: cos,
          visCos: mod === "visdoc" || mod === "image" ? cos : null,
          txtCos: mod === "document" || mod === "text" || mod === "code" ? cos : null,
          vectorRank: null,
          ftsRank: null,
        });
      }
    }

    // 3) Gather matching `doc_pages` rows (PDF pages & PowerPoint slides)
    if (includeDocs) {
      const fmtWhere =
        scope === "pdf"
          ? `WHERE p.format = 'pdf'`
          : scope === "pptx"
            ? `WHERE p.format = 'pptx'`
            : "";
      const pagesRes = await this.client.execute(`
        SELECT
          p.id, p.doc_id, b.title AS doc_title, b.page_count, p.format, p.page_number,
          p.page_title, p.extracted_text, p.speaker_notes,
          vector_extract(p.emb_vis) AS v_vis,
          vector_extract(p.emb_txt) AS v_txt,
          vector_extract(p.emb_fused) AS v_fused
        FROM doc_pages p
        JOIN doc_bundles b ON b.id = p.doc_id
        ${fmtWhere}
      `);

      for (const r of pagesRes.rows) {
        const pageId = String(r.id);
        const uid = `page:${pageId}`;
        const ftsEntry = ftsMap.get(uid);
        if (lens === "fts" && !ftsEntry) continue;

        let visCos: number | null = null;
        let txtCos: number | null = null;
        let fusedCos: number | null = null;
        if (qTrunc) {
          if (typeof r.v_vis === "string") {
            visCos = cosineSimilarity(
              qTrunc,
              truncateMrl(new Float32Array(JSON.parse(r.v_vis) as number[]), dim),
            );
          }
          if (typeof r.v_txt === "string") {
            txtCos = cosineSimilarity(
              qTrunc,
              truncateMrl(new Float32Array(JSON.parse(r.v_txt) as number[]), dim),
            );
          }
          if (typeof r.v_fused === "string") {
            fusedCos = cosineSimilarity(
              qTrunc,
              truncateMrl(new Float32Array(JSON.parse(r.v_fused) as number[]), dim),
            );
          }
        }

        const chosenCos =
          lens === "vision"
            ? visCos
            : fusedCos !== null && visCos !== null && txtCos !== null
              ? Math.max(fusedCos, visCos * 0.985, txtCos * 0.985)
              : fusedCos;

        const docId = String(r.doc_id);
        const pNum = Number(r.page_number ?? 1);
        const pTot = Number(r.page_count ?? 1);
        const fmt = String(r.format) as "pdf" | "pptx";
        const notes = String(r.speaker_notes ?? "");

        candidates.push({
          uid,
          sourceKind: fmt === "pdf" ? "pdf_page" : "pptx_slide",
          modalityBadge:
            fmt === "pdf" ? `PDF · p.${pNum}/${pTot}` : `PPTX · Slide ${pNum}/${pTot}`,
          id: pageId,
          docId,
          pageNumber: pNum,
          totalPages: pTot,
          title: String(r.page_title ?? `Page ${pNum}`),
          parentTitle: String(r.doc_title ?? docId),
          snippet: makeSnippet(String(r.extracted_text ?? ""), notes),
          speakerNotes: notes,
          hasSpeakerNotes: notes.trim().length > 0,
          thumbUrl: `/api/docs/${encodeURIComponent(docId)}/page/${pNum}.png?scale=0.32`,
          fullImageUrl: `/api/docs/${encodeURIComponent(docId)}/page/${pNum}.png?scale=1.4`,
          audioDataUrl: null,
          score: chosenCos ?? ftsEntry?.bm25 ?? 0,
          cosineSimilarity: chosenCos,
          visCos,
          txtCos,
          vectorRank: null,
          ftsRank: null,
        });
      }
    }

    // 4) Unified Ranking (FTS-only, Pure Cosine, or Unified RRF Fusion)
    if (lens === "fts") {
      const ftsSorted = candidates
        .map((c) => ({ c, b: ftsMap.get(c.uid)?.bm25 ?? 0 }))
        .sort((a, b) => b.b - a.b);
      ftsSorted.forEach((entry, idx) => {
        entry.c.ftsRank = idx + 1;
        entry.c.score = entry.b;
      });
      const top = ftsSorted.slice(0, limit).map((e) => e.c);
      return {
        totalCandidates: candidates.length,
        hits: top,
        rollup: this.buildOmniRollup(top),
      };
    }

    // Assign vectorRank across the unified candidate pool
    candidates.sort((a, b) => (b.cosineSimilarity ?? -1) - (a.cosineSimilarity ?? -1));
    candidates.forEach((c, idx) => {
      c.vectorRank = idx + 1;
    });

    if (lens === "hybrid" && ftsMap.size > 0) {
      // Sort FTS hits globally by BM25 score
      const ftsRanked = [...ftsMap.entries()].sort((a, b) => b[1].bm25 - a[1].bm25);
      const ftsGlobalRank = new Map<string, { rank: number; exact: boolean }>();
      ftsRanked.forEach(([uid, meta], idx) => {
        ftsGlobalRank.set(uid, { rank: idx + 1, exact: meta.exact });
      });

      const rrfK = 12;
      for (const c of candidates) {
        const vRrf = 1.0 / (rrfK + (c.vectorRank ?? 999));
        const fMeta = ftsGlobalRank.get(c.uid);
        if (fMeta) {
          c.ftsRank = fMeta.rank;
          const w = fMeta.exact ? 0.85 : 0.22;
          c.score = vRrf + w / (rrfK + fMeta.rank);
        } else {
          c.score = vRrf;
        }
      }
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.cosineSimilarity ?? -1) - (a.cosineSimilarity ?? -1);
      });
    } else {
      for (const c of candidates) {
        c.score = c.cosineSimilarity ?? 0;
      }
    }

    const topHits = candidates.slice(0, limit);
    return {
      totalCandidates: candidates.length,
      hits: topHits,
      rollup: this.buildOmniRollup(candidates.slice(0, Math.max(limit, 24))),
    };
  }

  private buildOmniRollup(pool: OmniSearchHit[]): OmniBundleRollup[] {
    const groups = new Map<string, OmniBundleRollup>();
    for (const h of pool) {
      const key = h.docId ?? `item:${h.id}`;
      const existing = groups.get(key);
      const pageEntry = {
        label:
          h.pageNumber !== null
            ? `${h.sourceKind === "pptx_slide" ? "Slide" : "p."}${h.pageNumber}`
            : h.id,
        pageNumber: h.pageNumber,
        itemId: h.id,
        cos: h.cosineSimilarity,
      };
      if (!existing) {
        groups.set(key, {
          groupKey: key,
          title: h.docId ? h.parentTitle : h.title,
          kindBadge:
            h.sourceKind === "pdf_page"
              ? "PDF Paper"
              : h.sourceKind === "pptx_slide"
                ? "PowerPoint"
                : h.modalityBadge,
          docId: h.docId,
          bestPageNumber: h.pageNumber,
          bestItemId: h.id,
          bestCosine: h.cosineSimilarity,
          bestScore: h.score,
          hitCount: 1,
          topPages: [pageEntry],
        });
      } else {
        existing.hitCount += 1;
        if (existing.topPages.length < 4) {
          existing.topPages.push(pageEntry);
        }
      }
    }
    return [...groups.values()].slice(0, 6);
  }

  private mapStoredRow(row: Record<string, unknown>): StoredItem {
    let parsedMeta: Record<string, unknown> = {};
    if (typeof row.metadata === "string") {
      try {
        parsedMeta = JSON.parse(row.metadata) as Record<string, unknown>;
      } catch {
        parsedMeta = {};
      }
    }
    return {
      id: String(row.id ?? ""),
      title: String(row.title ?? ""),
      content: String(row.content ?? ""),
      modality: String(row.modality ?? "text") as Modality,
      category: String(row.category ?? "general"),
      language: String(row.language ?? "en"),
      imageDataUrl: row.image_data_url ? String(row.image_data_url) : null,
      audioDataUrl: row.audio_data_url ? String(row.audio_data_url) : null,
      metadata: parsedMeta,
      createdAt: String(row.created_at ?? ""),
    };
  }
}
