# Alpha

Alpha is a local-first chess guide. It lets you load a PGN database, explore positions on a board, and ask focused questions such as “What is the best move?”, “Who is better?”, or “Show candidate moves.” Alpha's answers are grounded in the connected UCI engine's evaluation and principal variations.

## What you need

- A UCI-compatible chess engine executable (`.exe`)
- Node.js 20 or newer (the browser and the local UCI bridge use no global installs)

The local `engine/` folder and `engine_config.json` are intentionally excluded from Git. This keeps your downloaded engine private to your computer and avoids GitHub's file-size limit; use the included configuration example after cloning.

## Start it

1. Put your engine's full path in a copy of `engine_config.example.json` named `engine_config.json`, or pass it on the command line.
2. From this folder, run one of the following:

   ```powershell
   npm start
   # or
   npm start -- --engine "C:\\Engines\\chess-engine.exe"
   ```

3. Open [http://127.0.0.1:8787](http://127.0.0.1:8787). The app will display **Engine ready** once the UCI handshake finishes.

   The browser opens automatically after `npm start`. Use `npm start -- --no-open` if you only want to start the server.

## Android APK

The public repository includes an Android wrapper for Alpha. It packages the interface and a single-threaded Stockfish 19 WebAssembly engine inside the APK, so board analysis works on the device without the Windows engine executable or a local server. Version 1.4.0 targets depth 20 and displays the achieved/target engine depth (for example, `Depth 20/20`). On Android, Alpha defaults to one candidate line for its fastest depth-20 search; choose two to four lines when comparison matters more than speed. Selected-game review checks every played move once, reuses the resulting position for the following move, and divides a three-minute budget across the entire game.

Every push to `main` runs **Build Android APK** in GitHub Actions. Open that workflow, select the latest successful run, and download the `Alpha-debug-apk` artifact. Transfer the resulting `app-debug.apk` to an Android phone and install it after allowing installs from the file manager/browser you used. This debug APK is installable for personal testing; publishing to Google Play needs a separately signed release build.

The app needs an internet connection only when you choose to retrieve public Chess.com or Lichess games. Imported PGNs and engine analysis remain on the device.

## Use your downloaded database

Choose **Import PGN** and select one or more `.pgn` files. The complete files are indexed in the browser and never leave your computer. For large collections, every indexed game remains loaded while the library displays them in batches of 100; use **Find a loaded game** or **Show more games** to navigate the collection. Move histories are decoded only when you open or review a game, keeping large databases responsive.

If by “engine database” you mean a format other than PGN (for example ChessBase `.cbh`, SCID `.si4`, or a raw engine opening book), it needs a small import adapter. This starter intentionally treats the engine binary and the games database as separate things: the UCI engine calculates, and the PGN database supplies positions.

## Player archives

- **Chess.com:** select Chess.com, enter a public username, and choose **All** to retrieve every available monthly archive through Chess.com's published data API. The requests are made serially to respect the service's rate-limit guidance.
- **Lichess:** select Lichess, enter a public username, and choose **All** to retrieve the full public PGN export. Private or hidden games are not available without the platform's own authorization.
The app never asks for platform passwords, browser cookies, or personal access tokens. Full archives can be large and may take a while to download and parse; keep the tab open until the library count appears.

## Full-database coach

After loading a Chess.com or Lichess account, the **Full Database Coach** panel appears in the library column.

1. Choose **Build full-library profile**. Every loaded game is decoded for aggregate results, progression over time, opening frequency and score, phase activity, endgame reach, and an evidence-based style description. The coach panel displays the profiled count, overall score, results trend, main opening, and later engine coverage. The list shows the first 100 cards at once; use the library search or **Show more games** for the rest.
2. Choose the engine coverage and click **Scan all games with engine**. The default samples one rotating diagnostic decision from every decoded game, balancing opening, middlegame, and endgame coverage. The broader option samples up to three phase decisions per game and will take substantially longer.
3. Keep the tab open during the scan. The progress line reports exactly how many games and decisions have been checked. You can stop safely; the final verdict clearly reports its actual coverage.

The final chat verdict combines full-library statistics with the engine audit: opening error concentrations, tactical flags, exact best-move finds at the recorded depth, endgame-conversion flags, error trends over time, high-priority moments, and focused training advice. The engine audit is distributed across every game; it is not presented as an exhaustive verdict on every move unless you choose a deeper scan and let it complete.

## Every-move game review

Open any loaded game, then use **Review every move (≤3 min)** in the **Alpha Game Review** card (or ask “analyse this game” in chat). Alpha examines every played move, sharing one three-minute budget across the complete game and targeting depth 20 for each position. It shows:

- overall, opening, middlegame, and endgame accuracy estimates for both players;
- counts for Brilliant, Great, Book, Best, Excellent, Good, Inaccuracy, Mistake, Miss, and Blunder moves;
- a game rating for each player, based on the PGN rating when it is available.
- the five largest inaccurate-or-worse turning points, with the played SAN move and Alpha's preferred move.

This is free and runs through the configured local engine. Consecutive positions are reused instead of being searched twice, so the review can cover the full game within its shared time budget. Keep the app open until the review completes.

## Chat behaviour

The chat is an engine interpreter, not a general-purpose language model. It recognises common questions about best moves, evaluation, candidate moves, tactics, and plans, then runs the engine and explains the returned line. This keeps its chess claims traceable. A future server-side LLM layer can consume the same structured `/analyze` response if you want more open-ended prose.

## Board controls

- Left-click a piece and then a legal destination, or left-drag it to the destination, to make a move. Use the left and right arrow buttons below the board to step backwards and forwards through the move history.
- Right-drag from one square to another to draw a yellow analysis arrow. Right-drag the same arrow again to remove it, or use **Clear arrows**.
- Choose **1–4 lines** to set the number of Alpha candidate moves returned by the next analysis.
- Choose from 10 board themes and 10 piece styles in the controls below the analysis buttons. These preferences stay on this browser only.

## Opening requests in chat

Ask the chat to **load** or **show** a position in an opening, and it will set up a representative legal position directly on the board. For example: `Load a position in the Caro-Kann` or `Show a solid Sicilian position`. It includes the Caro-Kann, Sicilian (Najdorf and a solid Kan), French, Ruy Lopez, Italian, Queen's Gambit Declined, King's Indian, London, English, Pirc, Scandinavian, and Slav.

## Privacy and safety

- The server binds only to `127.0.0.1`.
- Your PGN stays in the browser.
- The configured executable is launched only on your own machine.
- Do not expose this development server to a network without adding authentication.
