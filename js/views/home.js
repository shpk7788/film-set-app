import { Auth, rpc } from "../api.js";
import { btn, checkbox, empty, esc, fmtStamp, onForm, textarea, title } from "../ui.js";
import { anySchedule, bindGotIt, bindNotices, changedBox, dayLabel, gotIt, has, noticeCard, sliceView } from "./parts.js";

export async function home({ me, filmId, render }) {
  const h = await rpc("home", { p_film: filmId });
  const n = h.notices;
  const next = h.next;
  return {
    html: `<main class="page">
      ${
        next
          ? `<p class="muted b">Your call sheet · ${dayLabel(next)}</p>${changedBox(next.version, next.summary, next.sentAt)}${sliceView(next.slice)}${gotIt(next.confirmed, next.versionId)}`
          : anySchedule(me)
            ? ""
            : empty("No call sheet for you yet. You'll see a notification in your Inbox when one is sent.")
      }
      ${
        anySchedule(me)
          ? `<section class="card"><p class="label">Upcoming days</p>${
              (h.upcoming || []).length
                ? h.upcoming.map((d) => `<a class="line" href="#/day/${esc(d.dayId)}"><b>${dayLabel(d)}</b><span class="muted">v${d.version}</span></a>`).join("")
                : `<p class="muted">Nothing sent yet.</p>`
            }${has(me, "live.view") ? `<a class="btn direction wide" href="#/today">On set now</a>` : ""}</section>`
          : ""
      }
      <section class="card"><div class="row"><p class="label">Notices for everyone</p><a href="#/notices"><b>All</b></a></div>
        ${n.notices.length ? n.notices.map((x) => noticeCard(x, n.canPost, n.memberCount)).join("") : `<p class="muted">No notices yet.</p>`}
      </section>
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
    html: `${title("Inbox", "", unread ? `<button class="btn ghost small" id="all">Mark all as read</button>` : "")}<main class="page tight">
      ${items.length ? "" : empty("Nothing here yet.")}
      ${items
        .map((i) => {
          const body = `<div class="notif ${i.read ? "" : "unread"}"><span class="ndot"></span><div><p><b>${esc(i.title)}</b></p>${i.body ? `<p class="muted">${esc(i.body)}</p>` : ""}<p class="muted small">${fmtStamp(i.createdAt)}</p></div></div>`;
          return i.link ? `<a href="${esc(i.link)}" data-read="${esc(i.link)}">${body}</a>` : body;
        })
        .join("")}
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
    ["#/notices", "Notices for everyone", "Updates for the whole unit", true],
    ["#/today", "On set now", "What's being shot and what's next", has(me, "live.view")],
    ["#/crew", "Crew lists", "Daily crew lists and approvals", has(me, "crew.view")],
    ["#/search", "Search crew history", "Call sheets worked by any person", has(me, "crew.view")],
    ["#/contracts", "Contracts & payments", "Artists, deals and balances", has(me, "contracts")],
    ["#/people", "People & codes", "Add people, sign-up codes, access", has(me, "people.view")],
    ["#/access", "Channels & access", "Who each channel is unlocked for", me.member.role === "producer"],
    ["#/audit", "Change log", "Every change, who and when", has(me, "audit.view")],
    ["#/films", "Your movies", "Switch movie or add another movie", true],
  ];
  return {
    html: `${title("Menu")}<main class="page">
      ${items
        .filter((i) => i[3])
        .map(([href, l, sub]) => `<a class="menuitem" href="${href}"><b>${l}</b><span>${sub}</span></a>`)
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
