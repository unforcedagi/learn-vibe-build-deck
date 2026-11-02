"""Invented upload fixtures for the instructor-files tests and the prod e2e:
an HTML page, an RTF, and a DOCX, PDF and PNG made from them with
LibreOffice/pdftoppm. No real student data.

    python3 worker/test/fixtures/files/make_fixtures.py <outdir>
"""
import os
import shutil
import subprocess
import sys
import zipfile

HTML = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>FIXTURE-HTML tide planner</title>
<style>body{font-family:sans-serif;background:#eef6f7;padding:2rem}</style>
<script>document.addEventListener('DOMContentLoaded',()=>{document.getElementById('js').textContent='FIXTURE-JS ran inside the sandbox';try{parent.document.title='ESCAPED'}catch(e){}});</script>
</head><body>
<h1>FIXTURE-HTML Tide planner</h1>
<p id="js">FIXTURE-JS did not run</p>
<p>FIXTURE-HTML body: this invented page plans a morning surf around the tides.</p>
<img alt="" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==">
</body></html>
"""
RTF = r"""{\rtf1\ansi\deff0{\fonttbl{\f0 Helvetica;}}
\f0\fs28 FIXTURE-RTF Progress report\par
\fs22 FIXTURE-RTF body: an invented week of work on a tide planner. I tried three tools and kept the one that explained its steps.\par
}
"""
DOC_HTML = """<html><body><h1>FIXTURE-DOCX Final project plan</h1>
<p>FIXTURE-DOCX body: an invented plan for a tide planner with a reading list.</p>
<p>Second paragraph so the document has some length to it.</p></body></html>"""
PDF_HTML = """<html><body><h1>FIXTURE-PDF Artifact</h1>
<p>FIXTURE-PDF page one: invented notes on the build.</p>
<p style="page-break-before:always">FIXTURE-PDF page two: what I would change next.</p></body></html>"""


def soffice(src, fmt, outdir):
    prof = os.path.join(outdir, ".lo-profile")
    subprocess.run(["soffice", f"-env:UserInstallation=file://{prof}", "--headless",
                    "--convert-to", fmt, "--outdir", outdir, src],
                   check=True, capture_output=True, timeout=300)


def main(out):
    os.makedirs(out, exist_ok=True)
    def w(n, s):
        with open(os.path.join(out, n), "w") as f:
            f.write(s)
    w("tide-planner.html", HTML)
    w("progress-report.rtf", RTF)
    w("plan-src.html", DOC_HTML)
    w("artifact-src.html", PDF_HTML)
    soffice(os.path.join(out, "plan-src.html"), 'docx:MS Word 2007 XML', out)
    os.rename(os.path.join(out, "plan-src.docx"), os.path.join(out, "final-plan.docx"))
    soffice(os.path.join(out, "artifact-src.html"), "pdf:writer_web_pdf_Export", out)
    os.rename(os.path.join(out, "artifact-src.pdf"), os.path.join(out, "artifact.pdf"))
    subprocess.run(["pdftoppm", "-png", "-r", "60", "-singlefile", os.path.join(out, "artifact.pdf"),
                    os.path.join(out, "screenshot")], check=True)
    with zipfile.ZipFile(os.path.join(out, "project.zip"), "w") as z:
        z.writestr("project/README.md", "FIXTURE-ZIP readme: how to run the invented planner.")
        z.writestr("project/index.html", "<p>hi</p>")
    for n in ("plan-src.html", "artifact-src.html"):
        os.remove(os.path.join(out, n))
    shutil.rmtree(os.path.join(out, ".lo-profile"), ignore_errors=True)


if __name__ == "__main__":
    main(sys.argv[1])
