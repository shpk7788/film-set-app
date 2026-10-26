import { Auth, rpc } from "../api.js";
import { btn, checkbox, empty, esc, fmtStamp, fmtTime, greeting, onForm, svg, textarea, title } from "../ui.js";
import { anySchedule, bindGotIt, bindNotices, changedBox, dayLabel, gotIt, has, noticeCard, sliceView } from "./parts.js";

const safe = (p) => p.catch(() => null);
const todayLong = () => new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });

const task = (href, text, sub, icon, tone) =>
  `<a class="task" href="${href}"><span class="ticon ${tone}">${svg(icon, 20)}</span><span class="ttext">${text}${sub ? `<small>${sub}</small>` : ""}</span><span class="chev">${svg("chev", 18)}</span></a>`;

const tile = (href, label, sub, icon, tone) =>
  `<a class="tile" href="${href}"><span class="ticon ${tone}">${svg(icon, 22)}</span><span><b>${label}</b>${sub ? `<br><small>${sub}</small>` : ""}</span></a>`;

/** Everything that's waiting on this person, built only from channels they hold. */
async function needsYou(me, filmId, h) {
  const out = [];
  const [hub, contracts, days] = await Promise.all([
    has(me, "crew.view") ? safe(rpc("crew_hub", { p_film: filmId })) : null,
    has(me, "contracts") ? safe(rpc("contracts_view", { p_film: filmId })) : null,
    has(me, "program.edit") ? safe(rpc("days_list", { p_film: filmId })) : null,
  ]);
  for (const d of hub || []) {
    if (d.status === "awaiting_pm" && has(me, "crew.approve.pm")) out.push(task(`#/crew/${esc(d.dayId)}`, `Approve ${dayLabel(d)} crew list`, "Waiting for you (step 1)", "check", "s-sun"));
    if (d.status === "awaiting_ep" && has(me, "crew.approve.ep")) out.push(task(`#/crew/${esc(d.dayId)}`, `Approve ${dayLabel(d)} crew list`, "PM approved · waiting for you", "check", "s-sun"));
    if ((!d.status || d.status === "draft") && d.date <= me.today && has(me, "crew.edit")) out.push(task(`#/crew/${esc(d.dayId)}`, `Prepare ${dayLabel(d)} crew list`, d.status ? "Draft" : "Not started", "people", "s-teal"));
  }
  for (const d of days?.days || []) {
    if (d.draft && d.date >= me.today) out.push(task(`#/edit/${esc(d.id)}`, `Draft v${d.draft} for ${dayLabel(d)} not sent`, has(me, "program.send") ? "Review and send" : "Waiting for Director / Co-director", "schedule", "s-violet"));
  }
  if (contracts) {
    const unsigned = contracts.filter((a) => !a.contract?.signedOn).length;
    if (unsigned) out.push(task("#/contracts", `${unsigned} contract${unsigned === 1 ? "" : "s"} not signed`, "Artists & payments", "money", "s-red"));
  }
  if (has(me, "tracker.view")) {
    const soon = (h.upcoming || []).slice(0, 2);
    const tr = await Promise.all(soon.map((d) => safe(rpc("tracker", { p_day: d.dayId }))));
    tr.forEach((t, i) => {
      if (!t) return;
      const waiting = t.people.filter((p) => !p.confirmedAt).length;
      if (waiting) out.push(task(`#/tracker/${esc(soon[i].dayId)}`, `${waiting} haven't confirmed ${dayLabel(soon[i])}`, `${t.people.length - waiting} of ${t.people.length} confirmed`, "inbox", "s-indigo"));
    });
  }
  if (me.unread) out.push(task("#/inbox", `${me.unread} new update${me.unread === 1 ? "" : "s"}`, "In your Updates", "inbox", "s-indigo"));
  return out;
}

