# PROGRESS: final reflection prompt on My journey (T-469, attempt gwzyrm28)

Worktree: ~/Code/wt/mts-gwzyrm28 (branch mts/t-469-gwzyrm28).

## Done
- Shared builder: worker/src/fpprompt.js buildContext({ budget, baseline }); buildPrompt (final project) and
  buildReflectionPrompt (Week 1 first, never trimmed). Template: assets/reflection-prompt-template.js.
- Worker: /me/final-reflection-prompt via handleHistoryPrompt (same handler as /me/final-project-prompt).
- Site: assets/fp-prompt.js mounts either kind (mountReflectionPrompt); My journey shows both, previews folded.
- Tests: worker/test/reflection-prompt.test.mjs (7). Broke Week 1 protection once -> red, restored -> green.

## Review
- Independent reviewer subagent: SHIP. Fixed its nits (distinct "Read the … prompt" labels, "summarise it all"),
  noted the Week 1 over-cap case in fpprompt.js.

## PR
- https://github.com/unforcedagi/learn-vibe-build-deck/pull/51 (not merged, not deployed)

## Next (owner: Uni)
- Verify, merge, deploy the Worker.
