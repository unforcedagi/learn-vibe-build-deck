-- Weeks 7-9 learning pods. Run once, remote, after migration 0007 is applied.
-- Members are students.id values.
INSERT INTO pod_sets (id, name, starts_on, ends_on, created_at)
VALUES (1, 'Weeks 7-9 learning pods', '2026-10-12', '2026-11-01', '2026-10-12T00:00:00.000Z');

INSERT INTO pods (id, pod_set_id, name) VALUES
  (1, 1, 'Pod 1'), (2, 1, 'Pod 2'), (3, 1, 'Pod 3'), (4, 1, 'Pod 4'), (5, 1, 'Pod 5');

INSERT INTO pod_members (pod_id, student_id) VALUES
  (1, 24), (1, 1), (1, 3), (1, 14), (1, 5),
  (2, 15), (2, 18), (2, 19), (2, 11), (2, 26),
  (3, 8), (3, 22), (3, 13), (3, 16), (3, 23),
  (4, 17), (4, 6), (4, 2), (4, 10), (4, 7),
  (5, 21), (5, 20), (5, 12), (5, 4), (5, 9), (5, 27);
