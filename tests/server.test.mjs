import test from "node:test";
import assert from "node:assert/strict";

import { fetchPublicGames, isCompleteFen, isSafePlayerName, normalizeGameLimit, parseUciInfo, staticSourceForPath, tagChessComPgn } from "../server.mjs";

test("parses a centipawn MultiPV UCI line", () => {
  assert.deepEqual(
    parseUciInfo("info depth 18 seldepth 27 multipv 2 score cp -37 nodes 3000 nps 100000 pv d2d4 g8f6"),
    { rank: 2, depth: 18, score: { type: "cp", value: -37 }, pv: ["d2d4", "g8f6"] },
  );
});

test("parses a mate line with implicit first variation", () => {
  assert.deepEqual(
    parseUciInfo("info depth 9 score mate 3 pv h5f7 e8d8"),
    { rank: 1, depth: 9, score: { type: "mate", value: 3 }, pv: ["h5f7", "e8d8"] },
  );
});

test("validates complete FEN board fields", () => {
  assert.equal(isCompleteFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"), true);
  assert.equal(isCompleteFen("8/8/8/8/8/8/8/8 w - -"), false);
  assert.equal(isCompleteFen("8/8/8/8/8/8/8/9 w - - 0 1"), false);
});

test("accepts only safe public profile usernames and supports complete archive requests", () => {
  assert.equal(isSafePlayerName("player-name_42"), true);
  assert.equal(isSafePlayerName("player name"), false);
  assert.equal(isSafePlayerName("../../secret"), false);
  assert.equal(normalizeGameLimit("all"), null);
  assert.equal(normalizeGameLimit("999"), 999);
  assert.equal(normalizeGameLimit("0"), 1);
});

test("keeps Chess.com account-side metadata with a PGN", () => {
  const pgn = "[Event \"Rated game\"]\n[White \"OldName\"]\n[Black \"Opponent\"]\n\n1. e4 e5";
  assert.match(tagChessComPgn(pgn, "CurrentName", { white: { username: "currentname" } }), /\[EngineDialogueColor "w"\]/);
  assert.match(tagChessComPgn(pgn, "CurrentName", { black: { username: "CURRENTNAME" } }), /\[EngineDialogueColor "b"\]/);
  assert.doesNotMatch(tagChessComPgn(pgn, "CurrentName", { white: { username: "SomeoneElse" } }), /EngineDialogueColor/);
});

test("serves the Chess960 browser modules from their actual package files", () => {
  const chess960 = staticSourceForPath("/vendor/cm-chess/Chess.js");
  const pgn = staticSourceForPath("/vendor/cm-pgn/src/Pgn.js");
  const rules = staticSourceForPath("/vendor/chess.mjs/src/Chess.js");
  assert.equal(chess960.allowed, true);
  assert.match(chess960.source, /cm-chess[\\/]src[\\/]Chess\.js$/);
  assert.equal(pgn.allowed, true);
  assert.match(pgn.source, /cm-pgn[\\/]src[\\/]Pgn\.js$/);
  assert.equal(rules.allowed, true);
  assert.match(rules.source, /chess\.mjs[\\/]src[\\/]Chess\.js$/);
});

test("collects most recent Chess.com PGNs from documented monthly archives", async () => {
  const responses = new Map([
    ["https://api.chess.com/pub/player/tester/games/archives", { archives: ["https://api.chess.com/pub/player/tester/games/2026/01", "https://api.chess.com/pub/player/tester/games/2026/02"] }],
    ["https://api.chess.com/pub/player/tester/games/2026/02", { games: [{ pgn: "[Event \"Newest\"]\n\n1. e4 e5" }, { pgn: "[Event \"Latest\"]\n\n1. d4 d5" }] }],
    ["https://api.chess.com/pub/player/tester/games/2026/01", { games: [{ pgn: "[Event \"Oldest\"]\n\n1. Nf3 d5" }] }],
  ]);
  const mockFetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () => responses.get(String(url)),
  });
  const result = await fetchPublicGames("chesscom", "tester", 2, mockFetch);
  assert.equal(result.count, 2);
  assert.match(result.pgn, /Newest/);
  assert.match(result.pgn, /Latest/);
});

test("collects all Chess.com monthly archives when requested", async () => {
  const responses = new Map([
    ["https://api.chess.com/pub/player/tester/games/archives", { archives: ["https://api.chess.com/pub/player/tester/games/2026/01", "https://api.chess.com/pub/player/tester/games/2026/02"] }],
    ["https://api.chess.com/pub/player/tester/games/2026/02", { games: [{ pgn: "[Event \"Newest\"]\n\n1. e4 e5" }] }],
    ["https://api.chess.com/pub/player/tester/games/2026/01", { games: [{ pgn: "[Event \"Oldest\"]\n\n1. Nf3 d5" }] }],
  ]);
  const mockFetch = async (url) => ({ ok: true, status: 200, json: async () => responses.get(String(url)) });
  const result = await fetchPublicGames("chesscom", "tester", "all", mockFetch);
  assert.equal(result.count, 2);
  assert.ok(result.pgn.indexOf("Newest") < result.pgn.indexOf("Oldest"));
});

test("requests Lichess user games as PGN", async () => {
  let requestedUrl = "";
  let requestedAccept = "";
  const mockFetch = async (url, options) => {
    requestedUrl = String(url);
    requestedAccept = options.headers.Accept;
    return { ok: true, status: 200, text: async () => "[Event \"Lichess\"]\n\n1. c4 e5" };
  };
  const result = await fetchPublicGames("lichess", "tester", 10, mockFetch);
  assert.equal(result.provider, "lichess");
  assert.match(requestedUrl, /api\/games\/user\/tester/);
  assert.match(requestedUrl, /max=10/);
  assert.equal(requestedAccept, "application/x-chess-pgn");
});

test("omits the Lichess max parameter for a full archive request", async () => {
  let requestedUrl = "";
  const mockFetch = async (url) => {
    requestedUrl = String(url);
    return { ok: true, status: 200, text: async () => "[Event \"Lichess\"]\n\n1. c4 e5" };
  };
  await fetchPublicGames("lichess", "tester", "all", mockFetch);
  assert.doesNotMatch(requestedUrl, /[?&]max=/);
});
