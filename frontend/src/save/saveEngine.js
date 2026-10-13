// Serial, coalescing save queue. Guarantees:
//  * at most one request in flight, so requests reach the server in order
//  * every request carries a strictly increasing seq (server also rejects
//    stale seq), so an old autosave can never overwrite a newer snapshot
//  * a failed save keeps the state "dirty" and reports the error; the
//    previously saved game is untouched (server writes are atomic)
import { SCHEMA_VERSION } from "./gameState.js";

export class SaveEngine {
  constructor({ api, getGame, getSessionId, onStatus, debounceMs = 1200 }) {
    this.api = api;
    this.getGame = getGame;
    this.getSessionId = getSessionId;
    this.onStatus = onStatus || (() => {});
    this.debounceMs = debounceMs;
    this.seq = 0;
    this.dirty = false;
    this.running = null;
    this.timer = null;
    this.replaceNext = false;
    this.lastError = null;
    this.status = "saved";
    this.override = null;
  }

  _set(status, error = null) {
    this.status = status;
    this.lastError = error;
    this.onStatus(status, error);
  }

  /** Begin tracking a (new or restored) session. */
  reset(seq = 0) {
    clearTimeout(this.timer);
    this.timer = null;
    this.seq = seq;
    this.dirty = false;
    this._set("saved");
  }

  /** Called after any meaningful state change; debounced autosave. */
  markDirty(delay = this.debounceMs) {
    if (!this.getSessionId()) return;
    this.dirty = true;
    if (this.status !== "saving") this._set("unsaved");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, delay);
  }

  /**
   * Save the latest state now. Resolves {ok} once the state as of this call
   * (or newer) is durably stored, or {ok:false,error}.
   * opts.replace marks the request as an explicit new game replacing the old.
   */
  flush({ replace = false, force = false, game = null } = {}) {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.getSessionId()) return Promise.resolve({ ok: false, error: new Error("No active game") });
    if (replace) this.replaceNext = true;
    if (game) this.override = game;
    if (force) this.dirty = true;
    if (!this.dirty && !this.running) return Promise.resolve({ ok: true });
    this.dirty = true;
    if (!this.running) this.running = this._loop();
    return this.running;
  }

  async _loop() {
    try {
      while (this.dirty) {
        this.dirty = false;
        const sessionId = this.getSessionId();
        if (!sessionId) return { ok: false, error: new Error("No active game") };
        const seq = ++this.seq;
        const replace = this.replaceNext;
        this._set("saving");
        try {
          const game = this.override ?? this.getGame();
          await this.api.putSave({
            snapshot: { schemaVersion: SCHEMA_VERSION, sessionId, seq, savedAt: new Date().toISOString(), game },
            replace,
          });
          this.replaceNext = false;
          this.override = null;
        } catch (error) {
          this.dirty = true; // keep unsaved; retry on next change / manual save
          this._set("error", error);
          return { ok: false, error };
        }
      }
      this._set("saved");
      return { ok: true };
    } finally {
      this.running = null;
    }
  }
}
