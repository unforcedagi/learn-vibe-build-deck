// MCP endpoint: protocol handshake, tool listing, lesson fetch, input validation,
// and that it only ever fetches fixed public paths on SITE_ORIGIN.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMcp, parseLessons } from '../src/mcp.js';

const env = { SITE_ORIGIN: 'https://cu.learnvibe.build' };
const LLMS = `# Learn, Vibe, Build\n\n## Lessons\n\n- [Week 6 — Context](https://cu.learnvibe.build/lessons/week-6/lesson.md): Choose what the AI sees.\n- [Week 1 — Orientation](https://cu.learnvibe.build/lessons/week-1/lesson.md): What this course is.\n`;
const fetched = [];
const fakeFetch = async (url) => {
  fetched.push(url);
  if (url === env.SITE_ORIGIN + '/llms.txt') return new Response(LLMS);
  if (url === env.SITE_ORIGIN + '/lessons/week-6/lesson.md') return new Response('# Week 6 — Context, Fluency, and Connectors\n...');
  return new Response('nope', { status: 404 });
};
const rpc = async (msg) => {
  const res = await handleMcp(new Request('https://api.learnvibe.build/mcp', { method: 'POST', body: JSON.stringify(msg), headers: { 'Content-Type': 'application/json' } }), env, fakeFetch);
  return res.status === 202 ? null : res.json();
};

test('initialize negotiates a protocol version and advertises tools', async () => {
  const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
  assert.equal(r.result.protocolVersion, '2025-06-18');
  assert.ok(r.result.capabilities.tools);
  assert.equal(await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});

test('tools/list exposes three read-only tools', async () => {
  const r = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(r.result.tools.map((t) => t.name), ['get_course_map', 'list_lessons', 'get_lesson']);
  assert.ok(r.result.tools.every((t) => t.annotations.readOnlyHint));
});

test('list_lessons parses llms.txt, sorted by week', async () => {
  const r = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_lessons', arguments: {} } });
  assert.deepEqual(r.result.structuredContent.lessons.map((l) => l.week), [1, 6]);
  assert.equal(parseLessons(LLMS).length, 2);
});

test('get_lesson returns the markdown; bad or missing weeks are tool errors', async () => {
  const ok = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_lesson', arguments: { week: 6 } } });
  assert.match(ok.result.content[0].text, /^# Week 6/);
  const missing = await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_lesson', arguments: { week: 9 } } });
  assert.equal(missing.result.isError, true);
  const bad = await rpc({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_lesson', arguments: { week: '../../account' } } });
  assert.equal(bad.result.isError, true);
});

test('only fixed public paths on the site are ever fetched', () => {
  for (const u of fetched) assert.match(u, /^https:\/\/(cu\.learnvibe\.build|raw\.githubusercontent\.com\/unforcedagi\/learn-vibe-build-deck\/main)\/(llms\.txt|lessons\/week-\d+\/lesson\.md)$/);
});

test('unknown method and parse errors are JSON-RPC errors', async () => {
  const r = await rpc({ jsonrpc: '2.0', id: 7, method: 'resources/list' });
  assert.equal(r.error.code, -32601);
  const res = await handleMcp(new Request('https://x/mcp', { method: 'POST', body: '{' }), env, fakeFetch);
  assert.equal(res.status, 400);
});
