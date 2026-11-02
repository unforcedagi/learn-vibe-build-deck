"""tools/publish_gift_videos.py: a video goes to a student id only when every source agrees
it is theirs, and only a published file with the right bytes counts. Invented data only.

    python3 -m unittest worker/test/test_publish_gift_videos.py
"""
import hashlib
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tools"))
import publish_gift_videos as pg  # noqa: E402

EXPORT = {7: {"id": 7, "canvas_id": "900", "name": "Ana Example"}}
PROD = {7: {"id": 7, "canvas_id": "900", "name": "Ana Example", "email": "ana@example.invalid", "is_instructor": 0}}
ROW = {"name": "Ana", "url": "https://x.invalid/gift2-s7-abc.mp4", "status": "published 57.0 s; QA pass"}
SCRIPT = {"student_id": 7, "first_name": "Ana"}


def problem(**over):
    args = {"row": ROW, "export": EXPORT, "prod": PROD, "script": SCRIPT, **over}
    return pg.mapping_problem(7, args["row"], args["export"], args["prod"], args["script"])


class Mapping(unittest.TestCase):
    def test_all_sources_agree(self):
        self.assertIsNone(problem())

    def test_each_disagreement_blocks_the_upload(self):
        cases = {
            "not in export": {"export": {}},
            "not in prod": {"prod": {}},
            "instructor": {"prod": {7: {**PROD[7], "is_instructor": 1}}},
            "no email": {"prod": {7: {**PROD[7], "email": None}}},
            "canvas id moved": {"prod": {7: {**PROD[7], "canvas_id": "901"}}},
            "id reused for someone else": {"prod": {7: {**PROD[7], "name": "Bo Example"}}},
            "status row is someone else": {"row": {**ROW, "name": "Bo"}},
            "no script": {"script": None},
            "script for another id": {"script": {"student_id": 8, "first_name": "Ana"}},
            "script for another person": {"script": {"student_id": 7, "first_name": "Bo"}},
        }
        for label, over in cases.items():
            self.assertIsNotNone(problem(**over), label)


class Ready(unittest.TestCase):
    def test_only_published_mp4_rows(self):
        rows = {"rows": {
            "1": {**ROW, "status": "published 56 s; QA pass"},
            "2": {**ROW, "status": "rendering"},
            "3": {**ROW, "status": "published? no: render failed"},
            "4": {**ROW, "status": "published", "url": ""},
        }}
        self.assertEqual(sorted(pg.ready_rows(rows)), [1])

    def test_local_file_must_be_this_id_and_these_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            data = b"not really a video"
            sha8 = hashlib.sha256(data).hexdigest()[:8]
            (Path(d) / f"gift2-s7-{sha8}.mp4").write_bytes(data)
            (Path(d) / "gift2-s7-00000000.mp4").write_bytes(data)
            old, pg.SERVE_DIR = pg.SERVE_DIR, Path(d)
            try:
                f, err = pg.local_file(7, f"https://x.invalid/gift2-s7-{sha8}.mp4")
                self.assertIsNone(err)
                self.assertEqual(f["md5"], hashlib.md5(data).hexdigest())
                self.assertIsNotNone(pg.local_file(8, f"https://x.invalid/gift2-s7-{sha8}.mp4")[1])
                self.assertIsNotNone(pg.local_file(7, "https://x.invalid/gift2-s7-00000000.mp4")[1])
                self.assertIsNotNone(pg.local_file(7, "https://x.invalid/gift2-s7-11111111.mp4")[1])
            finally:
                pg.SERVE_DIR = old


if __name__ == "__main__":
    unittest.main()
