import type { HttpTransport, RequestOptions } from "./http.js";
import { compact, dateToString, symbolsToString, validateDataset } from "./params.js";
import type { ResolveParams, SymbologyResolution } from "./types.js";

/** The `symbology.*` endpoints. */
export class SymbologyApi {
  constructor(private readonly http: HttpTransport) {}

  /** Resolve symbols from one symbology type to another over a date range. `POST /symbology.resolve` */
  async resolve(params: ResolveParams, options?: RequestOptions): Promise<SymbologyResolution> {
    return this.http.postJson<SymbologyResolution>(
      "symbology.resolve",
      compact({
        dataset: validateDataset(params.dataset),
        symbols: symbolsToString(params.symbols),
        stype_in: params.stypeIn,
        stype_out: params.stypeOut,
        start_date: dateToString(params.startDate, "startDate"),
        end_date: params.endDate === undefined ? undefined : dateToString(params.endDate, "endDate"),
      }),
      options,
    );
  }
}
