import { Chess } from "/vendor/chess.js";
import { Chess as Chess960Pgn, GAME_VARIANT } from "cm-chess";
import { Chess as Chess960 } from "chess.mjs/src/Chess.js";
import { fetchPublicGamesOnDevice, isStandaloneAlpha, localAlphaEngine } from "/local-engine.js";

const STARTING_FEN = new Chess().fen();
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const PIECES = {
  w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
  b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
};
const BOARD_THEMES = ["blue", "walnut", "forest", "mono", "sand", "rosewood", "ocean", "violet", "tournament", "charcoal"];
const PIECE_THEMES = ["classic", "minimal", "contrast", "graphite", "ivory", "gold", "steel", "wood", "neon", "mono-piece"];
const OPENING_POSITIONS = [
  {
    id: "caro-kann",
    name: "Caro-Kann Defense · Classical",
    aliases: ["caro kann", "caro-kann"],
    moves: ["e2e4", "c7c6", "d2d4", "d7d5", "b1c3", "d5e4", "c3e4", "c8f5"],
  },
  {
    id: "sicilian-kan",
    name: "Sicilian Defense · Kan (solid setup)",
    aliases: ["solid sicilian", "sicilian kan", "kan sicilian"],
    moves: ["e2e4", "c7c5", "g1f3", "e7e6", "d2d4", "c5d4", "f3d4", "a7a6"],
  },
  {
    id: "sicilian-najdorf",
    name: "Sicilian Defense · Najdorf",
    aliases: ["sicilian", "najdorf"],
    moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "a7a6"],
  },
  {
    id: "french",
    name: "French Defense · Classical",
    aliases: ["french defense", "french"],
    moves: ["e2e4", "e7e6", "d2d4", "d7d5", "b1c3", "g8f6"],
  },
  {
    id: "ruy-lopez",
    name: "Ruy Lopez · Closed",
    aliases: ["ruy lopez", "spanish"],
    moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6", "e1g1", "f8e7"],
  },
  {
    id: "italian",
    name: "Italian Game · Giuoco Piano",
    aliases: ["italian game", "italian", "giuoco piano"],
    moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "d2d3", "g8f6"],
  },
  {
    id: "queens-gambit",
    name: "Queen’s Gambit Declined",
    aliases: ["queen's gambit", "queens gambit", "qgd"],
    moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c1g5", "f8e7"],
  },
  {
    id: "kings-indian",
    name: "King’s Indian Defense",
    aliases: ["king's indian", "kings indian", "kid"],
    moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6"],
  },
  {
    id: "london",
    name: "London System",
    aliases: ["london system", "london"],
    moves: ["d2d4", "d7d5", "c1f4", "g8f6", "e2e3", "e7e6", "g1f3"],
  },
  {
    id: "english",
    name: "English Opening",
    aliases: ["english opening", "english"],
    moves: ["c2c4", "e7e5", "b1c3", "g8f6", "g2g3", "d7d5"],
  },
  {
    id: "pirc",
    name: "Pirc Defense",
    aliases: ["pirc defense", "pirc"],
    moves: ["e2e4", "d7d6", "d2d4", "g8f6", "b1c3", "g7g6"],
  },
  {
    id: "scandinavian",
    name: "Scandinavian Defense",
    aliases: ["scandinavian", "scandi"],
    moves: ["e2e4", "d7d5", "e4d5", "d8d5", "b1c3", "d5a5"],
  },
  {
    id: "slav",
    name: "Slav Defense",
    aliases: ["slav defense", "slav"],
    moves: ["d2d4", "d7d5", "c2c4", "c7c6", "g1f3", "g8f6", "b1c3", "d5c4"],
  },
];
const MAX_ARROWS = 12;
const MAX_REPORT_GAMES = 4;
// Depth 20 is the default accuracy target for Alpha's on-device reports.
// It is deliberately shared by position, selected-game, and library analysis
// so an estimate is not quietly based on a shallower engine pass.
const POSITION_ANALYSIS_DEPTH = 20;
const REPORT_DEPTH = 20;
const REPORT_SAMPLES_PER_GAME = 7;
const GAME_REVIEW_DEPTH = 20;
const GAME_REVIEW_MULTI_PV = 3;
const GAME_LIST_PAGE_SIZE = 100;
const LIBRARY_AUDIT_DEPTH = 20;
const LIBRARY_PROFILE_YIELD_EVERY = 12;
const ON_DEVICE_ENGINE = isStandaloneAlpha();

const element = (id) => document.getElementById(id);
const boardElement = element("chessboard");
const fenInput = element("fen-input");
const chatLog = element("chat-log");
const gameList = element("game-list");

function readPreference(name, fallback) {
  try { return window.localStorage.getItem(`engine-dialogue:${name}`) || fallback; } catch { return fallback; }
}

function savePreference(name, value) {
  try { window.localStorage.setItem(`engine-dialogue:${name}`, value); } catch { /* Settings still work for this session. */ }
}

function createBoardGame(fen, chess960 = false) {
  return chess960 ? new Chess960(fen, { chess960: true }) : new Chess(fen);
}

let game = new Chess();
let chess960Mode = false;
let orientation = "w";
let selectedSquare = null;
let legalMoves = [];
let timeline = [{ fen: game.fen(), label: "Starting position" }];
let moveEntries = [];
let timelineIndex = 0;
let selectedDatabaseGame = null;
let databaseGames = [];
let analysis = null;
let analysisFen = null;
let isAnalyzing = false;
let engineReady = false;
let multiPv = Number(readPreference("multi-pv", "3"));
let boardTheme = readPreference("board-theme", "blue");
let pieceTheme = readPreference("piece-theme", "classic");
let currentPositionName = null;
let arrows = [];
let arrowPreview = null;
let arrowGesture = null;
let pieceGesture = null;
let lastPiecePointerUpAt = -Infinity;
let playerProfile = null;
let playerReport = null;
let isBuildingPlayerReport = false;
let selectedGameReview = null;
let isAnalyzingSelectedGame = false;
let shouldCancelSelectedGameAnalysis = false;
let visibleGameCount = GAME_LIST_PAGE_SIZE;
let gameSearchText = "";
let libraryProfile = null;
let isBuildingLibraryProfile = false;
let isScanningLibrary = false;
let shouldCancelLibraryScan = false;

function init() {
  multiPv = [1, 2, 3, 4].includes(multiPv) ? multiPv : 3;
  boardTheme = BOARD_THEMES.includes(boardTheme) ? boardTheme : "blue";
  pieceTheme = PIECE_THEMES.includes(pieceTheme) ? pieceTheme : "classic";
  element("multi-pv").value = String(multiPv);
  element("board-theme").value = boardTheme;
  element("piece-theme").value = pieceTheme;
  applyAppearance();
  fenInput.value = game.fen();
  renderAll();
  addMessage("engine", "I’m Alpha, your chess guide. Load a PGN, set up a position, or make moves on the board, then ask me a question.");
  checkEngine();
  window.setInterval(checkEngine, 20_000);

  element("flip-board").addEventListener("click", () => {
    orientation = orientation === "w" ? "b" : "w";
    renderBoard();
  });
  element("new-game").addEventListener("click", resetToNewGame);
  element("load-fen").addEventListener("click", loadFenFromField);
  fenInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loadFenFromField();
  });
  element("previous-move").addEventListener("click", () => goToTimeline(timelineIndex - 1));
  element("next-move").addEventListener("click", () => goToTimeline(timelineIndex + 1));
  element("copy-fen").addEventListener("click", copyFen);
  element("analyse-position").addEventListener("click", () => analyseAndReport(false));
  element("clear-arrows").addEventListener("click", () => clearArrows());
  element("multi-pv").addEventListener("change", (event) => {
    multiPv = Number(event.target.value);
    savePreference("multi-pv", String(multiPv));
    invalidateAnalysis();
    renderAnalysisGlance();
    renderCandidateLines();
  });
  element("board-theme").addEventListener("change", (event) => {
    boardTheme = event.target.value;
    savePreference("board-theme", boardTheme);
    applyAppearance();
  });
  element("piece-theme").addEventListener("change", (event) => {
    pieceTheme = event.target.value;
    savePreference("piece-theme", pieceTheme);
    applyAppearance();
  });
  boardElement.addEventListener("pointerdown", beginBoardGesture);
  boardElement.addEventListener("pointermove", updateBoardGesture);
  boardElement.addEventListener("pointerup", finishBoardGesture);
  boardElement.addEventListener("pointercancel", cancelBoardGesture);
  boardElement.addEventListener("contextmenu", (event) => event.preventDefault());
  element("pgn-file").addEventListener("change", importPgn);
  element("account-provider").addEventListener("change", updateAccountImportUi);
  element("fetch-account-games").addEventListener("click", fetchAccountGames);
  element("analyse-player-games").addEventListener("click", () => buildPlayerReport(true));
  element("analyse-selected-game").addEventListener("click", () => analyseSelectedGame(true));
  element("cancel-selected-game-analysis").addEventListener("click", () => {
    shouldCancelSelectedGameAnalysis = true;
    element("cancel-selected-game-analysis").textContent = "Stopping…";
  });
  element("build-library-profile").addEventListener("click", () => buildLibraryProfile(true));
  element("scan-library-engine").addEventListener("click", () => runLibraryEngineAudit(true));
  element("cancel-library-scan").addEventListener("click", () => {
    shouldCancelLibraryScan = true;
    element("cancel-library-scan").textContent = "Stopping…";
  });
  element("account-username").addEventListener("input", () => {
    playerReport = null;
  });
  element("game-search").addEventListener("input", (event) => {
    gameSearchText = event.target.value.trim().toLowerCase();
    visibleGameCount = GAME_LIST_PAGE_SIZE;
    renderDatabase();
  });
  element("clear-database").addEventListener("click", clearDatabase);
  element("clear-chat").addEventListener("click", clearChat);
  element("chat-form").addEventListener("submit", sendQuestion);
  document.querySelectorAll("[data-question]").forEach((button) => {
    button.addEventListener("click", () => askQuestion(button.dataset.question));
  });
  updateAccountImportUi();
}

function renderAll() {
  renderBoard();
  renderTimeline();
  renderPositionDetails();
  renderAnalysisGlance();
  renderCandidateLines();
  renderDatabase();
  renderSelectedGameReview();
}

function renderBoard() {
  boardElement.replaceChildren();
  const ranks = orientation === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === "w" ? FILES : [...FILES].reverse();
  const engineSquares = analysis?.bestMove ? [analysis.bestMove.slice(0, 2), analysis.bestMove.slice(2, 4)] : [];

  ranks.forEach((rank) => {
    files.forEach((file, fileIndex) => {
      const square = `${file}${rank}`;
      const piece = game.get(square);
      const squareButton = document.createElement("button");
      squareButton.dataset.square = square;
      const isDark = (FILES.indexOf(file) + rank) % 2 === 1;
      squareButton.className = `square ${isDark ? "dark" : "light"}`;
      if (selectedSquare === square) squareButton.classList.add("selected");
      if (legalMoves.some((move) => move.to === square)) {
        squareButton.classList.add("legal");
        if (piece) squareButton.classList.add("has-piece");
      }
      if (engineSquares.includes(square)) squareButton.classList.add("engine-move");
      squareButton.setAttribute("role", "gridcell");
      squareButton.setAttribute("aria-label", `${square}${piece ? `, ${piece.color === "w" ? "white" : "black"} ${piece.type}` : ", empty"}`);
      squareButton.addEventListener("click", () => {
        if (performance.now() - lastPiecePointerUpAt > 180) onSquareClick(square);
      });

      if (fileIndex === 0) {
        const rankLabel = document.createElement("span");
        rankLabel.className = "rank-label";
        rankLabel.textContent = rank;
        squareButton.append(rankLabel);
      }
      if (rank === (orientation === "w" ? 1 : 8)) {
        const fileLabel = document.createElement("span");
        fileLabel.className = "file-label";
        fileLabel.textContent = file;
        squareButton.append(fileLabel);
      }
      if (piece) {
        const pieceElement = document.createElement("span");
        pieceElement.className = `piece ${piece.color === "w" ? "white" : "black"}`;
        pieceElement.textContent = PIECES[piece.color][piece.type];
        squareButton.append(pieceElement);
      }
      boardElement.append(squareButton);
    });
  });
  renderArrows();
}

function renderTimeline() {
  const historyElement = element("move-history");
  historyElement.replaceChildren();
  moveEntries.forEach((entry, index) => {
    const button = document.createElement("button");
    button.className = "history-move";
    if (timelineIndex === index + 1) button.classList.add("current");
    const moveNumber = Math.floor(index / 2) + 1;
    button.textContent = index % 2 === 0 ? `${moveNumber}. ${entry.san}` : entry.san;
    button.title = entry.uci || entry.san;
    button.addEventListener("click", () => goToTimeline(index + 1));
    historyElement.append(button);
  });
  element("previous-move").disabled = timelineIndex === 0;
  element("next-move").disabled = timelineIndex >= timeline.length - 1;
  element("previous-move").title = timelineIndex === 0 ? "At the first position" : "Previous move";
  element("next-move").title = timelineIndex >= timeline.length - 1 ? "At the latest position" : "Next move";
}

