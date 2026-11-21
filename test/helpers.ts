/** A fake `fetch` that records requests and replays scripted responses. */
export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

export type Scripted = Response | Error | ((req: RecordedRequest) => Response | Error);

export function fakeFetch(...script: Scripted[]) {
  const requests: RecordedRequest[] = [];
  const impl = async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const req: RecordedRequest = {
      url,
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    requests.push(req);
    const next = script.shift();
    if (next === undefined) throw new Error(`fakeFetch: no scripted response for ${req.method} ${url}`);
    const out = typeof next === "function" ? next(req) : next;
    if (out instanceof Error) throw out;
    return out;
  };
  return { fetch: impl as typeof fetch, requests };
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

export function errorResponse(status: number, detail: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** A streaming response whose body is delivered in the given chunks, to exercise line splitting across chunk boundaries. */
export function chunkedResponse(chunks: string[], init: ResponseInit = {}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, ...init });
}

export function parseForm(body: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new URLSearchParams(body ?? "").forEach((v, k) => (out[k] = v));
  return out;
}
