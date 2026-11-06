import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("reviews every move through one bounded, time-balanced workflow", async () => {
  const source = await readFile(new URL("../static/app.js", import.meta.url), "utf8");
  const reviewStart = source.indexOf("async function analyseSelectedGame(announce = false)");
  const reviewEnd = source.indexOf("\nfunction gameReviewTimeLimit", reviewStart);
  const reviewSource = source.slice(reviewStart, reviewEnd);

  assert.ok(reviewStart >= 0 && reviewEnd > reviewStart, "the selected-game review should be present");
  assert.match(source, /const GAME_REVIEW_BUDGET_MS = 165_000;/);
  assert.match(reviewSource, /for \(let index = 0; index < history\.length; index \+= 1\)/);
  assert.match(reviewSource, /timeLimitMs,/);
  assert.match(reviewSource, /reuseGame: true/);
  assert.match(reviewSource, /minimumDepth: 1/);
  assert.doesNotMatch(source, /analyseSelectedGameQuickPreview/);
  assert.doesNotMatch(source, /QUICK_GAME_REVIEW/);
});

test("keeps the selected-game UI to one all-moves review action", async () => {
  const page = await readFile(new URL("../static/index.html", import.meta.url), "utf8");
  assert.match(page, /id="analyse-selected-game"[^>]*>Review every move \(≤3 min\)/);
  assert.doesNotMatch(page, /quick-review-selected-game/);
});

test("normalizes Stockfish scores to White's perspective before comparing positions", async () => {
  const source = await readFile(new URL("../static/app.js", import.meta.url), "utf8");
  const start = source.indexOf("function normalizeEngineResultToWhite");
  const end = source.indexOf("\nasync function analyseFenAtDepth", start);
  assert.ok(start >= 0 && end > start, "score normalization should be present");
  const context = {};
  vm.createContext(context);
  new vm.Script(`${source.slice(start, end)}\nglobalThis.normalize = normalizeEngineResultToWhite;`).runInContext(context);

  const raw = { lines: [{ score: { type: "cp", value: 54 } }] };
  assert.equal(context.normalize(raw, "8/8/8/8/8/8/8/8 w - - 0 1").lines[0].score.value, 54);
  assert.equal(context.normalize(raw, "8/8/8/8/8/8/8/8 b - - 0 1").lines[0].score.value, -54);
});
