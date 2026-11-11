# Third-party engine source record

Alpha v1.4.0 packages the unmodified **Lite, single-threaded** Stockfish.js
engine. It is a separate Web Worker that communicates with Alpha over the UCI
text protocol and runs on the user's device.

## Stockfish.js 19.0.1

- Package: [`stockfish` 19.0.1](https://www.npmjs.com/package/stockfish/v/19.0.1)
- Exact corresponding source: [`nmrugg/stockfish.js` tag `v19.0.1`](https://github.com/nmrugg/stockfish.js/tree/v19.0.1)
- Source commit: `0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6`
- Licence: GNU General Public License version 3 (GPL-3.0)
- Build tool used upstream: Emscripten 6.0.9
- Upstream Stockfish source: [`official-stockfish/Stockfish` tag `sf_19`](https://github.com/official-stockfish/Stockfish/tree/sf_19)

The two engine files copied into Alpha are byte-for-byte the files from that
package. Their SHA-256 hashes are:

| File | SHA-256 |
| --- | --- |
| `stockfish-19-lite-single.js` | `ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a` |
| `stockfish-19-lite-single.wasm` | `ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de` |

The full GPL-3.0 text is in [LICENSE](LICENSE). No proprietary engine, neural
network download, analytics SDK, or remote analysis service is used.
