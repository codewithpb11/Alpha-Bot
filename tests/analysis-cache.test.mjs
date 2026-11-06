import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadAnalysisCache() {
  const source = await readFile(new URL("../static/app.js", import.meta.url), "utf8");
  const start = source.indexOf("function createAnalysisCache()");
  const end = source.indexOf("\nfunction freshMoveLabelCounts()", start);
  assert.ok(start >= 0 && end > start, "analysis cache should be present in app.js");
  const calls = [];
  const context = {
    analyseFenAtDepth: async (...args) => {
      calls.push(args);
      return { args };
    },
  };
  vm.createContext(context);
  new vm.Script(`${source.slice(start, end)}\nglobalThis.createAnalysisCache = createAnalysisCache;`).runInContext(context);
  return { createAnalysisCache: context.createAnalysisCache, calls };
}

test("reuses a deeper cached engine result for the same position", async () => {
  const { createAnalysisCache, calls } = await loadAnalysisCache();
  const analyse = createAnalysisCache();
  const deep = await analyse("position", 20, false, 3);
  const shallow = await analyse("position", 20, false, 1);
  assert.equal(calls.length, 1);
  assert.equal(deep, shallow);
  await analyse("position", 20, false, 4);
  assert.equal(calls.length, 2);
});
