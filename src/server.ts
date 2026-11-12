import { createAppHandler } from "./app.ts";
import { loadConfig } from "./config.ts";
import { OllamaEmbedder } from "./ollama.ts";
import { VectorStore } from "./store.ts";

const config = loadConfig();
const store = new VectorStore(config.dbUrl);
await store.init();

const embedder = new OllamaEmbedder({
  baseUrl: config.ollamaBaseUrl,
  model: config.embeddingModel,
});

const fetchHandler = createAppHandler({
  store,
  embedder,
  ollamaBaseUrl: config.ollamaBaseUrl,
});

const server = Bun.serve({
  port: config.port,
  fetch: fetchHandler,
});

console.log(
  `EmbeddingGemma 2 Lab running at http://127.0.0.1:${server.port} (model=${config.embeddingModel}, db=${config.dbUrl})`,
);
