"""Durable single-slot save storage (stdlib sqlite3).

Exactly one saved game can exist: the table has a single row (id = 1)
enforced by a CHECK constraint. All writes are atomic transactions, so a
failed or interrupted save leaves the previous valid save untouched.
"""
import json
import os
import sqlite3
import threading
from datetime import datetime, timezone

SCHEMA_VERSION = 1
DEFAULT_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ipl_save.db")

_lock = threading.Lock()


class SaveError(Exception):
    status = 400
    code = "bad-request"

    def __init__(self, message=""):
        super().__init__(message or self.code)


class InvalidSnapshot(SaveError):
    status = 422
    code = "invalid-snapshot"


class StaleSave(SaveError):
    status = 409
    code = "stale"


class SessionMismatch(SaveError):
    status = 409
    code = "session-mismatch"


def db_path():
    return os.environ.get("IPL_SAVE_DB", DEFAULT_DB)


def _connect():
    conn = sqlite3.connect(db_path(), timeout=10, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS save (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            session_id TEXT NOT NULL,
            seq INTEGER NOT NULL,
            schema_version INTEGER NOT NULL,
            saved_at TEXT NOT NULL,
            meta TEXT NOT NULL,
            data TEXT NOT NULL
        )"""
    )
    return conn


def _validate(snapshot):
    if not isinstance(snapshot, dict):
        raise InvalidSnapshot("snapshot must be an object")
    sid = snapshot.get("sessionId")
    seq = snapshot.get("seq")
    ver = snapshot.get("schemaVersion")
    if not isinstance(sid, str) or not sid or len(sid) > 100:
        raise InvalidSnapshot("sessionId missing")
    if not isinstance(seq, int) or isinstance(seq, bool) or seq < 0:
        raise InvalidSnapshot("seq must be a non-negative integer")
    if not isinstance(ver, int) or isinstance(ver, bool):
        raise InvalidSnapshot("schemaVersion missing")
    if not isinstance(snapshot.get("game"), dict):
        raise InvalidSnapshot("game state missing")
    return sid, seq, ver


def _meta(snapshot, saved_at):
    game = snapshot["game"]
    team = (game.get("selectedTeam") or {}).get("name")
    return {
        "sessionId": snapshot["sessionId"],
        "seq": snapshot["seq"],
        "schemaVersion": snapshot["schemaVersion"],
        "savedAt": saved_at,
        "teamName": team,
        "playerIndex": game.get("playerIndex", 0),
        "queueLength": len(game.get("queueIds") or []),
        "auctionStarted": bool(game.get("auctionInitialized")),
    }


def get_meta():
    """Return metadata of the saved game, or None."""
    with _lock:
        conn = _connect()
        try:
            row = conn.execute("SELECT meta FROM save WHERE id = 1").fetchone()
        finally:
            conn.close()
    if row is None:
        return None
    try:
        return json.loads(row[0])
    except ValueError:
        return {"corrupt": True}


def get_data():
    """Return the raw saved snapshot text and metadata, or None."""
    with _lock:
        conn = _connect()
        try:
            row = conn.execute("SELECT meta, data FROM save WHERE id = 1").fetchone()
        finally:
            conn.close()
    if row is None:
        return None
    return row[0], row[1]


def put(snapshot, replace=False):
    """Atomically create/update the single save.

    - Same session: accepted only if seq is newer than the stored one
      (stale or duplicate writes are rejected with StaleSave).
    - Different session: only when replace=True (an explicit New Game);
      otherwise SessionMismatch, so an old tab can never overwrite it.
    """
    sid, seq, _ = _validate(snapshot)
    saved_at = datetime.now(timezone.utc).isoformat()
    meta = _meta(snapshot, saved_at)
    data = json.dumps(snapshot, separators=(",", ":"))

    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            try:
                row = conn.execute(
                    "SELECT session_id, seq FROM save WHERE id = 1"
                ).fetchone()
                if row is not None and row[0] == sid:
                    if seq <= row[1]:
                        raise StaleSave(f"seq {seq} <= stored {row[1]}")
                elif row is not None and not replace:
                    raise SessionMismatch("a different game is saved")
                conn.execute(
                    """INSERT INTO save (id, session_id, seq, schema_version, saved_at, meta, data)
                       VALUES (1, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(id) DO UPDATE SET
                         session_id = excluded.session_id,
                         seq = excluded.seq,
                         schema_version = excluded.schema_version,
                         saved_at = excluded.saved_at,
                         meta = excluded.meta,
                         data = excluded.data""",
                    (sid, seq, snapshot["schemaVersion"], saved_at, json.dumps(meta), data),
                )
                conn.execute("COMMIT")
            except BaseException:
                conn.execute("ROLLBACK")
                raise
        finally:
            conn.close()
    return meta


def count():
    with _lock:
        conn = _connect()
        try:
            return conn.execute("SELECT COUNT(*) FROM save").fetchone()[0]
        finally:
            conn.close()
