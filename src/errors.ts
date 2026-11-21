/** Base class for every error this library throws. */
export class DatabentoError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DatabentoError";
  }
}

/** Thrown before any request is sent, for example a missing key or a bad parameter. */
export class DatabentoValidationError extends DatabentoError {
  constructor(message: string) {
    super(message);
    this.name = "DatabentoValidationError";
  }
}

/** The shape Databento's gateway uses for error bodies. */
export interface ErrorDetail {
  case?: string;
  message?: string;
  docs?: string;
}

/** An HTTP response with a 4xx or 5xx status. */
export class DatabentoHttpError extends DatabentoError {
  /** HTTP status code. */
  readonly status: number;
  /** Raw response body, decoded as text. */
  readonly body: string;
  /** Parsed `detail` object when the body was JSON with one. */
  readonly detail: ErrorDetail | undefined;
  /** The gateway's `request-id` header, useful when contacting support. */
  readonly requestId: string | undefined;
  /** Seconds to wait before retrying, from the `Retry-After` header. */
  readonly retryAfter: number | undefined;

  constructor(status: number, body: string, headers: Headers) {
    const detail = parseDetail(body);
    const requestId = headers.get("request-id") ?? undefined;
    const retryAfterRaw = headers.get("retry-after");
    const retryAfter = retryAfterRaw !== null && /^\d+$/.test(retryAfterRaw) ? Number(retryAfterRaw) : undefined;
    super(composeMessage(status, detail, body, requestId));
    this.name = status >= 500 ? "DatabentoServerError" : "DatabentoClientError";
    this.status = status;
    this.body = body;
    this.detail = detail;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
  }

  /** True for 5xx responses. */
  get isServerError(): boolean {
    return this.status >= 500;
  }

  /** True for HTTP 429. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** True for HTTP 401 or 403. */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

function parseDetail(body: string): ErrorDetail | undefined {
  if (!body) return undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null || !("detail" in parsed)) return undefined;
    const detail = (parsed as { detail: unknown }).detail;
    if (typeof detail === "string") return { message: detail };
    if (typeof detail === "object" && detail !== null) return detail as ErrorDetail;
    return undefined;
  } catch {
    return undefined;
  }
}

function composeMessage(status: number, detail: ErrorDetail | undefined, body: string, requestId: string | undefined): string {
  const parts: string[] = [];
  if (detail?.case) parts.push(detail.case);
  if (detail?.message) parts.push(detail.message);
  if (detail?.docs) parts.push(`documentation: ${detail.docs}`);
  let message = parts.length > 0 ? parts.join(": ") : body.trim().slice(0, 300) || statusText(status);
  message = `${status} ${message}`;
  return requestId ? `Request ${requestId}: ${message}` : message;
}

function statusText(status: number): string {
  switch (status) {
    case 400:
      return "bad request";
    case 401:
      return "unauthorized; check the API key";
    case 403:
      return "forbidden; the key may lack entitlement for this dataset";
    case 404:
      return "not found";
    case 408:
      return "the request transmission timed out";
    case 422:
      return "unprocessable request";
    case 429:
      return "rate limited";
    case 504:
      return "the remote gateway timed out";
    default:
      return status >= 500 ? "server error" : "client error";
  }
}
