# PROGRESS: final project prompt v4 (T-121, attempt la2y6n6x)

Worktree: ~/Code/wt/mts-la2y6n6x (branch mts/t-121-la2y6n6x). Video work: ~/Code/teaching/week9/video-fp/.

## Done
- v4 read read-only from the uni vault (sqlite ?mode=ro), saved to video-fp/convo/prompt-v4.txt.

- Step 2 site+Worker: commit 3bf4792, PR #37. Tests 75 pass/1 skip; new v4 assertion goes red with v3 template.
- Step 3 Canvas: backup ~/Builders/db-backups/lvb/canvas-2858631-20261026-200426.html; PUT 02:04:44Z;
  read-back = sent; name/due/points/published/submission types unchanged. Also replaced the option step
  that described the old menu (flagged in report).
- PR #37 merged (1b47513), CI green. wrangler deploy version 1b5c612e. Prod: temporary e2e-test student + session ->
  /me/final-project-prompt 200, has "the answer is probably yes", no "Pressure-test it"; signed out 401; e2e rows removed
  (0 e2e students, 0 orphan sessions). Pages live: week-9 page and template carry the new text.
- Video: old outputs copied to video-fp/{out,artifact,film,scene}/v1/. New inputs convo/{prompt-v4.txt,context-v4.md
  (Jules added to week 8), persona-v4.md, run_v4.py}; AI role opus, student role sonnet; -> convo/transcript-v4.json.

## Next
- Video: lines, voice, data, scene edits, render, mix, encode, QA (ffprobe, volumedetect, decode, contact sheet, whisper).
- Publish (uni-publish), Buzz #atlas, replace lessons/week-9/media/*, update "Watch first (m:ss)" in week-9.md, PR, merge.
