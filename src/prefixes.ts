export type TaskPrefixMode =
  | "none"
  | "search_query"
  | "search_document"
  | "code_query"
  | "classification"
  | "clustering"
  | "similarity"
  | "question_answering"
  | "fact_checking";

export interface PrefixMeta {
  mode: TaskPrefixMode;
  label: string;
  template: string;
}

export const TASK_PREFIXES: readonly PrefixMeta[] = [
  { mode: "none", label: "Raw (no prefix)", template: "{text}" },
  { mode: "search_query", label: "Search Query", template: "task: search result | query: {text}" },
  {
    mode: "search_document",
    label: "Search Document",
    template: "title: {title} | text: {text}",
  },
  { mode: "code_query", label: "Code Retrieval", template: "task: code retrieval | query: {text}" },
  { mode: "similarity", label: "Sentence Similarity", template: "task: sentence similarity | query: {text}" },
  { mode: "classification", label: "Classification", template: "task: classification | query: {text}" },
  { mode: "clustering", label: "Clustering", template: "task: clustering | query: {text}" },
  {
    mode: "question_answering",
    label: "Question Answering",
    template: "task: question answering | query: {text}",
  },
  { mode: "fact_checking", label: "Fact Checking", template: "task: fact checking | query: {text}" },
] as const;

/**
 * Formats input text with EmbeddingGemma 2's task-steered instruction prefix.
 */
export function formatWithTaskPrefix(
  text: string,
  mode: TaskPrefixMode,
  title?: string,
): string {
  const clean = text.trim();
  switch (mode) {
    case "none":
      return clean;
    case "search_query":
      return `task: search result | query: ${clean}`;
    case "search_document":
      return `title: ${title?.trim() || "none"} | text: ${clean}`;
    case "code_query":
      return `task: code retrieval | query: ${clean}`;
    case "classification":
      return `task: classification | query: ${clean}`;
    case "clustering":
      return `task: clustering | query: ${clean}`;
    case "similarity":
      return `task: sentence similarity | query: ${clean}`;
    case "question_answering":
      return `task: question answering | query: ${clean}`;
    case "fact_checking":
      return `task: fact checking | query: ${clean}`;
  }
}
