import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

// The MCP must still serve a lesson when the Pages site 404s (unpublished / stuck build).
test('get_lesson falls back to the repo when the site 404s', async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    if (String(url).startsWith('https://site.test')) return new Response('nope', { status: 404 });
    if (String(url).endsWith('/lessons/week-6/lesson.md')) return new Response('# Week 6 lesson body', { status: 200 });
    return new Response('nope', { status: 404 });
  };
  try {
    const env = { SITE_ORIGIN: 'https://site.test', REPO_RAW_ORIGIN: 'https://raw.test' };
    const req = new Request('https://api.test/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_lesson', arguments: { week: 6 } } }),
    });
    const res = await worker.fetch(req, env, {});
    const j = await res.json();
    assert.ok(!j.result.isError, JSON.stringify(j));
    assert.match(j.result.content[0].text, /Week 6 lesson body/);
    assert.ok(seen.some((u) => u.startsWith('https://raw.test')));
  } finally {
    globalThis.fetch = realFetch;
  }
});
