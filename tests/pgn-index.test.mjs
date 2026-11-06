import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadPgnIndexFunctions() {
  const source = await readFile(new URL("../static/app.js", import.meta.url), "utf8");
  const start = source.indexOf("function pgnHeader(");
  const end = source.indexOf("\nfunction readGameHistory(", start);
  assert.ok(start >= 0 && end > start, "PGN index functions should be present in app.js");
  const context = {};
  vm.createContext(context);
  new vm.Script(`${source.slice(start, end)}\nglobalThis.parsePgnDatabase = parsePgnDatabase;`).runInContext(context);
  return context.parsePgnDatabase;
}

test("indexes ordinary multi-game Chess.com PGN archives for the visible library", async () => {
  const parsePgnDatabase = await loadPgnIndexFunctions();
  const archive = `[Event "Live Chess"]
[Site "Chess.com"]
[EngineDialogueColor "w"]
[Date "2026.11.01"]
[White "IamAKPB11"]
[Black "OpponentOne"]
[Result "1-0"]
[ECO "B01"]
[ECOUrl "https://www.chess.com/openings/Scandinavian-Defense"]

1. e4 e5 2. Nf3 Nc6 1-0

[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.11.02"]
[White "OpponentTwo"]
[Black "IamAKPB11"]
[Result "0-1"]

1. d4 d5 2. c4 e6 0-1`;
  const records = parsePgnDatabase(archive);
  assert.equal(records.length, 2);
  assert.equal(records[0].eco, "B01");
  assert.equal(records[0].openingName, "Scandinavian Defense");
  assert.equal(records[0].accountColor, "w");
  assert.equal(
    JSON.stringify(records.map((record) => [record.white, record.black, record.date, record.result])),
    JSON.stringify([
      ["IamAKPB11", "OpponentOne", "2026.11.01", "1-0"],
      ["OpponentTwo", "IamAKPB11", "2026.11.02", "0-1"],
    ]),
  );
});
