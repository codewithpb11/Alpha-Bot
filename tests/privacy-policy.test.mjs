import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("ships an in-app privacy policy for public-game imports", async () => {
  const [app, policy] = await Promise.all([
    readFile(new URL("../static/index.html", import.meta.url), "utf8"),
    readFile(new URL("../static/privacy.html", import.meta.url), "utf8"),
  ]);

  assert.match(app, /href="\/privacy\.html"/);
  assert.match(policy, /Alpha is a local-first chess-analysis app/);
  assert.match(policy, /api\.chess\.com\/pub/);
  assert.match(policy, /lichess\.org\/api/);
  assert.match(policy, /does not ask for Chess\.com or Lichess passwords/);
});
