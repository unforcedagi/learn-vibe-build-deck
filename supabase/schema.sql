-- ============================================================================
-- Learn, Vibe, Build (ATLS 4519) — student accounts schema
--
-- Run this once in the Supabase SQL editor after creating the cloud project
-- (see supabase/README.md for the full wiring order).
--
-- Model:
--   * auth.users        — managed by Supabase Auth; rows are pre-seeded by
--                         supabase/import.py (public signups are disabled).
--   * public.profiles   — one row per student, pk = auth.users.id.
--   * public.submissions — homework rows, private by default; a future
--                         'public' visibility feeds the studio wall.
--   * public.instructors — the configurable list of instructor emails that
--                         grants read-everything access via RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- instructors: who counts as "the instructor" for RLS purposes.
--
-- >>> CONFIGURE ME <<<
-- Add one row per instructor email BELOW (see the INSERT at the bottom of
-- this file). The email must exactly match (case-insensitively) the email the
-- instructor signs in with, because policies compare it against the JWT's
-- email claim.
-- ----------------------------------------------------------------------------
create table if not exists public.instructors (
  email text primary key
);

-- Lock the instructors table down completely: RLS on, and no policies means
-- no access for anon/authenticated. Only the service role (import scripts,
-- dashboard) and the security-definer function below can read it.
alter table public.instructors enable row level security;

-- ----------------------------------------------------------------------------
-- is_instructor(): true when the calling JWT's email is in instructors.
--
-- security definer so it can read public.instructors even though that table
-- has no RLS policies; stable + fixed search_path per Supabase guidance.
-- ----------------------------------------------------------------------------
create or replace function public.is_instructor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.instructors i
    where lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Both roles may *call* the function; it only ever returns a boolean.
grant execute on function public.is_instructor() to authenticated, anon;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id        uuid primary key references auth.users (id) on delete cascade,
  canvas_id bigint,
  name      text,
  email     text unique not null
);

alter table public.profiles enable row level security;

-- Policy: a signed-in student can read their own profile row (and only
-- theirs) — auth.uid() is the id from their JWT, which equals profiles.id.
create policy "students read own profile"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

-- Policy: a signed-in student can update their own profile row (e.g. fix
-- their display name). USING limits which rows they may touch; WITH CHECK
-- prevents them from re-pointing the row at another id. Note: RLS is
-- row-level, not column-level — if email/canvas_id must become immutable,
-- add a BEFORE UPDATE trigger later.
create policy "students update own profile"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Policy: instructors can read every profile (roster view).
create policy "instructors read all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_instructor());

-- ----------------------------------------------------------------------------
-- submissions
-- ----------------------------------------------------------------------------
create table if not exists public.submissions (
  id           bigint generated always as identity primary key,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  week         int not null,
  body         text,
  submitted_at timestamptz not null default now(),
  -- 'private' (default): visible to the student + instructor only.
  -- 'public': also readable by anyone — this later feeds the studio wall.
  visibility   text not null default 'private'
               check (visibility in ('private', 'public'))
);

alter table public.submissions enable row level security;

-- Policy: a student can read their own submissions, whatever the visibility.
create policy "students read own submissions"
  on public.submissions
  for select
  to authenticated
  using (profile_id = auth.uid());

-- Policy: instructors can read every submission (grading view).
create policy "instructors read all submissions"
  on public.submissions
  for select
  to authenticated
  using (public.is_instructor());

-- Policy: anyone — including anonymous visitors — can read submissions the
-- student has made public. This is the studio-wall feed. anon covers
-- signed-out visitors; authenticated is included so signed-in students also
-- see classmates' public work.
create policy "anyone reads public submissions"
  on public.submissions
  for select
  to anon, authenticated
  using (visibility = 'public');

-- No INSERT/UPDATE/DELETE policies yet: week-1 rows are seeded by
-- import.py with the service role (which bypasses RLS). When students start
-- submitting from the site, add e.g.:
--   create policy "students insert own submissions" on public.submissions
--     for insert to authenticated with check (profile_id = auth.uid());
--   create policy "students set own visibility" on public.submissions
--     for update to authenticated
--     using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ----------------------------------------------------------------------------
-- >>> CONFIGURE ME <<<  — instructor email(s)
-- Replace the placeholder with the instructor's real sign-in email before
-- (or right after) running this file. Re-runnable: on conflict do nothing.
-- ----------------------------------------------------------------------------
insert into public.instructors (email)
values ('INSTRUCTOR_EMAIL@colorado.edu')  -- <<< replace with the real one
on conflict (email) do nothing;
