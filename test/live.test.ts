/**
 * Live smoke test against the real gateway. Opt in with:
 *   DATABENTO_API_KEY=db-... npm run test:live
 * It spends a fraction of a cent: five daily bars of one futures contract.
 */
import { describe, expect, it } from "vitest";
import { Historical, toArray } from "../src/index.js";

const key = process.env.DATABENTO_API_KEY;
const enabled = process.env.DATABENTO_LIVE_TEST === "1" && typeof key === "string" && key.length > 0;

describe.skipIf(!enabled)("live gateway", () => {
  const client = new Historical({ key });
  const range = { dataset: "GLBX.MDP3", symbols: "ES.c.0", stypeIn: "continuous" as const, schema: "ohlcv-1d" as const, start: "2024-06-03", end: "2024-06-10" };

  it("lists datasets including GLBX.MDP3", async () => {
    const datasets = await client.metadata.listDatasets();
    expect(datasets).toContain("GLBX.MDP3");
  });

  it("lists schemas for GLBX.MDP3", async () => {
    const schemas = await client.metadata.listSchemas({ dataset: "GLBX.MDP3" });
    expect(schemas).toContain("ohlcv-1d");
  });

  it("prices a tiny range below one cent", async () => {
    const cost = await client.metadata.getCost(range);
    expect(cost).toBeGreaterThanOrEqual(0);
    expect(cost).toBeLessThan(0.01);
  });

  it("streams five daily bars", async () => {
    const bars = await toArray(client.timeseries.getRange({ ...range, limit: 5 }));
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.length).toBeLessThanOrEqual(5);
    expect(bars[0]!.hd.instrument_id).toBeTypeOf("number");
    expect(bars[0]!.close).toMatch(/^\d+$/);
  });
});
