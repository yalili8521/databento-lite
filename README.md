# databento-lite

Unofficial TypeScript client for the [Databento](https://databento.com) Historical HTTP API. Zero runtime dependencies, works anywhere `fetch` does (Node 18+, Deno, Bun, browsers, edge runtimes), ships ESM and CommonJS with type declarations.

Not affiliated with or endorsed by Databento, Inc. For the official clients see [databento-python](https://github.com/databento/databento-python), [databento-cpp](https://github.com/databento/databento-cpp) and [databento-rs](https://github.com/databento/databento-rs).

## Why

Databento has no official JavaScript client. This library covers the part of the Historical API that most applications need, with three design choices:

- **Records stream.** `timeseries.getRange` is an async iterator over JSON Lines, so a day of trades does not have to fit in memory. `getRangeRaw` hands back the `Response` for `dbn` or `csv` if you want the bytes.
- **Nothing is invented.** Endpoint paths, form fields, defaults, auth and error shapes mirror the wire protocol used by the official Python client. Unions are open (`"trades" | ... | (string & {})`) so a new schema works before this library knows its name.
- **Errors carry what support will ask for.** `DatabentoHttpError` exposes `status`, `detail.case`, `detail.message`, `detail.docs`, `requestId` and `retryAfter`. 429, 502, 503, 504 and network failures retry with backoff; 4xx do not.

## Install

```sh
npm install databento-lite
```

## Quick start

```ts
import { Historical, priceToNumber } from "databento-lite";

const client = new Historical({ key: process.env.DATABENTO_API_KEY });

// Metadata calls are free.
const datasets = await client.metadata.listDatasets();
const schemas = await client.metadata.listSchemas({ dataset: "GLBX.MDP3" });

// Time series calls are billed by the byte. Price a request first.
const range = {
  dataset: "GLBX.MDP3",
  symbols: "ES.c.0",          // front-month E-mini S&P via continuous symbology
  stypeIn: "continuous",
  schema: "ohlcv-1m",
  start: "2024-06-03",
  end: "2024-06-04",
} as const;

const dollars = await client.metadata.getCost(range);
if (dollars > 0.05) throw new Error(`too expensive: $${dollars}`);

for await (const bar of client.timeseries.getRange(range)) {
  console.log(bar.hd.ts_event, priceToNumber(bar.close), bar.volume);
}
```

Set `DATABENTO_API_KEY` in the environment and the `key` option can be omitted. Keys are issued at <https://databento.com/portal/keys>. New accounts come with free data credits; check the current amount on the pricing page.

## API

### `new Historical(options?)`

| option | default | purpose |
| --- | --- | --- |
| `key` | `process.env.DATABENTO_API_KEY` | API key, sent as HTTP basic auth |
| `gateway` | `https://hist.databento.com` | base URL |
| `fetch` | `globalThis.fetch` | inject a fetch for tests, proxies or older runtimes |
| `timeoutMs` | `100000` | per-request timeout; `0` disables |
| `maxRetries` | `2` | retries for 429, 502, 503, 504 and network errors |
| `retryBaseMs` | `500` | backoff base, doubled per attempt, capped at 30 s; `Retry-After` wins when present |
| `onWarning` | `console.warn` | receives gateway `X-Warning` messages |

Every method takes an optional trailing `{ signal }` for cancellation.

### `client.metadata`

| method | endpoint | returns |
| --- | --- | --- |
| `listPublishers()` | `GET metadata.list_publishers` | `Publisher[]` |
| `listDatasets({ startDate?, endDate? })` | `GET metadata.list_datasets` | `string[]` |
| `listSchemas({ dataset })` | `GET metadata.list_schemas` | `Schema[]` |
| `listFields({ schema, encoding, dataset? })` | `GET metadata.list_fields` | `FieldInfo[]` |
| `listUnitPrices({ dataset })` | `GET metadata.list_unit_prices` | `UnitPrices[]` |
| `getDatasetCondition({ dataset, startDate?, endDate? })` | `GET metadata.get_dataset_condition` | `DatasetCondition[]` |
| `getDatasetRange({ dataset })` | `GET metadata.get_dataset_range` | `DatasetRange` |
| `getRecordCount(range)` | `POST metadata.get_record_count` | `number` |
| `getBillableSize(range)` | `POST metadata.get_billable_size` | bytes |
| `getCost(range)` | `POST metadata.get_cost` | US dollars |

`range` is a `RangeParams`:

```ts
interface RangeParams {
  dataset: string;              // "GLBX.MDP3"
  start: DateTimeLike;          // ISO 8601 string, Date, or nanoseconds as number/bigint; inclusive
  end?: DateTimeLike;           // exclusive; defaults to start forward-filled by resolution
  symbols?: Symbols;            // string | number | array, up to 2,000; default all symbols
  schema?: Schema;              // default "trades"
  stypeIn?: SType;              // default "raw_symbol"
  limit?: number;               // max records
}
```

### `client.timeseries`

**`getRange(params)`** returns `AsyncGenerator<Record>` where the record type follows the schema: `trades` yields `TradeRecord`, `ohlcv-*` yields `OhlcvRecord`, everything else `JsonRecord`. Field names and types are exactly what Databento's JSON encoding emits: the header is nested under `hd`, 64-bit values such as `ts_event` and prices are decimal strings. Prices are fixed-precision with nine decimals; `priceToNumber` converts them and returns `null` for the undefined sentinel.

**`getRangeRaw(params)`** adds `encoding` (`dbn` default, `csv`, `json`) and `compression` (`zstd` default for `dbn`, otherwise `none`) and returns the `Response`:

```ts
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const res = await client.timeseries.getRangeRaw({ ...range, encoding: "dbn" });
await pipeline(Readable.fromWeb(res.body!), createWriteStream("es-2024-06-03.ohlcv-1m.dbn.zst"));
```

Decode `.dbn.zst` files with the official `dbn` CLI or Python client; this library does not decode DBN.

### `client.symbology`

**`resolve({ dataset, symbols, stypeIn, stypeOut, startDate, endDate? })`** maps symbols between symbology types per date. `POST symbology.resolve`.

### Errors

```ts
import { DatabentoHttpError, DatabentoValidationError } from "databento-lite";

try {
  await client.metadata.getCost(range);
} catch (err) {
  if (err instanceof DatabentoValidationError) // bad parameters; nothing was sent
  if (err instanceof DatabentoHttpError) {
    err.status;       // 422
    err.detail;       // { case, message, docs }
    err.requestId;    // quote this to support@databento.com
    err.isRateLimited; err.isAuthError; err.isServerError;
  }
}
```

## Development

```sh
npm install
npm run check            # typecheck, lint, unit tests, build
DATABENTO_API_KEY=db-... npm run test:live   # one real request set, costs well under a cent
```

Unit tests run against a scripted `fetch`; no network, no key. CI runs the same on Node 18, 20 and 22 and smoke-loads the built package from both ESM and CommonJS. Pushing a `v*` tag that matches `package.json` publishes to npm with provenance.

## Scope and limits

- Historical API only. No live (WebSocket/raw TCP) gateway, no batch job endpoints yet.
- No DBN decoding. Use `getRange` for parsed records or `getRangeRaw` plus the official tools for binary.
- Billing is per byte. Call `getCost` or `getBillableSize` before any range you did not size on purpose.

## License

MIT