function renderPositionDetails() {
  fenInput.value = game.fen();
  const activeColor = game.turn() === "w" ? "White" : "Black";
  const title = currentPositionName
    ? `${currentPositionName} · ${activeColor} to move`
    : selectedDatabaseGame !== null
    ? `${databaseGames[selectedDatabaseGame].white} — ${databaseGames[selectedDatabaseGame].black}`
    : timelineIndex === 0 && moveEntries.length === 0 ? "Starting position" : `${activeColor} to move`;
  element("position-title").textContent = title;
}

function renderAnalysisGlance() {
  if (!analysis || analysisFen !== game.fen()) {
    element("evaluation-value").textContent = "—";
    element("evaluation-caption").textContent = "Run an analysis to begin";
    element("best-move-value").textContent = "—";
    element("engine-depth").textContent = `Target depth ${POSITION_ANALYSIS_DEPTH}`;
    return;
  }
  const principal = analysis.lines?.[0];
  element("evaluation-value").textContent = principal ? formatScore(principal.score) : "—";
  element("evaluation-caption").textContent = principal ? evaluationCaption(principal.score) : "No score returned";
  element("best-move-value").textContent = analysis.bestMove ? uciToSan(game.fen(), analysis.bestMove) : "—";
  const achievedDepth = analysis.depth || principal?.depth || "—";
  const requestedDepth = analysis.requestedDepth || POSITION_ANALYSIS_DEPTH;
  element("engine-depth").textContent = `Depth ${achievedDepth}/${requestedDepth} · ${analysis.lines.length} line${analysis.lines.length === 1 ? "" : "s"}`;
}

function renderCandidateLines() {
  const container = element("candidate-lines");
  container.replaceChildren();
  if (!analysis || analysisFen !== game.fen()) {
    const note = document.createElement("p");
    note.textContent = `Select between one and four lines, then analyse to compare Alpha’s best ${multiPv === 1 ? "move" : "moves"}.`;
    container.append(note);
    return;
  }
  analysis.lines.slice(0, multiPv).forEach((candidate) => {
    const row = document.createElement("div");
    row.className = "candidate-line";
    const rank = document.createElement("span");
    rank.className = "candidate-rank";
    rank.textContent = candidate.rank;
    const details = document.createElement("div");
    const move = document.createElement("span");
    move.className = "candidate-move";
    move.textContent = candidate.pv?.[0] ? uciToSan(game.fen(), candidate.pv[0]) : "—";
    const pv = document.createElement("span");
    pv.className = "candidate-pv";
    pv.textContent = formatPv(game.fen(), candidate.pv, 4);
    details.append(move, pv);
    const score = document.createElement("span");
    score.className = "candidate-score";
    score.textContent = formatScore(candidate.score);
    row.append(rank, details, score);
    container.append(row);
  });
}

function renderDatabase() {
  gameList.replaceChildren();
  if (!databaseGames.length) {
    gameList.append(element("empty-library-template").content.cloneNode(true));
    return;
  }
  const matchingGames = databaseGames
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => {
      if (!gameSearchText) return true;
      return [record.white, record.black, record.event, record.date, record.result, record.eco]
        .join(" ")
        .toLowerCase()
        .includes(gameSearchText);
    });
  const visibleGames = matchingGames.slice(0, visibleGameCount);
  const summary = document.createElement("p");
  summary.className = "game-list-summary";
  summary.textContent = matchingGames.length === databaseGames.length
    ? `Showing ${visibleGames.length} of ${databaseGames.length} loaded games.`
    : `Showing ${visibleGames.length} of ${matchingGames.length} matching games (${databaseGames.length} loaded).`;
  gameList.append(summary);
  visibleGames.forEach(({ record, index }) => {
    const card = document.createElement("button");
    card.className = "game-card";
    if (selectedDatabaseGame === index) card.classList.add("active");
    const players = document.createElement("div");
    players.className = "game-players";
    players.textContent = `${record.white} — ${record.black}`;
    const meta = document.createElement("div");
    meta.className = "game-meta";
    const event = document.createElement("span");
    event.textContent = record.event || "Untitled game";
    const result = document.createElement("span");
    result.textContent = record.result || "*";
    meta.append(event, result);
    card.append(players, meta);
    card.addEventListener("click", () => loadDatabaseGame(index));
    gameList.append(card);
  });
  if (visibleGames.length < matchingGames.length) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "show-more-games";
    more.textContent = `Show ${Math.min(GAME_LIST_PAGE_SIZE, matchingGames.length - visibleGames.length)} more games`;
    more.addEventListener("click", () => {
      visibleGameCount += GAME_LIST_PAGE_SIZE;
      renderDatabase();
    });
    gameList.append(more);
  }
}

function onSquareClick(square) {
  const targetMove = legalMoves.find((move) => move.to === square);
  if (selectedSquare && targetMove) {
    movePieceToSquare(selectedSquare, square, legalMoves);
    return;
  }
  const piece = game.get(square);
  if (piece?.color === game.turn()) {
    selectedSquare = square;
    legalMoves = game.moves({ square, verbose: true });
  } else {
    selectedSquare = null;
    legalMoves = [];
  }
  renderBoard();
}

function movePieceToSquare(from, to, moves = game.moves({ square: from, verbose: true })) {
  const matchingMoves = moves.filter((move) => move.to === to);
  if (!matchingMoves.length) {
    selectedSquare = from;
    legalMoves = moves;
    renderBoard();
    return false;
  }
  let promotion = matchingMoves[0].promotion;
  if (matchingMoves.length > 1) {
    const chosen = window.prompt("Promote to queen, rook, bishop, or knight? (q/r/b/n)", "q");
    promotion = /^[qrbn]$/i.test(chosen || "") ? chosen.toLowerCase() : "q";
  }
  const move = game.move({ from, to, promotion });
  if (!move) return false;
  appendManualMove(move);
  selectedSquare = null;
  legalMoves = [];
  renderAll();
  return true;
}

function appendManualMove(move) {
  if (!move) return;
  timeline = timeline.slice(0, timelineIndex + 1);
  moveEntries = moveEntries.slice(0, timelineIndex);
  timeline.push({ fen: move.after || game.fen(), label: move.san });
  moveEntries.push({ san: move.san, uci: move.lan || `${move.from}${move.to}${move.promotion || ""}` });
  timelineIndex = timeline.length - 1;
  selectedDatabaseGame = null;
  selectedGameReview = null;
  clearArrows(false);
  invalidateAnalysis();
}

function goToTimeline(index) {
  const position = timeline[index];
  if (!position || index === timelineIndex) return;
  try {
    game = createBoardGame(position.fen, chess960Mode);
    timelineIndex = index;
    selectedSquare = null;
    legalMoves = [];
    clearArrows(false);
    renderAll();
  } catch (error) {
    addMessage("system", `Could not return to that move: ${error.message}`);
  }
}

function resetToNewGame() {
  game = new Chess();
  chess960Mode = false;
  timeline = [{ fen: game.fen(), label: "Starting position" }];
  moveEntries = [];
  timelineIndex = 0;
  selectedDatabaseGame = null;
  selectedGameReview = null;
  currentPositionName = null;
  selectedSquare = null;
  legalMoves = [];
  clearArrows(false);
  invalidateAnalysis();
  renderAll();
}

function loadFenFromField() {
  try {
    const fen = fenInput.value.trim();
    chess960Mode = isChess960Fen(fen);
    const nextGame = createBoardGame(fen, chess960Mode);
    game = nextGame;
    timeline = [{ fen: game.fen(), label: "Custom FEN" }];
    moveEntries = [];
    timelineIndex = 0;
    selectedDatabaseGame = null;
    selectedGameReview = null;
    currentPositionName = null;
    selectedSquare = null;
    legalMoves = [];
    clearArrows(false);
    invalidateAnalysis();
    renderAll();
    addMessage("system", chess960Mode ? "Loaded the Chess960 FEN position." : "Loaded the FEN position.");
  } catch (error) {
    addMessage("system", `Could not load that FEN: ${error.message}`);
  }
}

function invalidateAnalysis() {
  analysis = null;
  analysisFen = null;
}

function applyAppearance() {
  document.documentElement.dataset.boardTheme = element("board-theme").value;
  document.documentElement.dataset.pieceTheme = element("piece-theme").value;
}

function squareAtPointer(event) {
  const rect = boardElement.getBoundingClientRect();
  const contentLeft = rect.left + boardElement.clientLeft;
  const contentTop = rect.top + boardElement.clientTop;
  const width = boardElement.clientWidth;
  const height = boardElement.clientHeight;
  const column = Math.floor((event.clientX - contentLeft) / (width / 8));
  const row = Math.floor((event.clientY - contentTop) / (height / 8));
  if (column < 0 || column > 7 || row < 0 || row > 7) return null;
  const files = orientation === "w" ? FILES : [...FILES].reverse();
  const ranks = orientation === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  return `${files[column]}${ranks[row]}`;
}

function beginBoardGesture(event) {
  if (event.button === 2) {
    beginArrowGesture(event);
    return;
  }
  if (event.button !== 0) return;
  const from = squareAtPointer(event);
  const piece = from ? game.get(from) : null;
  if (!from || piece?.color !== game.turn()) return;
  pieceGesture = {
    from,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    dragged: false,
  };
  boardElement.setPointerCapture(event.pointerId);
}

function updateBoardGesture(event) {
  if (arrowGesture?.pointerId === event.pointerId) {
    updateArrowGesture(event);
    return;
  }
  if (!pieceGesture || event.pointerId !== pieceGesture.pointerId) return;
  const distance = Math.hypot(event.clientX - pieceGesture.startX, event.clientY - pieceGesture.startY);
  if (distance < 7) return;
  if (!pieceGesture.dragged) {
    pieceGesture.dragged = true;
    boardElement.classList.add("dragging-piece");
    boardElement.querySelector(`[data-square="${pieceGesture.from}"]`)?.classList.add("drag-origin");
    boardElement.setPointerCapture(event.pointerId);
  }
}

function finishBoardGesture(event) {
  if (arrowGesture?.pointerId === event.pointerId) {
    finishArrowGesture(event);
    return;
  }
  if (event.button !== 0 || !pieceGesture || event.pointerId !== pieceGesture.pointerId) return;
  const gesture = pieceGesture;
  const to = squareAtPointer(event);
  pieceGesture = null;
  boardElement.classList.remove("dragging-piece");
  boardElement.querySelector(`[data-square="${gesture.from}"]`)?.classList.remove("drag-origin");
  if (boardElement.hasPointerCapture(event.pointerId)) boardElement.releasePointerCapture(event.pointerId);
  // Handle the action here and suppress the native click that follows, so a
  // completed drag never turns into an accidental second click-to-move action.
  lastPiecePointerUpAt = performance.now();
  if (gesture.dragged && to && to !== gesture.from) {
    movePieceToSquare(gesture.from, to);
  } else {
    onSquareClick(to || gesture.from);
  }
}

function cancelBoardGesture(event) {
  if (arrowGesture?.pointerId === event.pointerId) {
    cancelArrowGesture(event);
    return;
  }
  if (!pieceGesture || event.pointerId !== pieceGesture.pointerId) return;
  pieceGesture = null;
  boardElement.classList.remove("dragging-piece");
  boardElement.querySelector(".drag-origin")?.classList.remove("drag-origin");
}

function beginArrowGesture(event) {
  if (event.button !== 2) return;
  const from = squareAtPointer(event);
  if (!from) return;
  event.preventDefault();
  arrowGesture = { from, pointerId: event.pointerId, dragged: false };
  boardElement.setPointerCapture(event.pointerId);
}

function updateArrowGesture(event) {
  if (!arrowGesture || event.pointerId !== arrowGesture.pointerId) return;
  event.preventDefault();
  const to = squareAtPointer(event);
  if (!to || to === arrowGesture.from) return;
  arrowGesture.dragged = true;
  arrowPreview = { from: arrowGesture.from, to };
  renderArrows();
}

function finishArrowGesture(event) {
  if (!arrowGesture || event.pointerId !== arrowGesture.pointerId) return;
  event.preventDefault();
  const to = squareAtPointer(event);
  const completedArrow = arrowGesture.dragged && to && to !== arrowGesture.from;
  if (completedArrow) {
    toggleArrow(arrowGesture.from, to);
  }
  arrowGesture = null;
  arrowPreview = null;
  if (boardElement.hasPointerCapture(event.pointerId)) boardElement.releasePointerCapture(event.pointerId);
  renderArrows();
}

