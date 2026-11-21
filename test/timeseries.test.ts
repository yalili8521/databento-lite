import { describe, expect, it } from "vitest";
import { Historical, priceToNumber, toArray } from "../src/index.js";
import { chunkedResponse, fakeFetch, parseForm } from "./helpers.js";

const KEY = "db-testkeytestkeytestkeytestke12";

const bar = (ts: string, close: string) =>
  JSON.stringify({ hd: { ts_event: ts, rtype: 33, publisher_id: 1, instrument_id: 5482 }, open: close, high: close, low: close, close, volume: "10" });

describe("timeseries.getRange", () => {
  it("requests JSON lines and yields records as they stream, even when a line is split across chunks", async () => {
    const line1 = bar("1717372800000000000", "5300250000000");
    const line2 = bar("1717372860000000000", "5300500000000");
    const line3 = bar("1717372920000000000", "5300750000000");
    const joined = `${line1}\n${line2}\n${line3}`; // no trailing newline on purpose
    const cut = line1.length + 7; // splits line2 mid-record
    const { fetch, requests } = fakeFetch(chunkedResponse([joined.slice(0, cut), joined.slice(cut)]));
    const client = new Historical({ key: KEY, fetch });

    const seen: string[] = [];
    for await (const record of client.timeseries.getRange({
      dataset: "GLBX.MDP3",
      symbols: "ESM4",
      schema: "ohlcv-1m",
      start: "2024-06-03",
      end: "2024-06-04",
    })) {
      seen.push(record.close);
    }

    expect(seen).toEqual(["5300250000000", "5300500000000", "5300750000000"]);
    const form = parseForm(requests[0]!.body);
    expect(requests[0]!.url).toBe("https://hist.databento.com/v0/timeseries.get_range");
    expect(form.encoding).toBe("json");
    expect(form.compression).toBe("none");
    expect(form.stype_out).toBe("instrument_id");
    expect(form.schema).toBe("ohlcv-1m");
  });

  it("skips blank lines and converts fixed-precision prices", async () => {
    const { fetch } = fakeFetch(chunkedResponse([`${bar("1", "5300250000000")}\n\n\n`]));
    const client = new Historical({ key: KEY, fetch });
    const records = await toArray(client.timeseries.getRange({ dataset: "GLBX.MDP3", schema: "ohlcv-1m", start: "2024-06-03" }));
    expect(records).toHaveLength(1);
    expect(priceToNumber(records[0]!.close)).toBeCloseTo(5300.25, 9);
    expect(priceToNumber("9223372036854775807")).toBeNull();
  });

  it("throws a DatabentoError naming the line when a record is not valid JSON", async () => {
    const { fetch } = fakeFetch(chunkedResponse([`${bar("1", "1")}\n{not json\n`]));
    const client = new Historical({ key: KEY, fetch });
    await expect(toArray(client.timeseries.getRange({ dataset: "GLBX.MDP3", start: "2024-06-03" }))).rejects.toThrow(/invalid JSON on line 2/);
  });

  it("getRangeRaw defaults to dbn with zstd and hands back the Response", async () => {
    const { fetch, requests } = fakeFetch(chunkedResponse(["DBN\u0001"]));
    const client = new Historical({ key: KEY, fetch });
    const response = await client.timeseries.getRangeRaw({ dataset: "GLBX.MDP3", symbols: "ESM4", start: "2024-06-03", limit: 5 });
    expect(response.ok).toBe(true);
    expect(await response.text()).toBe("DBN\u0001");
    const form = parseForm(requests[0]!.body);
    expect(form.encoding).toBe("dbn");
    expect(form.compression).toBe("zstd");
    expect(form.limit).toBe("5");
  });

  it("getRangeRaw with csv defaults compression to none", async () => {
    const { fetch, requests } = fakeFetch(chunkedResponse(["ts_event,close\n"]));
    const client = new Historical({ key: KEY, fetch });
    await client.timeseries.getRangeRaw({ dataset: "GLBX.MDP3", start: "2024-06-03", encoding: "csv" });
    expect(parseForm(requests[0]!.body).compression).toBe("none");
  });
});
