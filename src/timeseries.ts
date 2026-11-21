import type { HttpTransport, RequestOptions } from "./http.js";
import { parseJsonLines } from "./jsonl.js";
import { rangeForm } from "./metadata.js";
import type { GetRangeParams, GetRangeRawParams, RecordFor, Schema } from "./types.js";

/** The `timeseries.*` endpoints. Every call here is billed by the byte. */
export class TimeseriesApi {
  constructor(private readonly http: HttpTransport) {}

  /**
   * Stream records for a range as parsed JSON objects.
   *
   * Records are yielded as they arrive, so a large range does not have to fit
   * in memory. The record type narrows by schema: `trades` yields
   * {@link TradeRecord}, `ohlcv-*` yields {@link OhlcvRecord}, anything else
   * yields {@link JsonRecord}.
   *
   * `POST /timeseries.get_range` with `encoding=json`.
   */
  async *getRange<S extends Schema = "trades">(
    params: GetRangeParams & { schema?: S },
    options?: RequestOptions,
  ): AsyncGenerator<RecordFor<S>, void, undefined> {
    const response = await this.getRangeRaw({ ...params, encoding: "json", compression: "none" }, options);
    yield* parseJsonLines<RecordFor<S>>(response.body);
  }

  /**
   * Request a range and return the raw `Response` so the caller can consume
   * `response.body` in any encoding: `dbn` (binary, optionally zstd), `csv`,
   * or `json` lines. Use this to write a `.dbn.zst` file to disk or to pipe
   * CSV somewhere.
   *
   * `POST /timeseries.get_range`
   */
  async getRangeRaw(params: GetRangeRawParams, options?: RequestOptions): Promise<Response> {
    const encoding = params.encoding ?? "dbn";
    const compression = params.compression ?? (encoding === "dbn" ? "zstd" : "none");
    const form = {
      ...rangeForm(params),
      stype_out: params.stypeOut ?? "instrument_id",
      encoding,
      compression,
    };
    return this.http.postForm("timeseries.get_range", form, options);
  }
}
