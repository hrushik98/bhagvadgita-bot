import { API_URL } from "./api-url";

export class ApiRequestError extends Error {}

/** POSTs JSON to the API and yields the server-sent events of the response. */
export async function* postEventStream<T>(
  path: string,
  body: unknown,
  signal: AbortSignal,
): AsyncGenerator<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiRequestError(
      "Can't reach the Gita Guide server. Is the API running?",
    );
  }

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new ApiRequestError(
      payload?.error ?? `Request failed (${response.status})`,
    );
  }

  // A reader loop rather than `for await`, which not every browser supports on streams.
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) yield JSON.parse(data) as T;
    }
  }
}
