const ENGINE_WORKER_URL = "/vendor/stockfish/stockfish-19-lite-single.js";
const ENGINE_START_TIMEOUT_MS = 20_000;
// A depth-20 Stockfish pass can take more than one minute on a modest phone.
// Do not silently stop it at a shallow depth and report that result as final.
const ENGINE_ANALYSIS_TIMEOUT_MS = 180_000;

export function isStandaloneAlpha() {
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function parseUciInfo(line) {
  const tokens = String(line || "").trim().split(/\s+/);
  const depthIndex = tokens.indexOf("depth");
  const scoreIndex = tokens.indexOf("score");
  const pvIndex = tokens.indexOf("pv");
  if (depthIndex < 0 || scoreIndex < 0 || pvIndex < 0) return null;
  const depth = Number.parseInt(tokens[depthIndex + 1], 10);
  const rankIndex = tokens.indexOf("multipv");
  const rank = rankIndex < 0 ? 1 : Number.parseInt(tokens[rankIndex + 1], 10);
  const type = tokens[scoreIndex + 1];
  const value = Number.parseInt(tokens[scoreIndex + 2], 10);
  const pv = tokens.slice(pvIndex + 1);
  if (!Number.isFinite(depth) || !Number.isFinite(rank) || !Number.isFinite(value) || !["cp", "mate"].includes(type) || !pv.length) return null;
  return { rank, depth, score: { type, value }, pv };
}

class BrowserUciEngine {
  constructor() {
    this.worker = null;
    this.starting = null;
    this.queue = Promise.resolve();
    this.activeAnalysis = null;
  }

  async start() {
    if (this.worker) return;
    if (this.starting) return this.starting;
    this.starting = new Promise((resolve, reject) => {
      let startupState = "uci";
      const timeout = window.setTimeout(() => fail(new Error("Alpha took too long to start on this device.")), ENGINE_START_TIMEOUT_MS);
      const settle = (callback, value) => {
        window.clearTimeout(timeout);
        callback(value);
      };
      const fail = (error) => {
        this.worker?.terminate();
        this.worker = null;
        settle(reject, error);
      };
      try {
        this.worker = new Worker(ENGINE_WORKER_URL, { name: "alpha-stockfish" });
        this.worker.addEventListener("error", () => fail(new Error("Alpha’s local engine could not start.")), { once: true });
        this.worker.addEventListener("message", (event) => {
          const line = String(event.data || "").trim();
          if (startupState === "uci" && line === "uciok") {
            startupState = "ready";
            this.send("isready");
            return;
          }
          if (startupState === "ready" && line === "readyok") {
            startupState = "running";
            settle(resolve);
            return;
          }
          this.activeAnalysis?.onLine(line);
        });
        this.send("uci");
      } catch (error) {
        fail(error instanceof Error ? error : new Error("Alpha’s local engine could not start."));
      }
    });
    return this.starting.catch((error) => {
      this.starting = null;
      throw error;
    });
  }

  send(command) {
    if (!this.worker) throw new Error("Alpha’s local engine is not running.");
    this.worker.postMessage(command);
  }

  async analyse({ fen, depth, multiPv = 1, chess960 = false }) {
    await this.start();
    const run = this.queue.then(() => this.runAnalysis({ fen, depth, multiPv, chess960 }));
    this.queue = run.catch(() => undefined);
    return run;
  }

  runAnalysis({ fen, depth, multiPv, chess960 }) {
    const requestedDepth = Math.max(1, Math.min(28, Number.parseInt(depth, 10) || 20));
    const requestedMultiPv = Math.max(1, Math.min(5, Number.parseInt(multiPv, 10) || 1));
    return new Promise((resolve, reject) => {
      const latestLines = new Map();
      const finish = (error, bestMove = null) => {
        if (!this.activeAnalysis) return;
        window.clearTimeout(timeout);
        this.activeAnalysis = null;
        if (error) {
          reject(error);
          return;
        }
        const lines = [...latestLines.values()].sort((left, right) => left.rank - right.rank);
        const reachedDepth = Math.max(0, ...lines.map((line) => line.depth));
        if (reachedDepth < requestedDepth) {
          reject(new Error(`Alpha reached depth ${reachedDepth} before its depth-${requestedDepth} target. This result was not used; try again and keep the app open.`));
          return;
        }
        resolve({
          bestMove: bestMove && bestMove !== "(none)" ? bestMove : lines[0]?.pv?.[0] || null,
          depth: reachedDepth,
          requestedDepth,
          lines,
        });
      };
      const timeout = window.setTimeout(() => {
        try { this.send("stop"); } catch { /* The rejection below explains the failure. */ }
        finish(new Error(`Alpha could not reach its depth-${requestedDepth} target within three minutes on this device.`));
      }, ENGINE_ANALYSIS_TIMEOUT_MS);
      this.activeAnalysis = {
        onLine: (line) => {
          const info = parseUciInfo(line);
          if (info) {
            const previous = latestLines.get(info.rank);
            if (!previous || info.depth >= previous.depth) latestLines.set(info.rank, info);
            return;
          }
          if (line.startsWith("bestmove ")) finish(null, line.split(/\s+/)[1]);
        },
      };
      try {
        this.send(`setoption name MultiPV value ${requestedMultiPv}`);
        this.send(`setoption name UCI_Chess960 value ${chess960 ? "true" : "false"}`);
        this.send("ucinewgame");
        this.send(`position fen ${fen}`);
        this.send(`go depth ${requestedDepth}`);
      } catch (error) {
        finish(error instanceof Error ? error : new Error("Alpha’s local engine could not analyse this position."));
      }
    });
  }
}

export const localAlphaEngine = new BrowserUciEngine();

function safeUsername(value) {
  return /^[A-Za-z0-9_-]{1,80}$/.test(String(value || "").trim());
}

function accountColorTag(pgn, username, game) {
  const account = String(username || "").trim().toLowerCase();
  const white = String(game?.white?.username || "").trim().toLowerCase();
  const black = String(game?.black?.username || "").trim().toLowerCase();
  const color = white === account ? "w" : black === account ? "b" : "";
  if (!color) return pgn;
  return String(pgn).replace(/^(\s*\[Event\s+"[^\r\n]*"\]\r?\n)/m, `$1[EngineDialogueColor "${color}"]\n`);
}

async function deviceFetch(url, options) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The public game archive did not respond in time. Try fewer games.");
    throw new Error("Could not reach the public game archive. Check your connection and try again.");
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function fetchPublicGamesOnDevice(provider, username, requestedLimit) {
  if (!safeUsername(username)) throw new Error("Enter a public username using only letters, numbers, underscores, or hyphens.");
  const max = String(requestedLimit || "20").toLowerCase() === "all" ? null : Math.max(1, Number.parseInt(requestedLimit, 10) || 20);
  const encodedUser = encodeURIComponent(username.trim());
  if (provider === "chesscom") {
    const archiveResponse = await deviceFetch(`https://api.chess.com/pub/player/${encodedUser}/games/archives`, { headers: { Accept: "application/json" } });
    if (!archiveResponse.ok) throw new Error(archiveResponse.status === 404 ? "Chess.com could not find that public username." : `Chess.com returned ${archiveResponse.status} while reading public games.`);
    const archivePayload = await archiveResponse.json();
    const pgns = [];
    for (const archiveUrl of [...(archivePayload.archives || [])].reverse()) {
      if (max !== null && pgns.length >= max) break;
      const monthResponse = await deviceFetch(archiveUrl, { headers: { Accept: "application/json" } });
      if (!monthResponse.ok) throw new Error(`Chess.com returned ${monthResponse.status} while reading public games.`);
      const month = await monthResponse.json();
      for (const game of [...(month.games || [])].reverse()) {
        if (game?.pgn) pgns.push(accountColorTag(game.pgn, username, game));
        if (max !== null && pgns.length >= max) break;
      }
    }
    if (!pgns.length) throw new Error("Chess.com returned no readable public games for that username.");
    return { provider: "chesscom", username, pgn: pgns.join("\n\n"), count: pgns.length };
  }
  if (provider === "lichess") {
    const endpoint = new URL(`https://lichess.org/api/games/user/${encodedUser}`);
    if (max !== null) endpoint.searchParams.set("max", String(max));
    endpoint.searchParams.set("sort", "dateDesc");
    endpoint.searchParams.set("clocks", "false");
    endpoint.searchParams.set("evals", "false");
    endpoint.searchParams.set("opening", "true");
    const response = await deviceFetch(endpoint, { headers: { Accept: "application/x-chess-pgn" } });
    if (!response.ok) throw new Error(response.status === 404 ? "Lichess could not find that public username." : `Lichess returned ${response.status} while reading public games.`);
    const pgn = (await response.text()).trim();
    if (!pgn) throw new Error("Lichess returned no readable public games for that username.");
    return { provider: "lichess", username, pgn, count: (pgn.match(/^\s*\[Event\s+"/gm) || []).length || 1 };
  }
  throw new Error("Choose Chess.com or Lichess.");
}
