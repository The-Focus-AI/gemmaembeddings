export const MRL_DIMS = [768, 512, 256, 128] as const;
export type MrlDim = (typeof MRL_DIMS)[number];

export function isMrlDim(value: number): value is MrlDim {
  return (MRL_DIMS as readonly number[]).includes(value);
}

/**
 * L2-normalizes a vector so dot product equals cosine similarity.
 * Returns a new Float32Array.
 */
export function l2Normalize(vec: ArrayLike<number>): Float32Array {
  const len = vec.length;
  const out = new Float32Array(len);
  let sumSq = 0;
  for (let i = 0; i < len; i++) {
    const v = vec[i] ?? 0;
    sumSq += v * v;
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0) {
    return out;
  }
  const inv = 1 / norm;
  for (let i = 0; i < len; i++) {
    out[i] = (vec[i] ?? 0) * inv;
  }
  return out;
}

/**
 * Truncates a full 768d EmbeddingGemma 2 vector to a Matryoshka dimension
 * (768, 512, 256, or 128) and L2-renormalizes per Google DeepMind MRL spec.
 */
export function truncateMrl(vec: ArrayLike<number>, dim: MrlDim): Float32Array {
  if (vec.length < dim) {
    throw new Error(`Cannot truncate vector of length ${vec.length} to ${dim}d`);
  }
  const sliced = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    sliced[i] = vec[i] ?? 0;
  }
  return l2Normalize(sliced);
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Formats a Float32Array as a JSON array string accepted by libSQL `vector32('[...]')`.
 */
export function toVector32Json(vec: ArrayLike<number>): string {
  const parts = new Array<string>(vec.length);
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i] ?? 0;
    parts[i] = Number.isFinite(v) ? v.toFixed(7) : "0";
  }
  return `[${parts.join(",")}]`;
}

export function storageBytesForDim(dim: MrlDim, vectorCount = 1): number {
  return dim * 4 * vectorCount;
}
