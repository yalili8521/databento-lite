import { describe, expect, it, vi } from "vitest";
import { DatabentoError, DatabentoHttpError, DatabentoValidationError, Historical } from "../src/index.js";
import { errorResponse, fakeFetch, jsonResponse } from "./helpers.js";

const KEY = "db-testkeytestkeytestkeytestke12";

describe("errors and retries", () => {
  it("maps a 4xx JSON error body to DatabentoHttpError with case, message and request id", async () => {
    const { fetch } = fakeFetch(
      errorResponse(422, { case: "validation_error", message: "symbols invalid", docs: "https://databento.com/docs" }, { "request-id": "abc-123" }),
    );
    const client = new Historical({ key: KEY, fetch, maxRetries: 0 });

    const err = await client.metadata.listSchemas({ dataset: "GLBX.MDP3" }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DatabentoHttpError);
    const httpErr = err as DatabentoHttpError;
    expect(httpErr.status).toBe(422);
    expect(httpErr.requestId).toBe("abc-123");
    expect(httpErr.detail).toEqual({ case: "validation_error", message: "symbols invalid", docs: "https://databento.com/docs" });
    expect(httpErr.message).toBe("Request abc-123: 422 validation_error: symbols invalid: documentation: https://databento.com/docs");
    expect(httpErr.isServerError).toBe(false);
    expect(httpErr.isAuthError).toBe(false);
  });

  it("handles a string detail and a 401", async () => {
    const { fetch } = fakeFetch(errorResponse(401, "Unauthorized"));
    const client = new Historical({ key: KEY, fetch, maxRetries: 0 });
    const err = (await client.metadata.listPublishers().catch((e: unknown) => e)) as DatabentoHttpError;
    expect(err.isAuthError).toBe(true);
    expect(err.message).toBe("401 Unauthorized");
  });

  it("falls back to the raw body when it is not JSON", async () => {
    const { fetch } = fakeFetch(new Response("<html>gateway down</html>", { status: 503 }));
    const client = new Historical({ key: KEY, fetch, maxRetries: 0 });
    const err = (await client.metadata.listPublishers().catch((e: unknown) => e)) as DatabentoHttpError;
    expect(err.status).toBe(503);
    expect(err.isServerError).toBe(true);
    expect(err.body).toBe("<html>gateway down</html>");
    expect(err.message).toBe("503 <html>gateway down</html>");
  });

  it("retries 429 after Retry-After and then succeeds", async () => {
    vi.useFakeTimers();
    try {
      const { fetch, requests } = fakeFetch(errorResponse(429, "slow down", { "retry-after": "2" }), jsonResponse(["GLBX.MDP3"]));
      const client = new Historical({ key: KEY, fetch, maxRetries: 2 });
      const promise = client.metadata.listDatasets();
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toEqual(["GLBX.MDP3"]);
      expect(requests).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up after maxRetries and surfaces the last error", async () => {
    vi.useFakeTimers();
    try {
      const { fetch, requests } = fakeFetch(errorResponse(503, "a"), errorResponse(503, "b"), errorResponse(503, "c"));
      const client = new Historical({ key: KEY, fetch, maxRetries: 2, retryBaseMs: 10 });
      const promise = client.metadata.listDatasets().catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(10 + 20);
      const err = (await promise) as DatabentoHttpError;
      expect(err.status).toBe(503);
      expect(err.message).toBe("503 c");
      expect(requests).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry a 400", async () => {
    const { fetch, requests } = fakeFetch(errorResponse(400, "bad"), jsonResponse([]));
    const client = new Historical({ key: KEY, fetch, maxRetries: 2 });
    await expect(client.metadata.listDatasets()).rejects.toBeInstanceOf(DatabentoHttpError);
    expect(requests).toHaveLength(1);
  });

  it("retries a network error and wraps it when retries run out", async () => {
    vi.useFakeTimers();
    try {
      const { fetch, requests } = fakeFetch(new TypeError("fetch failed"), new TypeError("fetch failed"));
      const client = new Historical({ key: KEY, fetch, maxRetries: 1, retryBaseMs: 5 });
      const promise = client.metadata.listDatasets().catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(5);
      const err = (await promise) as DatabentoError;
      expect(err).toBeInstanceOf(DatabentoError);
      expect(err.message).toMatch(/network error after 2 attempt\(s\): fetch failed/);
      expect(requests).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts when the request exceeds timeoutMs", async () => {
    const neverResolving: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new Error("aborted")));
      });
    const client = new Historical({ key: KEY, fetch: neverResolving, maxRetries: 0, timeoutMs: 20 });
    await expect(client.metadata.listDatasets()).rejects.toThrow(/timed out/);
  });

  it("respects a caller-provided AbortSignal without retrying", async () => {
    const controller = new AbortController();
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const client = new Historical({ key: KEY, fetch: fetchImpl, maxRetries: 3 });
    const promise = client.metadata.listDatasets({}, { signal: controller.signal });
    controller.abort(new Error("caller cancelled"));
    await expect(promise).rejects.toThrow("caller cancelled");
  });

  it("surfaces X-Warning headers through onWarning", async () => {
    const warnings: string[] = [];
    const { fetch } = fakeFetch(jsonResponse([], { headers: { "x-warning": JSON.stringify(["DeprecationWarning: stype parent is deprecated"]) } }));
    const client = new Historical({ key: KEY, fetch, onWarning: (w) => warnings.push(w) });
    await client.metadata.listDatasets();
    expect(warnings).toEqual(["DeprecationWarning: stype parent is deprecated"]);
  });

  it("validates parameters before sending anything", async () => {
    const { fetch, requests } = fakeFetch();
    const client = new Historical({ key: KEY, fetch });
    await expect(client.metadata.getCost({ dataset: "glbx", start: "2024-06-03" })).rejects.toBeInstanceOf(DatabentoValidationError);
    await expect(client.metadata.getCost({ dataset: "GLBX.MDP3", start: "2024-06-03", limit: 0 })).rejects.toThrow(/limit/);
    await expect(client.metadata.getCost({ dataset: "GLBX.MDP3", start: -1 })).rejects.toThrow(/nanoseconds/);
    await expect(client.metadata.getCost({ dataset: "GLBX.MDP3", start: "2024-06-03", symbols: [] })).rejects.toThrow(/at least one symbol/);
    await expect(
      client.metadata.getCost({ dataset: "GLBX.MDP3", start: "2024-06-03", symbols: Array.from({ length: 2001 }, (_, i) => `S${i}`) }),
    ).rejects.toThrow(/at most 2000/);
    await expect(client.metadata.listDatasets({ startDate: "June 3" })).rejects.toThrow(/YYYY-MM-DD/);
    expect(requests).toHaveLength(0);
  });

  it("refuses to construct without a key", () => {
    const saved = process.env.DATABENTO_API_KEY;
    delete process.env.DATABENTO_API_KEY;
    try {
      expect(() => new Historical({ fetch: fakeFetch().fetch })).toThrow(DatabentoValidationError);
      expect(() => new Historical({ key: "YOUR_API_KEY", fetch: fakeFetch().fetch })).toThrow(/placeholder/);
    } finally {
      if (saved !== undefined) process.env.DATABENTO_API_KEY = saved;
    }
  });
});