function cancelArrowGesture(event) {
  if (!arrowGesture || event.pointerId !== arrowGesture.pointerId) return;
  arrowGesture = null;
  arrowPreview = null;
  renderArrows();
}

function toggleArrow(from, to) {
  const existing = arrows.findIndex((arrow) => arrow.from === from && arrow.to === to);
  if (existing >= 0) arrows.splice(existing, 1);
  else arrows = [...arrows.slice(-(MAX_ARROWS - 1)), { from, to }];
}

function clearArrows(shouldRender = true) {
  arrows = [];
  arrowPreview = null;
  if (shouldRender) renderArrows();
}

function arrowPoint(square) {
  const file = square[0];
  const rank = Number(square[1]);
  const files = orientation === "w" ? FILES : [...FILES].reverse();
  const ranks = orientation === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  return { x: (files.indexOf(file) + 0.5) * 12.5, y: (ranks.indexOf(rank) + 0.5) * 12.5 };
}

function renderArrows() {
  const svgNamespace = "http://www.w3.org/2000/svg";
  let layer = boardElement.querySelector(".arrow-layer");
  if (!layer) {
    layer = document.createElementNS(svgNamespace, "svg");
    layer.classList.add("arrow-layer");
    layer.setAttribute("viewBox", "0 0 100 100");
    layer.setAttribute("aria-hidden", "true");
    boardElement.append(layer);
  }
  layer.replaceChildren();
  const definitions = document.createElementNS(svgNamespace, "defs");
  const marker = document.createElementNS(svgNamespace, "marker");
  marker.setAttribute("id", "board-arrowhead");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "8");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "4.5");
  marker.setAttribute("markerHeight", "4.5");
  marker.setAttribute("orient", "auto-start-reverse");
  const head = document.createElementNS(svgNamespace, "path");
  head.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  head.setAttribute("fill", "context-stroke");
  marker.append(head);
  definitions.append(marker);
  layer.append(definitions);
  arrows.forEach((arrow) => drawArrow(layer, arrow));
  if (arrowPreview) drawArrow(layer, arrowPreview, true);
}

function drawArrow(layer, arrow, preview = false) {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const start = arrowPoint(arrow.from);
  const end = arrowPoint(arrow.to);
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  if (!length) return;
  const tail = document.createElementNS(svgNamespace, "circle");
  tail.setAttribute("class", preview ? "board-arrow-tail preview" : "board-arrow-tail");
  tail.setAttribute("cx", start.x);
  tail.setAttribute("cy", start.y);
  tail.setAttribute("r", "1.8");
  const shaft = document.createElementNS(svgNamespace, "line");
  shaft.setAttribute("class", preview ? "board-arrow preview" : "board-arrow");
  shaft.setAttribute("x1", start.x);
  shaft.setAttribute("y1", start.y);
  shaft.setAttribute("x2", end.x - (deltaX / length) * 2.4);
  shaft.setAttribute("y2", end.y - (deltaY / length) * 2.4);
  shaft.setAttribute("stroke-width", "1.55");
  shaft.setAttribute("marker-end", "url(#board-arrowhead)");
  layer.append(tail, shaft);
}

async function copyFen() {
  try {
    await navigator.clipboard.writeText(game.fen());
    addMessage("system", "FEN copied to the clipboard.");
  } catch {
    fenInput.select();
    document.execCommand("copy");
    addMessage("system", "FEN selected; use Ctrl+C if your browser blocked clipboard access.");
  }
}

function accountProvider() {
  return element("account-provider").value;
}

function updateAccountImportUi() {
  const provider = accountProvider();
  const username = element("account-username");
  const button = element("fetch-account-games");
  const help = element("account-help");
  username.placeholder = provider === "lichess" ? "e.g. DrNykterstein" : "e.g. yourusername";
  button.textContent = "Load public games";
  help.textContent = `${provider === "lichess" ? "Lichess" : "Chess.com"} imports public games for this username. Choose All to load the complete available archive. No password, browser login, or account token is requested.`;
}

function setPlayerProfile(profile) {
  playerProfile = profile;
  playerReport = null;
  libraryProfile = null;
  element("player-report-tools").hidden = !profile || !databaseGames.length;
  element("library-coach").hidden = !profile || !databaseGames.length;
  element("scan-library-engine").disabled = true;
  element("library-report-summary").hidden = true;
  element("library-report-summary").replaceChildren();
  element("library-progress").textContent = profile && databaseGames.length
    ? "Build the full-library profile first. It includes every loaded game."
    : "Build the full-library profile first.";
  if (profile && databaseGames.length) {
    const source = profile.provider === "chesscom" ? "Chess.com" : "Lichess";
    element("player-report-title").textContent = `${profile.username || "Player"} · ${source}`;
  }
}

