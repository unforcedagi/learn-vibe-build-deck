# Progress: gift videos on account pages (T-121, attempt ahpvxxog)

## Done (2026-11-02, MT)
- 16:18 private R2 bucket lvb-gift-videos (no r2.dev, no custom domain). 20 of 20 ready videos uploaded,
  size + md5 and sha256 read-back match (tools/publish_gift_videos.py --go --verify-bytes).
- 16:27 D1 backup ~/Builders/db-backups/lvb/pre-gift-videos-20261102-1627.sql (0600). No migration.
- 16:28 Worker deployed: version 6b7fa61a-969c-46da-ab45-4a4983fba5fb (rollback: db3c8acc-13b0-495c-acc9-b562a22184cf).
- 16:28 PR #43 merged (ad1f517), Pages built. 16:34 PR #44 merged (da2d547), Pages built.
- Prod e2e with throwaway accounts: owner 206 + plays + seeks, classmate 403, anon 401, instructor 206;
  instructor roster shows 20 real links. Cleaned: 0 e2e rows, test object deleted, 27 students as before.
- Walkthrough: https://uni.taildf9ce2.ts.net:8444/walkthrough-gift-videos-22a61a84.mp4

- 16:49 s5 and 17:33 s4, s7, s12, s17 (run 4cux7tmr) uploaded: 25 of 25 ready rows stored, sha256 read-back matches.

## Next
- None. If a video is re-rendered or a new row is published in status.json, run
  `python3 tools/publish_gift_videos.py --go --verify-bytes` (idempotent; uploads only new or changed videos).
