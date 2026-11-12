import { l2Normalize, type MrlDim } from "./mrl.ts";

export type EmbedInputItem =
  | string
  | {
      text?: string;
      image?: string;
      audio?: string;
    };

export interface EmbedBatchResult {
  embeddings: Float32Array[];
  durationMs: number;
  model: string;
}

export interface OllamaHealth {
  ok: boolean;
  baseUrl: string;
  model: string;
  version?: string;
  modelAvailable: boolean;
  installedModels: string[];
  error?: string;
}

export interface Embedder {
  readonly model: string;
  embed(inputs: EmbedInputItem[], options?: { dimensions?: MrlDim }): Promise<EmbedBatchResult>;
  health(): Promise<OllamaHealth>;
}

interface OllamaEmbedResponse {
  model?: string;
  embeddings?: number[][];
  total_duration?: number;
  error?: string;
}

export class OllamaEmbedder implements Embedder {
  readonly baseUrl: string;
  readonly model: string;

  constructor(options: { baseUrl: string; model: string }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.model = options.model;
  }

  async embed(
    inputs: EmbedInputItem[],
    options?: { dimensions?: MrlDim },
  ): Promise<EmbedBatchResult> {
    if (inputs.length === 0) {
      return { embeddings: [], durationMs: 0, model: this.model };
    }
    const started = performance.now();
    const payload: Record<string, unknown> = {
      model: this.model,
      input: inputs.length === 1 ? inputs[0] : inputs,
    };
    if (options?.dimensions) {
      payload.dimensions = options.dimensions;
    }

    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as OllamaEmbedResponse;
    if (!res.ok || data.error) {
      throw new Error(
        `Ollama /api/embed failed (${res.status}): ${data.error ?? res.statusText}`,
      );
    }
    if (!Array.isArray(data.embeddings) || data.embeddings.length !== inputs.length) {
      throw new Error(
        `Expected ${inputs.length} embeddings from Ollama, received ${data.embeddings?.length ?? 0}`,
      );
    }

    const durationMs = performance.now() - started;
    return {
      embeddings: data.embeddings.map((row) => l2Normalize(row)),
      durationMs,
      model: data.model ?? this.model,
    };
  }

  async health(): Promise<OllamaHealth> {
    try {
      const [verRes, tagsRes] = await Promise.all([
        fetch(`${this.baseUrl}/api/version`),
        fetch(`${this.baseUrl}/api/tags`),
      ]);
      if (!verRes.ok || !tagsRes.ok) {
        return {
          ok: false,
          baseUrl: this.baseUrl,
          model: this.model,
          modelAvailable: false,
          installedModels: [],
          error: `HTTP ${verRes.status} / ${tagsRes.status}`,
        };
      }
      const verJson = (await verRes.json()) as { version?: string };
      const tagsJson = (await tagsRes.json()) as { models?: Array<{ name: string }> };
      const installedModels = (tagsJson.models ?? []).map((m) => m.name);
      const baseName = this.model.split(":")[0] ?? this.model;
      const modelAvailable = installedModels.some(
        (m) => m === this.model || m.startsWith(`${baseName}:`),
      );
      return {
        ok: true,
        baseUrl: this.baseUrl,
        model: this.model,
        version: verJson.version,
        modelAvailable,
        installedModels,
      };
    } catch (error) {
      return {
        ok: false,
        baseUrl: this.baseUrl,
        model: this.model,
        modelAvailable: false,
        installedModels: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Strips common data URL prefixes (`data:image/png;base64,...`) so raw base64 can be sent to Ollama.
 */
export function stripDataUrlPrefix(input: string): string {
  const idx = input.indexOf("base64,");
  return idx >= 0 ? input.slice(idx + "base64,".length).trim() : input.trim();
}