async function fetchAccountGames() {
  const provider = accountProvider();
  const username = element("account-username").value.trim();
  if (!username) {
    element("account-help").textContent = "Enter the public account username first.";
    element("account-username").focus();
    return;
  }
  const button = element("fetch-account-games");
  button.disabled = true;
  button.textContent = "Loading public games…";
  element("account-help").textContent = "Reading the requested public archive…";
  try {
    const params = new URLSearchParams({
      provider,
      username,
      max: element("account-game-limit").value,
    });
    const payload = ON_DEVICE_ENGINE
      ? await fetchPublicGamesOnDevice(provider, username, element("account-game-limit").value)
      : await fetch(`/public-games?${params}`, { cache: "no-store" }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load public games.");
        return body;
      });
    loadPgnDatabase(payload.pgn, {
      provider: payload.provider,
      username: payload.username,
      count: payload.count,
      label: `${payload.provider === "chesscom" ? "Chess.com" : "Lichess"} public archive`,
    });
    const indexedCount = databaseGames.length;
    const mismatch = indexedCount === payload.count
      ? ""
      : ` The archive contained ${payload.count}; ${payload.count - indexedCount} game record${payload.count - indexedCount === 1 ? "" : "s"} could not be indexed as standard PGN.`;
    element("account-help").textContent = `${indexedCount} public game${indexedCount === 1 ? "" : "s"} indexed and visible in the library.${mismatch} Build the full-library profile to coach from every indexed game.`;
    addMessage("system", `Indexed ${indexedCount} public ${payload.provider === "chesscom" ? "Chess.com" : "Lichess"} game${indexedCount === 1 ? "" : "s"} for ${payload.username}.${mismatch}`);
  } catch (error) {
    element("account-help").textContent = `Could not load public games: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "Load public games";
  }
}

async function importPgn(event) {
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  const importButton = document.querySelector(".import-zone strong");
  importButton.textContent = files.length === 1 ? "Reading database…" : `Reading ${files.length} PGNs…`;
  try {
    const fragment = (await Promise.all(files.map((file) => file.text()))).join("\n\n");
    const label = files.length === 1 ? files[0].name : `${files.length} PGN files`;
    loadPgnDatabase(fragment, { label });
  } catch (error) {
    element("library-note").textContent = `Could not read this database: ${error.message}`;
  } finally {
    importButton.textContent = "Import PGN";
    event.target.value = "";
  }
}

function loadPgnDatabase(text, source = {}) {
  // The newest game belongs at the top of the library. Date-less PGNs retain
  // their source order, which is newest-first for both supported accounts.
  databaseGames = parsePgnDatabase(text).sort((left, right) => recordDateValue(right) - recordDateValue(left));
  selectedDatabaseGame = null;
  playerReport = null;
  libraryProfile = null;
  selectedGameReview = null;
  visibleGameCount = GAME_LIST_PAGE_SIZE;
  gameSearchText = "";
  element("game-search").value = "";
  const suffix = source.suffix || "";
  const label = source.label || "this import";
  element("library-note").textContent = databaseGames.length
    ? `${databaseGames.length} games indexed from ${label}.${suffix}`
    : "No PGN games with readable headers were found in that source.";
  if (source.provider) setPlayerProfile({ provider: source.provider, username: source.username || "" });
  else {
    setPlayerProfile(null);
    element("library-progress").textContent = "Load a Chess.com or Lichess account to build a player-specific all-games report.";
  }
  renderDatabase();
  if (databaseGames.length) loadDatabaseGame(0);
}

function pgnHeader(source, name) {
  const prefix = `[${name} "`;
  const line = source.split(/\r?\n/).find((entry) => entry.trimStart().startsWith(prefix));
  if (!line) return "";
  const quotedValue = line.trimStart().slice(prefix.length);
  const closingQuote = quotedValue.lastIndexOf('"]');
  if (closingQuote < 0) return "";
  return quotedValue.slice(0, closingQuote).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function isChess960Variant(value) {
  return /chess\s*960|fischer\s*random|freestyle/i.test(String(value || ""));
}

function isChess960Fen(fen) {
  const fields = String(fen || "").trim().split(/\s+/);
  if (fields.length !== 6 || fields[2] === "-") return false;
  if (/[^KQkq-]/.test(fields[2])) return true;
  const ranks = fields[0].split("/");
  return !/4K/.test(ranks[7] || "") || !/4k/.test(ranks[0] || "");
}

function readableOpeningName(value) {
  let decoded = String(value || "");
  try { decoded = decodeURIComponent(decoded); } catch { /* Preserve the source text if it was not URI-encoded. */ }
  return decoded
    .replace(/^.*\/openings\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function openingNameFromPgn(source) {
  const explicit = pgnHeader(source, "Opening") || pgnHeader(source, "OpeningName");
  if (explicit) return readableOpeningName(explicit);
  const ecoUrl = pgnHeader(source, "ECOUrl");
  return ecoUrl ? readableOpeningName(ecoUrl) : "";
}

function parsePgnDatabase(text) {
  const likelyGames = text
    .replace(/^\uFEFF/, "")
    .split(/(?=^\s*\[Event\s+\")/m)
    .filter((part) => part.trim());
  const sources = likelyGames.length ? likelyGames : [text];
  const records = [];
  for (const source of sources) {
    try {
      const white = pgnHeader(source, "White");
      const black = pgnHeader(source, "Black");
      const event = pgnHeader(source, "Event");
      const site = pgnHeader(source, "Site");
      const variant = pgnHeader(source, "Variant");
      const setupFen = pgnHeader(source, "FEN");
      if (!white && !black && !event && !site) continue;
      records.push({
        white: white || "White",
        black: black || "Black",
        result: pgnHeader(source, "Result") || "*",
        event: event || site || "Imported game",
        date: pgnHeader(source, "Date"),
        site,
        eco: pgnHeader(source, "ECO"),
        openingName: openingNameFromPgn(source),
        variant,
        chess960: isChess960Variant(variant) || isChess960Fen(setupFen),
        accountColor: ["w", "b"].includes(pgnHeader(source, "EngineDialogueColor"))
          ? pgnHeader(source, "EngineDialogueColor")
          : "",
        pgn: source,
        positions: null,
        moves: null,
        history: null,
      });
    } catch {
      // An incomplete tail or malformed header is skipped.
    }
  }
  return records;
}

function readGameHistory(record) {
  if (record?.history?.length) return record.history;
  if (!record?.pgn) throw new Error("This game has no readable PGN moves.");
  if (record.chess960) {
    const source = isChess960Variant(pgnHeader(record.pgn, "Variant"))
      ? record.pgn
      : `[Variant "Chess960"]\n${record.pgn}`;
    const parsedGame = new Chess960Pgn({ pgn: source, gameVariant: GAME_VARIANT.chess960 });
    const moves = parsedGame.history();
    const startFen = parsedGame.setUpFen();
    const history = moves.map((move, index) => ({
      san: move.san,
      uci: move.uci || `${move.from}${move.to}${move.promotion || ""}`,
      color: move.color,
      piece: move.piece,
      captured: move.captured || null,
      promotion: move.promotion || null,
      flags: move.flags || "",
      before: index ? moves[index - 1].fen : startFen,
      after: move.fen,
      ply: move.ply || index + 1,
    }));
    if (!history.length) throw new Error("This Chess960 PGN does not contain readable chess moves.");
    return history;
  }
  const parsedGame = new Chess();
  parsedGame.loadPgn(record.pgn, { strict: false });
  const history = parsedGame.history({ verbose: true }).map((move, index) => ({
    san: move.san,
    uci: move.lan,
    color: move.color,
    piece: move.piece,
    captured: move.captured || null,
    promotion: move.promotion || null,
    flags: move.flags,
    before: move.before,
    after: move.after,
    ply: index + 1,
  }));
  if (!history.length) throw new Error("This PGN does not contain readable chess moves.");
  return history;
}

function materializeGameRecord(record) {
  if (record?.positions && record.moves && record.history) return record;
  const history = readGameHistory(record);
  const startFen = history[0]?.before || STARTING_FEN;
  record.positions = [{ fen: startFen, label: "Start" }];
  history.forEach((move) => record.positions.push({ fen: move.after, label: move.san }));
  record.moves = history.map((move) => ({ san: move.san, uci: move.uci }));
  record.history = history;
  return record;
}

function loadDatabaseGame(index) {
  if (isAnalyzingSelectedGame) {
    addMessage("system", "Finish or stop the current every-move review before loading another game.");
    return;
  }
  const record = databaseGames[index];
  if (!record) return;
  try {
    materializeGameRecord(record);
    selectedDatabaseGame = index;
    selectedGameReview = record.gameReview || null;
    currentPositionName = null;
    timeline = record.positions;
    moveEntries = record.moves;
    timelineIndex = Math.max(0, timeline.length - 1);
    chess960Mode = Boolean(record.chess960);
    game = createBoardGame(timeline[timelineIndex].fen, chess960Mode);
    selectedSquare = null;
    legalMoves = [];
    clearArrows(false);
    invalidateAnalysis();
    renderAll();
    addMessage("system", `Loaded ${record.white} — ${record.black}${chess960Mode ? " · Chess960" : ""}. Use the move strip to navigate, then ask Alpha.`);
  } catch (error) {
    addMessage("system", `Could not load this PGN: ${error.message}`);
  }
}

function clearDatabase() {
  if (isAnalyzingSelectedGame) {
    addMessage("system", "Finish or stop the current every-move review before clearing the game library.");
    return;
  }
  databaseGames = [];
  selectedDatabaseGame = null;
  selectedGameReview = null;
  chess960Mode = false;
  visibleGameCount = GAME_LIST_PAGE_SIZE;
  gameSearchText = "";
  element("game-search").value = "";
  setPlayerProfile(null);
  element("library-note").textContent = "Load a game collection to jump straight into any position.";
  renderDatabase();
  renderSelectedGameReview();
}

function clearChat() {
  chatLog.replaceChildren();
  addMessage("engine", "Conversation cleared. Ask Alpha about the current position.");
}

function addMessage(kind, text) {
  const message = document.createElement("article");
  message.className = `message ${kind}`;
  if (kind !== "system") {
    const label = document.createElement("span");
    label.className = "message-label";
    label.textContent = kind === "user" ? "YOU" : "ALPHA";
    message.append(label);
  }
  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = text;
  message.append(body);
  chatLog.append(message);
  chatLog.scrollTop = chatLog.scrollHeight;
}

async function checkEngine() {
  if (ON_DEVICE_ENGINE) {
    try {
      await localAlphaEngine.start();
      engineReady = true;
      setEngineStatus(true, "Alpha is ready on this device");
    } catch (error) {
      engineReady = false;
      setEngineStatus(false, error.message || "Alpha could not start on this device");
    }
    return;
  }
  try {
    const response = await fetch("/health", { cache: "no-store" });
    const status = await response.json();
    engineReady = response.ok && status.ready;
    setEngineStatus(engineReady, engineReady ? "Alpha is ready" : status.error || "Alpha is unavailable");
  } catch {
    engineReady = false;
    setEngineStatus(false, "Alpha’s local server is unavailable");
  }
}

function setEngineStatus(ready, text) {
  const status = element("engine-status");
  status.dataset.tone = ready ? "ready" : "error";
  element("engine-status-text").textContent = text;
}

async function analysePosition() {
  if (isAnalyzing) return null;
  await checkEngine();
  if (!engineReady) {
    addMessage("system", ON_DEVICE_ENGINE
      ? "Alpha could not start its on-device engine. Restart the app and try again."
      : "Alpha is not connected. Add the local engine path in engine_config.json or start this app with --engine \"C:\\path\\to\\engine.exe\".");
    return null;
  }
  isAnalyzing = true;
  element("analyse-position").textContent = "Analysing…";
  document.querySelector(".send-button").disabled = true;
  try {
    const payload = await analyseFenAtDepth(game.fen(), POSITION_ANALYSIS_DEPTH, chess960Mode, multiPv);
    analysis = payload;
    analysisFen = game.fen();
    renderBoard();
    renderAnalysisGlance();
    renderCandidateLines();
    return analysis;
  } catch (error) {
    addMessage("system", `Analysis failed: ${error.message}`);
    return null;
  } finally {
    isAnalyzing = false;
    element("analyse-position").textContent = "Analyse position";
    document.querySelector(".send-button").disabled = false;
  }
}

async function analyseAndReport(withChatMessage) {
  const result = await analysePosition();
  if (result && withChatMessage) addMessage("engine", buildAnswer("analyse", result));
}

async function analyseFenForReview(fen, chess960 = false) {
  return analyseFenAtDepth(fen, REPORT_DEPTH, chess960);
}

async function analyseFenAtDepth(fen, depth, chess960 = false, multiPv = 1) {
  const result = ON_DEVICE_ENGINE
    ? await localAlphaEngine.analyse({ fen, depth, chess960, multiPv })
    : await fetch("/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fen, depth, multiPv, chess960 }),
    }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Alpha could not analyse this game position.");
      return payload;
    });
  const reachedDepth = Number(result?.depth || result?.lines?.[0]?.depth || 0);
  if (reachedDepth < depth) {
    throw new Error(`Alpha reached depth ${reachedDepth} before its depth-${depth} target. This result was not used; try again.`);
  }
  return { ...result, requestedDepth: depth };
}

function freshMoveLabelCounts() {
  return {
    brilliant: 0,
    great: 0,
    book: 0,
    best: 0,
    excellent: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    missedWin: 0,
    blunder: 0,
  };
}

function freshSelectedGameSideStats() {
  return {
    moves: 0,
    accuracyValues: [],
    phases: { opening: [], middlegame: [], endgame: [] },
    labels: freshMoveLabelCounts(),
  };
}

function scoreForColor(result, color) {
  const whiteScore = scoreForWhite(result);
  return color === "w" ? whiteScore : -whiteScore;
}

function moveAccuracyEstimate(loss) {
  // This deliberately is Alpha's own reproducible estimate, not a platform
  // accuracy score: every centipawn of engine loss reduces the score smoothly.
  return Math.max(0, Math.min(100, 100 * Math.exp(-Math.max(0, loss) / 190)));
}

function averageAccuracy(values) {
  if (!values?.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function accuracyText(values) {
  const value = averageAccuracy(values);
  return value === null ? "—" : `${Math.round(value)}%`;
}

function singleGamePerformanceEstimate(accuracy, result) {
  if (accuracy === null) return null;
  const outcomeAdjustment = result === "win" ? 65 : result === "loss" ? -65 : 0;
  return Math.round(Math.max(400, Math.min(2200, 400 + accuracy * 16 + outcomeAdjustment)));
}

function pieceValue(piece) {
  return ({ p: 1, n: 3, b: 3, r: 5, q: 9 })[piece] || 0;
}

function classifySelectedGameMove(entry, nextEntry) {
  const loss = entry.loss;
  const wonPosition = entry.beforePlayerScore >= 250;
  const noLongerWinning = entry.afterPlayerScore < 90;
  if (wonPosition && noLongerWinning && loss >= 160) return "missedWin";
  if (loss >= 250) return "blunder";
  if (loss >= 120) return "mistake";
  if (loss >= 55) return "inaccuracy";
  const sacrificesMoreThanItWins = nextEntry
    && nextEntry.move.color !== entry.move.color
    && nextEntry.move.captured
    && nextEntry.move.to === entry.move.to
    && pieceValue(nextEntry.move.captured) > pieceValue(entry.move.captured);
  if (entry.rank === 1 && sacrificesMoreThanItWins && entry.afterPlayerScore >= entry.beforePlayerScore - 10) return "brilliant";
  if (entry.rank === 1 && forcingMove(entry.move) && entry.afterPlayerScore - entry.beforePlayerScore >= 100) return "great";
  if (entry.phase === "opening" && entry.move.ply <= 16 && loss <= 12) return "book";
  if (entry.rank === 1) return "best";
  if (entry.rank === 2 || loss <= 12) return "excellent";
  return "good";
}

function labelDisplayName(label) {
  return ({
    brilliant: "Brilliant candidates",
    great: "Great moves",
    book: "Book moves",
    best: "Best moves",
    excellent: "Excellent moves",
    good: "Good moves",
    inaccuracy: "Inaccuracies",
    mistake: "Mistakes",
    missedWin: "Missed wins",
    blunder: "Blunders",
  })[label] || label;
}

function buildSelectedGameReport(record, reviewedMoves, totalMoves, cancelled) {
  const sides = { w: freshSelectedGameSideStats(), b: freshSelectedGameSideStats() };
  reviewedMoves.forEach((entry, index) => {
    entry.label = classifySelectedGameMove(entry, reviewedMoves[index + 1]);
    const side = sides[entry.move.color];
    const accuracy = moveAccuracyEstimate(entry.loss);
    side.moves += 1;
    side.accuracyValues.push(accuracy);
    side.phases[entry.phase].push(accuracy);
    side.labels[entry.label] += 1;
  });
  const results = { w: gameResultForPlayer(record.result, "w"), b: gameResultForPlayer(record.result, "b") };
  ["w", "b"].forEach((color) => {
    sides[color].accuracy = averageAccuracy(sides[color].accuracyValues);
    sides[color].performance = singleGamePerformanceEstimate(sides[color].accuracy, results[color]);
  });
  return {
    record,
    sides,
    reviewedMoves,
    totalMoves,
    cancelled,
    completedMoves: reviewedMoves.length,
    depth: GAME_REVIEW_DEPTH,
  };
}

function renderSelectedGameReview() {
  const section = element("selected-game-review");
  const record = selectedDatabaseGame === null ? null : databaseGames[selectedDatabaseGame];
  if (!record) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  element("selected-game-review-label").textContent = `${record.white} — ${record.black}${record.date ? ` · ${record.date}` : ""}. Alpha checks every played half-move locally.`;
  const button = element("analyse-selected-game");
  const cancelButton = element("cancel-selected-game-analysis");
  button.disabled = isAnalyzingSelectedGame;
  button.textContent = isAnalyzingSelectedGame ? "Analysing every move…" : selectedGameReview ? "Reanalyse every move" : "Analyse every move";
  cancelButton.hidden = !isAnalyzingSelectedGame;
  if (!isAnalyzingSelectedGame) cancelButton.textContent = "Stop";
  const summary = element("selected-game-analysis-summary");
  if (!selectedGameReview) {
    if (!isAnalyzingSelectedGame) {
      element("selected-game-analysis-progress").textContent = "Alpha uses local depth-20 analysis. Accuracy and performance are transparent estimates, not Chess.com scores or ratings.";
    }
    summary.hidden = true;
    summary.replaceChildren();
    return;
  }
  const report = selectedGameReview;
  const metrics = document.createElement("div");
  metrics.className = "library-report-summary";
  const white = report.sides.w;
  const black = report.sides.b;
  metrics.append(
    createLibraryMetric(`${report.record.white} accuracy`, accuracyText(white.accuracyValues)),
    createLibraryMetric(`${report.record.black} accuracy`, accuracyText(black.accuracyValues)),
    createLibraryMetric("Opening accuracy", `W ${accuracyText(white.phases.opening)} · B ${accuracyText(black.phases.opening)}`),
    createLibraryMetric("Middlegame accuracy", `W ${accuracyText(white.phases.middlegame)} · B ${accuracyText(black.phases.middlegame)}`),
    createLibraryMetric("Endgame accuracy", `W ${accuracyText(white.phases.endgame)} · B ${accuracyText(black.phases.endgame)}`),
    createLibraryMetric("Performance estimate", `W ~${white.performance ?? "—"} · B ~${black.performance ?? "—"}`),
  );
  const labels = document.createElement("div");
  labels.className = "game-move-labels";
  Object.keys(freshMoveLabelCounts()).forEach((label) => {
    const row = document.createElement("div");
    const title = document.createElement("span");
    const counts = document.createElement("strong");
    title.textContent = labelDisplayName(label);
    counts.textContent = `${white.labels[label]} / ${black.labels[label]}`;
    counts.title = `${record.white} / ${record.black}`;
    row.append(title, counts);
    labels.append(row);
  });
  const note = document.createElement("p");
  note.className = "selected-game-copy";
  const scope = report.cancelled ? `Partial review: ${report.completedMoves}/${report.totalMoves} moves checked.` : `All ${report.totalMoves} moves checked.`;
  note.textContent = `${scope} Left/right counts are ${record.white}/${record.black}. Accuracy and ~performance are Alpha estimates from depth-${report.depth} local engine loss; they are not Chess.com accuracy or official Elo ratings. “Brilliant” marks a verified best-move sacrifice candidate.`;
  const critical = report.reviewedMoves
    .filter((entry) => ["missedWin", "blunder", "mistake", "inaccuracy"].includes(entry.label))
    .sort((left, right) => right.loss - left.loss)
    .slice(0, 5);
  const moments = document.createElement("div");
  moments.className = "game-review-moments";
  if (critical.length) {
    const heading = document.createElement("p");
    heading.className = "selected-game-copy";
    heading.textContent = "Largest turning points";
    const list = document.createElement("ol");
    critical.forEach((entry) => {
      const item = document.createElement("li");
      const player = entry.move.color === "w" ? record.white : record.black;
      const turn = `${Math.ceil(entry.move.ply / 2)}${entry.move.color === "w" ? "." : "…"}`;
      const preferred = entry.preferredMove ? ` Alpha preferred ${entry.preferredMove}.` : "";
      item.textContent = `${turn} ${player}: ${entry.move.san} — ${labelDisplayName(entry.label)} (−${Math.round(entry.loss)}cp).${preferred}`;
      list.append(item);
    });
    moments.append(heading, list);
  }
  summary.replaceChildren(metrics, labels, note, moments);
  summary.hidden = false;
}

function selectedGameReportMessage(report) {
  const white = report.sides.w;
  const black = report.sides.b;
  const scope = report.cancelled ? `Partial review: ${report.completedMoves}/${report.totalMoves} moves were checked.` : `Full review: all ${report.totalMoves} moves were checked.`;
  return `${scope}\n${report.record.white}: ${accuracyText(white.accuracyValues)} Alpha accuracy estimate · ~${white.performance ?? "—"} single-game performance estimate.\n${report.record.black}: ${accuracyText(black.accuracyValues)} Alpha accuracy estimate · ~${black.performance ?? "—"} single-game performance estimate.\n\nCritical labels — ${report.record.white}/${report.record.black}: ${white.labels.blunder}/${black.labels.blunder} blunders, ${white.labels.mistake}/${black.labels.mistake} mistakes, ${white.labels.inaccuracy}/${black.labels.inaccuracy} inaccuracies, ${white.labels.missedWin}/${black.labels.missedWin} missed wins. These are Alpha’s local depth-${report.depth} classifications, not Chess.com scores or Elo ratings.`;
}

async function analyseSelectedGame(announce = false) {
  if (isAnalyzingSelectedGame || selectedDatabaseGame === null) {
    if (selectedDatabaseGame === null) addMessage("system", "Load a game from the library before asking Alpha to analyse every move.");
    return null;
  }
  const record = databaseGames[selectedDatabaseGame];
  try {
    materializeGameRecord(record);
  } catch (error) {
    addMessage("system", `Could not read this game for full analysis: ${error.message}`);
    return null;
  }
  await checkEngine();
  if (!engineReady) {
    addMessage("system", "Connect Alpha’s local analysis engine before reviewing every move.");
    return null;
  }
  isAnalyzingSelectedGame = true;
  shouldCancelSelectedGameAnalysis = false;
  selectedGameReview = null;
  record.gameReview = null;
  renderSelectedGameReview();
  const history = record.history;
  const reviewedMoves = [];
  try {
    for (let index = 0; index < history.length; index += 1) {
      if (shouldCancelSelectedGameAnalysis) break;
      const move = history[index];
      element("selected-game-analysis-progress").textContent = `Alpha is checking move ${index + 1} of ${history.length} at depth ${GAME_REVIEW_DEPTH}…`;
      const before = await analyseFenAtDepth(move.before, GAME_REVIEW_DEPTH, Boolean(record.chess960), GAME_REVIEW_MULTI_PV);
      const after = await analyseFenAtDepth(move.after, GAME_REVIEW_DEPTH, Boolean(record.chess960));
      const beforePlayerScore = scoreForColor(before, move.color);
      const afterPlayerScore = scoreForColor(after, move.color);
      const rank = before.lines?.find((line) => line.pv?.[0] === move.uci)?.rank || null;
      reviewedMoves.push({
        move,
        phase: phaseForMove(move),
        rank,
        loss: Math.max(0, beforePlayerScore - afterPlayerScore),
        beforePlayerScore,
        afterPlayerScore,
        beforeScore: resultScore(before),
        afterScore: resultScore(after),
        preferredMove: before.bestMove ? uciToSan(move.before, before.bestMove, Boolean(record.chess960)) : null,
      });
      if (index % 2 === 0) await yieldToBrowser();
    }
    const report = buildSelectedGameReport(record, reviewedMoves, history.length, shouldCancelSelectedGameAnalysis);
    selectedGameReview = report;
    record.gameReview = report;
    element("selected-game-analysis-progress").textContent = report.cancelled
      ? `Alpha stopped after ${report.completedMoves}/${report.totalMoves} moves. The visible results are partial.`
      : `Alpha completed a local depth-${GAME_REVIEW_DEPTH} review of all ${report.totalMoves} moves.`;
    renderSelectedGameReview();
    if (announce) addMessage("engine", selectedGameReportMessage(report));
    return report;
  } catch (error) {
    element("selected-game-analysis-progress").textContent = `Analysis stopped: ${error.message}`;
    addMessage("system", `The selected-game review stopped: ${error.message}`);
    return null;
  } finally {
    isAnalyzingSelectedGame = false;
    shouldCancelSelectedGameAnalysis = false;
    renderSelectedGameReview();
  }
}

function samePlayerName(first, second) {
  return String(first || "").trim().toLowerCase() === String(second || "").trim().toLowerCase();
}

function playerColorInGame(record, username) {
  if (record?.accountColor === "w" || record?.accountColor === "b") return record.accountColor;
  if (samePlayerName(record.white, username)) return "w";
  if (samePlayerName(record.black, username)) return "b";
  return null;
}

function takeEvenly(items, count) {
  if (items.length <= count) return [...items];
  const chosen = [];
  for (let index = 0; index < count; index += 1) {
    chosen.push(items[Math.round((index * (items.length - 1)) / Math.max(1, count - 1))]);
  }
  return chosen;
}

function phaseForMove(move) {
  if (move.ply <= 16) return "opening";
  if (isEndgameFen(move.before)) return "endgame";
  if (move.ply <= 60) return "middlegame";
  return "middlegame";
}

function isEndgameFen(fen) {
  const pieces = String(fen || "").split(" ")[0].match(/[prnbqkPRNBQK]/g) || [];
  const queens = pieces.filter((piece) => piece.toLowerCase() === "q").length;
  const rooks = pieces.filter((piece) => piece.toLowerCase() === "r").length;
  const minors = pieces.filter((piece) => ["b", "n"].includes(piece.toLowerCase())).length;
  return queens === 0 && rooks + minors <= 6;
}

function selectReviewMoves(history, color) {
  const playerMoves = history.filter((move) => move.color === color);
  const byPhase = {
    opening: playerMoves.filter((move) => phaseForMove(move) === "opening"),
    middlegame: playerMoves.filter((move) => phaseForMove(move) === "middlegame"),
    endgame: playerMoves.filter((move) => phaseForMove(move) === "endgame"),
  };
  const selected = [
    ...takeEvenly(byPhase.opening, 2),
    ...takeEvenly(byPhase.middlegame, 3),
    ...takeEvenly(byPhase.endgame, 2),
  ];
  const used = new Set(selected.map((move) => move.ply));
  if (selected.length < REPORT_SAMPLES_PER_GAME) {
    for (const move of takeEvenly(playerMoves.filter((move) => !used.has(move.ply)), REPORT_SAMPLES_PER_GAME - selected.length)) {
      selected.push(move);
      used.add(move.ply);
    }
  }
  return selected.sort((left, right) => left.ply - right.ply);
}

function scoreForWhite(result) {
  const score = result?.lines?.[0]?.score;
  if (!score) return 0;
  if (score.type === "mate") return (score.value >= 0 ? 1 : -1) * 10_000;
  return score.value;
}

function resultScore(result) {
  return result?.lines?.[0]?.score || null;
}

function findingImpactText(finding) {
  if (finding.beforeScore?.type === "mate" || finding.afterScore?.type === "mate") return "forced-mate swing";
  return `−${Math.round(finding.loss)}cp`;
}

function lossLabel(loss) {
  if (loss >= 250) return "blunder";
  if (loss >= 120) return "mistake";
  if (loss >= 55) return "inaccuracy";
  return "stable";
}

function gameResultForPlayer(result, color) {
  if (result === "1/2-1/2") return "draw";
  if (result === "*") return "unfinished";
  return (result === "1-0") === (color === "w") ? "win" : "loss";
}

function openingForRecord(record) {
  return openingForMoves(record.moves.map((move) => move.uci), record.openingName);
}

function openingForMoves(moves, pgnOpeningName = "") {
  const match = OPENING_POSITIONS
    .filter((opening) => moves.length >= opening.moves.length && opening.moves.every((uci, index) => uci === moves[index]))
    .sort((left, right) => right.moves.length - left.moves.length)[0];
  return match?.name || pgnOpeningName || "Unclassified opening";
}

function recordDateValue(record) {
  const compactDate = String(record.date || "").replace(/\D/g, "");
  if (/^\d{8}$/.test(compactDate)) return Number(compactDate);
  return 0;
}

function freshResultCounts() {
  return { win: 0, draw: 0, loss: 0, unfinished: 0 };
}

function freshPhaseStats() {
  return {
    opening: { moves: 0, captures: 0, checks: 0, pawnMoves: 0, quietMoves: 0, castles: 0, issues: 0 },
    middlegame: { moves: 0, captures: 0, checks: 0, pawnMoves: 0, quietMoves: 0, castles: 0, issues: 0 },
    endgame: { moves: 0, captures: 0, checks: 0, pawnMoves: 0, quietMoves: 0, castles: 0, issues: 0 },
  };
}

function addResult(counts, result) {
  counts[result] += 1;
}

function resultPoints(result) {
  return result === "win" ? 1 : result === "draw" ? 0.5 : 0;
}

function percentage(numerator, denominator) {
  if (!denominator) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function forcingMove(move) {
  return Boolean(move.captured || move.promotion || /[+#]/.test(move.san || ""));
}

function historyForProfile(record) {
  return readGameHistory(record);
}

function summarizeLibraryGame(record, index, username) {
  const color = playerColorInGame(record, username);
  if (!color) return { skipped: "accountMismatch" };
  const history = historyForProfile(record);
  const playerMoves = history.filter((move) => move.color === color);
  if (!playerMoves.length) return { skipped: "noPlayerMoves" };
  const phaseMoves = freshPhaseStats();
  for (const move of playerMoves) {
    const phase = phaseForMove(move);
    const stats = phaseMoves[phase];
    stats.moves += 1;
    if (move.captured) stats.captures += 1;
    if (/[+#]/.test(move.san || "")) stats.checks += 1;
    if (move.piece === "p") stats.pawnMoves += 1;
    if (!move.captured && !/[+#]/.test(move.san || "")) stats.quietMoves += 1;
    if (/[kq]/.test(move.flags || "")) stats.castles += 1;
  }
  const result = gameResultForPlayer(record.result, color);
  return {
    index,
    color,
    result,
    points: resultPoints(result),
    date: recordDateValue(record),
    opening: openingForMoves(history.map((move) => move.uci), record.openingName),
    phaseMoves,
    playerMoveCount: playerMoves.length,
    totalPly: history.length,
    reachedEndgame: phaseMoves.endgame.moves > 0,
  };
}

function describeLibraryStyle(profile) {
  const phases = profile.phaseStats;
  const totalMoves = Object.values(phases).reduce((sum, phase) => sum + phase.moves, 0);
  const captures = Object.values(phases).reduce((sum, phase) => sum + phase.captures, 0);
  const checks = Object.values(phases).reduce((sum, phase) => sum + phase.checks, 0);
  const quietMiddle = phases.middlegame.quietMoves;
  const middleMoves = phases.middlegame.moves;
  const forceRate = (captures + checks) / Math.max(1, totalMoves);
  const quietMiddleRate = quietMiddle / Math.max(1, middleMoves);
  if (forceRate >= 0.3) return "an active, tactical style that regularly creates forcing positions";
  if (quietMiddleRate >= 0.7) return "a patient, maneuvering style that invests heavily in quiet middlegame decisions";
  return "a balanced style, mixing maneuvering with tactical exchanges";
}

function rankedOpenings(profile, limit = 3) {
  return [...profile.openings.values()]
    .sort((left, right) => right.games - left.games)
    .slice(0, limit);
}

function summarizeTimeTrend(profile) {
  const dated = [...profile.gameRows].filter((row) => row.date).sort((left, right) => left.date - right.date);
  if (dated.length < 12) return null;
  const blockSize = Math.max(1, Math.floor(dated.length / 3));
  const average = (rows) => rows.reduce((sum, row) => sum + row.points, 0) / Math.max(1, rows.length);
  const early = average(dated.slice(0, blockSize));
  const recent = average(dated.slice(-blockSize));
  return { early, recent, delta: recent - early, gamesPerPeriod: blockSize };
}

function setLibraryProgress(text) {
  element("library-progress").textContent = text;
}

function createLibraryMetric(label, value) {
  const metric = document.createElement("div");
  const caption = document.createElement("span");
  caption.textContent = label;
  const amount = document.createElement("strong");
  amount.textContent = value;
  metric.append(caption, amount);
  return metric;
}

function renderLibrarySummary(profile) {
  const summary = element("library-report-summary");
  if (!profile?.games) {
    summary.hidden = true;
    summary.replaceChildren();
    return;
  }
  const score = profile.results.win + profile.results.draw + profile.results.loss;
  const trend = profile.timeTrend
    ? `${profile.timeTrend.delta >= 0 ? "+" : ""}${Math.round(profile.timeTrend.delta * 100)} pts`
    : "Need dates";
  const primaryOpening = rankedOpenings(profile, 1)[0];
  const audit = profile.audit;
  summary.replaceChildren(
    createLibraryMetric("Games profiled", `${profile.games}/${profile.importedGames}`),
    createLibraryMetric("Overall score", percentage(profile.results.win + profile.results.draw * 0.5, score)),
    createLibraryMetric("Results trend", trend),
    createLibraryMetric("Most played", primaryOpening ? `${primaryOpening.name} · ${primaryOpening.games}` : "—"),
    createLibraryMetric("Alpha coverage", audit ? `${audit.checkedGames}/${profile.games}` : "Not scanned"),
    createLibraryMetric("Best-move finds", audit ? percentage(audit.bestMoveFinds, audit.decisionChecks) : "Run Alpha scan"),
  );
  summary.hidden = false;
}

function yieldToBrowser() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function buildLibraryProfile(announce = false) {
  if (isBuildingLibraryProfile || isScanningLibrary) return libraryProfile;
  if (!databaseGames.length || !playerProfile?.username) {
    addMessage("system", "Load a Chess.com or Lichess account before building a whole-library coaching profile.");
    return null;
  }
  isBuildingLibraryProfile = true;
  const buildButton = element("build-library-profile");
  buildButton.disabled = true;
  buildButton.textContent = "Indexing every game…";
  const profile = {
    username: playerProfile.username,
    provider: playerProfile.provider,
    importedGames: databaseGames.length,
    games: 0,
    skipped: 0,
    skipReasons: { accountMismatch: 0, unreadable: 0, noPlayerMoves: 0 },
    results: freshResultCounts(),
    endgameResults: freshResultCounts(),
    phaseStats: freshPhaseStats(),
    openings: new Map(),
    gameRows: [],
    auditEntries: [],
    totalPlayerMoves: 0,
    totalPly: 0,
    audit: null,
  };
  try {
    for (let index = 0; index < databaseGames.length; index += 1) {
      if (index % LIBRARY_PROFILE_YIELD_EVERY === 0) {
        setLibraryProgress(`Reading game ${index + 1} of ${databaseGames.length}…`);
        await yieldToBrowser();
      }
      try {
        const summary = summarizeLibraryGame(databaseGames[index], index, profile.username);
        if (!summary || summary.skipped) {
          profile.skipped += 1;
          const reason = summary?.skipped || "unreadable";
          profile.skipReasons[reason] = (profile.skipReasons[reason] || 0) + 1;
          continue;
        }
        profile.games += 1;
        profile.totalPlayerMoves += summary.playerMoveCount;
        profile.totalPly += summary.totalPly;
        addResult(profile.results, summary.result);
        if (summary.reachedEndgame) addResult(profile.endgameResults, summary.result);
        for (const phase of ["opening", "middlegame", "endgame"]) {
          const destination = profile.phaseStats[phase];
          const source = summary.phaseMoves[phase];
          Object.keys(destination).forEach((key) => { destination[key] += source[key] || 0; });
        }
        const opening = profile.openings.get(summary.opening) || { name: summary.opening, games: 0, points: 0, results: freshResultCounts(), issues: 0 };
        opening.games += 1;
        opening.points += summary.points;
        addResult(opening.results, summary.result);
        profile.openings.set(summary.opening, opening);
        profile.gameRows.push(summary);
        profile.auditEntries.push({ index, color: summary.color, result: summary.result, date: summary.date, opening: summary.opening, chess960: Boolean(databaseGames[index].chess960) });
      } catch {
        profile.skipped += 1;
        profile.skipReasons.unreadable += 1;
      }
    }
    profile.timeTrend = summarizeTimeTrend(profile);
    libraryProfile = profile;
    element("scan-library-engine").disabled = !profile.games;
    const skipped = profile.skipped
      ? ` ${profile.skipped} could not be profiled (${profile.skipReasons.accountMismatch} account mismatch, ${profile.skipReasons.unreadable} unreadable, ${profile.skipReasons.noPlayerMoves} with no player move).`
      : " Every imported game was profiled.";
    setLibraryProgress(`${profile.games}/${profile.importedGames} games profiled.${skipped} Alpha will check every profiled game at depth ${LIBRARY_AUDIT_DEPTH}.`);
    renderLibrarySummary(profile);
    if (announce) addMessage("engine", fullLibraryAnswer("overview", profile));
    return profile;
  } catch (error) {
    addMessage("system", `The full-library profile stopped: ${error.message}`);
    return null;
  } finally {
    isBuildingLibraryProfile = false;
    buildButton.disabled = false;
    buildButton.textContent = libraryProfile ? "Rebuild full-library profile" : "Build full-library profile";
  }
}

function auditMoveForPhase(playerMoves, phase) {
  const moves = playerMoves.filter((move) => phaseForMove(move) === phase);
  if (!moves.length) return null;
  return moves.find(forcingMove) || moves[Math.floor(moves.length / 2)];
}

function selectLibraryAuditMoves(history, color, mode, rotation = 0) {
  const playerMoves = history.filter((move) => move.color === color);
  if (!playerMoves.length) return [];
  const phases = ["opening", "middlegame", "endgame"];
  if (mode === 1) {
    const preferredPhase = phases[rotation % phases.length];
    return [
      auditMoveForPhase(playerMoves, preferredPhase)
      || playerMoves.find(forcingMove)
      || playerMoves[Math.floor(playerMoves.length / 2)],
    ].filter(Boolean);
  }
  const selected = phases.map((phase) => auditMoveForPhase(playerMoves, phase)).filter(Boolean);
  return selected.length ? selected : [playerMoves[Math.floor(playerMoves.length / 2)]];
}

function newLibraryAudit() {
  return {
    checkedGames: 0,
    skippedGames: 0,
    decisionChecks: 0,
    bestMoveFinds: 0,
    totals: { blunder: 0, mistake: 0, inaccuracy: 0 },
    phaseStats: {
      opening: { checked: 0, issues: 0, loss: 0 },
      middlegame: { checked: 0, issues: 0, loss: 0 },
      endgame: { checked: 0, issues: 0, loss: 0 },
    },
    openingIssues: new Map(),
    tacticalErrors: 0,
    conversionFlags: 0,
    findings: [],
    datedChecks: [],
    cancelled: false,
  };
}

function engineTrend(audit) {
  const dated = audit.datedChecks.filter((check) => check.date).sort((left, right) => left.date - right.date);
  if (dated.length < 20) return null;
  const size = Math.max(1, Math.floor(dated.length / 3));
  const averageLoss = (checks) => checks.reduce((sum, check) => sum + check.loss, 0) / Math.max(1, checks.length);
  const early = averageLoss(dated.slice(0, size));
  const recent = averageLoss(dated.slice(-size));
  return { early, recent, delta: recent - early, checksPerPeriod: size };
}

async function runLibraryEngineAudit(announce = false) {
  if (isScanningLibrary || isBuildingLibraryProfile) return libraryProfile?.audit || null;
  const profile = libraryProfile || await buildLibraryProfile(false);
  if (!profile?.games) return null;
  await checkEngine();
  if (!engineReady) {
    addMessage("system", "Connect Alpha’s local analysis engine before running the whole-library scan.");
    return null;
  }
  isScanningLibrary = true;
  shouldCancelLibraryScan = false;
  const scanButton = element("scan-library-engine");
  const cancelButton = element("cancel-library-scan");
  scanButton.disabled = true;
  cancelButton.hidden = false;
  cancelButton.textContent = "Stop scan";
  const mode = Number(element("library-scan-mode").value);
  const audit = newLibraryAudit();
  ["opening", "middlegame", "endgame"].forEach((phase) => { profile.phaseStats[phase].issues = 0; });
  try {
    scanGames: for (let cursor = 0; cursor < profile.auditEntries.length; cursor += 1) {
      if (shouldCancelLibraryScan) {
        audit.cancelled = true;
        break;
      }
      const entry = profile.auditEntries[cursor];
      const record = databaseGames[entry.index];
      setLibraryProgress(`Alpha scan: game ${cursor + 1} of ${profile.auditEntries.length} · ${audit.decisionChecks} decisions checked…`);
      try {
        const history = historyForProfile(record);
        const moves = selectLibraryAuditMoves(history, entry.color, mode, cursor);
        if (!moves.length) {
          audit.skippedGames += 1;
          continue;
        }
        for (const move of moves) {
          if (shouldCancelLibraryScan) {
            audit.cancelled = true;
            break scanGames;
          }
          const before = await analyseFenAtDepth(move.before, LIBRARY_AUDIT_DEPTH, entry.chess960);
          const after = await analyseFenAtDepth(move.after, LIBRARY_AUDIT_DEPTH, entry.chess960);
          const beforeScore = scoreForWhite(before);
          const afterScore = scoreForWhite(after);
          const loss = Math.max(0, entry.color === "w" ? beforeScore - afterScore : afterScore - beforeScore);
          const label = lossLabel(loss);
          const phase = phaseForMove(move);
          const bestMoveFound = Boolean(before.bestMove && before.bestMove === move.uci);
          const phaseStats = audit.phaseStats[phase];
          audit.decisionChecks += 1;
          phaseStats.checked += 1;
          phaseStats.loss += loss;
          if (bestMoveFound) audit.bestMoveFinds += 1;
          if (label !== "stable") {
            audit.totals[label] += 1;
            phaseStats.issues += 1;
            profile.phaseStats[phase].issues += 1;
            const opening = audit.openingIssues.get(entry.opening) || { issues: 0, checks: 0, loss: 0 };
            opening.issues += 1;
            opening.loss += loss;
            audit.openingIssues.set(entry.opening, opening);
          }
          const openingTotals = audit.openingIssues.get(entry.opening) || { issues: 0, checks: 0, loss: 0 };
          openingTotals.checks += 1;
          audit.openingIssues.set(entry.opening, openingTotals);
          if (phase === "middlegame" && forcingMove(move) && label !== "stable") audit.tacticalErrors += 1;
          const playerBefore = entry.color === "w" ? beforeScore : -beforeScore;
          if (phase === "endgame" && playerBefore >= 120 && (loss >= 80 || entry.result !== "win")) audit.conversionFlags += 1;
          const finding = {
            entry,
            move,
            phase,
            loss,
            label,
            bestMoveFound,
            beforeScore: resultScore(before),
            afterScore: resultScore(after),
            preferredMove: before.bestMove ? uciToSan(move.before, before.bestMove, entry.chess960) : null,
          };
          if (label !== "stable" || bestMoveFound) audit.findings.push(finding);
          audit.datedChecks.push({ date: entry.date, loss });
        }
        audit.checkedGames += 1;
      } catch {
        audit.skippedGames += 1;
      }
      if (cursor % 3 === 0) await yieldToBrowser();
    }
    audit.timeTrend = engineTrend(audit);
    audit.findings.sort((left, right) => right.loss - left.loss);
    profile.audit = audit;
    const state = audit.cancelled ? "stopped" : "complete";
    setLibraryProgress(`Alpha scan ${state}: ${audit.checkedGames}/${profile.games} games · ${audit.decisionChecks} decisions at depth ${LIBRARY_AUDIT_DEPTH}.`);
    renderLibrarySummary(profile);
    if (announce) addMessage("engine", fullLibraryAnswer("overview", profile));
    return audit;
  } catch (error) {
    addMessage("system", `The all-games Alpha scan stopped: ${error.message}`);
    return null;
  } finally {
    isScanningLibrary = false;
    shouldCancelLibraryScan = false;
    scanButton.disabled = false;
    cancelButton.hidden = true;
  }
}

function fullLibraryAnswer(question, profile) {
  const focused = focusedLibraryAnswer(question, profile);
  if (focused) return focused;
  const openings = rankedOpenings(profile);
  const topOpenings = openings.length
    ? openings.map((opening) => `${opening.name} (${opening.games} games, ${percentage(opening.points, opening.games)} score)`).join(" · ")
    : "No recurring opening label could be identified";
  const resultLine = `${profile.results.win} wins, ${profile.results.draw} draws, ${profile.results.loss} losses`;
  const phase = profile.phaseStats;
  const totalMoves = profile.totalPlayerMoves;
  const style = describeLibraryStyle(profile);
  const structuralTrend = profile.timeTrend
    ? `Your score moved from ${Math.round(profile.timeTrend.early * 100)}% in the earliest third to ${Math.round(profile.timeTrend.recent * 100)}% in the latest third (${profile.timeTrend.delta >= 0 ? "+" : ""}${Math.round(profile.timeTrend.delta * 100)} points).`
    : "There are not enough reliably dated games to compare early and recent results.";
  const skippedDetail = profile.skipped
    ? ` ${profile.skipped} could not be profiled: ${profile.skipReasons?.accountMismatch || 0} could not be matched to this account, ${profile.skipReasons?.unreadable || 0} had unreadable moves, and ${profile.skipReasons?.noPlayerMoves || 0} ended before your first move.`
    : " Every loaded game was decoded.";
  const base = `Whole-library profile for ${profile.username}: ${profile.games} of ${profile.importedGames} loaded games were decoded (${resultLine}).${skippedDetail} ${structuralTrend}\n\nOpening repertoire: ${topOpenings}.\nMiddlegame activity: ${percentage(phase.middlegame.captures + phase.middlegame.checks, phase.middlegame.moves)} forcing actions across ${phase.middlegame.moves} middlegame moves; ${percentage(phase.middlegame.quietMoves, phase.middlegame.moves)} were quiet maneuvering decisions.\nTactical activity: ${percentage(phase.middlegame.captures + phase.middlegame.checks, totalMoves)} of all your moves were captures or checks.\nEndgames: ${profile.endgameResults.win + profile.endgameResults.draw + profile.endgameResults.loss} games reached the practical endgame stage (${profile.endgameResults.win} wins, ${profile.endgameResults.draw} draws, ${profile.endgameResults.loss} losses).\nStyle: You show ${style}.`;
  const audit = profile.audit;
  if (!audit) {
    return `${base}\n\nThis is the all-games structural verdict. Run “Scan all games with Alpha” for concrete error rates, best-move finds, opening inaccuracies, tactical misses, and endgame conversion flags across the full database.`;
  }
  const issuePhase = ["opening", "middlegame", "endgame"].sort((left, right) => audit.phaseStats[right].issues - audit.phaseStats[left].issues)[0];
  const worstOpening = [...audit.openingIssues.entries()]
    .filter(([, stats]) => stats.checks >= 3)
    .sort((left, right) => (right[1].issues / right[1].checks) - (left[1].issues / left[1].checks))[0];
  const engineTrendLine = audit.timeTrend
    ? `Alpha’s loss per audited decision changed from ${Math.round(audit.timeTrend.early)}cp early to ${Math.round(audit.timeTrend.recent)}cp recently (${audit.timeTrend.delta <= 0 ? "improving" : "needs attention"}).`
    : "Alpha’s sample has insufficient dated checks for a reliable error-rate trend.";
  const topFindings = audit.findings.slice(0, 3).map((finding) => describeLibraryFinding(finding)).join("\n");
  const auditScope = audit.cancelled
    ? "This is a partial Alpha audit because the scan was stopped."
    : "Every profiled game received its selected Alpha diagnostic check.";
  const coach = `\n\nAlpha’s verdict: ${audit.decisionChecks} distributed decisions across ${audit.checkedGames}/${profile.games} games were checked at depth ${LIBRARY_AUDIT_DEPTH}. ${auditScope} You found Alpha’s first move in ${audit.bestMoveFinds} checks (${percentage(audit.bestMoveFinds, audit.decisionChecks)}). Errors: ${audit.totals.blunder} blunders, ${audit.totals.mistake} mistakes, ${audit.totals.inaccuracy} inaccuracies. Your largest recurring Alpha-tested weakness is ${issuePhase}. ${worstOpening ? `${worstOpening[0]} produced ${worstOpening[1].issues}/${worstOpening[1].checks} flagged checks.` : "No opening has enough audited checks yet for a reliable weakness label."}\nTactical flags: ${audit.tacticalErrors}. Endgame conversion flags: ${audit.conversionFlags}. ${engineTrendLine}${topFindings ? `\n\nHighest-priority moments:\n${topFindings}` : ""}\n\nCoaching focus: 1) review the highest-loss moments on the board; 2) train ${issuePhase} positions before your next sessions; 3) use your most frequent opening as a repeatable study file, keeping one Alpha-approved plan per side.`;
  return `${base}${coach}`;
}

function describeLibraryFinding(finding) {
  const moveNumber = Math.ceil(finding.move.ply / 2);
  const dots = finding.move.color === "w" ? "." : "...";
  const alternative = finding.preferredMove && finding.preferredMove !== finding.move.san
    ? ` · Alpha preferred ${finding.preferredMove}`
    : "";
  return `Game ${finding.entry.index + 1}, ${moveNumber}${dots}${finding.move.san}${alternative} (${finding.phase}, ${finding.label}, ${findingImpactText(finding)})`;
}

function auditPhaseRate(audit, phase) {
  const stats = audit?.phaseStats?.[phase];
  if (!stats?.checked) return null;
  return { issues: stats.issues, checked: stats.checked, rate: stats.issues / stats.checked, averageLoss: stats.loss / stats.checked };
}

function phaseCoachingAdvice(phase) {
  if (phase === "opening") return "Before each game, play one model game from your most frequent line and write a five-move development checklist: centre, king safety, least-developed piece, pawn break, opponent threat.";
  if (phase === "middlegame") return "Use a fixed candidate-move routine: forcing moves first, then opponent threats, then your worst-placed piece. Calculate one full reply cycle before committing.";
  return "Practise conversion drills from one-pawn-up and rook endgames. At every endgame move, name the passed pawn, active king square, and whether a trade helps your result.";
}

function focusedLibraryAnswer(question, profile) {
  const lower = question.toLowerCase();
  const audit = profile.audit;
  const phase = /opening/.test(lower) ? "opening" : /endgame|conversion/.test(lower) ? "endgame" : /middle|tactic|maneuver/.test(lower) ? "middlegame" : null;
  if (/style/.test(lower)) {
    return `Style verdict from all ${profile.games} profiled games: you show ${describeLibraryStyle(profile)}. Your middlegame contains ${percentage(profile.phaseStats.middlegame.quietMoves, profile.phaseStats.middlegame.moves)} quiet decisions and ${percentage(profile.phaseStats.middlegame.captures + profile.phaseStats.middlegame.checks, profile.phaseStats.middlegame.moves)} captures or checks. Treat this as a description of your choices, not a quality score; Alpha’s scan is what tests whether those choices worked.`;
  }
  if (/improve(?:ment)?\s+with\s+time|trend|progress/.test(lower)) {
    const structural = profile.timeTrend
      ? `Result score shifted from ${Math.round(profile.timeTrend.early * 100)}% early to ${Math.round(profile.timeTrend.recent * 100)}% recently.`
      : "There are not enough dated games for a results trend.";
    const engine = audit?.timeTrend
      ? `Alpha’s loss per checked decision shifted from ${Math.round(audit.timeTrend.early)}cp to ${Math.round(audit.timeTrend.recent)}cp; ${audit.timeTrend.delta <= 0 ? "that is an improving accuracy signal" : "that needs targeted work"}.`
      : "Run Alpha’s scan for an accuracy trend, not just a results trend.";
    return `${structural} ${engine}`;
  }
  if (!phase) return null;
  const structural = profile.phaseStats[phase];
  const phaseTitle = phase === "middlegame" ? "Middlegame and tactics" : `${phase[0].toUpperCase()}${phase.slice(1)}`;
  const auditRate = auditPhaseRate(audit, phase);
  const structuralLine = phase === "opening"
    ? `Across the whole database you played ${structural.moves} opening moves and castled ${structural.castles} times.`
    : phase === "middlegame"
      ? `Across the whole database you played ${structural.moves} middlegame moves; ${percentage(structural.quietMoves, structural.moves)} were quiet maneuvers and ${percentage(structural.captures + structural.checks, structural.moves)} were forcing actions.`
      : `${profile.endgameResults.win + profile.endgameResults.draw + profile.endgameResults.loss} games reached a practical endgame; the result was ${profile.endgameResults.win} wins, ${profile.endgameResults.draw} draws, ${profile.endgameResults.loss} losses.`;
  const auditLine = auditRate
    ? `Alpha’s all-games scan flagged ${auditRate.issues}/${auditRate.checked} ${phase} checks (${Math.round(auditRate.rate * 100)}%) with an average ${Math.round(auditRate.averageLoss)}cp loss per check.`
    : "Run Alpha’s all-games scan to attach concrete error rates to this phase.";
  const bestEvidence = audit?.findings.filter((finding) => finding.phase === phase && finding.label !== "stable").slice(0, 2)
    .map(describeLibraryFinding).join("\n");
  return `${phaseTitle} verdict: ${structuralLine}\n${auditLine}\n\nCoaching task: ${phaseCoachingAdvice(phase)}${bestEvidence ? `\n\nLargest flagged examples:\n${bestEvidence}` : ""}`;
}

function describePlayerFinding(finding) {
  const moveNumber = Math.ceil(finding.move.ply / 2);
  const dots = finding.move.color === "w" ? "." : "...";
  const alternative = finding.preferredMove && finding.preferredMove !== finding.move.san
    ? ` · Alpha preferred ${finding.preferredMove}`
    : "";
  return `Game ${finding.gameNumber}, ${moveNumber}${dots}${finding.move.san}${alternative} (${finding.phase}, ${finding.label}, ${findingImpactText(finding)})`;
}

async function buildPlayerReport(announce = false) {
  if (isBuildingPlayerReport) return null;
  if (!databaseGames.length) {
    addMessage("system", "Load a public profile or a PGN before asking for a player report.");
    return null;
  }
  const username = playerProfile?.username || element("account-username").value.trim();
  if (!username) {
    addMessage("system", "Enter your player name in the Player Review panel so the app knows which side to assess in each game.");
    return null;
  }
  const candidates = databaseGames
    .map((record, index) => ({ record, index, color: playerColorInGame(record, username) }))
    .filter((gameContext) => gameContext.color)
    .sort((left, right) => recordDateValue(right.record) - recordDateValue(left.record));
  if (!candidates.length) {
    addMessage("system", `No imported games list “${username}” as White or Black. Check the player name in the PGN headers, then try again.`);
    return null;
  }
  await checkEngine();
  if (!engineReady) {
    addMessage("system", "Connect Alpha’s local analysis engine before starting a player review.");
    return null;
  }

  const reviewGames = [];
  for (const gameContext of candidates) {
    if (reviewGames.length >= MAX_REPORT_GAMES) break;
    try {
      materializeGameRecord(gameContext.record);
      if (gameContext.record.history?.length) reviewGames.push(gameContext);
    } catch {
      // Skip malformed games in a large archive without blocking the review.
    }
  }
  if (!reviewGames.length) {
    addMessage("system", "The matching PGNs could not be decoded into legal games. Try exporting standard chess PGNs from the platform archive.");
    return null;
  }

  isBuildingPlayerReport = true;
  const reviewButton = element("analyse-player-games");
  reviewButton.disabled = true;
  const reviewQueue = reviewGames.flatMap((gameContext) => selectReviewMoves(gameContext.record.history, gameContext.color).map((move) => ({ ...gameContext, move })));
  const findings = [];
  const phaseCounts = {
    opening: { blunder: 0, mistake: 0, inaccuracy: 0 },
    middlegame: { blunder: 0, mistake: 0, inaccuracy: 0 },
    endgame: { blunder: 0, mistake: 0, inaccuracy: 0 },
  };
  const totals = { blunder: 0, mistake: 0, inaccuracy: 0 };
  try {
    for (let index = 0; index < reviewQueue.length; index += 1) {
      const item = reviewQueue[index];
      reviewButton.textContent = `Reviewing ${index + 1}/${reviewQueue.length}…`;
      const [before, after] = await Promise.all([
        analyseFenForReview(item.move.before, Boolean(item.record.chess960)),
        analyseFenForReview(item.move.after, Boolean(item.record.chess960)),
      ]);
      const beforeScore = scoreForWhite(before);
      const afterScore = scoreForWhite(after);
      const loss = Math.max(0, item.color === "w" ? beforeScore - afterScore : afterScore - beforeScore);
      const label = lossLabel(loss);
      const phase = phaseForMove(item.move);
      if (label !== "stable") {
        totals[label] += 1;
        phaseCounts[phase][label] += 1;
      }
      findings.push({
        ...item,
        phase,
        loss,
        label,
        beforeScore: resultScore(before),
        afterScore: resultScore(after),
        preferredMove: before.bestMove ? uciToSan(item.move.before, before.bestMove, Boolean(item.record.chess960)) : null,
        gameNumber: item.index + 1,
        opening: openingForRecord(item.record),
      });
    }
    const resultCounts = { win: 0, draw: 0, loss: 0, unfinished: 0 };
    reviewGames.forEach(({ record, color }) => { resultCounts[gameResultForPlayer(record.result, color)] += 1; });
    const report = {
      username,
      provider: playerProfile?.provider || "pgn",
      reviewedGames: reviewGames.length,
      availableGames: candidates.length,
      sampledMoves: findings.length,
      depth: REPORT_DEPTH,
      totals,
      phaseCounts,
      resultCounts,
      findings: findings.sort((left, right) => right.loss - left.loss),
    };
    playerReport = report;
    element("library-note").textContent = `Alpha review complete: ${report.sampledMoves} sampled decisions across ${report.reviewedGames} recent game${report.reviewedGames === 1 ? "" : "s"}, depth ${REPORT_DEPTH}. Ask Alpha about openings, middlegames, endgames, or recurring weaknesses.`;
    if (announce) addMessage("engine", playerReportAnswer("overview", report));
    return report;
  } catch (error) {
    addMessage("system", `Player review stopped: ${error.message}`);
    return null;
  } finally {
    isBuildingPlayerReport = false;
    reviewButton.disabled = false;
    reviewButton.textContent = "Review recent games";
  }
}

function playerReportAnswer(question, report) {
  const lower = question.toLowerCase();
  const isPhaseQuestion = /opening/.test(lower) ? "opening" : /middle|tactic|dynamic/.test(lower) ? "middlegame" : /endgame|conversion/.test(lower) ? "endgame" : null;
  const relevant = isPhaseQuestion ? report.findings.filter((finding) => finding.phase === isPhaseQuestion) : report.findings;
  const costly = relevant.filter((finding) => finding.label !== "stable");
  const phaseTotals = (phase) => {
    const counts = report.phaseCounts[phase];
    return counts.blunder + counts.mistake + counts.inaccuracy;
  };
  const phaseSummary = ["opening", "middlegame", "endgame"]
    .map((phase) => `${phase}: ${phaseTotals(phase)}`)
    .join(" · ");
  const examples = costly.slice(0, 3).map(describePlayerFinding);
  const record = `Alpha sampled ${report.sampledMoves} of ${report.username}’s actual decisions from ${report.reviewedGames}/${report.availableGames} imported games at depth ${report.depth}; this is a focused review, not a claim that every move was checked.`;
  if (isPhaseQuestion) {
    const title = isPhaseQuestion === "middlegame" ? "middlegame/tactical" : isPhaseQuestion;
    if (!costly.length) return `${record}\n\nNo sampled ${title} move crossed the inaccuracy threshold. That is encouraging, but extend the review with more games before treating it as a final verdict.`;
    return `${record}\n\n${title[0].toUpperCase()}${title.slice(1)} issues: ${costly.length} sampled inaccuracies or worse. Key examples:\n${examples.join("\n")}\n\nUse the game list and move strip to inspect each turning point; the reported centipawn loss measures the evaluation swing after your move.`;
  }
  const highestPhase = ["opening", "middlegame", "endgame"].sort((left, right) => phaseTotals(right) - phaseTotals(left))[0];
  const outcome = `Results in the reviewed slice: ${report.resultCounts.win} wins, ${report.resultCounts.draw} draws, ${report.resultCounts.loss} losses${report.resultCounts.unfinished ? `, ${report.resultCounts.unfinished} unfinished` : ""}.`;
  const headline = costly.length
    ? `Recurring focus: ${highestPhase}, with ${phaseTotals(highestPhase)} sampled inaccuracies or worse.`
    : "No sampled move crossed the inaccuracy threshold; broaden the game sample to validate that result.";
  return `${record}\n\n${headline}\nBreakdown — blunders: ${report.totals.blunder}, mistakes: ${report.totals.mistake}, inaccuracies: ${report.totals.inaccuracy}. By phase: ${phaseSummary}.\n${outcome}${examples.length ? `\n\nLargest swings:\n${examples.join("\n")}` : ""}\n\nAsk “What opening inaccuracies show up in my games?”, “Show my middlegame mistakes”, or “What endgame conversion problems do I have?” for a focused view.`;
}

function isPlayerReportQuestion(question) {
  return /\b(my\s+(games?|weakness|mistakes?|opening|middlegame|middle game|endgame|report|play)|player\s+(report|games?|weakness)|account\s+(games?|review)|game\s+(review|history|patterns?)|recurring\s+(weakness|mistakes?|errors?)|opening\s+(inaccurac|error)|endgame\s+(conversion|mistake|error)|middlegame\s+(mistake|error|tactic)|loopholes?)\b/i.test(question);
}

async function sendQuestion(event) {
  event.preventDefault();
  const input = element("chat-input");
  const question = input.value.trim();
  if (!question) return;
  input.value = "";
  await askQuestion(question);
}

async function askQuestion(question) {
  addMessage("user", question);
  const opening = openingRequest(question);
  if (opening) {
    try {
      loadOpeningPosition(opening);
      addMessage("engine", `Loaded ${opening.name}. This is a representative position after ${formatMoveList(moveEntries)}. The board is ready for analysis.`);
    } catch (error) {
      addMessage("system", `I could not load that opening position: ${error.message}`);
    }
    return;
  }
  if (isSelectedGameReviewQuestion(question)) {
    const report = await analyseSelectedGame(false);
    if (report) addMessage("engine", selectedGameReportMessage(report));
    return;
  }
  if (isFullLibraryQuestion(question) || (libraryProfile && isLibraryCoachingFollowUp(question))) {
    const profile = libraryProfile || await buildLibraryProfile(false);
    if (profile) addMessage("engine", fullLibraryAnswer(question, profile));
    return;
  }
  if (isPlayerReportQuestion(question)) {
    const report = playerReport || await buildPlayerReport(false);
    if (report) addMessage("engine", playerReportAnswer(question, report));
    return;
  }
  const result = analysis && analysisFen === game.fen() ? analysis : await analysePosition();
  if (result) addMessage("engine", buildAnswer(question, result));
}

function isSelectedGameReviewQuestion(question) {
  return /\b(analyse|analyze|review)\b.*\b(this|selected|current)\s+game\b|\b(this|selected|current)\s+game\b.*\b(analyse|analyze|review)\b/i.test(question);
}

function isFullLibraryQuestion(question) {
  return /\b(full|whole|entire|all)\s+(game|games|database|library|archive)|\b(database|library|archive)\s+(coach|report|analysis|verdict)|\bcoach\s+me\s+(using|from|with)\b/i.test(question);
}

function isLibraryCoachingFollowUp(question) {
  return /\b(opening\s+(inaccurac|error|weakness)|middle\s*game|middlegame|tactical\s+play|best\s+move\s+find|endgame\s+(conversion|mistake)|style\s+of\s+play|recurring\s+(weakness|mistake)|improve(?:ment)?\s+with\s+time)\b/i.test(question);
}

function openingRequest(question) {
  const normalized = question
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const asksToLoad = /\b(load|show|set up|setup|give me|bring up|display)\b/.test(normalized)
    && /\b(position|opening|defen[cs]e|line|variation|caro|sicilian|french|ruy|spanish|italian|gambit|indian|london|english|pirc|scandinavian|slav)\b/.test(normalized);
  if (!asksToLoad) return null;
  if (normalized.includes("sicilian") && /\b(solid|safe|quiet|positional)\b/.test(normalized)) {
    return OPENING_POSITIONS.find((opening) => opening.id === "sicilian-kan") || null;
  }
  return OPENING_POSITIONS.find((opening) => opening.aliases.some((alias) => normalized.includes(alias))) || null;
}

function loadOpeningPosition(opening) {
  const replay = new Chess();
  const positions = [{ fen: replay.fen(), label: "Starting position" }];
  const moves = [];
  for (const uci of opening.moves) {
    const move = replay.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (!move) throw new Error(`The stored move ${uci} is not legal.`);
    positions.push({ fen: move.after, label: move.san });
    moves.push({ san: move.san, uci: move.lan });
  }
  game = new Chess(replay.fen());
  chess960Mode = false;
  timeline = positions;
  moveEntries = moves;
  timelineIndex = positions.length - 1;
  selectedDatabaseGame = null;
  selectedGameReview = null;
  currentPositionName = opening.name;
  selectedSquare = null;
  legalMoves = [];
  clearArrows(false);
  invalidateAnalysis();
  renderAll();
}

function formatMoveList(entries) {
  return entries.map((entry, index) => {
    const moveNumber = Math.floor(index / 2) + 1;
    return index % 2 === 0 ? `${moveNumber}. ${entry.san}` : entry.san;
  }).join(" ");
}

function buildAnswer(question, result) {
  const line = result.lines?.[0];
  if (!line) return "Alpha could not return a principal variation for this position. Try a legal FEN and analyse again.";
  const lower = question.toLowerCase();
  const bestMove = result.bestMove ? uciToSan(game.fen(), result.bestMove) : "no move";
  const mainLine = formatPv(game.fen(), line.pv);
  const score = formatScore(line.score);
  const assessment = evaluationCaption(line.score);

  if (/candidate|top.*move|alternatives?/.test(lower)) {
    const candidates = result.lines.map((candidate) => {
      const move = candidate.pv?.[0] ? uciToSan(game.fen(), candidate.pv[0]) : "—";
      return `${candidate.rank}. ${move} (${formatScore(candidate.score)}, d${candidate.depth}) — ${formatPv(game.fen(), candidate.pv, 6)}`;
    });
    return `At depth ${result.depth}, Alpha’s candidate list is:\n${candidates.join("\n")}`;
  }
  if (/who.*better|evaluat|advantage|winning|equal/.test(lower)) {
    return `${assessment} (${score}, depth ${result.depth}). The concrete evidence is ${bestMove}, followed by ${mainLine}. The score is from White’s point of view.`;
  }
  if (/tactic|combination|sacrifice|mate|threat/.test(lower)) {
    const tactical = line.score.type === "mate"
      ? `There is a forced mating sequence: ${mainLine}.`
      : `I do not see a forced mate in Alpha’s current line. Its most forcing continuation is ${bestMove}: ${mainLine}.`;
    return `${tactical} Evaluation: ${score} at depth ${result.depth}. Treat a named tactical theme as a hypothesis until you test the candidate line on the board.`;
  }
  if (/plan|strategy|idea|improve/.test(lower)) {
    return `My immediate priority is ${bestMove}. My principal variation is ${mainLine}, with ${score} (${assessment.toLowerCase()}). A practical plan is to identify what ${bestMove} attacks, protects, or releases in that line, then compare the next two replies before committing.`;
  }
  if (/best|what.*play|what.*move|move/.test(lower)) {
    return `I would choose ${bestMove} at depth ${result.depth}, with ${score} — ${assessment.toLowerCase()}. Main line: ${mainLine}.`;
  }
  return `For this position, my top move is ${bestMove}. I evaluate the position as ${score} (${assessment.toLowerCase()}) at depth ${result.depth}. Principal variation: ${mainLine}. Ask me for candidate moves, tactics, plans, or the evaluation for a more focused read.`;
}

function formatScore(score) {
  if (!score) return "—";
  if (score.type === "mate") return score.value > 0 ? `+M${score.value}` : `−M${Math.abs(score.value)}`;
  const value = score.value / 100;
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function evaluationCaption(score) {
  if (score.type === "mate") return score.value > 0 ? "White has a forced mate" : "Black has a forced mate";
  const value = score.value;
  const side = value >= 0 ? "White" : "Black";
  const magnitude = Math.abs(value);
  if (magnitude < 25) return "The position is approximately equal";
  if (magnitude < 90) return `${side} has a slight edge`;
  if (magnitude < 180) return `${side} is clearly preferable`;
  if (magnitude < 350) return `${side} has a large advantage`;
  return `${side} is winning with accurate play`;
}

function uciToSan(fen, uci, chess960 = chess960Mode) {
  if (!uci || uci.length < 4) return uci || "—";
  try {
    const replay = createBoardGame(fen, chess960);
    return replay.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })?.san || uci;
  } catch {
    return uci;
  }
}

function formatPv(fen, pv = [], maxMoves = 9, chess960 = chess960Mode) {
  const replay = createBoardGame(fen, chess960);
  const printed = [];
  for (const uci of pv.slice(0, maxMoves)) {
    try {
      const beforeFen = replay.fen();
      const move = replay.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!move) break;
      const fullmove = beforeFen.split(" ")[5];
      printed.push(move.color === "w" ? `${fullmove}. ${move.san}` : `${fullmove}... ${move.san}`);
    } catch {
      break;
    }
  }
  return printed.length ? printed.join(" ") : "No readable principal variation";
}

init();
