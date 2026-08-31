# Wiring up student accounts

Everything on this branch is scaffolding: the site works today with
placeholder config (the account page shows a "not wired yet" banner). This
file is the exact order of operations once you're ready to create the
Supabase project.

**No student data lives in this repo.** The roster seed file lives only at
`~/.scratch/lvb-accounts/seed.json` on the machine that runs the import.

## 1. Create the project

1. [supabase.com](https://supabase.com) → New project (free tier is fine).
   Name it something like `learn-vibe-build`; region: US.
2. Note two things from **Settings → API**:
   - Project URL (`https://<ref>.supabase.co`)
   - `anon` public key (for `account/config.js`)
   - `service_role` secret key (for `import.py` only — never in the repo,
     never in `config.js`)

## 2. Run the schema

Dashboard → **SQL Editor** → paste all of `supabase/schema.sql` → Run.

Before (or right after) running it, replace the
`INSTRUCTOR_EMAIL@colorado.edu` placeholder at the bottom with the real
instructor email — the RLS policies grant read-everything to whoever is in
the `instructors` table, matched against the signed-in JWT's email.

## 3. Lock down auth: no signups, no passwords

Dashboard → **Authentication → Sign In / Providers**:

- **Turn OFF "Allow new users to sign up"** (`enable_signup = false`).
  This is the real gate: only the 24 pre-seeded accounts can ever sign in.
  The page also passes `shouldCreateUser: false` client-side, but the server
  setting is what enforces it.
- Email provider: leave **enabled**, with magic link / email OTP on. We never
  set passwords (import.py creates users with no password), so magic link is
  the only way in.
- A student who types a non-roster email gets a 422 ("Signups not allowed")
  which the page translates to *"use the email on your Canvas account."*

## 4. Set the URLs

Dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://cu.learnvibe.build/account/`
- **Redirect URLs:** add `https://cu.learnvibe.build/account/`
  (and `http://localhost:*/account/` if you want to test locally).

The page uses the implicit flow: the emailed link hits Supabase's `/verify`
endpoint, which redirects to this URL with the session tokens in the URL
hash. If the redirect URL isn't allowlisted, students get bounced to the
Site URL — so both must point at `/account/`.

## 5. Email sending: read this before class night

Facts verified against the [Supabase custom-SMTP docs](https://supabase.com/docs/guides/auth/auth-smtp)
(checked 2026-08-31):

- The **built-in default email service sends only 2 messages per hour**, and
  — bigger problem — it **only delivers to pre-authorized addresses**
  (emails belonging to project *team members*; everyone else gets
  "Email address not authorized"). It's explicitly for testing, no SLA.
- So for 24 students signing in on the same evening, **custom SMTP is
  required, not optional.** Free options that work fine at this scale:
  [Resend](https://resend.com) (free tier ~3,000 emails/mo) or Brevo.
  Configure under **Authentication → Emails → SMTP Settings**.
- Once custom SMTP is on, Supabase still imposes an initial cap of
  **30 emails per hour**; raise it under **Authentication → Rate Limits**
  (e.g. to 100/hour) so a room of 24 students requesting links — some twice
  — doesn't stall.
- Note: per the [June 2026 changelog](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier),
  free-tier projects created after 3 June 2026 also need custom SMTP to
  customize email templates — one more reason to just set it up.

## 6. Seed the roster

On a machine with the seed file at `~/.scratch/lvb-accounts/seed.json`
(JSON array of `{canvas_id, name, email, week1_submitted_at, week1_body}`):

```sh
export SUPABASE_URL="https://<ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service role key>"   # keep out of shell history if possible
python3 supabase/import.py
```

Creates confirmed passwordless auth users, upserts `profiles`, inserts
week-1 submissions where a body exists. Idempotent — safe to re-run after
fixing a bad row.

## 7. Wire the page and ship

1. Edit `account/config.js`: replace both `FILL_ME` values with the Project
   URL and the **anon** key. (The anon key is public by design; RLS protects
   the data.)
2. Commit on this branch, sanity-check on the branch preview or locally.
3. Test the full loop once with the instructor account: request link →
   click → see profile → sign out. Then test one non-roster email and
   confirm the Canvas-email error shows.
4. Merge `accounts` into `main` — GitHub Pages redeploys, and
   `https://cu.learnvibe.build/account/` is live.

## Later: the studio wall

`submissions.visibility` defaults to `'private'`. Flipping a row to
`'public'` makes it readable by anyone (including signed-out visitors) under
the existing RLS policy — that's the hook for a public studio-wall feed.
Student-driven submits/visibility toggles need the two commented-out
policies at the bottom of `schema.sql`.
