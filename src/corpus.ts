import { buildSyntheticAudioClips } from "./audio.ts";
import { buildSyntheticScenes, buildVisualDocuments } from "./images.ts";
import type { Modality } from "./store.ts";

export interface RawCorpusDoc {
  id: string;
  title: string;
  content: string;
  modality: Modality;
  category: string;
  language: string;
  imageBase64?: string;
  imageDataUrl?: string;
  audioBase64?: string;
  audioDataUrl?: string;
  groundTruthNote?: string;
}

export interface EvalQuery {
  id: string;
  query: string;
  expectedIds: string[];
  distractorId?: string;
  intent:
    | "semantic"
    | "document_qa"
    | "lexical_hybrid"
    | "code"
    | "homonym"
    | "multilingual";
  recommendedPrefix: "search_query" | "code_query" | "question_answering";
  notes: string;
}

export interface CrossModalQuery {
  id: string;
  query: string;
  targetModality: "image" | "visdoc" | "audio";
  expectedId: string;
  recommendedPrefix?: "search_query" | "question_answering";
}

export function buildReferenceCorpus(): RawCorpusDoc[] {
  const scenes = buildSyntheticScenes(160);
  const visDocs = buildVisualDocuments();
  const audioClips = buildSyntheticAudioClips();

  const docs: RawCorpusDoc[] = [
    // --- Full Multi-Section Structured Documents (`document` modality) ---
    {
      id: "doc-adr-014",
      title: "ADR-014: Migrating Settlement Deduplication to UUIDv7 Keys",
      modality: "document",
      category: "architecture-decision",
      language: "en",
      content: `# ADR-014: Settlement Deduplication & Replay Window

- **Status:** Accepted (2026-10-18)
- **Owners:** Payments Core, Ledger Platform
- **Supersedes:** ADR-003 (Random UUIDv4 Redis Locks)

## Context
During mobile subway handoffs, checkout clients retry \`POST /v2/ledger/settlements\` up to four times within 900ms. Random UUIDv4 keys fragmented our B-tree index page cache by 63% and lacked monotonic ordering for audit compaction.

## Decision
1. Clients must generate time-ordered **UUIDv7** tokens in header \`X-Focus-Idempotency-Token\`.
2. Active settlement locks live in Redis for a **24-hour** hot replay window, then compact into cold Parquet partitions keyed by the 48-bit Unix millisecond prefix.
3. Payload SHA-256 mismatches under the same token immediately return \`HTTP 422 Unprocessable Entity\` rather than replaying the earlier receipt.

## Consequences
B-tree page splits fell by 4.1x in shadow benchmarks; client SDKs older than \`v3.4.0\` require the gateway shim.`,
    },
    {
      id: "doc-postmortem-209",
      title: "Postmortem #209: EU-West Reverse Proxy Keep-Alive Desync",
      modality: "document",
      category: "incident-postmortem",
      language: "en",
      content: `# Incident Postmortem #209: Checkout 502 Spike in eu-west-1

- **Date:** 2026-09-29 · **Duration:** 19 minutes · **Severity:** SEV-2
- **Impact:** 1.84% of API mutations failed before reaching application pods.

## Root Cause
An infrastructure Terraform bump raised Envoy's upstream \`idle_timeout\` to **65 seconds** while the Bun HTTP origin server kept \`idleTimeout = 60\` seconds. Whenever a pooled connection sat idle between 60.0s and 65.0s, the origin sent a \`TCP FIN\` at the exact millisecond Envoy flushed a new \`POST\` header frame, surfacing \`ERR_UPSTREAM_RST_499\`.

## Remediation
1. Enforced invariant: \`origin_keepalive_timeout >= proxy_idle_timeout + 10s\` in CI policy checks.
2. Added idempotent retry only for \`GET\`/\`HEAD\`; \`POST\` callers rely on \`X-Focus-Idempotency-Token\`.`,
    },
    {
      id: "doc-rfc-008",
      title: "RFC-008: On-Device Hybrid Vector Search with Matryoshka SQLite",
      modality: "document",
      category: "engineering-rfc",
      language: "en",
      content: `# RFC-008: Embedded Multimodal Retrieval Without a Cloud Vector DB

- **Stage:** Ratified · **Target Footprint:** < 120 MB RAM on laptops

## Summary
Desktop and CLI tools shouldn't require provisioning a remote vector cluster just to search 50,000 local notes, screenshots, and voice memos. We pair **EmbeddingGemma 2** (768d unified text/vision/audio vectors) with a single **libSQL** SQLite file.

## Storage & Tiering Strategy
- **Hot RAM Index:** Store truncated **256d Matryoshka** (\`F32_BLOB(256)\`, 1,024 bytes/item) in a DiskANN cosine graph—cutting memory 3x with < 2% recall loss.
- **Exact Rerank & Cold Archive:** Keep full \`768d\` vectors on disk only when auditing subtle cross-modal rankings, and fuse \`FTS5\` \`bm25()\` scores via Reciprocal Rank Fusion (\`k = 12\`).`,
    },

    // --- Semantic & Homonym Disambiguation Notes (`text` modality) ---
    {
      id: "doc-jvm-gc",
      title: "JVM ZGC Generational Pause Tuning",
      content:
        "Java's generational ZGC collects young and old heap regions concurrently using colored pointers and load barriers, keeping stop-the-world garbage collection pauses below a millisecond under high allocation rates.",
      modality: "text",
      category: "systems",
      language: "en",
    },
    {
      id: "doc-java-coffee",
      title: "Volcanic Arabica Cultivation in East Java",
      content:
        "High-altitude estates on the Ijen plateau of Java harvest wet-hulled Arabica coffee cherries grown in mineral-rich volcanic soil, producing a heavy-bodied cup with dark cocoa and spice notes.",
      modality: "text",
      category: "agriculture",
      language: "en",
    },
    {
      id: "doc-mercury-planet",
      title: "Perihelion Precession of Innermost Planet",
      content:
        "Mercury completes an eccentric solar orbit every 88 Earth days; general relativity explains the extra 43 arcseconds per century of perihelion shift caused by spacetime curvature near the Sun.",
      modality: "text",
      category: "astronomy",
      language: "en",
    },
    {
      id: "doc-mercury-metal",
      title: "Liquid Quicksilver Barometers and Amalgamation",
      content:
        "Elemental mercury (Hg) remains a dense silvery liquid at room temperature with high surface tension, historically used in Torricelli barometers, thermometers, and gold-ore amalgamation.",
      modality: "text",
      category: "chemistry",
      language: "en",
    },
    {
      id: "doc-python-snake",
      title: "Infrared Pit Organs in Reticulated Constrictors",
      content:
        "Arboreal pythons ambush warm-blooded prey in tropical rainforests using labial thermoreceptive pits and muscular constriction rather than venom.",
      modality: "text",
      category: "biology",
      language: "en",
    },
    {
      id: "doc-sqlite-wal",
      title: "SQLite Write-Ahead Logging Concurrency",
      content:
        "Enabling PRAGMA journal_mode=WAL appends committed pages to a separate write-ahead log file so multiple readers can query consistent snapshots concurrently while a single writer appends transactions.",
      modality: "text",
      category: "databases",
      language: "en",
    },
    {
      id: "doc-mrl-theory",
      title: "Matryoshka Representation Learning Nested Prefixes",
      content:
        "Multi-granularity contrastive loss trains the leading k coordinates (128, 256, 512, 768) of a single dense vector to form coarse-to-fine subspaces that remain accurate after slicing and L2 renormalization.",
      modality: "text",
      category: "ml",
      language: "en",
    },
    {
      id: "doc-err-socket",
      title: "Proxy Socket Runbook (ERR_UPSTREAM_RST_499)",
      content:
        "Incident runbook for edge gateway fault ERR_UPSTREAM_RST_499: occurs when reverse proxy idle_timeout exceeds backend keepalive_timeout, reusing a half-closed TCP socket on header flush.",
      modality: "text",
      category: "runbook",
      language: "en",
    },
    {
      id: "doc-err-socket-524",
      title: "Proxy Socket Runbook (ERR_UPSTREAM_RST_524)",
      content:
        "Incident runbook for edge gateway fault ERR_UPSTREAM_RST_524: occurs when reverse proxy idle_timeout exceeds backend keepalive_timeout, reusing a half-closed TCP socket on payload flush.",
      modality: "text",
      category: "runbook",
      language: "en",
    },
    {
      id: "doc-idempotency-hdr",
      title: "Payment Mutation Deduplication (X-Focus-Idempotency-Token)",
      content:
        "All POST /v2/ledger/settlements callers must supply header X-Focus-Idempotency-Token (UUIDv7) retained in Redis for 24h so retried network timeouts return the original ledger receipt.",
      modality: "text",
      category: "api",
      language: "en",
    },

    // --- Code Snippets (`code` modality) ---
    {
      id: "code-ts-ratelimit",
      title: "src/ratelimit/tokenBucket.ts",
      content: `export class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;
  constructor(private readonly capacity: number, private readonly refillPerSec: number) {
    this.tokens = capacity;
    this.lastRefillMs = performance.now();
  }
  consume(cost = 1): boolean {
    const now = performance.now();
    const elapsed = (now - this.lastRefillMs) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
    this.lastRefillMs = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}`,
      modality: "code",
      category: "typescript",
      language: "ts",
    },
    {
      id: "code-py-backoff",
      title: "retry/jitter_backoff.py",
      content: `import asyncio, random

async def retry_with_full_jitter(fn, max_attempts: int = 5, base_delay: float = 0.2):
    for attempt in range(max_attempts):
        try:
            return await fn()
        except TransientHttpError as exc:
            if exc.status not in (429, 502, 503, 504) or attempt == max_attempts - 1:
                raise
            cap = base_delay * (2 ** attempt)
            await asyncio.sleep(random.uniform(0, cap))`,
      modality: "code",
      category: "python",
      language: "py",
    },
    {
      id: "code-sql-cte",
      title: "queries/org_hierarchy_cte.sql",
      content: `WITH RECURSIVE org_tree AS (
  SELECT id, manager_id, full_name, 0 AS depth
  FROM employees
  WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, e.manager_id, e.full_name, t.depth + 1
  FROM employees e
  JOIN org_tree t ON e.manager_id = t.id
)
SELECT id, full_name, depth FROM org_tree ORDER BY depth, full_name;`,
      modality: "code",
      category: "sql",
      language: "sql",
    },
    {
      id: "code-rs-ringbuf",
      title: "src/ring_buffer.rs",
      content: `pub struct RingBuffer<T> {
    buf: Vec<Option<T>>,
    head: usize,
    tail: usize,
    len: usize,
}
impl<T> RingBuffer<T> {
    pub fn push_overwrite(&mut self, item: T) {
        let cap = self.buf.len();
        self.buf[self.tail] = Some(item);
        self.tail = (self.tail + 1) % cap;
        if self.len == cap { self.head = (self.head + 1) % cap; } else { self.len += 1; }
    }
}`,
      modality: "code",
      category: "rust",
      language: "rs",
    },
    {
      id: "code-ts-rrf",
      title: "src/search/rrfFusion.ts",
      content: `export function reciprocalRankFusion(rankings: string[][], k = 60): Array<[string, number]> {
  const scores = new Map<string, number>();
  for (const list of rankings) {
    list.forEach((docId, idx) => {
      scores.set(docId, (scores.get(docId) ?? 0) + 1 / (k + idx + 1));
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]);
}`,
      modality: "code",
      category: "typescript",
      language: "ts",
    },

    // --- Multilingual Docs (Cross-Lingual Retrieval) ---
    {
      id: "doc-es-solar",
      title: "Almacenamiento Térmico en Sales Fundidas",
      content:
        "Las plantas termosolares almacenan calor diurno en tanques de nitrato de sodio y potasio fundido a 565 grados Celsius para generar electricidad con turbinas de vapor durante toda la noche.",
      modality: "text",
      category: "energy",
      language: "es",
    },
    {
      id: "doc-ja-shinkansen",
      title: "新幹線の早期地震検知システム (UrEDAS)",
      content:
        "海岸沿いの地震計が初期微動（P波）を検知すると、主要動（S波）が到達する前に送電を自動遮断し、営業運転中の高速列車に非常ブレーキをかける安全システムです。",
      modality: "text",
      category: "engineering",
      language: "ja",
    },
    {
      id: "doc-fr-fermentation",
      title: "Levain Naturel et Hydratation de la Pâte",
      content:
        "Une fermentation lente à froid avec un levain sauvage développe des acides lactiques et acétiques complexes tout en améliorant la digestibilité du gluten et l'alvéolage de la mie.",
      modality: "text",
      category: "culinary",
      language: "fr",
    },
  ];

  // Pure visual PNG scenes (`image` modality — no text drawn or indexed)
  for (const scene of scenes) {
    docs.push({
      id: scene.id,
      title: scene.title,
      content: "",
      modality: "image",
      category: "visual-scene",
      language: "visual",
      imageBase64: scene.pngBase64,
      imageDataUrl: scene.dataUrl,
      groundTruthNote: scene.groundTruthCaption,
    });
  }

  // Scanned Visual Documents (`visdoc` modality — bitmap pixel typography, zero OCR / zero SQLite text)
  for (const vd of visDocs) {
    docs.push({
      id: vd.id,
      title: vd.title,
      content: "",
      modality: "visdoc",
      category: "scanned-doc",
      language: "visdoc",
      imageBase64: vd.pngBase64,
      imageDataUrl: vd.dataUrl,
      groundTruthNote: vd.groundTruthSummary,
    });
  }

  // Synthesized 16kHz PCM WAV clips (`audio` modality — embedded via 300M audio encoder)
  for (const clip of audioClips) {
    docs.push({
      id: clip.id,
      title: clip.title,
      content: "",
      modality: "audio",
      category: "acoustic-wav",
      language: "audio",
      audioBase64: clip.wavBase64,
      audioDataUrl: clip.audioDataUrl,
      groundTruthNote: clip.groundTruthDescription,
    });
  }

  return docs;
}

