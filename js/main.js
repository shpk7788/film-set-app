import { Auth, configured, rpc } from "./api.js";
import { avatar, esc, svg } from "./ui.js";
import * as A from "./views/auth.js";
import * as H from "./views/home.js";
import * as S from "./views/schedule.js";
import * as C from "./views/crew.js";
import * as P from "./views/admin.js";

const FKEY = "fs:film";
export const film = {
  get id() {
    try { return localStorage.getItem(FKEY); } catch { return null; }
  },
  set(id) {
    try { id ? localStorage.setItem(FKEY, id) : localStorage.removeItem(FKEY); } catch {}
  },
};

// [pattern, view, needs login, needs a film]
const routes = [
  ["login", A.login, false, false],
  ["join", A.join, false, false],
  ["join/:code", A.confirm, false, false],
  ["account/:code", A.account, false, false],
  ["welcome", A.welcome, true, true],
  ["setup", A.setup, false, false],
  ["films", A.films, true, false],
  ["owner", A.owner, true, false],
  ["home", H.home, true, true],
  ["notices", H.notices, true, true],
  ["inbox", H.inbox, true, true],
  ["menu", H.menu, true, true],
  ["callsheet/:day", S.callsheet, true, true],
  ["viewas/:day", S.viewAs, true, true],
  ["viewas/:day/:kind/:id", S.viewAs, true, true],
  ["schedule", S.schedule, true, true],
  ["day/:day", S.day, true, true],
  ["edit/:day", S.edit, true, true],
  ["tracker/:day", S.tracker, true, true],
  ["today", S.today, true, true],
  ["crew", C.hub, true, true],
  ["crew/:day", C.day, true, true],
  ["search", C.search, true, true],
  ["contracts", P.contracts, true, true],
  ["people", P.people, true, true],
  ["access", P.access, true, true],
  ["audit", P.audit, true, true],
];

function match(path) {
  const parts = path.split("/").filter(Boolean);
  for (const [pattern, view, auth, needsFilm] of routes) {
    const pp = pattern.split("/");
    if (pp.length !== parts.length) continue;
    const params = {};
    if (pp.every((p, i) => (p.startsWith(":") ? ((params[p.slice(1)] = decodeURIComponent(parts[i])), true) : p === parts[i])))
      return { view, auth, needsFilm, params, name: pp[0] };
  }
  return null;
}

export const go = (path) => {
  if (location.hash === `#/${path}`) render();
  else location.hash = `#/${path}`;
};

const app = document.getElementById("app");
let timer = null;
let renderSeq = 0;

function navFor(me, active) {
  const caps = new Set(me.caps);
  const items = [["home", "Today", "home"]];
  if (caps.has("schedule.all") || caps.has("schedule.today") || caps.has("schedule.tomorrow")) items.push(["schedule", "Schedule", "schedule"]);
  if (caps.has("crew.view")) items.push(["crew", "Records", "records"]);
  items.push(["inbox", "Updates", "inbox"], ["menu", "More", "menu"]);
  const map = { day: "schedule", edit: "schedule", tracker: "schedule", viewas: "schedule", search: "crew", contracts: "menu", people: "menu", access: "menu", audit: "menu", notices: "menu", today: "home", callsheet: "home" };
  const cur = map[active] ?? (active === "crew" ? "crew" : active);
  return `<nav class="bottom" style="grid-template-columns:repeat(${items.length},minmax(0,1fr))" aria-label="Main">${items
    .map(
      ([k, label, ic]) =>
        `<a href="#/${k}" ${cur === k ? 'aria-current="page"' : ""}>${svg(ic, 24)}<span>${label}</span>${
          k === "inbox" && me.unread ? `<b class="dot">${me.unread > 99 ? "99+" : me.unread}</b>` : ""
        }</a>`,
    )
    .join("")}</nav>`;
}

function shell(me, active, inner) {
  const ini = esc((me.film.title || "?").trim()[0] || "?").toUpperCase();
  return `<div class="shell">
    <header class="top">
      <a class="film-chip" href="#/films" aria-label="Switch movie"><i>${ini}</i><span>${esc(me.film.title)}${me.film.readOnly ? " · wrapped" : ""}</span>${svg("down", 16)}</a>
      <a class="me" href="#/menu" aria-label="Menu"><small>${esc(me.member.roleLabel)}${me.member.department ? `<br>${esc(me.member.department)}` : ""}</small>${avatar(me.member.name)}</a>
    </header>
    <div class="content">${inner}</div>
    ${navFor(me, active)}
  </div>`;
}

export async function render() {
  const seq = ++renderSeq;
  clearInterval(timer);
  timer = null;
  const path = location.hash.replace(/^#\/?/, "") || (Auth.user ? "home" : "login");
  if (!configured) {
    app.innerHTML = `<main class="auth"><h1>Almost there</h1><p class="muted">Open <b>config.js</b> and put in your Supabase project URL and publishable key.</p></main>`;
    return;
  }
  const m = match(path.split("?")[0]);
  if (!m) return go(Auth.user ? "home" : "login");
  if (m.auth && !Auth.user) return go("login");
  if (m.needsFilm && !film.id) return go("films");

  let me = null;
  try {
    if (m.needsFilm) me = await rpc("me", { p_film: film.id });
    const out = await m.view({ me, params: m.params, filmId: film.id, go, render, film });
    if (seq !== renderSeq) return; // a newer navigation started
    app.innerHTML = m.needsFilm ? shell(me, m.name, out.html) : out.html;
    window.scrollTo(0, 0);
    out.bind?.(app);
    // Live screens refresh themselves, but never while someone is typing.
    if (out.refreshEvery)
      timer = setInterval(() => {
        if (document.visibilityState === "visible" && !document.activeElement?.matches("input, select, textarea")) render();
      }, out.refreshEvery * 1000);
  } catch (e) {
    if (seq !== renderSeq) return;
    if (/access to this film/i.test(e.message)) {
      film.set(null);
      return go("films");
    }
    const inner = `<main class="page"><div class="alert danger"><div>${esc(e.message)}</div></div><a class="btn outline" href="#/home">Go home</a></main>`;
    app.innerHTML = me ? shell(me, m.name, inner) : `<main class="auth">${inner}</main>`;
  }
}

window.addEventListener("hashchange", render);
window.addEventListener("api:loggedout", () => go("login"));
render();

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
