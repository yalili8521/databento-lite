import { DatabentoValidationError } from "./errors.js";
import type { DateLike, DateTimeLike, Symbols } from "./types.js";

export const ALL_SYMBOLS = "ALL_SYMBOLS";
export const MAX_SYMBOLS_PER_REQUEST = 2000;

/** Format a {@link DateTimeLike} the way the API expects it. */
export function dateTimeToString(value: DateTimeLike, name: string): string {
  if (typeof value === "string") {
    if (value.trim() === "") throw new DatabentoValidationError(`\`${name}\` must not be empty`);
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      throw new DatabentoValidationError(`\`${name}\` as a number must be a non-negative integer of nanoseconds since the UNIX epoch`);
    }
    return String(value);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new DatabentoValidationError(`\`${name}\` is an invalid Date`);
    return value.toISOString();
  }
  throw new DatabentoValidationError(`\`${name}\` has an unsupported type`);
}

/** Format a {@link DateLike} as `YYYY-MM-DD`. */
export function dateToString(value: DateLike, name: string): string {
  if (typeof value === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new DatabentoValidationError(`\`${name}\` must be a YYYY-MM-DD string`);
    }
    return value;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new DatabentoValidationError(`\`${name}\` is an invalid Date`);
    return value.toISOString().slice(0, 10);
  }
  throw new DatabentoValidationError(`\`${name}\` has an unsupported type`);
}

/** Join symbols into the comma-separated form the API takes. */
export function symbolsToString(symbols: Symbols | undefined): string {
  if (symbols === undefined) return ALL_SYMBOLS;
  const list = (Array.isArray(symbols) ? symbols : [symbols]).map((s) => String(s).trim()).filter((s) => s !== "");
  if (list.length === 0) throw new DatabentoValidationError("`symbols` must contain at least one symbol");
  if (list.length > MAX_SYMBOLS_PER_REQUEST) {
    throw new DatabentoValidationError(`\`symbols\` may hold at most ${MAX_SYMBOLS_PER_REQUEST} entries per request, got ${list.length}`);
  }
  return list.join(",");
}

/** Validate a dataset code such as `GLBX.MDP3`. */
export function validateDataset(dataset: string): string {
  if (typeof dataset !== "string" || !/^[A-Z0-9]+\.[A-Z0-9]+$/.test(dataset)) {
    throw new DatabentoValidationError(`\`dataset\` must look like \`VENUE.FEED\` (for example GLBX.MDP3), got ${JSON.stringify(dataset)}`);
  }
  return dataset;
}

/** Validate an optional record limit. */
export function validateLimit(limit: number | undefined): string | undefined {
  if (limit === undefined) return undefined;
  if (!Number.isInteger(limit) || limit <= 0) throw new DatabentoValidationError("`limit` must be a positive integer");
  return String(limit);
}

/** Drop undefined values so they are not sent as the string "undefined". */
export function compact(fields: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) out[k] = v;
  return out;
}