export const BENCHMARK_QUERIES: readonly EvalQuery[] = [
  {
    id: "q-sem-1",
    query: "how to allow simultaneous database reads while writing without locking readers",
    expectedIds: ["doc-sqlite-wal"],
    intent: "semantic",
    recommendedPrefix: "search_query",
    notes: "Zero exact keyword overlap with PRAGMA journal_mode=WAL",
  },
  {
    id: "q-sem-2",
    query: "cutting embedding dimensions down to save memory while keeping accuracy",
    expectedIds: ["doc-mrl-theory", "doc-rfc-008"],
    intent: "semantic",
    recommendedPrefix: "search_query",
    notes: "Paraphrase of Matryoshka Representation Learning",
  },
  {
    id: "q-doc-1",
    query: "what HTTP status is returned if a retried settlement token has a different payload hash?",
    expectedIds: ["doc-adr-014"],
    intent: "document_qa",
    recommendedPrefix: "question_answering",
    notes: "Retrieves multi-section ADR-014 answering HTTP 422 Unprocessable Entity",
  },
  {
    id: "q-doc-2",
    query: "why did Envoy 65s timeout vs Bun 60s timeout cause checkout 502 failures in eu-west-1?",
    expectedIds: ["doc-postmortem-209"],
    intent: "document_qa",
    recommendedPrefix: "question_answering",
    notes: "Retrieves Incident Postmortem #209 root-cause analysis",
  },
  {
    id: "q-hom-1",
    query: "java memory heap pause latency",
    expectedIds: ["doc-jvm-gc"],
    distractorId: "doc-java-coffee",
    intent: "homonym",
    recommendedPrefix: "search_query",
    notes: "Disambiguates JVM memory from Java island coffee",
  },
  {
    id: "q-hom-2",
    query: "mercury solar orbit relativity shift",
    expectedIds: ["doc-mercury-planet"],
    distractorId: "doc-mercury-metal",
    intent: "homonym",
    recommendedPrefix: "search_query",
    notes: "Disambiguates planet Mercury from liquid Hg metal",
  },
  {
    id: "q-lex-1",
    query: "ERR_UPSTREAM_RST_499",
    expectedIds: ["doc-err-socket", "doc-postmortem-209"],
    distractorId: "doc-err-socket-524",
    intent: "lexical_hybrid",
    recommendedPrefix: "search_query",
    notes: "Exact error code separating 499 from near-identical 524 sibling runbook",
  },
  {
    id: "q-lex-2",
    query: "X-Focus-Idempotency-Token header",
    expectedIds: ["doc-idempotency-hdr", "doc-adr-014"],
    intent: "lexical_hybrid",
    recommendedPrefix: "search_query",
    notes: "Exact custom HTTP header lookup across API note and ADR-014",
  },
  {
    id: "q-code-1",
    query: "throttle burst requests by refilling capacity over elapsed time",
    expectedIds: ["code-ts-ratelimit"],
    intent: "code",
    recommendedPrefix: "code_query",
    notes: "Natural language description to TypeScript TokenBucket class",
  },
  {
    id: "q-code-2",
    query: "exponential retry delay with random jitter on HTTP 429 or 503",
    expectedIds: ["code-py-backoff"],
    distractorId: "doc-python-snake",
    intent: "code",
    recommendedPrefix: "code_query",
    notes: "Async Python backoff implementation",
  },
  {
    id: "q-code-3",
    query: "traverse manager employee tree hierarchy with depth in SQL",
    expectedIds: ["code-sql-cte"],
    intent: "code",
    recommendedPrefix: "code_query",
    notes: "Maps tree traversal description to WITH RECURSIVE SQL CTE",
  },
  {
    id: "q-code-4",
    query: "fixed capacity circular queue overwriting oldest element",
    expectedIds: ["code-rs-ringbuf"],
    intent: "code",
    recommendedPrefix: "code_query",
    notes: "Maps circular queue concept to Rust RingBuffer",
  },
  {
    id: "q-multi-1",
    query: "storing daytime solar heat in molten salt tanks to generate power at night",
    expectedIds: ["doc-es-solar"],
    intent: "multilingual",
    recommendedPrefix: "search_query",
    notes: "English query retrieving Spanish energy engineering article",
  },
  {
    id: "q-multi-2",
    query: "automatic bullet train emergency braking triggered by P-wave earthquake sensors",
    expectedIds: ["doc-ja-shinkansen"],
    intent: "multilingual",
    recommendedPrefix: "search_query",
    notes: "English query retrieving Japanese Shinkansen safety note",
  },
  {
    id: "q-multi-3",
    query: "cold slow sourdough bread fermentation lactic acid and crumb texture",
    expectedIds: ["doc-fr-fermentation"],
    intent: "multilingual",
    recommendedPrefix: "search_query",
    notes: "English query retrieving French sourdough baking note",
  },
] as const;

