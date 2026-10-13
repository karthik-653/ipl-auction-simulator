import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { players } from "./players.js";
import {
  PORTRAIT_COUNT, PORTRAIT_POOLS, poolFor, portraitFile, portraitIdFor, portraitUrl,
} from "./portraits.js";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public/portraits");

test("every portrait file exists, is a real WebP, and is a sensible size", () => {
  let total = 0;
  for (let n = 1; n <= PORTRAIT_COUNT; n++) {
    const f = path.join(dir, portraitFile(n));
    assert.ok(existsSync(f), `${portraitFile(n)} missing`);
    const buf = readFileSync(f);
    assert.equal(buf.subarray(0, 4).toString(), "RIFF");
    assert.equal(buf.subarray(8, 12).toString(), "WEBP");
    assert.ok(buf.length > 4000 && buf.length < 60000, `${portraitFile(n)} size ${buf.length}`);
    total += buf.length;
  }
  assert.ok(total < 1.5 * 1024 * 1024, `total ${total}`);
  const webps = readdirSync(dir).filter((f) => f.endsWith(".webp"));
  assert.equal(webps.length, PORTRAIT_COUNT);
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.pools.indian, PORTRAIT_POOLS.indian);
  assert.deepEqual(manifest.pools.overseas, PORTRAIT_POOLS.overseas);
});

test("assignment is deterministic and depends only on player id + nationality pool", () => {
  for (const p of players) {
    const a = portraitIdFor(p);
    assert.equal(portraitIdFor({ ...p }), a);
    // unrelated fields (team, retention, price, set, name) never change it
    assert.equal(portraitIdFor({ ...p, team: "ZZZ", retained: !p.retained, soldPrice: 99, set: "x", name: "Y", rating: 1 }), a);
    assert.ok(poolFor(p).includes(a));
  }
});

test("Indian and overseas players use their own pools; unknown nations fall back to the general pool", () => {
  for (const p of players) {
    const id = portraitIdFor(p);
    if (p.nation === "Indian") assert.ok(PORTRAIT_POOLS.indian.includes(id));
    else if (p.nation === "Foreigner") assert.ok(PORTRAIT_POOLS.overseas.includes(id));
  }
  const odd = portraitIdFor({ id: 7, nation: "Martian" });
  assert.ok(PORTRAIT_POOLS.general.includes(odd));
  assert.ok(portraitIdFor({ id: 7 }) >= 1);
  assert.equal(portraitUrl({ id: 1, nation: "Indian" }).startsWith("/portraits/portrait_"), true);
});

test("the real dataset spreads across the whole library (no silhouette, no gaps)", () => {
  const used = new Set(players.map(portraitIdFor));
  assert.equal(used.size, PORTRAIT_COUNT);
  for (const pool of ["indian", "overseas"]) {
    const counts = new Map();
    for (const p of players.filter((x) => (pool === "indian") === (x.nation === "Indian"))) {
      const id = portraitIdFor(p);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const vals = [...counts.values()];
    assert.ok(Math.max(...vals) / Math.min(...vals) < 3, `${pool} spread ${vals}`);
  }
  // neighbouring ids do not all get neighbouring faces
  let same = 0;
  for (let id = 1; id < 200; id++) if (portraitIdFor({ id, nation: "Indian" }) === portraitIdFor({ id: id + 1, nation: "Indian" })) same++;
  assert.ok(same < 30);
  assert.ok(statSync(path.join(dir, portraitFile(3))).size > 0); // backdrop artwork exists
});
