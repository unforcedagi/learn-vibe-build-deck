"""submission_files.py on real files with the real tools (pdftotext,
pdftoppm, LibreOffice, html2text): every fixture upload comes out with
readable text and the right renderings, and the SQL keeps a student's rows to
that student. Invented fixtures only (fixtures/files/make_fixtures.py).

    uv run -q --no-project --with html2text python3 -m unittest worker/test/test_submission_files.py
"""
import os
import sqlite3
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
sys.path.insert(0, os.path.join(HERE, "fixtures", "files"))
import submission_files as sf  # noqa: E402
import make_fixtures  # noqa: E402

TYPES = {
    "artifact.pdf": "application/pdf",
    "final-plan.docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "progress-report.rtf": "text/rtf",
    "tide-planner.html": "text/html",
    "screenshot.png": "image/png",
    "project.zip": "application/x-zip-compressed",
}


class ProcessTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.fx = os.path.join(cls.tmp.name, "fx")
        make_fixtures.main(cls.fx)
        cls.out = {}
        for i, (name, ctype) in enumerate(TYPES.items(), 1):
            att = {"id": 1000 + i, "display_name": name, "content-type": ctype,
                   "size": os.path.getsize(os.path.join(cls.fx, name)), "url": f"https://canvas.example/files/{i}"}
            cls.out[name] = sf.process(os.path.join(cls.fx, name), att, os.path.join(cls.tmp.name, "work"))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_pdf_has_text_and_one_image_per_page(self):
        r = self.out["artifact.pdf"]
        self.assertEqual(r["row"]["kind"], "pdf")
        self.assertIn("FIXTURE-PDF page two", r["row"]["text"])
        self.assertEqual(r["row"]["pages"], 2)
        self.assertEqual([k for k, _ in r["uploads"]], ["files/1001/p1.jpg", "files/1001/p2.jpg"])
        for _, p in r["uploads"]:
            with open(p, "rb") as f:
                self.assertEqual(f.read(3), b"\xff\xd8\xff")  # JPEG

    def test_word_and_rtf_go_through_libreoffice(self):
        for name, marker in (("final-plan.docx", "FIXTURE-DOCX body"), ("progress-report.rtf", "FIXTURE-RTF body")):
            row = self.out[name]["row"]
            self.assertEqual((row["kind"], row["status"]), ("office", "ok"), name)
            self.assertIn(marker, row["text"])
            self.assertGreaterEqual(row["pages"], 1)

    def test_html_text_drops_script_and_keeps_the_file_for_the_sandbox(self):
        r = self.out["tide-planner.html"]
        self.assertIn("FIXTURE-HTML body", r["row"]["text"])
        self.assertNotIn("addEventListener", r["row"]["text"])
        self.assertNotIn("base64", r["row"]["text"])
        self.assertEqual((r["row"]["rendition"], r["uploads"][0][0]), ("html", "files/1004/rendition"))

    def test_image_and_zip(self):
        self.assertEqual(self.out["screenshot.png"]["row"]["rendition_type"], "image/png")
        self.assertIn("FIXTURE-ZIP readme", self.out["project.zip"]["row"]["text"])
        self.assertIn("project/index.html", self.out["project.zip"]["row"]["text"])

    def test_every_fixture_has_content(self):
        for name, r in self.out.items():
            self.assertTrue(sf.has_content(r["row"]), name)

    def test_unknown_type_and_failed_download_say_why(self):
        att = {"id": 7, "display_name": "x.bin", "content-type": "application/octet-stream", "url": "u"}
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "x.bin")
            with open(p, "wb") as f:
                f.write(b"\x00\x01")
            self.assertEqual(sf.process(p, att, d)["row"]["status"], "no preview for this file type")
            self.assertEqual(sf.process(None, att, d)["row"]["status"], "download failed")


class SqlTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        with open(os.path.join(HERE, "..", "schema.sql")) as f:
            self.db.executescript(f.read())
        self.db.executemany("INSERT INTO students (id, canvas_id, name, email) VALUES (?, ?, ?, ?)",
                            [(1, "c1", "E2E One", "e2e-test@learnvibe.build"), (2, "c2", "E2E Two", "e2e-test-2@learnvibe.build")])

    def row(self, fid, text="it's text"):
        return {"canvas_file_id": fid, "name": "a.pdf", "content_type": "application/pdf", "size": 1,
                "kind": "pdf", "text": text, "pages": 1, "rendition": None, "rendition_type": None,
                "canvas_url": "https://canvas.example/f", "status": "ok"}

    def test_upsert_maps_canvas_user_to_student_and_prune_drops_replaced_files(self):
        x = self.db.executescript
        x(sf.upsert_sql(self.row("f1"), "c1", 9, 0, "2026-11-02T00:00:00Z"))
        x(sf.upsert_sql(self.row("f2"), "c1", 9, 1, "2026-11-02T00:00:00Z"))
        x(sf.upsert_sql(self.row("f3"), "c2", 9, 0, "2026-11-02T00:00:00Z"))
        x(sf.upsert_sql(self.row("f1", "new text"), "c1", 9, 0, "2026-11-03T00:00:00Z"))
        rows = self.db.execute("SELECT canvas_file_id, student_id, text FROM submission_files ORDER BY 1").fetchall()
        self.assertEqual(rows, [("f1", 1, "new text"), ("f2", 1, "it's text"), ("f3", 2, "it's text")])
        x(sf.prune_sql("c1", 9, ["f2"]))     # student one resubmitted with only f2
        x(sf.prune_sql("c2", 8, []))         # another week: nothing of week 9 goes
        self.assertEqual([r[0] for r in self.db.execute("SELECT canvas_file_id FROM submission_files ORDER BY 1")],
                         ["f2", "f3"])
        x(sf.prune_sql("c2", 9, []))         # text-only resubmission clears their files
        self.assertEqual([r[0] for r in self.db.execute("SELECT canvas_file_id FROM submission_files")], ["f2"])

    def test_text_is_capped_under_the_d1_statement_limit(self):
        capped = sf.cap_text("é" * 100000)
        self.assertLess(len(sf.upsert_sql(self.row("f9", capped), "c1", 1, 0, "t").encode()), 100 * 1024)


if __name__ == "__main__":
    unittest.main()
