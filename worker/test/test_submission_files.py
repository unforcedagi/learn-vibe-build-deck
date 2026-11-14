"""submission_files.py on real files with the real tools (pdftotext,
pdftoppm, LibreOffice, html2text): every fixture upload comes out with
readable text and the right renderings, and the sync requests are well formed. Invented fixtures only (fixtures/files/make_fixtures.py).

    uv run -q --no-project --with html2text python3 -m unittest worker/test/test_submission_files.py
"""
import os
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


class WriteTest(unittest.TestCase):
    """The rows and objects go to the Worker's sync API (its SQL is tested in
    worker/test/admin-sync.test.mjs); here: the requests it gets are well formed."""

    def row(self, fid, text="it's text"):
        return {"canvas_file_id": fid, "name": "a.pdf", "content_type": "application/pdf", "size": None,
                "kind": "pdf", "text": text, "pages": 1, "rendition": "video", "rendition_type": "video/mp4",
                "canvas_url": "https://canvas.example/f", "status": "ok"}

    def test_api_row_and_object_types(self):
        r = sf.api_row(self.row("f1"), 2)
        self.assertEqual((r["position"], r["size"], r["pages"], r["render_version"]), (2, 0, 1, sf.RENDER_VERSION))
        rows = {"f1": self.row("f1")}
        self.assertEqual(sf.object_type("files/f1/p3.jpg", rows), "image/jpeg")
        self.assertEqual(sf.object_type("files/f1/rendition", rows), "video/mp4")
        self.assertEqual(sf.object_type("files/zz/rendition", rows), "application/octet-stream")

    def test_requests_stay_under_the_statement_cap_and_send_every_row_and_prune(self):
        import resync
        groups = [{"week": 9, "canvas_id": str(i), "rows": [{"canvas_file_id": f"{i}-{k}"} for k in range(n)],
                   "keep": [f"{i}-{k}" for k in range(n)]} for i, n in enumerate([0, 3, 39, 40, 95, 1, 0])]
        sent, prunes = [], set()
        for chunk in resync.file_group_chunks(groups, limit=40):
            self.assertLessEqual(sum(len(g["rows"]) + 1 for g in chunk), 40)
            for g in chunk:
                sent += [r["canvas_file_id"] for r in g["rows"]]
                prunes.add(g["canvas_id"])
                self.assertEqual(g["keep"], groups[int(g["canvas_id"])]["keep"])
        self.assertEqual(sorted(sent), sorted(r["canvas_file_id"] for g in groups for r in g["rows"]))
        self.assertEqual(prunes, {g["canvas_id"] for g in groups})

    def test_text_is_capped(self):
        capped = sf.cap_text("é" * 100000)
        self.assertLess(len(capped.encode()), sf.MAX_TEXT_BYTES + 100)
        self.assertTrue(capped.endswith("[truncated: the rest is in the pages]"))


if __name__ == "__main__":
    unittest.main()
