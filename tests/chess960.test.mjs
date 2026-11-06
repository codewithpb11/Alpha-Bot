import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { Chess } from "chess.js";
import { Chess as Chess960Pgn, GAME_VARIANT } from "cm-chess";

async function loadChess960Readers() {
  const source = await readFile(new URL("../static/app.js", import.meta.url), "utf8");
  const start = source.indexOf("function pgnHeader(");
  const end = source.indexOf("\nfunction materializeGameRecord(", start);
  assert.ok(start >= 0 && end > start, "Chess960 PGN functions should be present in app.js");
  const context = { Chess, Chess960Pgn, GAME_VARIANT };
  vm.createContext(context);
  new vm.Script(`${source.slice(start, end)}\nglobalThis.parsePgnDatabase = parsePgnDatabase; globalThis.readGameHistory = readGameHistory;`).runInContext(context);
  return context;
}

test("indexes and replays Chess960 PGNs with castling", async () => {
  const { parsePgnDatabase, readGameHistory } = await loadChess960Readers();
  const pgn = `[Event "Chess960 test"]
[Site "Local"]
[Date "2026.11.06"]
[White "Player"]
[Black "Opponent"]
[Result "*"]
[Variant "Chess960"]
[SetUp "1"]
[FEN "nrkbrnbq/pppppppp/8/8/8/8/PPPPPPPP/NRKBRNBQ w KQkq - 0 1"]

1. f4 Nb6 2. Nb3 f6 3. e4 e5 4. f5 d5 5. g4 Nfd7 6. exd5 Bxd5 7. Bf3 c6 8. Ng3 Be7 9. O-O-O Qg8 *`;
  const [record] = parsePgnDatabase(pgn);
  assert.equal(record.chess960, true);
  const history = readGameHistory(record);
  const castle = history.find((move) => move.san === "O-O-O");
  assert.equal(history.length, 18);
  assert.equal(castle?.uci, "c1b1");
  assert.equal(castle?.before, "1rk1r2q/pp1nb1pp/1np2p2/3bpP2/6P1/1N3BN1/PPPP3P/1RK1R1BQ w KQkq - 2 9");
  assert.equal(castle?.after, "1rk1r2q/pp1nb1pp/1np2p2/3bpP2/6P1/1N3BN1/PPPP3P/2KRR1BQ b kq - 3 9");
});
