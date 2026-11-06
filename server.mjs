/**
 * Localhost UCI bridge for Alpha.
 *
 * The browser only receives structured engine output. The configured executable
 * is started on this computer, and the server intentionally binds to loopback.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const ROOT = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = join(ROOT, "static");
const VENDOR_CHESS = join(ROOT, "node_modules", "chess.js", "dist", "esm", "chess.js");
const VENDOR_MODULE_DIRS = [
  { prefix: "/vendor/cm-chess/", root: join(ROOT, "node_modules", "cm-chess", "src") },
  { prefix: "/vendor/cm-pgn/", root: join(ROOT, "node_modules", "cm-pgn") },
  { prefix: "/vendor/chess.mjs/", root: join(ROOT, "node_modules", "chess.mjs") },
];
const MAX_DEPTH = 28;
const MAX_MULTI_PV = 5;
const MAX_BODY_BYTES = 32_000;
const ENGINE_TIMEOUT_MS = 45_000;
const MAX_REVIEW_ANALYSIS_MS = 15_000;
const REMOTE_TIMEOUT_MS = 18_000;
const PROFILE_USER_AGENT = "Engine-Dialogue/0.2 (local chess study tool)";

export class EngineError extends Error {}
export class RemoteGamesError extends Error {}

export function isSafePlayerName(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value.trim());
}

export function normalizeGameLimit(value, fallback = 20) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "all") return null;
  return clampInteger(normalized, fallback, 1, Number.MAX_SAFE_INTEGER);
}

// Chess.com's JSON game object identifies the requested account's colour even
// when an older PGN header uses a former display name. Keep that information
// in a private, harmless PGN tag so the local coach can still attribute every
// game to the correct side.
export function tagChessComPgn(pgn, username, game) {
  const source = String(pgn || "").trim();
  const account = String(username || "").trim().toLowerCase();
  if (!source || !account) return source;
  const white = String(game?.white?.username || "").trim().toLowerCase();
  const black = String(game?.black?.username || "").trim().toLowerCase();
  const color = white === account ? "w" : black === account ? "b" : "";
  if (!color) return source;
  const tag = `[EngineDialogueColor "${color}"]`;
  // Keep the Event tag first so ordinary PGN archive splitting still treats
  // this as one complete game.
  if (/^\s*\[Event\s+"/m.test(source)) {
    return source.replace(/^(\s*\[Event\s+"[^\r\n]*"\]\r?\n)/m, `$1${tag}\n`);
  }
  return `${tag}\n${source}`;
}

async function fetchWithTimeout(url, options = {}, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw new RemoteGamesError("The game archive did not respond in time. Try fewer games.");
    throw new RemoteGamesError("Could not reach the public game archive. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }
}

async function readRemoteJson(response, provider) {
  if (!response.ok) {
    if (response.status === 404) throw new RemoteGamesError(`${provider} could not find that public username.`);
    if (response.status === 429) throw new RemoteGamesError(`${provider} is rate-limiting requests. Please wait a moment and try again.`);
    throw new RemoteGamesError(`${provider} returned ${response.status} while reading public games.`);
  }
  try {
    return await response.json();
  } catch {
    throw new RemoteGamesError(`${provider} returned an unreadable game archive.`);
  }
}

async function fetchChessComGames(username, maxGames, fetchImpl) {
  const headers = { "User-Agent": PROFILE_USER_AGENT, Accept: "application/json" };
  const archiveResponse = await fetchWithTimeout(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
    { headers },
    fetchImpl,
  );
  const archivePayload = await readRemoteJson(archiveResponse, "Chess.com");
  const archives = Array.isArray(archivePayload.archives) ? archivePayload.archives : [];
  if (!archives.length) throw new RemoteGamesError("Chess.com did not return any public game archives for that username.");

  const pgnGames = [];
  for (const archiveUrl of [...archives].reverse()) {
    if (maxGames !== null && pgnGames.length >= maxGames) break;
    const monthResponse = await fetchWithTimeout(archiveUrl, { headers }, fetchImpl);
    const monthPayload = await readRemoteJson(monthResponse, "Chess.com");
    const monthGames = Array.isArray(monthPayload.games) ? monthPayload.games : [];
    for (const game of monthGames.reverse()) {
      if (typeof game.pgn === "string" && game.pgn.trim()) pgnGames.push(tagChessComPgn(game.pgn, username, game));
      if (maxGames !== null && pgnGames.length >= maxGames) break;
    }
  }
  if (!pgnGames.length) throw new RemoteGamesError("Chess.com returned no readable PGNs in the selected public archive.");
  return { provider: "chesscom", username, pgn: pgnGames.join("\n\n"), count: pgnGames.length };
}

async function fetchLichessGames(username, maxGames, fetchImpl) {
  const endpoint = new URL(`https://lichess.org/api/games/user/${encodeURIComponent(username)}`);
  if (maxGames !== null) endpoint.searchParams.set("max", String(maxGames));
  endpoint.searchParams.set("sort", "dateDesc");
  endpoint.searchParams.set("clocks", "false");
  endpoint.searchParams.set("evals", "false");
  endpoint.searchParams.set("opening", "true");
  const response = await fetchWithTimeout(endpoint, {
    headers: { "User-Agent": PROFILE_USER_AGENT, Accept: "application/x-chess-pgn" },
  }, fetchImpl);
  if (!response.ok) {
    if (response.status === 404) throw new RemoteGamesError("Lichess could not find that public username.");
    if (response.status === 429) throw new RemoteGamesError("Lichess is rate-limiting requests. Please wait a moment and try again.");
    throw new RemoteGamesError(`Lichess returned ${response.status} while reading public games.`);
  }
  const pgn = (await response.text()).trim();
  if (!pgn) throw new RemoteGamesError("Lichess returned no readable public games for that username.");
  const count = (pgn.match(/^\s*\[Event\s+"/gm) || []).length || 1;
  return { provider: "lichess", username, pgn, count: maxGames === null ? count : Math.min(maxGames, count) };
}

export async function fetchPublicGames(provider, username, requestedLimit, fetchImpl = fetch) {
  const safeProvider = String(provider || "").toLowerCase();
  const safeUsername = String(username || "").trim();
  if (!isSafePlayerName(safeUsername)) {
    throw new RemoteGamesError("Enter a public username using only letters, numbers, underscores, or hyphens.");
  }
  const maxGames = normalizeGameLimit(requestedLimit);
  if (safeProvider === "chesscom") return fetchChessComGames(safeUsername, maxGames, fetchImpl);
  if (safeProvider === "lichess") return fetchLichessGames(safeUsername, maxGames, fetchImpl);
  throw new RemoteGamesError("Choose Chess.com or Lichess.");
}

export function parseUciInfo(line) {
  const tokens = line.trim().split(/\s+/);
  try {
    const depth = Number.parseInt(tokens[tokens.indexOf("depth") + 1], 10);
    const rank = tokens.includes("multipv") ? Number.parseInt(tokens[tokens.indexOf("multipv") + 1], 10) : 1;
    const scoreIndex = tokens.indexOf("score");
    const scoreType = tokens[scoreIndex + 1];
    const scoreValue = Number.parseInt(tokens[scoreIndex + 2], 10);
    const pvIndex = tokens.indexOf("pv");
    const pv = tokens.slice(pvIndex + 1);
    if (!Number.isFinite(depth) || !Number.isFinite(rank) || !Number.isFinite(scoreValue)) return null;
    if (!["cp", "mate"].includes(scoreType) || !pv.length) return null;
    return { rank, depth, score: { type: scoreType, value: scoreValue }, pv };
  } catch {
    return null;
  }
}

export function isCompleteFen(fen) {
  const fields = typeof fen === "string" ? fen.trim().split(/\s+/) : [];
  if (fields.length !== 6 || !["w", "b"].includes(fields[1])) return false;
  const ranks = fields[0].split("/");
  if (ranks.length !== 8) return false;
  return ranks.every((rank) => {
    let squares = 0;
    for (const character of rank) {
      if (/^[1-8]$/.test(character)) squares += Number(character);
      else if (/^[prnbqkPRNBQK]$/.test(character)) squares += 1;
      else return false;
    }
    return squares === 8;
  });
}

class UciEngine {
  constructor(executable) {
    this.executable = executable;
    this.child = null;
    // The engine is presented to the local player as their chess guide, Alpha.
    // The executable remains configurable without exposing its product name in
    // the app's chat or status display.
    this.name = "Alpha";
    this.lastError = null;
    this.lines = [];
    this.pendingLine = null;
    this.partialLine = "";
    this.startPromise = null;
    this.analysisQueue = Promise.resolve();
  }

  get isRunning() {
    return Boolean(this.child && this.child.exitCode === null && !this.child.killed);
  }

  async start() {
    if (this.isRunning) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.#start();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async #start() {
    if (!this.executable || !existsSync(this.executable)) {
      throw this.#error(`Engine file was not found: ${this.executable || "no path configured"}`);
    }
    this.lines = [];
    this.partialLine = "";
    try {
      this.child = spawn(this.executable, [], {
        cwd: dirname(this.executable),
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      throw this.#error(`Could not start engine: ${error.message}`);
    }
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (data) => this.#readOutput(data));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", () => {}); // UCI data is expected on stdout.
    this.child.once("error", (error) => this.#fail(`Could not start engine: ${error.message}`));
    this.child.once("exit", (code) => {
      if (code !== 0 && code !== null) this.#fail(`The engine exited unexpectedly (code ${code}).`);
      else this.#rejectLineWaiter(new EngineError("The engine stopped."));
    });

    this.#send("uci");
    await this.#waitFor((line) => line === "uciok", 12_000);
    this.#send("isready");
    await this.#waitFor((line) => line === "readyok", 12_000);
    this.lastError = null;
  }

  analyse(fen, depth, multiPv, chess960 = false, timeLimitMs = null, reuseGame = false) {
    const run = this.analysisQueue.then(() => this.#analyse(fen, depth, multiPv, chess960, timeLimitMs, reuseGame));
    this.analysisQueue = run.catch(() => undefined);
    return run;
  }

  async #analyse(fen, requestedDepth, requestedMultiPv, chess960, requestedTimeLimitMs, reuseGame) {
    if (!isCompleteFen(fen)) throw new EngineError("This does not look like a complete FEN position.");
    await this.start();
    const depth = clampInteger(requestedDepth, 20, 1, MAX_DEPTH);
    const multiPv = clampInteger(requestedMultiPv, 3, 1, MAX_MULTI_PV);
    const timeLimitMs = Number.isFinite(Number(requestedTimeLimitMs))
      ? clampInteger(requestedTimeLimitMs, MAX_REVIEW_ANALYSIS_MS, 50, MAX_REVIEW_ANALYSIS_MS)
      : null;
    try {
      this.#send(`setoption name MultiPV value ${multiPv}`);
      this.#send(`setoption name UCI_Chess960 value ${chess960 ? "true" : "false"}`);
      if (!reuseGame) {
        this.#send("ucinewgame");
        this.#send("isready");
        await this.#waitFor((line) => line === "readyok", 10_000);
      }
      this.#send(`position fen ${fen}`);
      this.#send(`go depth ${depth}${timeLimitMs ? ` movetime ${timeLimitMs}` : ""}`);

      const candidates = new Map();
      let bestMove = null;
      const deadline = Date.now() + (timeLimitMs ? timeLimitMs + 1_500 : ENGINE_TIMEOUT_MS);
      while (Date.now() < deadline) {
        let line;
        try {
          line = await this.#nextLine(Math.min(500, Math.max(1, deadline - Date.now())));
        } catch (error) {
          if (error.message === "Engine did not respond before the timeout.") continue;
          throw error;
        }
        if (line.startsWith("info ") && line.includes(" score ") && line.includes(" pv ")) {
          const parsed = parseUciInfo(line);
          if (parsed && (!candidates.has(parsed.rank) || parsed.depth >= candidates.get(parsed.rank).depth)) {
            candidates.set(parsed.rank, parsed);
          }
        }
        if (line.startsWith("bestmove ")) {
          const token = line.trim().split(/\s+/)[1];
          bestMove = token && token !== "(none)" ? token : null;
          return {
            engine: this.name,
            depth: Math.max(0, ...[...candidates.values()].map((candidate) => candidate.depth)),
            bestMove,
            timeLimitMs,
            lines: [...candidates.values()].sort((a, b) => a.rank - b.rank),
          };
        }
      }
      try {
        this.#send("stop");
        await this.#waitFor((line) => line.startsWith("bestmove "), 2_000);
      } catch {}
      throw new EngineError(timeLimitMs ? "Engine analysis exceeded the game-review time limit." : "Engine analysis exceeded the 45-second limit.");
    } catch (error) {
      this.lastError = error.message;
      throw error;
    }
  }

  stop() {
    if (!this.child) return;
    const process = this.child;
    try { this.#send("quit"); } catch {}
    const forceStop = setTimeout(() => {
      if (process.exitCode === null && !process.killed) process.kill();
    }, 1_500);
    forceStop.unref();
    this.child = null;
  }

  #readOutput(data) {
    this.partialLine += data;
    const fragments = this.partialLine.split(/\r?\n/);
    this.partialLine = fragments.pop() || "";
    fragments.forEach((line) => this.#receiveLine(line.trim()));
  }

  #receiveLine(line) {
    if (!line) return;
    if (line.startsWith("id name ")) this.engineProductName = line.slice(8).trim();
    if (this.pendingLine) {
      const waiter = this.pendingLine;
      this.pendingLine = null;
      waiter.resolve(line);
    } else {
      this.lines.push(line);
    }
  }

  #send(command) {
    if (!this.isRunning || !this.child?.stdin.writable) throw this.#error("The engine process is not running.");
    this.child.stdin.write(`${command}\n`);
  }

  async #waitFor(predicate, timeout) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      let line;
      try {
        line = await this.#nextLine(Math.min(500, Math.max(1, deadline - Date.now())));
      } catch (error) {
        if (error.message === "Engine did not respond before the timeout.") continue;
        throw error;
      }
      if (predicate(line)) return line;
    }
    throw this.#error("Engine did not respond before the timeout.");
  }

  #nextLine(timeout) {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    if (!this.isRunning) return Promise.reject(this.#error("The engine process is not running."));
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingLine?.timeoutId === timeoutId) this.pendingLine = null;
        reject(new EngineError("Engine did not respond before the timeout."));
      }, timeout);
      this.pendingLine = {
        timeoutId,
        resolve: (line) => {
          clearTimeout(timeoutId);
          resolve(line);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      };
    });
  }

  #rejectLineWaiter(error) {
    if (this.pendingLine) {
      const waiter = this.pendingLine;
      this.pendingLine = null;
      waiter.reject(error);
    }
  }

  #fail(message) {
    this.lastError = message;
    this.#rejectLineWaiter(new EngineError(message));
  }

  #error(message) {
    this.lastError = message;
    return new EngineError(message);
  }
}

function clampInteger(value, fallback, minimum, maximum) {
  const integer = Number.parseInt(value, 10);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(integer) ? integer : fallback));
}

function openInDefaultBrowser(url) {
  let opener;
  if (process.platform === "win32") {
    opener = spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true });
  } else if (process.platform === "darwin") {
    opener = spawn("open", [url], { detached: true, stdio: "ignore" });
  } else {
    opener = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
  }
  opener.once("error", () => console.log(`Could not open a browser automatically. Open ${url} yourself.`));
  opener.unref();
}

function mimeType(path) {
  return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" })[extname(path)] || "application/octet-stream";
}

function json(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload), "Cache-Control": "no-store" });
  response.end(payload);
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new EngineError("Request is too large.");
  }
  try { return JSON.parse(body); } catch { throw new EngineError("Request body must be JSON."); }
}

export function staticSourceForPath(requestPath) {
  const pathname = requestPath === "/" ? "/index.html" : requestPath;
  const vendorDirectory = VENDOR_MODULE_DIRS.find(({ prefix }) => pathname.startsWith(prefix));
  const source = pathname === "/vendor/chess.js"
    ? VENDOR_CHESS
    : vendorDirectory
      ? resolve(vendorDirectory.root, pathname.slice(vendorDirectory.prefix.length))
      : resolve(STATIC_DIR, `.${pathname}`);
  const isAllowedVendorModule = vendorDirectory
    && (source === vendorDirectory.root || source.startsWith(`${vendorDirectory.root}\\`) || source.startsWith(`${vendorDirectory.root}/`));
  const allowed = source === VENDOR_CHESS
    || isAllowedVendorModule
    || source.startsWith(`${STATIC_DIR}\\`)
    || source.startsWith(`${STATIC_DIR}/`);
  return { pathname, source, allowed };
}

async function serveStatic(requestPath, response) {
  const { pathname, source, allowed } = staticSourceForPath(requestPath);
  if (!allowed) {
    json(response, 403, { error: "Forbidden." });
    return;
  }
  try {
    const sourceStats = await stat(source);
    if (!sourceStats.isFile()) throw new Error("not a file");
    const content = await readFile(source);
    response.writeHead(200, { "Content-Type": mimeType(source), "Content-Length": content.length, "Cache-Control": "no-store" });
    response.end(content);
  } catch {
    json(response, 404, { error: pathname.startsWith("/vendor/") ? "Run npm install before starting the app." : "Not found." });
  }
}

async function makeApp() {
  const configText = await readFile(join(ROOT, "engine_config.json"), "utf8").catch(() => "{}");
  let config = {};
  try { config = JSON.parse(configText); } catch {}
  const argv = process.argv.slice(2);
  const valueAfter = (flag) => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
  const enginePath = valueAfter("--engine") || process.env.CHESS_ENGINE_PATH || config.enginePath || null;
  const port = clampInteger(valueAfter("--port") || process.env.PORT, 8787, 1024, 65_535);
  const shouldOpenBrowser = !argv.includes("--no-open") && config.openBrowser !== false;
  // A configured relative path is relative to this app, not to whichever
  // directory happened to invoke `npm start`.
  const engine = enginePath ? new UciEngine(resolve(ROOT, enginePath)) : null;

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (request.method === "OPTIONS") {
      response.writeHead(204, { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
      response.end();
      return;
    }
    if (request.method === "GET" && url.pathname === "/health") {
      if (engine?.isRunning) json(response, 200, { ready: true, engine: engine.name });
      else if (engine) json(response, 503, { ready: false, error: engine.lastError || "Engine is not running." });
      else json(response, 503, { ready: false, error: "No engine path configured." });
      return;
    }
    if (request.method === "GET" && url.pathname === "/public-games") {
      try {
        const result = await fetchPublicGames(
          url.searchParams.get("provider"),
          url.searchParams.get("username"),
          url.searchParams.get("max"),
        );
        json(response, 200, result);
      } catch (error) {
        json(response, error instanceof RemoteGamesError ? 400 : 502, { error: error.message || "Could not read public games." });
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/analyze") {
      try {
        const payload = await readJson(request);
        if (!engine) throw new EngineError("No engine configured. Add engine_config.json or start with --engine.");
        const result = await engine.analyse(payload.fen, payload.depth, payload.multiPv, payload.chess960 === true, payload.timeLimitMs, payload.reuseGame === true);
        json(response, 200, result);
      } catch (error) {
        json(response, error instanceof EngineError ? 400 : 500, { error: error.message || "Unexpected analysis error." });
      }
      return;
    }
    if (request.method === "GET") return serveStatic(url.pathname, response);
    json(response, 404, { error: "Not found." });
  });
  return { server, engine, port, shouldOpenBrowser };
}

async function main() {
  const { server, engine, port, shouldOpenBrowser } = await makeApp();
  if (!engine) console.log("No engine configured. The UI will show setup instructions.");
  else {
    try {
      await engine.start();
      console.log(`Connected to ${engine.name}.`);
    } catch (error) {
      console.log(`Engine not ready: ${error.message}`);
    }
  }
  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`Alpha is running at ${url}`);
    if (shouldOpenBrowser) openInDefaultBrowser(url);
  });
  const close = () => {
    engine?.stop();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
