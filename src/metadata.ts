import type { HttpTransport, RequestOptions } from "./http.js";
import { compact, dateTimeToString, dateToString, symbolsToString, validateDataset, validateLimit } from "./params.js";
import type {
  DatasetCondition,
  DatasetRange,
  DateLike,
  Encoding,
  FieldInfo,
  Publisher,
  RangeParams,
  Schema,
  UnitPrices,
} from "./types.js";

/** The `metadata.*` endpoints. These are free to call. */
export class MetadataApi {
  constructor(private readonly http: HttpTransport) {}

  /** List every publisher with its dataset and venue. `GET /metadata.list_publishers` */
  async listPublishers(options?: RequestOptions): Promise<Publisher[]> {
    return this.http.getJson<Publisher[]>("metadata.list_publishers", {}, options);
  }

  /** List dataset codes, optionally only those with data in a date range. `GET /metadata.list_datasets` */
  async listDatasets(params: { startDate?: DateLike; endDate?: DateLike } = {}, options?: RequestOptions): Promise<string[]> {
    return this.http.getJson<string[]>(
      "metadata.list_datasets",
      {
        start_date: params.startDate === undefined ? undefined : dateToString(params.startDate, "startDate"),
        end_date: params.endDate === undefined ? undefined : dateToString(params.endDate, "endDate"),
      },
      options,
    );
  }

  /** List the schemas a dataset offers. `GET /metadata.list_schemas` */
  async listSchemas(params: { dataset: string }, options?: RequestOptions): Promise<Schema[]> {
    return this.http.getJson<Schema[]>("metadata.list_schemas", { dataset: validateDataset(params.dataset) }, options);
  }

  /** List the fields of a schema in a given encoding. `GET /metadata.list_fields` */
  async listFields(params: { schema: Schema; encoding: Encoding; dataset?: string }, options?: RequestOptions): Promise<FieldInfo[]> {
    return this.http.getJson<FieldInfo[]>(
      "metadata.list_fields",
      {
        schema: params.schema,
        encoding: params.encoding,
        dataset: params.dataset === undefined ? undefined : validateDataset(params.dataset),
      },
      options,
    );
  }

  /** Unit prices per feed mode and schema, in US dollars per gigabyte. `GET /metadata.list_unit_prices` */
  async listUnitPrices(params: { dataset: string }, options?: RequestOptions): Promise<UnitPrices[]> {
    return this.http.getJson<UnitPrices[]>("metadata.list_unit_prices", { dataset: validateDataset(params.dataset) }, options);
  }

  /** Per-day availability and quality of a dataset. `GET /metadata.get_dataset_condition` */
  async getDatasetCondition(
    params: { dataset: string; startDate?: DateLike; endDate?: DateLike },
    options?: RequestOptions,
  ): Promise<DatasetCondition[]> {
    return this.http.getJson<DatasetCondition[]>(
      "metadata.get_dataset_condition",
      {
        dataset: validateDataset(params.dataset),
        start_date: params.startDate === undefined ? undefined : dateToString(params.startDate, "startDate"),
        end_date: params.endDate === undefined ? undefined : dateToString(params.endDate, "endDate"),
      },
      options,
    );
  }

  /** The date range available to this key for a dataset. `GET /metadata.get_dataset_range` */
  async getDatasetRange(params: { dataset: string }, options?: RequestOptions): Promise<DatasetRange> {
    return this.http.getJson<DatasetRange>("metadata.get_dataset_range", { dataset: validateDataset(params.dataset) }, options);
  }

  /** Number of records a range request would return. `POST /metadata.get_record_count` */
  async getRecordCount(params: RangeParams, options?: RequestOptions): Promise<number> {
    return this.http.postJson<number>("metadata.get_record_count", rangeForm(params), options);
  }

  /** Billable uncompressed size in bytes of a range request. `POST /metadata.get_billable_size` */
  async getBillableSize(params: RangeParams, options?: RequestOptions): Promise<number> {
    return this.http.postJson<number>("metadata.get_billable_size", { ...rangeForm(params), stype_out: "instrument_id" }, options);
  }

  /**
   * Cost in US dollars of a range request, after any flat-rate discounts.
   * Call this before `timeseries.getRange` on anything larger than a test.
   * `POST /metadata.get_cost`
   */
  async getCost(params: RangeParams, options?: RequestOptions): Promise<number> {
    return this.http.postJson<number>("metadata.get_cost", { ...rangeForm(params), stype_out: "instrument_id" }, options);
  }
}

/** Shape the shared range parameters into the form fields the gateway expects. */
export function rangeForm(params: RangeParams): Record<string, string> {
  return compact({
    dataset: validateDataset(params.dataset),
    start: dateTimeToString(params.start, "start"),
    end: params.end === undefined ? undefined : dateTimeToString(params.end, "end"),
    symbols: symbolsToString(params.symbols),
    schema: params.schema ?? "trades",
    stype_in: params.stypeIn ?? "raw_symbol",
    limit: validateLimit(params.limit),
  });
}