export const CROSS_MODAL_QUERIES: readonly CrossModalQuery[] = [
  // Pure Visual Scenes (`image`)
  {
    id: "cm-stop",
    query: "red octagonal warning stop sign with white bar",
    targetModality: "image",
    expectedId: "img-stop-sign",
  },
  {
    id: "cm-sunset",
    query: "bright yellow orange sun setting over blue ocean waves",
    targetModality: "image",
    expectedId: "img-ocean-sunset",
  },
  {
    id: "cm-tree",
    query: "green pine tree in grassy field under blue sky",
    targetModality: "image",
    expectedId: "img-pine-tree",
  },
  {
    id: "cm-chart",
    query: "blue rising vertical bar chart graph on white background",
    targetModality: "image",
    expectedId: "img-bar-chart",
  },
  {
    id: "cm-code",
    query: "dark computer terminal window with green source code lines",
    targetModality: "image",
    expectedId: "img-terminal-code",
  },
  // Scanned Visual Documents (`visdoc` — OCR-free pixel reading)
  {
    id: "vd-invoice",
    query: "How much was paid on invoice 4082 for Nebula H200 GPU nodes?",
    targetModality: "visdoc",
    expectedId: "visdoc-invoice-4082",
    recommendedPrefix: "question_answering",
  },
  {
    id: "vd-slo",
    query: "What was the Redis Cache P99 latency in milliseconds during the SLO breach?",
    targetModality: "visdoc",
    expectedId: "visdoc-slo-redis",
    recommendedPrefix: "question_answering",
  },
  {
    id: "vd-arr",
    query: "What is the Q3 annual recurring revenue ARR and net retention percentage?",
    targetModality: "visdoc",
    expectedId: "visdoc-q3-arr",
    recommendedPrefix: "question_answering",
  },
  // Acoustic WAV Audio (`audio` — 300M audio encoder)
  {
    id: "au-siren",
    query: "loud alternating high-low emergency alarm siren",
    targetModality: "audio",
    expectedId: "audio-siren",
  },
  {
    id: "au-surf",
    query: "continuous wind static ocean waves white noise",
    targetModality: "audio",
    expectedId: "audio-surf",
  },
  {
    id: "au-chime",
    query: "musical ascending bell chime melody notes",
    targetModality: "audio",
    expectedId: "audio-chime",
  },
] as const;
