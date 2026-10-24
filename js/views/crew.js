import { rpc } from "../api.js";
import { alert, badge, btn, empty, esc, field, fmtStamp, fmtTenths, onForm, select, title, watermark } from "../ui.js";
import { dayLabel, has, statusBadge } from "./parts.js";

const CAT = { artist: "Artist", crew: "Crew", junior_artist: "Junior artists" };

export function recordsTabs(me, active) {
  const tabs = [
    ["crew", "#/crew", "Crew lists", has(me, "crew.view")],
    ["search", "#/search", "Search", has(me, "crew.view")],
    ["contracts", "#/contracts", "Contracts", has(me, "contracts")],
    ["people", "#/people", "People", has(me, "people.view")],
    ["access", "#/access", "Channels", me.member.role === "producer"],
    ["audit", "#/audit", "Change log", has(me, "audit.view")],
  ].filter((t) => t[3]);
  return `<nav class="tabs" aria-label="Records sections">${tabs.map(([k, href, l]) => `<a href="${href}" ${k === active ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav>`;
}

export const recordsHeader = (me, t, active) =>
  `<header class="dark-head"><p>${esc(me.film.title)} · Records</p><h1>${esc(t)}</h1></header>${recordsTabs(me, active)}`;

export async function hub({ me, filmId }) {
  const days = await rpc("crew_hub", { p_film: filmId });
  const row = (d) =>
    `<a class="line" href="#/crew/${esc(d.dayId)}"><span><b>${dayLabel(d)}</b><small class="muted block">${statusBadge(d.status)}</small></span>${
      d.totals ? `<span class="muted small right">${d.totals.people} people<br>${fmtTenths(d.totals.workedTenths)} calls</span>` : ""
    }</a>`;
  const waiting = days.filter((d) => d.status === "awaiting_pm" || d.status === "awaiting_ep");
  const prep = days.filter((d) => (!d.status || d.status === "draft") && d.date <= me.today);
  const locked = days.filter((d) => d.status === "locked");
  return {
    html: `${recordsHeader(me, "Crew lists", "crew")}<main class="page">
      ${waiting.length ? `<section class="card strong-warn"><p class="label">Waiting for approval ${badge(String(waiting.length), "warn")}</p>${waiting.map(row).join("")}</section>` : ""}
      ${prep.length ? `<section class="card"><p class="label">To prepare</p>${prep.map(row).join("")}</section>` : ""}
      <section class="card"><p class="label">Approved &amp; locked</p>${locked.length ? locked.map(row).join("") : `<p class="muted">None yet.</p>`}</section>
    </main>`,
  };
}

export async function day({ me, params, render }) {
  const c = await rpc("crew_day", { p_day: params.day });
  const ro = me.film.readOnly;
  const draft = c.list?.status === "draft";
  const canEdit = c.caps.edit && !ro;
  const canRelease = c.caps.release && !ro;
  const f = new URLSearchParams(location.hash.split("?")[1] || "").get("f") || "all";
  const shown = f === "all" ? c.entries : c.entries.filter((e) => e.category === f);
  const t = c.totals;

  const entry = (e) => {
    const early = e.present && e.worked < e.called;
    const sub = [CAT[e.category], e.hasDepartment ? e.department : null, e.headcount > 1 ? `×${e.headcount}` : null, e.addedOnDay ? "added on the day" : null].filter(Boolean).join(" · ");
    return `<div class="entry ${early ? "early" : !e.present ? "absent" : ""}">
      <div class="row"><span><b class="${e.present ? "" : "struck"}">${esc(e.label)}</b><small class="muted block">${esc(sub)}</small></span>
        <span class="calls">${!e.present ? badge("Didn't come", "danger") : early ? `<s class="muted">${fmtTenths(e.called)}</s> → <b>${fmtTenths(e.worked)}</b>` : `<b>${fmtTenths(e.called)}</b>`}</span></div>
      ${early ? `<p class="warn-text small"><b>Released ${esc(e.releasedAt)} by ${esc(e.releasedBy)} · “${esc(e.reason)}”</b></p>` : ""}
      ${
        draft && (canRelease || canEdit)
          ? `<details><summary class="prod-text"><b>Change</b></summary><div class="stack">
            ${
              canRelease && e.present
                ? `<form class="release stack soft" data-id="${esc(e.id)}"><p><b>Release early</b></p>
                  <fieldset><legend>Count this day as</legend><div class="grid4">${[5, 10, 15, 20]
                    .filter((v) => v <= e.called)
                    .map((v) => `<label class="pick"><input type="radio" name="worked" value="${v}" ${v === e.worked ? "checked" : ""}><span>${fmtTenths(v)}</span></label>`)
                    .join("")}</div></fieldset>
                  ${field("Released at", "at", { type: "time", value: e.releasedAt || "", required: true })}
                  <fieldset><legend>Reason</legend><div class="pills">${["Scene moved", "Scene cut", "Finished early"]
                    .map((r) => `<label class="pill"><input type="radio" name="reason" value="${r}" ${e.reason === r ? "checked" : ""}><span>${r}</span></label>`)
                    .join("")}</div></fieldset>
                  ${field("Or another reason", "other")}
                  ${btn("Save", "production wide")}
                </form>`
                : ""
            }
            ${canEdit ? `<form class="presence" data-id="${esc(e.id)}" data-present="${e.present ? "0" : "1"}">${btn(e.present ? "Mark as didn't come" : "Mark as present", "outline wide")}</form>` : ""}
          </div></details>`
          : ""
      }
    </div>`;
  };

  const steps = [
    ["Prepared by production team", c.list && c.list.status !== "draft", false],
    ["Production Manager", ["awaiting_ep", "locked"].includes(c.list?.status), c.list?.status === "awaiting_pm"],
    ["Executive Producer", c.list?.status === "locked", c.list?.status === "awaiting_ep"],
  ];
  const myTurn = !ro && ((c.list?.status === "awaiting_pm" && c.caps.approvePm) || (c.list?.status === "awaiting_ep" && c.caps.approveEp));

  return {
    html: `${watermark(me)}${title(dayLabel(c.day), c.list ? `Crew list · ${statusText(c.list.status)}` : "Crew list", t ? `<div class="grid3 stats"><div><small>People</small><b>${t.people}</b></div><div><small>Calls worked</small><b>${fmtTenths(t.workedTenths)}</b></div><div class="warnbox"><small>Released early</small><b>${t.releasedEarly}</b></div></div>` : "")}
    <main class="page">
      ${c.list?.sentBackNote && draft ? alert(esc(c.list.sentBackNote), "Sent back") : ""}
      ${
        !c.list
          ? canEdit
            ? `<section class="card"><p>Start this day's crew list. It's filled in from the latest program sheet — then fix anything that's different on the day.</p><form id="start">${btn("Start crew list", "production wide")}</form></section>`
            : empty("The production team hasn't started this day's crew list yet.")
          : `<nav class="pills" aria-label="Filter">${[["all", "All"], ["artist", "Artists"], ["crew", "Crew"], ["junior_artist", "Junior artists"]]
              .map(([k, l]) => `<a class="pill ${f === k ? "on" : ""}" href="#/crew/${esc(c.day.id)}?f=${k}">${l}</a>`)
              .join("")}</nav>`
      }
      ${shown.map(entry).join("")}
      ${
        c.list && draft && canEdit
          ? `<details class="card add-scene prod"><summary><b>+ Add someone who came on the day</b></summary><form id="add" class="stack">
              ${select("Someone on the film", "membershipId", [["", "— Not on the app (type a name below) —"], ...(c.addable || []).map((m) => [m.id, `${m.name} · ${m.roleLabel}`])])}
              ${field("Or name / group", "label", { attrs: 'placeholder="e.g. Junior artists from [supplier]"' })}
              ${select("Kind", "category", [["crew", "Crew"], ["artist", "Artist"], ["junior_artist", "Junior artists (group)"]], "crew")}
              ${select("Department", "departmentId", [["", "—"], ...c.departments.map((d) => [d.id, d.name])])}
              <div class="grid2">${field("How many", "headcount", { type: "number", value: 1, attrs: 'min="1" inputmode="numeric"' })}${select("Called for", "called", [["5", "0.5"], ["10", "1"], ["15", "1.5"], ["20", "2"]], "10")}</div>
              ${btn("Add", "production wide")}
            </form></details>`
          : ""
      }
      ${
        c.list
          ? `<section class="card strong">
            <p class="label">Approval</p>
            <ol class="approval">${steps.map(([l, done, cur], i) => `<li class="${done ? "done" : cur ? "cur" : ""}"><span>${done ? "✓" : i + 1}</span>${l}</li>`).join("")}</ol>
            ${
              (myTurn || draft) && t
                ? `<div class="soft"><p><b>Check these</b></p><p>People on set: ${t.people}</p><p>Total call sheets: ${fmtTenths(t.workedTenths)}</p><p class="warn-text">Released early: ${t.releasedEarly}</p><p class="danger-text">On the list, didn't come: ${t.absent}</p><p>Added on the day: ${t.addedOnDay}</p></div>`
                : ""
            }
            ${draft && canEdit ? `<form id="sendap">${btn("Send for approval", "production wide")}</form>` : ""}
            ${myTurn ? `<form id="decide" class="stack">${field("Note (needed if sending back)", "note")}<div class="grid12">${btn("Send back", "outline", 'name="decision" value="send_back"')}${btn("Approve", "dept", 'name="decision" value="approve"')}</div></form>` : ""}
            ${c.list.status === "locked" ? `<p class="muted small">Locked ${fmtStamp(c.list.lockedAt)}. Any change needs the EP to reopen it with a reason; the locked version stays in the change log.</p>` : ""}
            ${c.list.status === "locked" && c.caps.reopen && !ro ? `<details><summary class="danger-text"><b>Reopen this day</b></summary><form id="reopen" class="stack">${field("Reason", "reason", { required: true })}${btn("Reopen", "danger wide")}</form></details>` : ""}
            ${
              c.history.length
                ? `<div class="sep"><p class="muted small"><b>History</b></p>${c.history
                    .map((h) => `<p class="small">${fmtStamp(h.at)} · ${esc(h.who)} · ${h.decision === "approved" ? `approved (${h.step.toUpperCase()})` : h.decision === "sent_back" ? "sent back" : "reopened"}${h.note ? ` — “${esc(h.note)}”` : ""}</p>`)
                    .join("")}</div>`
                : ""
            }
          </section>`
          : ""
      }
    </main>`,
    bind(root) {
      const day = c.day.id;
      onForm(root, "#start", async () => {
        await rpc("start_crew_list", { p_day: day });
        render();
      });
      onForm(root, ".release", async (fd, form) => {
        if (!fd.get("worked")) throw new Error("Pick 0.5, 1, 1.5 or 2.");
        await rpc("release_early", { p_entry: form.dataset.id, p_worked: Number(fd.get("worked")), p_at: fd.get("at"), p_reason: (fd.get("other") || "").trim() || fd.get("reason") || "" });
        render();
      });
      onForm(root, ".presence", async (_, form) => {
        await rpc("set_presence", { p_entry: form.dataset.id, p_present: form.dataset.present === "1" });
        render();
      });
      onForm(root, "#add", async (fd) => {
        await rpc("add_crew_entry", {
          p_day: day,
          p: { membershipId: fd.get("membershipId"), label: fd.get("label"), category: fd.get("category"), departmentId: fd.get("departmentId"), headcount: fd.get("headcount"), called: fd.get("called") },
        });
        render();
      });
      onForm(root, "#sendap", async () => {
        await rpc("send_for_approval", { p_day: day });
        render();
      });
      onForm(root, "#decide", async (fd) => {
        await rpc("decide", { p_day: day, p_decision: fd.get("decision"), p_note: fd.get("note") || null });
        render();
      });
      onForm(root, "#reopen", async (fd) => {
        await rpc("reopen", { p_day: day, p_reason: fd.get("reason") });
        render();
      });
    },
  };
}

