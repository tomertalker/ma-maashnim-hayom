// Local stand-in for the Supabase REST gateway, for tests only.
// It exposes POST /rest/v1/rpc/<function> exactly the way the app calls it and
// runs each call as the `anon` role, so the grants in pilot_schema.sql are
// what is being tested.   Usage: node test/local_api.mjs  (needs: npm i --no-save pg)
import http from "node:http";
import pg from "pg";

const PORT = Number(process.env.API_PORT || 54330);
const pool = new pg.Pool({
  host: process.env.PGHOST || "127.0.0.1", port: Number(process.env.PGPORT || 54329),
  user: process.env.PGUSER || "postgres", database: process.env.PGDATABASE || "mmh",
});
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, prefer, x-forwarded-for",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const send = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", ...CORS });
  res.end(JSON.stringify(body));
};

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  const m = /^\/rest\/v1\/rpc\/([a-z_0-9]+)$/.exec(req.url.split("?")[0]);
  if (!m || req.method !== "POST") return send(res, 404, { message: "not found" });
  if (!req.headers.apikey) return send(res, 401, { message: "No API key found in request" });
  let raw = ""; for await (const c of req) raw += c;
  let args; try { args = raw ? JSON.parse(raw) : {}; } catch { return send(res, 400, { message: "bad json" }); }
  const names = Object.keys(args);
  if (names.some(n => !/^[a-z_0-9]+$/.test(n))) return send(res, 400, { message: "bad arg" });
  const sql = `select public.${m[1]}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as r`;
  const vals = names.map(n => (args[n] !== null && typeof args[n] === "object") ? JSON.stringify(args[n]) : args[n]);
  const c = await pool.connect();
  try {
    await c.query("begin"); await c.query("set local role anon");
    // like PostgREST: the request headers are visible to the functions
    await c.query("select set_config('request.headers', $1, true)", [JSON.stringify(req.headers)]);
    const out = await c.query(sql, vals);
    await c.query("commit");
    send(res, 200, out.rows[0].r);
  } catch (e) {
    await c.query("rollback").catch(() => {});
    send(res, e.code === "42883" || e.code === "42501" ? 404 : 400, { code: e.code, message: e.message });
  } finally { c.release(); }
}).listen(PORT, "127.0.0.1", () => console.log("local api on", PORT));
