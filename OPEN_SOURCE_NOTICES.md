# Open-source notices

## Stockfish.js 19.0.1

The Android version of Alpha includes the unmodified `stockfish-19-lite-single` WebAssembly engine from the [`stockfish` 19.0.1 npm package](https://www.npmjs.com/package/stockfish/v/19.0.1). It is licensed under the GNU General Public License, version 3. The full license text is provided in [LICENSE](LICENSE).

- Engine source: <https://github.com/official-stockfish/Stockfish/tree/sf_19>
- WebAssembly build source: <https://github.com/nmrugg/stockfish.js/tree/v19.0.1>
- Included files: `stockfish-19-lite-single.js` and `stockfish-19-lite-single.wasm`

The exact source revision, build-tool version, and hashes of the unmodified
engine files are recorded in [THIRD_PARTY_SOURCES.md](THIRD_PARTY_SOURCES.md).

The engine runs locally in the app. Alpha does not send board positions to an analysis server.
