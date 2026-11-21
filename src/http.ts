import { DatabentoError, DatabentoHttpError, DatabentoValidationError } from "./errors.js";

export const DEFAULT_GATEWAY = "https://hist.databento.com";
export const API_VERSION = 0;

/** Options accepted by {@link Historical}. */
export interface ClientOptions {
  /** API key. Defaults to `process.env.DATABENTO_API_KEY` when running under Node. */
  key?: string | undefined;
  /** Gateway base URL. Defaults to {@link DEFAULT_GATEWAY}. */
  gateway?: string | undefined;
  /** `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch | undefined;
  /** Per-request timeout in milliseconds. Defaults to 100 000. Set to 0 to disable. */
  timeoutMs?: number | undefined;
  /** How many times to retry a request that failed with 429, 502, 503, 504 or a network error. Defaults to 2. */
  maxRetries?: number | undefined;
  /** Base delay for retries in milliseconds, doubled each attempt, capped at 30 s. Honors `Retry-After` when present. Defaults to 500. */
  retryBaseMs?: number | undefined;
  /** Receives warnings the gateway sends in its `X-Warning` header. Defaults to `console.warn`. */
  onWarning?: ((warning: string) => void) | undefined;
  /** `User-Agent` sent with each request. */
  userAgent?: string | undefined;
}

export interface RequestOptions {
  signal?: AbortSignal | undefined;
}

type Query = Record<string, string | undefined>;

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/**
 * Thin transport over `fetch`: basic auth, query and form encoding, timeouts,
 * retries, warning headers and error mapping. Everything above it is pure
 * parameter shaping.
 */
export class HttpTransport {
  readonly gateway: string;
  private readonly authorization: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly onWarning: (warning: string) => void;
  private readonly userAgent: string;

  constructor(options: ClientOptions = {}) {
    const key = options.key ?? readEnvKey();
    if (!key) {
      throw new DatabentoValidationError(
        "No API key. Pass `key` or set DATABENTO_API_KEY. Keys come from https://databento.com/portal/keys",
      );
    }
    if (key === "YOUR_API_KEY") {
      throw new DatabentoValidationError("The API key is still the placeholder YOUR_API_KEY");
    }
    this.gateway = (options.gateway ?? DEFAULT_GATEWAY).replace(/\/+$/, "");
    // The gateway uses HTTP basic auth with the key as the username and an empty password.
    this.authorization = `Basic ${toBase64(`${key}:`)}`;
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new DatabentoValidationError("No `fetch` available. Pass one in `options.fetch` or use Node 18+");
    }
    this.fetchImpl = fetchImpl;
    this.timeoutMs = options.timeoutMs ?? 100_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryBaseMs = options.retryBaseMs ?? 500;
    this.onWarning = options.onWarning ?? ((w) => console.warn(`[databento-lite] ${w}`));
    this.userAgent = options.userAgent ?? "databento-lite";
  }

  /** GET `{gateway}/v0/{method}` with query parameters; returns parsed JSON. */
  async getJson<T>(method: string, query: Query = {}, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.gateway}/v${API_VERSION}/${method}`);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
    const response = await this.send(url, { method: "GET" }, options);
    return (await response.json()) as T;
  }

  /** POST `{gateway}/v0/{method}` as a URL-encoded form; returns parsed JSON. */
  async postJson<T>(method: string, form: Record<string, string>, options: RequestOptions = {}): Promise<T> {
    const response = await this.postForm(method, form, options);
    return (await response.json()) as T;
  }

  /** POST a form and return the raw `Response` so the caller can stream the body. */
  async postForm(method: string, form: Record<string, string>, options: RequestOptions = {}): Promise<Response> {
    const url = new URL(`${this.gateway}/v${API_VERSION}/${method}`);
    const body = new URLSearchParams(form).toString();
    return this.send(
      url,
      {
        method: "POST",
        body,
        headers: { "content-type": "application/x-www-form-urlencoded" },
      },
      options,
    );
  }

  private async send(url: URL, init: RequestInit, options: RequestOptions): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("authorization", this.authorization);
    headers.set("accept", "application/json");
    headers.set("user-agent", this.userAgent);

    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const timer = this.timeoutMs > 0 ? setTimeout(() => controller.abort(new DatabentoError("request timed out")), this.timeoutMs) : undefined;
      const onOuterAbort = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener("abort", onOuterAbort, { once: true });
      if (options.signal?.aborted) onOuterAbort();

      let response: Response;
      try {
        response = await this.fetchImpl(url, { ...init, headers, signal: controller.signal });
      } catch (cause) {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onOuterAbort);
        if (options.signal?.aborted) throw cause;
        if (attempt < this.maxRetries) {
          await sleep(this.backoff(attempt, undefined));
          attempt += 1;
          continue;
        }
        throw new DatabentoError(`network error after ${attempt + 1} attempt(s): ${describe(cause)}`, { cause });
      }

      // Clear the timeout once headers are in; streaming bodies have their own lifetime.
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onOuterAbort);
      this.emitWarnings(response.headers);

      if (response.ok) return response;

      const text = await response.text();
      const error = new DatabentoHttpError(response.status, text, response.headers);
      if (RETRYABLE_STATUSES.has(response.status) && attempt < this.maxRetries) {
        await sleep(this.backoff(attempt, error.retryAfter));
        attempt += 1;
        continue;
      }
      throw error;
    }
  }

  private backoff(attempt: number, retryAfterSeconds: number | undefined): number {
    if (retryAfterSeconds !== undefined) return Math.min(retryAfterSeconds * 1000, 30_000);
    return Math.min(this.retryBaseMs * 2 ** attempt, 30_000);
  }

  private emitWarnings(headers: Headers): void {
    const raw = headers.get("x-warning");
    if (!raw) return;
    try {
      const list: unknown = JSON.parse(raw);
      if (Array.isArray(list)) for (const w of list) this.onWarning(String(w));
      else this.onWarning(raw);
    } catch {
      this.onWarning(raw);
    }
  }
}

function readEnvKey(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.["DATABENTO_API_KEY"];
}

function toBase64(text: string): string {
  const g = globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } }; btoa?: (s: string) => string };
  if (g.Buffer) return g.Buffer.from(text, "utf8").toString("base64");
  if (g.btoa) return g.btoa(text);
  throw new DatabentoError("no base64 encoder available");
}

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
