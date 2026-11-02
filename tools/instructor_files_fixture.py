"""Render the invented upload fixtures through worker/submission_files.py and
write a manifest the e2e checks load: rows (as the sync would store them) and
the R2 objects (key -> local file). No Canvas, no network, no real students.

    uv run -q --no-project --with html2text python3 tools/instructor_files_fixture.py <outdir>
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "worker"))
sys.path.insert(0, os.path.join(ROOT, "worker", "test", "fixtures", "files"))
import make_fixtures  # noqa: E402
import submission_files as sf  # noqa: E402

# Week 9 of the e2e student: the final-project artifact (PDF), the plan
# (Word), the progress report (RTF), the build (HTML) and a screenshot.
FILES = [
    ("artifact.pdf", "application/pdf"),
    ("final-plan.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ("progress-report.rtf", "text/rtf"),
    ("tide-planner.html", "text/html"),
    ("screenshot.png", "image/png"),
]


def main(out):
    fx = os.path.join(out, "fixtures")
    make_fixtures.main(fx)
    rows, objects = [], []
    for i, (name, ctype) in enumerate(FILES):
        path = os.path.join(fx, name)
        att = {"id": f"e2e-fixture-{i + 1}", "display_name": name, "content-type": ctype,
               "size": os.path.getsize(path), "url": f"https://canvas.colorado.edu/files/e2e-fixture-{i + 1}/download"}
        res = sf.process(path, att, os.path.join(out, "work"))
        rows.append({**res["row"], "position": i})
        objects += [{"key": k, "file": p} for k, p in res["uploads"]]
    with open(os.path.join(out, "manifest.json"), "w") as f:
        json.dump({"rows": rows, "objects": objects}, f, indent=1)
    print(f"{len(rows)} files, {len(objects)} objects -> {out}/manifest.json")


if __name__ == "__main__":
    main(os.path.abspath(sys.argv[1]))
