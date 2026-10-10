import {
  AutoModel,
  AutoTokenizer,
  env,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  type Tensor,
} from "@huggingface/transformers";
import { EMBEDDING_DIMENSIONS } from "./db.ts";

// EmbeddingGemma expects task-specific prefixes.
// https://ai.google.dev/gemma/docs/embeddinggemma/model_card#prompt-instructions
const QUERY_PREFIX = "task: search result | query: ";
const documentPrefix = (title: string) => `title: ${title} | text: `;

export interface EmbeddingDocument {
  title: string;
  text: string;
}

export interface Embedder {
  embedQuery(query: string): Promise<Float32Array>;
}

export class LocalEmbedder implements Embedder {
  private readonly tokenizer: PreTrainedTokenizer;
  private readonly model: PreTrainedModel;

  private constructor(tokenizer: PreTrainedTokenizer, model: PreTrainedModel) {
    this.tokenizer = tokenizer;
    this.model = model;
  }

  static async load(options: {
    model: string;
    dtype: "fp32" | "q8" | "q4";
    cacheDir: string;
  }): Promise<LocalEmbedder> {
    env.cacheDir = options.cacheDir;
    const tokenizer = await AutoTokenizer.from_pretrained(options.model);
    const model = await AutoModel.from_pretrained(options.model, {
      dtype: options.dtype,
      device: "cpu",
    });
    return new LocalEmbedder(tokenizer, model);
  }

  async embedQuery(query: string): Promise<Float32Array> {
    const [vector] = await this.embed([QUERY_PREFIX + query]);
    if (!vector) throw new Error("Embedding model returned no vector");
    return vector;
  }

  async embedDocuments(
    documents: EmbeddingDocument[],
  ): Promise<Float32Array[]> {
    return this.embed(documents.map((d) => documentPrefix(d.title) + d.text));
  }

  private async embed(texts: string[]): Promise<Float32Array[]> {
    const inputs = this.tokenizer(texts, { padding: true, truncation: true });
    const output = (await this.model(inputs)) as { sentence_embedding: Tensor };
    const [rows, dims] = output.sentence_embedding.dims as [number, number];
    if (dims !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Expected ${EMBEDDING_DIMENSIONS}-dim embeddings, got ${dims}`,
      );
    }
    const data = output.sentence_embedding.data as Float32Array;
    return Array.from({ length: rows }, (_, i) =>
      normalize(data.slice(i * dims, (i + 1) * dims)),
    );
  }
}

function normalize(vector: Float32Array): Float32Array {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return vector.map((value) => value / norm);
}