export async function home({ me, filmId, render }) {
  const h = await rpc("home", { p_film: filmId });
  const n = h.notices;
  const next = h.next;
  const office = anySchedule(me) || has(me, "crew.view") || has(me, "people.view");

  // Crew and actors: their own call sheet, front and centre.
  if (!office) {
    return {
      html: `<div class="greet"><small>${todayLong()}</small><h1>${greeting(me.member.name)}</h1></div>
      <main class="page">
        ${next ? `<p class="label">Your call sheet · ${dayLabel(next)}</p>${changedBox(next.version, next.summary, next.sentAt)}${sliceView(next.slice)}${gotIt(next.confirmed, next.versionId)}` : empty("No call sheet for you yet. You'll see it in Updates the moment one is sent.")}
        <section class="card"><div class="row"><p class="label">Notices for everyone</p><a href="#/notices"><b>All</b></a></div>
          ${n.notices.length ? n.notices.map((x) => noticeCard(x, n.canPost, n.memberCount)).join("") : `<p class="muted">No notices yet.</p>`}</section>
      </main>`,
      bind(root) {
        bindGotIt(root, render);
        bindNotices(root, render);
      },
    };
  }

  // Office, producer and direction team: today at a glance, what needs them, big tiles.
  const [live, tasks] = await Promise.all([has(me, "live.view") ? safe(rpc("live_view", { p_film: filmId })) : null, needsYou(me, filmId, h)]);
  const today = (h.upcoming || []).find((d) => String(d.date).slice(0, 10) === me.today);
  const todayTracker = today && has(me, "tracker.view") ? await safe(rpc("tracker", { p_day: today.dayId })) : null;
  const items = live?.items || [];
  const nowItem = items.find((i) => i.key === live?.liveKey);
  const confirmed = todayTracker ? `${todayTracker.people.filter((p) => p.confirmedAt).length}<span style="font-size:16px;opacity:.8">/${todayTracker.people.length}</span>` : "—";
  const dayData = today ? await safe(rpc("day_view", { p_day: today.dayId })) : null;
  const callTime = dayData?.sent?.data?.generalCall;

  const hero = today
    ? `<a class="hero brand" href="${has(me, "live.view") ? "#/today" : `#/day/${esc(today.dayId)}`}" style="color:#fff">
        <div class="row"><p class="hlabel">Today · ${dayLabel(today)}</p>${live?.liveKey ? `<p class="live"><span></span>SHOOTING</p>` : ""}</div>
        <div class="stats3">
          <div><b>${callTime ? fmtTime(callTime).replace(/ (AM|PM)/, "") : "—"}</b><small>Call time</small></div>
          <div><b>${nowItem ? `Sc ${esc(nowItem.scene)}` : "—"}</b><small>${nowItem ? "Now" : "Not started"}</small></div>
          <div><b>${confirmed}</b><small>Confirmed</small></div>
        </div>
      </a>`
    : `<section class="hero brand"><p class="hlabel">No shoot today</p><p class="big2">${(h.upcoming || [])[0] ? `Next: ${dayLabel(h.upcoming[0])}` : "Nothing scheduled yet"}</p></section>`;

  const tiles = [
    anySchedule(me) && tile("#/schedule", "Schedule", "Program sheets", "schedule", "t-dusk"),
    has(me, "artists.view") && tile("#/artists", "Artists", "Dates & scenes", "star", "t-indigo"),
    has(me, "crew.view") && tile("#/crew", "Crew", "Daily lists", "people", "t-sea"),
    has(me, "contracts") && tile("#/contracts", "Money", "Contracts & pay", "money", "t-sun"),
    me.member.role === "producer" && tile("#/access", "Who sees what", "Channels", "lock", "t-night"),
    has(me, "people.view") && tile("#/people", "People", "Codes & access", "people", "t-leaf"),
    has(me, "live.view") && tile("#/today", "On set", "Live now", "clap", "t-indigo"),
  ].filter(Boolean).slice(0, 4);

  return {
    html: `<div class="greet"><small>${todayLong()}</small><h1>${greeting(me.member.name)}</h1></div>
    <main class="page">
      ${hero}
      ${next ? `${sliceView(next.slice)}${gotIt(next.confirmed, next.versionId)}` : ""}
      <div class="section-h"><h2>Needs you</h2>${tasks.length ? `<span class="badge warn">${tasks.length}</span>` : ""}</div>
      ${tasks.length ? `<div class="stack" style="gap:10px">${tasks.join("")}</div>` : `<div class="caught">${svg("sparkle", 26)}<span>You're all caught up</span></div>`}
      <div class="tiles">${tiles.join("")}</div>
      <section class="card"><div class="row"><p class="label">Notices for everyone</p><a href="#/notices"><b>All</b></a></div>
        ${n.notices.length ? n.notices.map((x) => noticeCard(x, n.canPost, n.memberCount)).join("") : `<p class="muted">No notices yet.${n.canPost ? ' <a href="#/notices"><b>Post one</b></a>' : ""}</p>`}</section>
    </main>`,
    bind(root) {
      bindGotIt(root, render);
      bindNotices(root, render);
    },
  };
}

export async function notices({ me, filmId, render }) {
  const n = await rpc("notices_list", { p_film: filmId, p_limit: 50 });
  const canPost = n.canPost && !me.film.readOnly;
  return {
    html: `${title("Notices for everyone")}<main class="page">
      ${
        canPost
          ? `<section class="card"><form id="post" class="stack">
              ${textarea("New notice", "text", "", 'required placeholder="e.g. Night shoot cancelled because of rain. Pack-up at 7 PM."')}
              ${checkbox("Important — everyone must tap Got it", "important")}
              ${btn("Send to everyone")}
            </form></section>`
          : ""
      }
      ${n.notices.length ? n.notices.map((x) => `<section class="card">${noticeCard(x, n.canPost, n.memberCount)}</section>`).join("") : empty("No notices yet.")}
    </main>`,
    bind(root) {
      bindNotices(root, render);
      onForm(root, "#post", async (fd) => {
        await rpc("post_notice", { p_film: filmId, p_text: fd.get("text"), p_important: fd.get("important") === "on" });
        render();
      });
    },
  };
}

export async function inbox({ filmId, render }) {
  const items = await rpc("inbox", { p_film: filmId });
  const unread = items.some((i) => !i.read);
  return {
    html: `${title("Updates", "", unread ? `<button class="btn ghost small" id="all" style="align-self:flex-start;padding:0">Mark all as read</button>` : "")}<main class="page">
      ${items.length ? "" : `<div class="caught">${svg("sparkle", 26)}<span>Nothing here yet</span></div>`}
      <div>${items
        .map((i) => {
          const body = `<div class="notif ${i.read ? "" : "unread"}"><span class="ndot"></span><div><p><b>${esc(i.title)}</b></p>${i.body ? `<p class="muted">${esc(i.body)}</p>` : ""}<p class="muted small">${fmtStamp(i.createdAt)}</p></div></div>`;
          return i.link ? `<a href="${esc(i.link)}" data-read="${esc(i.link)}">${body}</a>` : body;
        })
        .join("")}</div>
    </main>`,
    bind(root) {
      root.querySelector("#all")?.addEventListener("click", async () => {
        await rpc("mark_read", { p_film: filmId, p_link: null });
        render();
      });
      root.querySelectorAll("[data-read]").forEach((a) => a.addEventListener("click", () => rpc("mark_read", { p_film: filmId, p_link: a.dataset.read }).catch(() => {})));
    },
  };
}

export async function menu({ me, go, film }) {
  const items = [
    ["#/notices", "Notices for everyone", "Updates for the whole unit", "megaphone", "s-indigo", true],
    ["#/today", "On set now", "What's being shot and what's next", "clap", "s-violet", has(me, "live.view")],
    ["#/artists", "Artists", "Actor dates and their scenes", "star", "s-sun", has(me, "artists.view")],
    ["#/upload", "Upload schedule", "Excel, PDF, photo or WhatsApp", "upload", "s-violet", has(me, "program.edit") && !me.film.readOnly],
    ["#/crew", "Crew lists", "Daily crew lists and approvals", "people", "s-teal", has(me, "crew.view")],
    ["#/search", "Search crew history", "Call sheets worked by anyone", "search", "s-teal", has(me, "crew.view")],
    ["#/contracts", "Contracts & payments", "Artists, deals and balances", "money", "s-sun", has(me, "contracts")],
    ["#/people", "People & codes", "Add people, sign-up codes", "people", "s-green", has(me, "people.view")],
    ["#/access", "Channels & access", "Who each channel is unlocked for", "lock", "s-violet", me.member.role === "producer"],
    ["#/audit", "Change log", "Every change, who and when", "log", "s-indigo", has(me, "audit.view")],
    ["#/films", "Your movies", "Switch movie or add another", "film", "s-sun", true],
  ];
  return {
    html: `${title("More")}<main class="page">
      ${items
        .filter((i) => i[5])
        .map(([href, l, sub, ic, tone]) => `<a class="menuitem" href="${href}"><span class="ticon ${tone}">${svg(ic, 20)}</span><div><b>${l}</b><span>${sub}</span></div></a>`)
        .join("")}
      <button class="btn outline wide" id="out">Log out</button>
    </main>`,
    bind(root) {
      root.querySelector("#out").addEventListener("click", async () => {
        await Auth.signOut();
        film.set(null);
        go("login");
      });
    },
  };
}