const statusText = (s) => ({ draft: "Draft", awaiting_pm: "Waiting for Production Manager", awaiting_ep: "PM approved · waiting for EP", locked: "Approved & locked" })[s];

export async function search({ me, filmId, go }) {
  const q = new URLSearchParams(location.hash.split("?")[1] || "");
  const term = q.get("q") || "";
  const approved = q.get("scope") !== "all";
  const groups = term ? await rpc("crew_search", { p_film: filmId, p_q: term, p_approved_only: approved }) : [];
  return {
    html: `${recordsHeader(me, "Search crew history", "search")}<main class="page">
      <form id="s" class="stack">
        <input class="search" name="q" value="${esc(term)}" placeholder="Search a name" aria-label="Search a name">
        <div class="pills">${[["approved", "Approved days only"], ["all", "All days"]]
          .map(([k, l]) => `<label class="pill"><input type="radio" name="scope" value="${k}" ${(k === "approved") === approved ? "checked" : ""}><span>${l}</span></label>`)
          .join("")}</div>
        ${btn("Search", "production wide")}
      </form>
      ${term && !groups.length ? empty(`No one called “${esc(term)}” on ${approved ? "approved days" : "any day"}.`) : ""}
      ${groups
        .map(
          (g) => `<section class="card"><p class="h2">${esc(g.label)}</p><p><span class="huge dark">${fmtTenths(g.tenths)}</span> <span class="muted">call sheets over ${g.days} days</span></p>
          <p class="label">Days</p>${g.rows
            .map((r) => `<a class="line" href="#/crew/${esc(r.dayId)}"><span><b>${dayLabel(r)}</b>${r.locked ? "" : ' <span class="warn-text">· not approved</span>'}</span><span class="muted">${r.present ? fmtTenths(r.worked) : "absent"}</span></a>`)
            .join("")}
          ${has(me, "contracts") ? "" : `<p class="muted small">Rate and payments are visible to the Producer only.</p>`}</section>`,
        )
        .join("")}
    </main>`,
    bind(root) {
      onForm(root, "#s", async (fd) => go(`search?q=${encodeURIComponent(fd.get("q"))}&scope=${fd.get("scope")}`));
    },
  };
}
