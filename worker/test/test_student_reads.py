"""student_reads.py planning: each student's input holds only their own work,
and an unchanged student is skipped. Invented fixture data only.

    uv run -q --with html2text python3 -m unittest worker/test/test_student_reads.py
"""
import datetime
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import student_reads as sr  # noqa: E402

WEEKS = {1: {"title": "Intentions", "due_at": "2026-08-31T05:59:00Z"},
         2: {"title": "Build something", "due_at": "2026-09-14T05:59:00Z"},
         3: {"title": "Three tools", "due_at": "2026-09-21T05:59:00Z"}}
STUDENTS = [{"id": 1, "name": "E2E One"}, {"id": 2, "name": "E2E Two"}]
SUBS = [
    {"student_id": 1, "week": 1, "body": "ONE-W1 tide chart", "submitted_at": "2026-08-30T12:00:00Z", "link_url": None},
    {"student_id": 1, "week": 3, "body": "ONE-W3 late", "submitted_at": "2026-09-25T12:00:00Z", "link_url": "https://one.example"},
    {"student_id": 2, "week": 2, "body": "TWO-W2 recipes", "submitted_at": "2026-09-13T12:00:00Z", "link_url": None},
]
UTC = datetime.timezone.utc
NOW = datetime.datetime(2026, 10, 26, 18, 0, tzinfo=UTC)
NEXT_DAY = datetime.datetime(2026, 10, 27, 18, 0, tzinfo=UTC)
POSTS = [{"student_id": 2, "kind": "build", "title": "TWO-POST", "body": "x", "link_url": None,
          "created_at": "2026-10-20T19:00:00Z", "pod_name": None}]


class PlanTest(unittest.TestCase):
    def test_each_input_holds_only_that_students_work(self):
        todo = {sid: text for sid, text, _, _ in sr.plan(STUDENTS, SUBS, POSTS, {}, WEEKS, NOW)}
        self.assertIn("ONE-W1", todo[1])
        self.assertIn("submitted 2026-09-25 (late)", todo[1])
        self.assertIn("Weeks past due with no submission: 2", todo[1])
        self.assertNotIn("TWO", todo[1])
        self.assertNotIn("Two", todo[1])
        self.assertIn("TWO-POST", todo[2])
        self.assertNotIn("ONE", todo[2])

    def test_unchanged_is_skipped_and_a_change_regenerates(self):
        first = sr.plan(STUDENTS, SUBS, POSTS, {}, WEEKS, NOW)
        stored = {sid: h for sid, _, h, _ in first}
        # Next day, same material: nothing to do.
        self.assertEqual(sr.plan(STUDENTS, SUBS, POSTS, stored, WEEKS, NEXT_DAY), [])
        self.assertEqual(len(sr.plan(STUDENTS, SUBS, POSTS, stored, WEEKS, NEXT_DAY, force=True)), 2)
        edited = [dict(s, body="ONE-W1 rewritten") if s["student_id"] == 1 and s["week"] == 1 else s for s in SUBS]
        self.assertEqual([t[0] for t in sr.plan(STUDENTS, edited, POSTS, stored, WEEKS, NEXT_DAY)], [1])

    def test_a_week_is_missing_only_after_its_deadline(self):
        # Week 2 is due 2026-09-14T05:59Z: an hour before, it is not missing yet.
        before = datetime.datetime(2026, 9, 14, 4, 59, tzinfo=UTC)
        after = datetime.datetime(2026, 9, 14, 6, 0, tzinfo=UTC)
        text = lambda now: sr.build_input(STUDENTS[0], SUBS[:1], [], WEEKS, now)
        self.assertIn("Weeks past due with no submission: none", text(before))
        self.assertIn("Weeks past due with no submission: 2", text(after))

    def test_odd_timestamps_do_not_crash(self):
        self.assertTrue(sr.is_late({"week": 3, "submitted_at": "2026-09-25T12:00:00"}, WEEKS))
        self.assertFalse(sr.is_late({"week": 3, "submitted_at": "not a date"}, WEEKS))

    def test_based_on(self):
        _, _, _, basis = sr.plan(STUDENTS, SUBS, POSTS, {}, WEEKS, NOW)[1]
        self.assertEqual(basis, {"weeks": [2], "posts": 1, "latest": "2026-10-20T19:00:00Z"})


if __name__ == "__main__":
    unittest.main()
