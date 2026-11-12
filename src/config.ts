export interface AppConfig {
  ollamaBaseUrl: string;
  embeddingModel: string;
  dbUrl: string;
  port: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const portRaw = Number.parseInt(env.PORT ?? "3456", 10);
  return {
    ollamaBaseUrl: (env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, ""),
    embeddingModel: env.EMBEDDING_MODEL ?? "embeddinggemma-2:latest",
    dbUrl: env.DB_URL ?? "file:data/embeddings.db",
    port: Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 3456,
  };
}
