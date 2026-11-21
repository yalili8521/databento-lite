import { HttpTransport } from "./http.js";
import type { ClientOptions } from "./http.js";
import { MetadataApi } from "./metadata.js";
import { SymbologyApi } from "./symbology.js";
import { TimeseriesApi } from "./timeseries.js";

/**
 * Client for the Databento Historical HTTP API.
 *
 * ```ts
 * const client = new Historical({ key: process.env.DATABENTO_API_KEY });
 * const cost = await client.metadata.getCost({ dataset: "GLBX.MDP3", symbols: "ESM4", schema: "ohlcv-1m", start: "2024-06-03", end: "2024-06-04" });
 * for await (const bar of client.timeseries.getRange({ dataset: "GLBX.MDP3", symbols: "ESM4", schema: "ohlcv-1m", start: "2024-06-03", end: "2024-06-04" })) {
 *   console.log(bar.hd.ts_event, bar.close);
 * }
 * ```
 */
export class Historical {
  readonly metadata: MetadataApi;
  readonly timeseries: TimeseriesApi;
  readonly symbology: SymbologyApi;
  /** The gateway this client talks to. */
  readonly gateway: string;

  constructor(options: ClientOptions = {}) {
    const http = new HttpTransport(options);
    this.gateway = http.gateway;
    this.metadata = new MetadataApi(http);
    this.timeseries = new TimeseriesApi(http);
    this.symbology = new SymbologyApi(http);
  }
}

export { DEFAULT_GATEWAY, API_VERSION } from "./http.js";
export type { ClientOptions, RequestOptions } from "./http.js";
export { MetadataApi } from "./metadata.js";
export { TimeseriesApi } from "./timeseries.js";
export { SymbologyApi } from "./symbology.js";
export { DatabentoError, DatabentoHttpError, DatabentoValidationError } from "./errors.js";
export type { ErrorDetail } from "./errors.js";
export { parseJsonLines, toArray } from "./jsonl.js";
export { ALL_SYMBOLS, MAX_SYMBOLS_PER_REQUEST } from "./params.js";
export { FIXED_PRICE_SCALE, UNDEF_PRICE, priceToNumber } from "./types.js";
export type {
  Compression,
  DatasetCondition,
  DatasetRange,
  DateLike,
  DateTimeLike,
  Encoding,
  FieldInfo,
  GetRangeParams,
  GetRangeRawParams,
  JsonRecord,
  OhlcvRecord,
  Publisher,
  RangeParams,
  RecordFor,
  RecordHeader,
  ResolveParams,
  Schema,
  SchemaRecordMap,
  SType,
  Symbols,
  SymbologyResolution,
  TradeRecord,
  UnitPrices,
} from "./types.js";
