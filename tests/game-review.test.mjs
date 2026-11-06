import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadGameReviewFunctions() {
  const source = await readFile(new URL("../static/app.js", import.meta.url), "utf8");
  const start = source.indexOf("function freshMoveLabelCounts()");
  const end = source.indexOf("\nfunction renderSelectedGameReview()", start);
  assert.ok(start >= 0 && end > start, "game-review functions should be present in app.js");
  const context = {
    GAME_REVIEW_DEPTH: 10,
    forcingMove: (move) => Boolean(move.givesCheck),
    scoreForWhite: (result) => result.score,
    gameResultForPlayer: () => "draw",
  };
  vm.createContext(context);
  new vm.Script(`${source.slice(start, end)}\nglobalThis.review = { moveAccuracyEstimate, classifySelectedGameMove, labelDisplayName };`).runInContext(context);
  return context.review;
}

function reviewedMove(overrides = {}) {
  return {
    loss: 0,
    rank: 1,
    phase: "middlegame",
    beforePlayerScore: 0,
    afterPlayerScore: 0,
    move: {
      color: "w",
      ply: 20,
      to: "e5",
      piece: "n",
      captured: null,
      givesCheck: false,
    },
    ...overrides,
  };
}

test("uses a reproducible local accuracy curve instead of platform accuracy", async () => {
  const { moveAccuracyEstimate } = await loadGameReviewFunctions();
  assert.equal(moveAccuracyEstimate(0), 100);
  assert.ok(moveAccuracyEstimate(190) > 36 && moveAccuracyEstimate(190) < 37);
  assert.ok(moveAccuracyEstimate(10_000) < 0.0001);
});

test("labels book, critical errors, and verified sacrifice candidates", async () => {
  const { classifySelectedGameMove, labelDisplayName } = await loadGameReviewFunctions();
  assert.equal(classifySelectedGameMove(reviewedMove({ phase: "opening", move: { color: "w", ply: 8, to: "e4", piece: "p", captured: null } })), "book");
  assert.equal(classifySelectedGameMove(reviewedMove({ loss: 130 })), "mistake");
  assert.equal(classifySelectedGameMove(reviewedMove({ loss: 300 })), "blunder");
  const sacrifice = reviewedMove({
    beforePlayerScore: 30,
    afterPlayerScore: 25,
    move: { color: "w", ply: 20, to: "e5", piece: "n", captured: "p" },
  });
  const recapture = reviewedMove({
    move: { color: "b", ply: 21, to: "e5", piece: "p", captured: "n" },
  });
  assert.equal(classifySelectedGameMove(sacrifice, recapture), "brilliant");
  assert.equal(labelDisplayName("brilliant"), "Brilliant candidates");
});
