import json
import os
import sqlite3
import tempfile
import unittest

os.environ["IPL_SAVE_DB"] = os.path.join(tempfile.mkdtemp(), "t.db")
import storage  # noqa: E402


def snap(sid="A", seq=1, **game):
    g = {"selectedTeam": {"name": "MI"}, "playerIndex": 0, "queueIds": [1, 2]}
    g.update(game)
    return {"schemaVersion": 1, "sessionId": sid, "seq": seq, "game": g}


class StorageTests(unittest.TestCase):
    def setUp(self):
        os.environ["IPL_SAVE_DB"] = os.path.join(tempfile.mkdtemp(), "t.db")

    def test_empty(self):
        self.assertIsNone(storage.get_meta())
        self.assertIsNone(storage.get_data())

    def test_create_and_overwrite_same_row(self):
        storage.put(snap(seq=1))
        storage.put(snap(seq=2, playerIndex=5))
        self.assertEqual(storage.count(), 1)
        self.assertEqual(storage.get_meta()["playerIndex"], 5)

    def test_stale_and_duplicate_seq_rejected(self):
        storage.put(snap(seq=5, playerIndex=9))
        for s in (5, 4, 1):
            with self.assertRaises(storage.StaleSave):
                storage.put(snap(seq=s, playerIndex=0))
        self.assertEqual(storage.get_meta()["playerIndex"], 9)

    def test_other_session_needs_replace(self):
        storage.put(snap("A", 3))
        with self.assertRaises(storage.SessionMismatch):
            storage.put(snap("B", 1))
        self.assertEqual(storage.get_meta()["sessionId"], "A")
        storage.put(snap("B", 1), replace=True)
        self.assertEqual(storage.get_meta()["sessionId"], "B")
        self.assertEqual(storage.count(), 1)
        # the replaced session can no longer write (stale tab)
        with self.assertRaises(storage.SessionMismatch):
            storage.put(snap("A", 99))

    def test_invalid_snapshot_keeps_previous(self):
        storage.put(snap(seq=1, playerIndex=3))
        for bad in (None, [], {}, {"sessionId": "A", "seq": -1, "schemaVersion": 1, "game": {}},
                    {"sessionId": "A", "seq": 2, "schemaVersion": 1, "game": "x"}):
            with self.assertRaises(storage.InvalidSnapshot):
                storage.put(bad)
        self.assertEqual(storage.get_meta()["playerIndex"], 3)

    def test_failed_write_rolls_back(self):
        storage.put(snap(seq=1, playerIndex=3))
        bad = snap(seq=2, playerIndex=4)
        bad["game"]["x"] = {1, 2}  # not JSON serialisable
        with self.assertRaises(TypeError):
            storage.put(bad)
        self.assertEqual(storage.get_meta()["playerIndex"], 3)
        self.assertEqual(json.loads(storage.get_data()[1])["seq"], 1)

    def test_persists_across_connections(self):
        storage.put(snap(seq=7))
        # a brand-new connection (as after a backend restart) sees the same save
        conn = sqlite3.connect(storage.db_path())
        self.assertEqual(conn.execute("SELECT seq FROM save").fetchone()[0], 7)
        conn.close()

    def test_single_row_constraint(self):
        storage.put(snap())
        conn = sqlite3.connect(storage.db_path())
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO save VALUES (2,'x',1,1,'t','{}','{}')")
        conn.close()


if __name__ == "__main__":
    unittest.main()
