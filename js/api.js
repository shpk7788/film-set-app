// Supabase Auth + database functions over plain fetch (same approach as Palli).
// The website never reads tables directly: every call is a database function that checks access.
const cfg = window.APP_CONFIG || {};
const BASE = (cfg.supabaseUrl || "").replace(/\/+$/, "");
const KEY = cfg.supabaseKey || "";
const SKEY = "fs:session";

export const configured = !!(BASE && KEY && !BASE.includes("YOUR-PROJECT"));

const load = () => { try { return JSON.parse(localStorage.getItem(SKEY) || "null"); } catch { return null; } };
let session = load();
const persist = () => { try { session ? localStorage.setItem(SKEY, JSON.stringify(session)) : localStorage.removeItem(SKEY); } catch {} };

export const emailFor = (u) => `${u.trim().toLowerCase()}@crew.snyp.io`;
export const validUsername = (u) => /^[a-z0-9._]{3,30}$/.test(u.trim().toLowerCase());
export function checkPassword(pw, confirm) {
  if ((pw || "").length < 8) return "Password needs at least 8 letters or numbers.";
  if (!/\d/.test(pw)) return "Password needs at least one number.";
  if (confirm !== undefined && pw !== confirm) return "The two passwords don't match.";
  return null;
}

function setSession(data) {
  const user = data.user || session?.user;
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    user: { id: user.id, username: (user.email || "").split("@")[0] },
  };
  persist();
}

function friendly(d, status) {
  const m = String(d?.msg || d?.error_description || d?.message || d?.error || "");
  if (/already registered|already exists/i.test(m)) return "That username is taken. Try another.";
  if (/invalid login|invalid grant|credentials/i.test(m)) return "Username or password is wrong.";
  if (/email not confirmed/i.test(m)) return "Sign-in needs \"Confirm email\" turned off in Supabase.";
  if (/rate limit|too many/i.test(m) || status === 429) return "Too many attempts. Wait a minute and try again.";
  return m || "Couldn't reach the server. Check your connection and try again.";
}

async function authPost(path, body) {
  let res;
  try {
    res = await fetch(BASE + path, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(friendly(data, res.status));
  return data;
}

async function refresh() {
  if (!session?.refresh_token) throw new Error("Not logged in");
  try {
    setSession(await authPost("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token }));
  } catch (e) {
    session = null;
    persist();
    window.dispatchEvent(new Event("api:loggedout"));
    throw e;
  }
}

async function token() {
  if (!session) return null;
  if (Date.now() > session.expires_at - 60_000) await refresh();
  return session.access_token;
}

/** Calls a database function. Errors come back as plain-language messages from the database. */
export async function rpc(fn, args = {}, retry = true) {
  const t = await token();
  let res;
  try {
    res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${t || KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
  } catch {
    throw new Error("No connection. Check your internet and try again.");
  }
  if (res.status === 401 && retry && session) {
    await refresh();
    return rpc(fn, args, false);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || `Something went wrong (${res.status})`);
  return data;
}

export const Auth = {
  get user() {
    return session?.user || null;
  },
  async signUp(username, password) {
    const u = username.trim().toLowerCase();
    if (!validUsername(u)) throw new Error("Username: 3–30 small letters, numbers, dots or underscores.");
    const err = checkPassword(password);
    if (err) throw new Error(err);
    const data = await authPost("/auth/v1/signup", { email: emailFor(u), password, data: { username: u } });
    if (!data.access_token) throw new Error("Account made, but \"Confirm email\" is on in Supabase. Ask the admin to turn it off, then log in.");
    setSession(data);
  },
  async signIn(username, password) {
    const u = username.trim().toLowerCase();
    if (!validUsername(u)) throw new Error("Username or password is wrong.");
    setSession(await authPost("/auth/v1/token?grant_type=password", { email: emailFor(u), password }));
  },
  async signOut() {
    try {
      if (session) await fetch(`${BASE}/auth/v1/logout`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${session.access_token}` } });
    } catch {}
    session = null;
    persist();
  },
};
