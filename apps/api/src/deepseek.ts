import type { ChatRole } from "@gita/shared";

export interface LlmMessage {
  role: "system" | ChatRole;
  content: string;
}

export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export interface CompletionOptions {
  messages: LlmMessage[];
  /** "none" disables thinking entirely. */
  reasoningEffort: ReasoningEffort;
  maxTokens?: number;
  /** Ask for a JSON object response. The prompt must mention JSON. */
  json?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type StreamChunk =
  | { type: "reasoning"; text: string }
  | { type: "content"; text: string };

export interface LlmClient {
  stream(options: CompletionOptions): AsyncGenerator<StreamChunk>;
  complete(options: CompletionOptions): Promise<string>;
}

export class LlmError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "LlmError";
    this.status = status;
  }
}

interface ChatCompletionChunk {
  choices?: {
    delta?: { content?: string | null; reasoning_content?: string | null };
  }[];
}

/** Minimal client for DeepSeek's OpenAI-compatible chat completions API. */
export class DeepSeekClient implements LlmClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(options: { apiKey: string; baseUrl: string; model: string }) {
    if (!options.apiKey) {
      throw new Error("DEEPSEEK_API_KEY is not set. Add it to apps/api/.env");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.model = options.model;
  }

  async *stream(options: CompletionOptions): AsyncGenerator<StreamChunk> {
    const response = await this.request(options, true);
    if (!response.body)
      throw new LlmError("DeepSeek returned an empty response");

    let buffer = "";
    for await (const text of response.body.pipeThrough(
      new TextDecoderStream(),
    )) {
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const data = line.startsWith("data:") ? line.slice(5).trim() : null;
        if (!data) continue;
        if (data === "[DONE]") return;
        const delta = (JSON.parse(data) as ChatCompletionChunk).choices?.[0]
          ?.delta;
        if (delta?.reasoning_content)
          yield { type: "reasoning", text: delta.reasoning_content };
        if (delta?.content) yield { type: "content", text: delta.content };
      }
    }
  }

  async complete(options: CompletionOptions): Promise<string> {
    const response = await this.request(options, false);
    const body = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    return body.choices?.[0]?.message?.content?.trim() ?? "";
  }

  private async request(
    options: CompletionOptions,
    stream: boolean,
  ): Promise<Response> {
    const thinking =
      options.reasoningEffort === "none"
        ? { thinking: { type: "disabled" } }
        : { reasoning_effort: options.reasoningEffort };

    const signals = [AbortSignal.timeout(options.timeoutMs ?? 120_000)];
    if (options.signal) signals.push(options.signal);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: options.messages,
        max_tokens: options.maxTokens,
        stream,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
        ...thinking,
      }),
      signal: AbortSignal.any(signals),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new LlmError(
        `DeepSeek request failed (${response.status}): ${detail.slice(0, 500)}`,
        response.status,
      );
    }
    return response;
  }
}
