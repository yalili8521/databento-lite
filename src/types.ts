/**
 * Public types for the Databento Historical HTTP API.
 *
 * Values mirror the strings the API accepts on the wire. The unions are open
 * (`| (string & {})`) so a newly added dataset, schema or symbology type can be
 * used before this library knows about it, while still giving autocomplete.
 */

/** Data record schema. */
export type Schema =
  | "mbo"
  | "mbp-1"
  | "mbp-10"
  | "tbbo"
  | "trades"
  | "bbo-1s"
  | "bbo-1m"
  | "ohlcv-1s"
  | "ohlcv-1m"
  | "ohlcv-1h"
  | "ohlcv-1d"
  | "ohlcv-eod"
  | "definition"
  | "statistics"
  | "status"
  | "imbalance"
  | "cmbp-1"
  | "cbbo-1s"
  | "cbbo-1m"
  | "tcbbo"
  | (string & {});

/** Symbology type. */
export type SType =
  | "raw_symbol"
  | "instrument_id"
  | "parent"
  | "continuous"
  | (string & {});

/** Record encoding for time series responses. */
export type Encoding = "dbn" | "csv" | "json";

/** Compression for time series responses. */
export type Compression = "none" | "zstd";

/**
 * A point in time accepted by the API.
 * - `string`: ISO 8601 (for example `2024-06-03T14:30:00`) or a date `2024-06-03`; UTC unless an offset is given.
 * - `number` or `bigint`: nanoseconds since the UNIX epoch.
 * - `Date`: converted to an ISO 8601 string.
 */
export type DateTimeLike = string | number | bigint | Date;

/** A calendar date accepted by the API: `YYYY-MM-DD` or a `Date` (UTC date part is used). */
export type DateLike = string | Date;

/** One symbol or many. `"ALL_SYMBOLS"` selects everything in the dataset. */
export type Symbols = string | number | ReadonlyArray<string | number>;

/** Options shared by every request that selects a range of records. */
export interface RangeParams {
  /** Dataset code, for example `GLBX.MDP3`. */
  dataset: string;
  /** Inclusive start of the range. */
  start: DateTimeLike;
  /** Exclusive end of the range. Defaults to `start` forward-filled by the schema's resolution. */
  end?: DateTimeLike;
  /** Symbols to select. Up to 2,000 per request. Defaults to all symbols. */
  symbols?: Symbols;
  /** Record schema. Defaults to `trades`. */
  schema?: Schema;
  /** Input symbology type. Defaults to `raw_symbol`. */
  stypeIn?: SType;
  /** Maximum number of records to return. */
  limit?: number;
}

/** Parameters for `timeseries.getRange`. */
export interface GetRangeParams extends RangeParams {
  /** Output symbology type. Defaults to `instrument_id`. */
  stypeOut?: SType;
}

/** Parameters for `timeseries.getRangeRaw`. */
export interface GetRangeRawParams extends GetRangeParams {
  /** Response encoding. Defaults to `dbn`. */
  encoding?: Encoding;
  /** Response compression. Defaults to `none` for `csv` and `json`, `zstd` for `dbn`. */
  compression?: Compression;
}

/** Parameters for `symbology.resolve`. */
export interface ResolveParams {
  dataset: string;
  symbols: Symbols;
  stypeIn: SType;
  stypeOut: SType;
  /** Inclusive start date, `YYYY-MM-DD`. */
  startDate: DateLike;
  /** Exclusive end date, `YYYY-MM-DD`. */
  endDate?: DateLike;
}

/** The record header every DBN record carries, as Databento's JSON encoding emits it. */
export interface RecordHeader {
  /** Event timestamp in nanoseconds since the UNIX epoch, as a decimal string. */
  ts_event: string;
  /** Record type. */
  rtype: number;
  publisher_id: number;
  instrument_id: number;
}

/**
 * A record from the JSON encoding. Field layout follows Databento's JSON
 * encoding of DBN: the header is nested under `hd`, 64-bit integers
 * (timestamps, fixed-precision prices) are decimal strings, and the record's
 * own fields sit at the top level.
 *
 * Prices are fixed-precision integers with 9 decimal places; see
 * {@link FIXED_PRICE_SCALE} and {@link priceToNumber}.
 */
export interface JsonRecord {
  hd: RecordHeader;
  /** Present when the server maps instrument IDs back to symbols. */
  symbol?: string;
  [field: string]: unknown;
}

/** A `trades` record. */
export interface TradeRecord extends JsonRecord {
  ts_recv: string;
  price: string;
  size: number;
  action: string;
  side: string;
  flags: number;
  depth: number;
  ts_in_delta: number;
  sequence: number;
}

/** An `ohlcv-*` record. */
export interface OhlcvRecord extends JsonRecord {
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

/** Map from schema to the record type `getRange` yields for it. */
export interface SchemaRecordMap {
  trades: TradeRecord;
  "ohlcv-1s": OhlcvRecord;
  "ohlcv-1m": OhlcvRecord;
  "ohlcv-1h": OhlcvRecord;
  "ohlcv-1d": OhlcvRecord;
  "ohlcv-eod": OhlcvRecord;
}

/** The record type for a schema, falling back to {@link JsonRecord}. */
export type RecordFor<S extends Schema> = S extends keyof SchemaRecordMap
  ? SchemaRecordMap[S]
  : JsonRecord;

/** Fixed-precision price scale: prices carry nine decimal places. */
export const FIXED_PRICE_SCALE = 1_000_000_000;

/** Sentinel for an undefined fixed-precision price. */
export const UNDEF_PRICE = "9223372036854775807";

/**
 * Convert a fixed-precision price string to a JavaScript number.
 * Returns `null` for the undefined-price sentinel.
 */
export function priceToNumber(price: string | number): number | null {
  if (typeof price === "number") return price / FIXED_PRICE_SCALE;
  if (price === UNDEF_PRICE) return null;
  return Number(price) / FIXED_PRICE_SCALE;
}

/** A publisher entry from `metadata.listPublishers`. */
export interface Publisher {
  publisher_id: number;
  dataset: string;
  venue: string;
  description: string;
}

/** A field entry from `metadata.listFields`. */
export interface FieldInfo {
  name: string;
  type: string;
}

/** One day's condition from `metadata.getDatasetCondition`. */
export interface DatasetCondition {
  date: string;
  condition: "available" | "degraded" | "pending" | "missing" | (string & {});
  last_modified_date: string | null;
}

/** Response of `metadata.getDatasetRange`. */
export interface DatasetRange {
  start: string;
  end: string;
  schema?: Record<string, { start: string; end: string }>;
}

/** Unit prices for a dataset: feed mode to schema to US dollars per gigabyte. */
export interface UnitPrices {
  mode: "historical" | "historical-streaming" | "live" | (string & {});
  unit_prices: Record<string, number>;
}

/** Response of `symbology.resolve`. */
export interface SymbologyResolution {
  result: Record<string, Array<{ d0: string; d1: string; s: string }>>;
  symbols: string[];
  stype_in: string;
  stype_out: string;
  start_date: string;
  end_date: string;
  partial: string[];
  not_found: string[];
  message: string;
  status: number;
}
