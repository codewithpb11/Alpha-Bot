import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("uses depth 20 for Alpha's position and coaching analysis", async () => {
  const source = await readFile(new URL("../static/app.js", import.meta.url), "utf8");
  assert.match(source, /const POSITION_ANALYSIS_DEPTH = 20;/);
  assert.match(source, /const REPORT_DEPTH = 20;/);
  assert.match(source, /const GAME_REVIEW_DEPTH = 20;/);
  assert.match(source, /const LIBRARY_AUDIT_DEPTH = 20;/);
  assert.match(source, /analyseFenAtDepth\(game\.fen\(\), POSITION_ANALYSIS_DEPTH, chess960Mode, multiPv\)/);
});
