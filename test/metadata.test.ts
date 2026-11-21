import { describe, expect, it } from "vitest";
import { Historical } from "../src/index.js";
import { fakeFetch, jsonResponse, parseForm } from "./helpers.js";

const KEY = "db-testkeytestkeytestkeytestke12";

describe("metadata", () => {
  it("lists datasets with basic auth and query parameters", async () => {
    const { fetch, requests } = fakeFetch(jsonResponse(["GLBX.MDP3", "XNAS.ITCH"]));
    const client = new Historical({ key: KEY, fetch });

    const datasets = await client.metadata.listDatasets({ startDate: "2024-01-01", endDate: new Date("2024-02-01T12:00:00Z") });

    expect(datasets).toEqual(["GLBX.MDP3", "XNAS.ITCH"]);
    const req = requests[0]!;
    expect(req.method).toBe("GET");
    expect(req.url).toBe("https://hist.databento.com/v0/metadata.list_datasets?start_date=2024-01-01&end_date=2024-02-01");
    expect(req.headers["authorization"]).toBe(`Basic ${Buffer.from(`${KEY}:`).toString("base64")}`);
    expect(req.headers["accept"]).toBe("application/json");
    expect(req.headers["user-agent"]).toBe("databento-lite");
  });

  it("omits undefined query parameters", async () => {
    const { fetch, requests } = fakeFetch(jsonResponse([]));
    const client = new Historical({ key: KEY, fetch });
    await client.metadata.listDatasets();
    expect(requests[0]!.url).toBe("https://hist.databento.com/v0/metadata.list_datasets");
  });

  it("lists schemas for a dataset", async () => {
    const { fetch, requests } = fakeFetch(jsonResponse(["trades", "ohlcv-1m"]));
    const client = new Historical({ key: KEY, fetch });
    const schemas = await client.metadata.listSchemas({ dataset: "GLBX.MDP3" });
    expect(schemas).toEqual(["trades", "ohlcv-1m"]);
    expect(requests[0]!.url).toBe("https://hist.databento.com/v0/metadata.list_schemas?dataset=GLBX.MDP3");
  });

  it("posts getCost as a URL-encoded form with defaults filled in", async () => {
    const { fetch, requests } = fakeFetch(jsonResponse(0.0123));
    const client = new Historical({ key: KEY, fetch });

    const cost = await client.metadata.getCost({
      dataset: "GLBX.MDP3",
      symbols: ["ESM4", "NQM4"],
      schema: "ohlcv-1m",
      start: "2024-06-03T00:00:00",
      end: new Date("2024-06-04T00:00:00Z"),
      limit: 100,
    });

    expect(cost).toBe(0.0123);
    const req = requests[0]!;
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://hist.databento.com/v0/metadata.get_cost");
    expect(req.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(parseForm(req.body)).toEqual({
      dataset: "GLBX.MDP3",
      symbols: "ESM4,NQM4",
      schema: "ohlcv-1m",
      start: "2024-06-03T00:00:00",
      end: "2024-06-04T00:00:00.000Z",
      limit: "100",
      stype_in: "raw_symbol",
      stype_out: "instrument_id",
    });
  });

  it("defaults symbols to ALL_SYMBOLS and schema to trades", async () => {
    const { fetch, requests } = fakeFetch(jsonResponse(42));
    const client = new Historical({ key: KEY, fetch });
    await client.metadata.getRecordCount({ dataset: "XNAS.ITCH", start: 1_717_372_800_000_000_000n });
    const form = parseForm(requests[0]!.body);
    expect(form.symbols).toBe("ALL_SYMBOLS");
    expect(form.schema).toBe("trades");
    expect(form.start).toBe("1717372800000000000");
    expect(form.end).toBeUndefined();
    expect(form.limit).toBeUndefined();
  });

  it("uses a custom gateway without a trailing slash problem", async () => {
    const { fetch, requests } = fakeFetch(jsonResponse([]));
    const client = new Historical({ key: KEY, fetch, gateway: "https://example.test/" });
    await client.metadata.listPublishers();
    expect(requests[0]!.url).toBe("https://example.test/v0/metadata.list_publishers");
  });
});
