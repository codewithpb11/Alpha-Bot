import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "mobile-dist");
const copy = async (from, to) => cp(from, to, { recursive: true });

await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, "vendor"), { recursive: true });
await copy(resolve(root, "static"), output);
await copy(resolve(root, "node_modules", "chess.js", "dist", "esm", "chess.js"), resolve(output, "vendor", "chess.js"));
await copy(resolve(root, "node_modules", "cm-chess", "src"), resolve(output, "vendor", "cm-chess"));
await copy(resolve(root, "node_modules", "cm-pgn"), resolve(output, "vendor", "cm-pgn"));
await copy(resolve(root, "node_modules", "chess.mjs"), resolve(output, "vendor", "chess.mjs"));
await mkdir(resolve(output, "vendor", "stockfish"), { recursive: true });
await copy(resolve(root, "node_modules", "stockfish", "bin", "stockfish-19-lite-single.js"), resolve(output, "vendor", "stockfish", "stockfish-19-lite-single.js"));
await copy(resolve(root, "node_modules", "stockfish", "bin", "stockfish-19-lite-single.wasm"), resolve(output, "vendor", "stockfish", "stockfish-19-lite-single.wasm"));
await copy(resolve(root, "node_modules", "stockfish", "Copying.txt"), resolve(output, "vendor", "stockfish", "COPYING.txt"));

console.log("Built mobile web assets with the on-device Alpha engine.");
