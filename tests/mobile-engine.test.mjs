import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadMobileParser() {
  const source = await readFile(new URL("../static/local-engine.js", import.meta.url), "utf8");
  const start = source.indexOf("export function parseUciInfo(");
  const end = source.indexOf("\nclass BrowserUciEngine", start);
  assert.ok(start >= 0 && end > start, "the mobile UCI parser should be present");
  const context = {};
  vm.createContext(context);
  const parser = source.slice(start, end).replace("export function", "function");
  new vm.Script(`${parser}\nglobalThis.parseUciInfo = parseUciInfo;`).runInContext(context);
  return context.parseUciInfo;
}

test("parses the on-device Stockfish UCI response format", async () => {
  const parseUciInfo = await loadMobileParser();
  const line = parseUciInfo("info depth 12 seldepth 18 multipv 2 score cp -34 nodes 888 pv e7e5 g1f3");
  assert.equal(JSON.stringify(line), JSON.stringify({
    rank: 2,
    depth: 12,
    score: { type: "cp", value: -34 },
    pv: ["e7e5", "g1f3"],
  }));
  assert.equal(parseUciInfo("info depth 7 score mate 3 pv h7h8q" ).score.value, 3);
  assert.equal(parseUciInfo("info depth 10 score cp 13"), null);
});
