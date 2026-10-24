// A tiny local stand-in for Supabase (Auth + calling database functions) plus a static file server,
// so the real website can be tested in a browser against the real database rules.
// Usage: DATABASE_URL=... PORT=4000 node mock-supabase.mjs
import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PORT = Number(process.env.PORT || 4000);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const tokens = new Map(); // access/refresh token -> user id

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
};
const readBody = (req) => new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => r(s ? JSON.parse(s) : {})); });
const issue = (user) => {
  const access = randomBytes(16).toString("hex");
  const refresh = randomBytes(16).toString("hex");
  tokens.set(access, user.id);
  tokens.set(refresh, user.id);
  return { access_token: access, refresh_token: refresh, expires_in: 3600, user: { id: user.id, email: user.email } };
};
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === "OPTIONS") return send(res, 204, "", "text/plain");
    try {
      if (url.pathname === "/auth/v1/signup") {
        const b = await readBody(req);
        const r = await pool.query(
          "insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, extensions.crypt($2, extensions.gen_salt('bf')), $3) on conflict (email) do nothing returning id, email",
          [b.email, b.password, b.data ?? {}],
        );
        if (!r.rows[0]) return send(res, 422, { msg: "User already registered" });
        return send(res, 200, issue(r.rows[0]));
      }
      if (url.pathname === "/auth/v1/token") {
        const b = await readBody(req);
        if (url.searchParams.get("grant_type") === "refresh_token") {
          const id = tokens.get(b.refresh_token);
          if (!id) return send(res, 400, { error_description: "Invalid Refresh Token" });
          const u = (await pool.query("select id, email from auth.users where id = $1", [id])).rows[0];
          return send(res, 200, issue(u));
        }
        const r = await pool.query("select id, email from auth.users where email = $1 and encrypted_password = extensions.crypt($2, encrypted_password)", [b.email, b.password]);
        if (!r.rows[0]) return send(res, 400, { error_description: "Invalid login credentials" });
        return send(res, 200, issue(r.rows[0]));
      }
      if (url.pathname === "/auth/v1/logout") return send(res, 204, "", "text/plain");
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const fn = url.pathname.split("/").pop();
        if (!/^[a-z_]+$/.test(fn)) return send(res, 404, { message: "not found" });
        const args = await readBody(req);
        const auth = (req.headers.authorization || "").replace("Bearer ", "");
        const uid = tokens.get(auth) ?? null;
        const keys = Object.keys(args);
        const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
        const vals = keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]));
        const c = await pool.connect();
        try {
          await c.query("begin");
          await c.query(`set local role ${uid ? "authenticated" : "anon"}`);
          await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
          const r = await c.query(sql, vals);
          await c.query("commit");
          return send(res, 200, r.rows[0].r);
        } catch (e) {
          await c.query("rollback").catch(() => {});
          return send(res, 400, { message: e.message });
        } finally {
          c.release();
        }
      }
      // static files (with a test config pointing at this server)
      if (url.pathname === "/config.js") {
        return send(res, 200, `window.APP_CONFIG = { supabaseUrl: "http://localhost:${PORT}", supabaseKey: "test-key" };`, "text/javascript");
      }
      const file = path.join(ROOT, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
      if (!file.startsWith(ROOT) || file.includes(`${path.sep}tests${path.sep}`)) return send(res, 404, "not found", "text/plain");
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch (e) {
      send(res, e.code === "ENOENT" ? 404 : 500, { message: e.message });
    }
  })
  .listen(PORT, () => console.log(`mock supabase on http://localhost:${PORT}`));
