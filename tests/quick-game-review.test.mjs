import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("keeps the complete depth-20 review and exposes a separate bounded quick preview", async () => {
  const source = await readFile(new URL("../static/app.js", import.meta.url), "utf8");
  const fullReviewStart = source.indexOf("async function analyseSelectedGame(announce = false)");
  const quickReviewStart = source.indexOf("async function analyseSelectedGameQuickPreview(announce = false)");
  const fullReviewSource = source.slice(fullReviewStart, quickReviewStart);

  assert.ok(fullReviewStart >= 0, "the complete review should remain available");
  assert.ok(quickReviewStart > fullReviewStart, "the quick preview should be a separate action");
  assert.match(fullReviewSource, /for \(let index = 0; index < history\.length; index \+= 1\)/);
  assert.match(fullReviewSource, /GAME_REVIEW_MULTI_PV/);
  assert.match(source, /const QUICK_GAME_REVIEW_MAX_MOVES = 10;/);
  assert.match(source, /const QUICK_GAME_REVIEW_BUDGET_MS = 110_000;/);
  assert.match(source, /timeLimitMs: beforeTimeLimitMs/);
  assert.match(source, /minimumDepth: QUICK_GAME_REVIEW_MIN_DEPTH/);
});

test("adds the quick preview button without replacing the full-review button", async () => {
  const page = await readFile(new URL("../static/index.html", import.meta.url), "utf8");
  assert.match(page, /id="analyse-selected-game"[^>]*>Analyse every move/);
  assert.match(page, /id="quick-review-selected-game"[^>]*>Quick preview/);
});
