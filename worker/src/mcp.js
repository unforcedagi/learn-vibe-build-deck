// Read-only MCP server for the course: POST https://api.learnvibe.build/mcp
//
// Students point Claude / ChatGPT / any MCP client at this URL and their AI can
// list and read the public lessons. It is the Week 6 "index file" idea as a
// connector: the AI reads a small map, then opens only the lesson it needs.
//
// Stateless Streamable HTTP transport (JSON responses, no sessions, no SSE).
// Public lesson text only: it reads the same static files cu.learnvibe.build
// serves (llms.txt + lessons/week-N/lesson.md). No auth, no student data, no
// D1, no writes. Week numbers are validated integers, so the only URLs this
// can fetch are fixed paths on SITE_ORIGIN.

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'learn-vibe-build', title: 'Learn, Vibe, Build (ATLS 4519)', version: '1.0.0' };
const INSTRUCTIONS =
  'Course materials for Learn, Vibe, Build, a CU Boulder studio course about building with AI. ' +
  'Call get_course_map first, then get_lesson for the week you need. Lessons are written to be ' +
  'taught from: explain, quiz, and connect them to the student\'s own project. Cite the lesson URL.';

const TOOLS = [
  {
    name: 'get_course_map',
    title: 'Course map',
    description: 'The course index (llms.txt): what the course is, every lesson with a one-line summary, and links to the syllabus, schedule, setup and tools pages. Start here.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'list_lessons',
    title: 'List lessons',
    description: 'List the published lessons: week number, title, one-line summary, and URL.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_lesson',
    title: 'Get a lesson',
    description: 'The full markdown of one week\'s lesson (e.g. week 6: context, the 4D AI Fluency framework, markdown index files, APIs and MCP, plus teach-me prompts).',
    inputSchema: {
      type: 'object',
      properties: { week: { type: 'integer', minimum: 1, maximum: 16, description: 'Week number, e.g. 6' } },
      required: ['week'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

const LESSON_LINE = /^- \[([^\]]+)\]\((\S*\/lessons\/week-(\d+)\/lesson\.md)\):\s*(.*)$/;

export function parseLessons(llmsTxt) {
  const out = [];
  for (const line of llmsTxt.split('\n')) {
    const m = line.trim().match(LESSON_LINE);
    if (m) out.push({ week: Number(m[3]), title: m[1], summary: m[4], url: m[2] });
  }
  return out.sort((a, b) => a.week - b.week);
}

// Lessons are public markdown in the repo. If the Pages site hasn't published a file
// yet (or a Pages build is stuck), fall back to the same file on the repo's main branch.
const REPO_RAW = 'https://raw.githubusercontent.com/unforcedagi/learn-vibe-build-deck/main';

async function siteText(env, path, fetchImpl) {
  for (const origin of [env.SITE_ORIGIN, env.REPO_RAW_ORIGIN || REPO_RAW]) {
    if (!origin) continue;
    try {
      const res = await fetchImpl(origin + path, { cf: { cacheTtl: 300, cacheEverything: true } });
      if (res.ok) return res.text();
    } catch (_) { /* try the next origin */ }
  }
  return null;
}

const text = (t) => ({ content: [{ type: 'text', text: t }] });
const toolError = (t) => ({ content: [{ type: 'text', text: t }], isError: true });

async function callTool(name, args, env, fetchImpl) {
  if (name === 'get_course_map') {
    const t = await siteText(env, '/llms.txt', fetchImpl);
    return t ? text(t) : toolError('The course map is not available right now. Try https://cu.learnvibe.build/lessons/');
  }
  if (name === 'list_lessons') {
    const t = await siteText(env, '/llms.txt', fetchImpl);
    if (!t) return toolError('The lesson list is not available right now.');
    const lessons = parseLessons(t);
    const body = lessons.map((l) => `- Week ${l.week}: ${l.title}. ${l.summary} (${l.url})`).join('\n');
    return { ...text(body || 'No lessons are published yet.'), structuredContent: { lessons } };
  }
  if (name === 'get_lesson') {
    const week = Number(args && args.week);
    if (!Number.isInteger(week) || week < 1 || week > 16) return toolError('week must be a whole number from 1 to 16.');
    const t = await siteText(env, `/lessons/week-${week}/lesson.md`, fetchImpl);
    return t ? text(t) : toolError(`There is no published lesson for week ${week} yet. Call list_lessons to see what exists.`);
  }
  return null;
}

function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }; }

async function handleMessage(msg, env, fetchImpl) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg && msg.id, -32600, 'Invalid Request');
  const isNotification = !('id' in msg);
  const { id, method, params } = msg;
  if (isNotification) return null; // notifications/initialized, cancelled, etc.

  switch (method) {
    case 'initialize': {
      const asked = params && params.protocolVersion;
      const protocolVersion = PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0];
      return rpcResult(id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, { tools: TOOLS });
    case 'tools/call': {
      const r = await callTool(params && params.name, (params && params.arguments) || {}, env, fetchImpl);
      return r ? rpcResult(id, r) : rpcError(id, -32602, `Unknown tool: ${params && params.name}`);
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

const MCP_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id',
};

export async function handleMcp(request, env, fetchImpl = fetch) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: MCP_CORS });
  if (request.method === 'GET') {
    // No server-initiated stream; say so per spec, and leave a human-readable hint.
    return new Response('Learn, Vibe, Build MCP server. POST JSON-RPC here, or add this URL as a connector in your AI app.\n', {
      status: 405, headers: { ...MCP_CORS, Allow: 'POST', 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...MCP_CORS, Allow: 'POST' } });

  let body;
  try { body = await request.json(); } catch {
    return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400, headers: MCP_CORS });
  }
  const batch = Array.isArray(body);
  const replies = (await Promise.all((batch ? body : [body]).map((m) => handleMessage(m, env, fetchImpl)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202, headers: MCP_CORS });
  return Response.json(batch ? replies : replies[0], { headers: MCP_CORS });
}
