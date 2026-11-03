-- What happened to each sign-in link (0010). Additive: three nullable columns.
-- sent_to: 'email' (the Canvas address), 'alias' (students.login_alias) or
-- 'in_person' (minted by the instructor, shown on screen, never emailed).
-- send_status: 'sent', 'failed: <code>: <reason>' or 'shown to instructor'.
-- send_message_id: the Email Service message id, to match Cloudflare's
-- email sending log or a recipient's message trace.
-- Apply BEFORE deploying the Worker that reads these columns: /auth/request
-- uses sent_to in its rate-limit query.
ALTER TABLE magic_tokens ADD COLUMN sent_to TEXT;
ALTER TABLE magic_tokens ADD COLUMN send_status TEXT;
ALTER TABLE magic_tokens ADD COLUMN send_message_id TEXT;
