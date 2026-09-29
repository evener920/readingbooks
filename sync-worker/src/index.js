// readingbooks 高亮云同步 Worker
// 存储：Cloudflare KV（绑定名 HL_KV）。键 = `${user}:${book}`，值 = 高亮数组 JSON。
// 鉴权：极简——user 是「同步口令」的 SHA-256 哈希（由浏览器算好再传，服务端不存明文口令）。
//       只有知道同一口令的人才能读写该 user 的数据。
// CORS：允许任意来源（个人站点可接受；如需收紧把 '*' 改成你的站点 origin）。

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    if (request.method === 'GET') {
      const book = url.searchParams.get('book');
      const user = url.searchParams.get('user');
      if (!book || !user) return json({ error: 'missing book/user' }, 400);
      const val = await env.HL_KV.get(user + ':' + book);
      return json(val ? JSON.parse(val) : [], 200);
    }

    if (request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'bad json' }, 400);
      }
      const { book, user, highlights } = body || {};
      if (!book || !user || !Array.isArray(highlights)) {
        return json({ error: 'missing book/user/highlights' }, 400);
      }
      // 合并：按 id 取并集，后写胜出（ts 较大者优先；ts 相同则高亮优先于删除）
      const existing = await env.HL_KV.get(user + ':' + book);
      const map = {};
      const put = (h) => {
        const cur = map[h.id];
        if (!cur || (h.ts || 0) > (cur.ts || 0) ||
            ((h.ts || 0) === (cur.ts || 0) && !h.del)) {
          map[h.id] = h;
        }
      };
      if (existing) {
        try { JSON.parse(existing).forEach(put); } catch {}
      }
      highlights.forEach(put);
      const merged = Object.values(map);
      await env.HL_KV.put(user + ':' + book, JSON.stringify(merged));
      return json({ ok: true, count: merged.length }, 200);
    }

    return json({ error: 'method not allowed' }, 405);
  },
};
