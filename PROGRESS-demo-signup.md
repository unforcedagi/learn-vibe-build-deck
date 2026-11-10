# Progress: final demo sign-up (T-121, attempt ztycfm8j)

## Done
- Worker: `/demos`, `/demos/status`, `/demos/claim` (POST, DELETE), `/instructor/demos` (+ `/move`, `/guest`,
  `/settings`, `/export`, `PATCH|DELETE /<id>`); `worker/src/demos.js`; migration `0011_demo_slots.sql` (additive:
  `demo_slots`, `demo_settings`), mirrored in `schema.sql`; `DEMO_PREVIEW` var in `wrangler.toml`.
- Days and start times from `schedule/semester.json` (`"demo_signup": true`, `"starts": "17:05"` on Nov 30; Dec 4 has
  no start yet, so "time to be confirmed") through `tools/build_schedule.py` → `DEMO_DAYS`.
- Pages: `/demos/` (student), `/instructor/demos/` (Aaron), hidden home card (generated) + `assets/demo-link.js`,
  account card. The flag is `demo_settings.signup_open` (button on the instructor page), off by default.
- Tests: `node --test 'worker/test/*.test.mjs'` 119 pass (16 in demos.test.mjs; 9 mutations each turned it red).
  `node tools/e2e_demos.mjs` passes (Chromium, 1280 and 390 px, fixture class).
- Migration proven on a copy of the 2026-11-02 production backup (in memory): 13 tables, counts and columns unchanged.
- Walkthrough: `WALKTHROUGH-demo-signup.md`, video https://uni.taildf9ce2.ts.net:8444/walkthrough-demo-signup-c9188402.mp4
- PR #48, CI green.

## Blocked: production (needs the Cloudflare broker, which this worker can't reach)
`~/.config/uni-sealed` and `/run/uni-sealed` are masked here, the broker doesn't answer, there's no wrangler login, and
the repo has no CI secrets. Steps for Uni (each `cf-job` is one approval card for Aaron on the `unforced` account).
Not on a Monday 5:05–7:35 PM MT. Run from the PR branch checkout (or main once merged), `cd worker`:

```sh
W=wrangler@4; STAMP=$(date +%Y%m%d-%H%M)
# 1. Back up D1 (export needs D1 write rights on some tokens; use d1-write if d1-read is refused)
~/Code/uni-ops/bin/cf-job --account unforced --template d1-read --purpose "LVB: back up lvb-accounts before the demo sign-up migration (T-121)" \
  -- npx -y $W d1 export lvb-accounts --remote --output ~/Builders/db-backups/lvb/pre-demo-slots-$STAMP.sql
# 2. Additive migration, then read back the new tables
~/Code/uni-ops/bin/cf-job --account unforced --template d1-write --purpose "LVB: add demo_slots + demo_settings tables (additive, T-121)" \
  -- sh -c 'npx -y wrangler@4 d1 execute lvb-accounts --remote --file migrations/0011_demo_slots.sql && npx -y wrangler@4 d1 execute lvb-accounts --remote --json --command "SELECT name FROM sqlite_master WHERE name LIKE '"'"'demo_%'"'"'"'
# 3. Note the current version (rollback target), then deploy
~/Code/uni-ops/bin/cf-job --account unforced --template workers-scripts-write --purpose "LVB: deploy lvb-accounts with the demo sign-up, flag off (T-121)" \
  -- sh -c 'npx -y wrangler@4 deployments list | tail -20 && npx -y wrangler@4 deploy'
# 4. Check prod: flag off
curl -s https://api.learnvibe.build/demos/status        # {"linked":false}
curl -s -o /dev/null -w '%{http_code}\n' https://api.learnvibe.build/demos   # 401
```
Rollback: `npx wrangler rollback <version id from step 3's list>` (same template). The tables can stay; nothing else
reads them.

Then the live end-to-end with throwaway accounts (D1 via `pg.d1`, which reads `CLOUDFLARE_API_TOKEN`):
```sh
D=$(mktemp -d); cd <repo root>
~/Code/uni-ops/bin/cf-job --account unforced --template d1-write --window 600 --purpose "LVB: demo sign-up live check with e2e accounts (T-121)" \
  -- sh -c "python3 tools/prod_e2e_demos.py seed $D && python3 tools/prod_e2e_demos.py check $D && \
     PLAYWRIGHT=/home/uni/Code/berner-collective/node_modules/playwright node tools/e2e_demos.mjs $D/shots --prod $D/tokens.json; \
     python3 tools/prod_e2e_demos.py clean $D"
```
Expect `all checks passed` twice and `demo sign-up open: False; lock: none; slot rows now 0`.

## Open
- Dec 4 start time: add `"starts": "HH:MM"` to that meeting in `schedule/semester.json` and run
  `python3 tools/build_schedule.py` (Worker redeploy needed for the times; DEMO_DAYS is compiled in). Its summary says
  "Friday, on a Monday schedule", which suggests 5:05 PM; not set without Aaron's word.
- Vault draft note of the Demo day brief: not written (vault API key not readable here). Text is in PR #48.
- Aaron approves the brief copy, then presses "Open sign-up to the class".
