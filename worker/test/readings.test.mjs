// The gift link is for signed-in students only: /me carries it, public routes don't.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const GIFT = 'gift=';
function fakeEnv(signedIn) {
  const student = { id: 1, canvas_id: '1', name: 'T', email: 't@x', is_instructor: 0 };
  const stmt = { bind() { return this; }, async first() { return signedIn ? student : null; }, async all() { return { results: [] }; }, async run() { return {}; } };
  return { SITE_ORIGIN: 'https://cu.learnvibe.build', READING_LINKS: JSON.stringify({ 6: 'https://every.to/p/x?gift=TEST' }), DB: { prepare: () => stmt } };
}
const req = (path, cookie) => new Request('https://api.learnvibe.build' + path, { headers: cookie ? { Cookie: 'lvb_session=abc' } : {} });

test('signed-in /me includes readings with the link', async () => {
  const r = await worker.fetch(req('/me', true), fakeEnv(true));
  const j = await r.json();
  assert.ok(Array.isArray(j.readings) && j.readings.length >= 1);
  assert.ok(j.readings.every((x) => x.title && x.author && x.url && x.week));
  assert.ok(j.readings.find((x) => x.week === 6).url.includes(GIFT), 'secret link served to signed-in students');
});

test('signed-out /me does not leak readings', async () => {
  const r = await worker.fetch(req('/me', false), fakeEnv(false));
  assert.equal(r.status, 401);
  assert.ok(!(await r.text()).includes(GIFT));
});

test('MCP tools never expose the gift link', async () => {
  const r = await worker.fetch(new Request('https://api.learnvibe.build/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }), fakeEnv(false));
  assert.ok(!(await r.text()).includes(GIFT));
});

test('no gift link is committed in the worker source', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.ok(!src.includes(GIFT));
});
