/* global process */
// Spins up the real FastAPI backend with a temporary SQLite file, then checks
// the save API end to end, including a backend restart.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, "../../../backend");
const py = path.join(backend, "venv/bin/python");
const PORT = 8127;
const BASE = `http://127.0.0.1:${PORT}`;
const skip = !existsSync(py) && "backend venv not found";

const start = async (db) => {
  const proc = spawn(py, ["-m", "uvicorn", "app:app", "--port", String(PORT), "--log-level", "error"], {
    cwd: backend, env: { ...process.env, IPL_SAVE_DB: db }, stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/`)).ok) return proc; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error("backend did not start");
};
const stop = (proc) => new Promise((res) => { proc.once("exit", res); proc.kill(); });
const put = (snapshot, replace = false) =>
  fetch(`${BASE}/api/save`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot, replace }) });
const snap = (sid, seq, extra = {}) => ({ schemaVersion: 1, sessionId: sid, seq, game: { selectedTeam: { name: "MI" }, playerIndex: seq, queueIds: [1, 2, 3], auctionInitialized: true, ...extra } });

test("save API: single slot, stale protection, replace semantics, persistence across restart", { skip }, async () => {
  const db = path.join(mkdtempSync(path.join(tmpdir(), "ipl-")), "save.db");
  let proc = await start(db);
  try {
    assert.deepEqual(await (await fetch(`${BASE}/api/save`)).json(), { exists: false, meta: null });
    assert.equal((await fetch(`${BASE}/api/save/data`)).status, 404);

    assert.equal((await put(snap("A", 1))).status, 200);          // 1 create
    assert.equal((await put(snap("A", 2))).status, 200);          // 2 overwrite same save
    assert.equal((await put(snap("A", 2))).status, 409);          // 14 duplicate/stale seq
    assert.equal((await put(snap("A", 1))).status, 409);
    assert.equal((await (await fetch(`${BASE}/api/save`)).json()).meta.playerIndex, 2);

    const other = await put(snap("B", 1));                         // 11 not replaced without confirmation
    assert.equal(other.status, 409);
    assert.equal((await (await fetch(`${BASE}/api/save`)).json()).meta.sessionId, "A");

    assert.equal((await put({ nope: 1 })).status, 422);            // 9 invalid input keeps old save
    assert.equal((await (await fetch(`${BASE}/api/save`)).json()).meta.playerIndex, 2);

    await stop(proc);                                              // 4 backend restart
    proc = await start(db);
    const info = await (await fetch(`${BASE}/api/save`)).json();
    assert.equal(info.exists, true);
    assert.equal(info.meta.sessionId, "A");
    assert.equal((await (await fetch(`${BASE}/api/save/data`)).json()).game.playerIndex, 2);

    assert.equal((await put(snap("B", 1), true)).status, 200);     // 12 confirmed new game replaces
    assert.equal((await (await fetch(`${BASE}/api/save`)).json()).meta.sessionId, "B");
    assert.equal((await put(snap("A", 50))).status, 409);          // old session can't write any more
    assert.equal((await put(snap("A", 51), false)).status, 409);
  } finally {
    await stop(proc);
  }
});
