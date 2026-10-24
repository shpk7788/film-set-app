import { rpc } from "../api.js";
import { alert, badge, btn, checkbox, empty, esc, field, fmtStamp, fmtTime, link, onForm, select, textarea, title, toast, watermark } from "../ui.js";
import { bindGotIt, changedBox, dayLabel, gotIt, has, sliceView } from "./parts.js";

const label = (x) => `<p class="label">${x}</p>`;

function programView(data, dir) {
  const dname = Object.fromEntries(dir.departments.map((d) => [d.id, d.name]));
  const aname = Object.fromEntries(dir.actors.map((a) => [a.id, a.name]));
  const calls = Object.entries(data.deptCalls || {});
  const actors = Object.entries(data.actorTimes || {});
  return `<section class="card">${label("General call")}<p class="huge dark">${fmtTime(data.generalCall)}</p><p>${esc(data.location || "Location to be confirmed")}</p>${
    data.notes ? `<p class="muted pre">${esc(data.notes)}</p>` : ""
  }</section>
  ${(data.items || [])
    .map(
      (i) => `<section class="card ${i.cut ? "cut" : ""}">
      <div class="row"><b class="${i.cut ? "struck" : ""}">Sc ${esc(i.scene)}${i.heading ? ` · ${esc(i.heading)}` : ""}</b>${i.cut ? badge("Cut", "danger") : i.pages ? `<span class="muted small">${esc(i.pages)} pg</span>` : ""}</div>
      ${i.cut ? (i.cutReason ? `<p class="danger-text small">${esc(i.cutReason)}</p>` : "") : `
        <p class="muted small">${i.start ? `${fmtTime(i.start)}–${fmtTime(i.end)}` : "Time TBC"}${i.location ? ` · ${esc(i.location)}` : ""}</p>
        ${i.castIds?.length ? `<p class="small">Cast: ${i.castIds.map((a) => esc(aname[a] || "—")).join(", ")}</p>` : ""}
        <div class="chips">${Object.entries(i.needs || {}).map(([d, n]) => `<span class="chip">${esc(dname[d] || "Dept")}: ${esc(n)}</span>`).join("")}</div>
        ${i.jobs?.length ? `<ul class="jobs">${i.jobs.map((j) => `<li>${esc(j.text)}</li>`).join("")}</ul>` : ""}`}
    </section>`,
    )
    .join("")}
  ${calls.length ? `<section class="card">${label("Department calls")}${calls.map(([d, t]) => `<div class="line"><span>${esc(dname[d] || "Dept")}</span><b>${fmtTime(t)}</b></div>`).join("")}</section>` : ""}
  ${
    actors.length
      ? `<section class="card">${label("Actor times")}${actors
          .map(
            ([a, t]) => `<div class="item"><p><b>${esc(aname[a] || "—")}</b></p><p class="muted small">Pickup ${fmtTime(t.pickup)} · Makeup ${fmtTime(t.makeup)} · On set ${fmtTime(t.onSet)}${t.costume ? ` · ${esc(t.costume)}` : ""}</p></div>`,
          )
          .join("")}</section>`
      : ""
  }`;
}

export async function callsheet({ params, render }) {
  const c = await rpc("my_callsheet", { p_day: params.day });
  return {
    html: `${title(dayLabel(c.day), `Call sheet · version ${c.version}`)}<main class="page">
      ${changedBox(c.version, c.summary, c.sentAt)}
      ${c.slice ? sliceView(c.slice) + gotIt(c.confirmed, c.versionId) : c.hasSchedule ? link("Open the full program sheet", `#/day/${esc(c.day.id)}`, "direction wide") : empty("You're not called on this day.")}
    </main>`,
    bind: (root) => bindGotIt(root, render),
  };
}

export async function viewAs({ me, params }) {
  if (!params.kind) {
    const d = await rpc("day_view", { p_day: params.day });
    return {
      html: `${title("Open a call sheet", dayLabel(d.day))}<main class="page">
        <section class="card">${label("Departments")}${d.dir.departments.map((x) => `<a class="line" href="#/viewas/${esc(params.day)}/department/${esc(x.id)}"><b>${esc(x.name)}</b><span>›</span></a>`).join("")}</section>
        <section class="card">${label("Actors")}${d.dir.actors.map((x) => `<a class="line" href="#/viewas/${esc(params.day)}/actor/${esc(x.id)}"><b>${esc(x.name)}</b><span class="muted">${esc(x.character || "")}</span></a>`).join("") || `<p class="muted">No actors yet.</p>`}</section>
      </main>`,
    };
  }
  const c = await rpc("callsheet_as", { p_day: params.day, p_kind: params.kind, p_id: params.id });
  const who = c.slice.kind === "department" ? c.slice.department : c.slice.name;
  return {
    html: `${watermark(me)}${title(`${who}'s call sheet`, `${dayLabel(c.day)} · version ${c.version} · exactly as they see it`)}<main class="page">
      ${changedBox(c.version, c.summary, c.sentAt)}
      ${c.slice.called ? sliceView(c.slice) : empty("Not called on this day.")}
      ${link("← Other call sheets", `#/viewas/${esc(params.day)}`, "outline wide")}
    </main>`,
  };
}

export async function schedule({ filmId, go, me }) {
  const s = await rpc("days_list", { p_film: filmId });
  const canEdit = s.canEdit && !me.film.readOnly;
  return {
    html: `${title("Schedule", "Program sheets")}<main class="page">
      ${s.days.length ? "" : empty("No shoot days you can see yet.")}
      ${s.days
        .map(
          (d) => `<a class="card daycard ${d.date < me.today ? "past" : ""}" href="#/day/${esc(d.id)}">
            <div class="row"><b>${dayLabel(d)}</b>${d.date === me.today ? badge("Today", "danger") : ""}</div>
            <div class="chips">${d.sent ? badge(`Sent v${d.sent}`, "dept") : badge("Not sent yet")}${d.draft && canEdit ? badge(`Draft v${d.draft} — not sent`, "warn") : ""}</div>
          </a>`,
        )
        .join("")}
      ${
        canEdit
          ? `<section class="card"><h2>Add a shoot day</h2><form id="new" class="stack">
              ${field("Day number", "n", { type: "number", value: s.nextDayNumber, required: true, attrs: 'min="1" inputmode="numeric"' })}
              ${field("Date", "date", { type: "date", required: true })}
              ${field("Main location", "location", { attrs: 'placeholder="e.g. Studio, Floor 3 · Gate 2"' })}
              ${field("General call", "call", { type: "time", value: "07:00" })}
              ${btn("Create day", "direction wide")}
            </form></section>`
          : ""
      }
    </main>`,
    bind(root) {
      onForm(root, "#new", async (fd) => {
        const r = await rpc("create_day", { p_film: filmId, p_day_number: Number(fd.get("n")), p_date: fd.get("date") || null, p_location: fd.get("location"), p_general_call: fd.get("call") });
        go(`edit/${r.dayId}`);
      });
    },
  };
}

export async function day({ me, params, render }) {
  const d = await rpc("day_view", { p_day: params.day });
  const ro = me.film.readOnly;
  const buttons = [
    d.canEdit && !ro ? link(d.draft ? `Edit draft v${d.draft}` : "Make changes", `#/edit/${esc(d.day.id)}`, "direction small") : "",
    d.sent && d.canTracker ? link("Who has confirmed", `#/tracker/${esc(d.day.id)}`, "outline small") : "",
    d.sent && d.canViewAs ? link("Open any call sheet", `#/viewas/${esc(d.day.id)}`, "outline small") : "",
  ].join("");
  return {
    html: `${watermark(me)}${title(dayLabel(d.day), d.sent ? `Program sheet · version ${d.sent.version}` : "Program sheet", buttons ? `<div class="btnrow">${buttons}</div>` : "")}
    <main class="page">
      ${d.draft && d.canEdit && !ro ? `<p class="note direction">Draft v${d.draft} has unsent changes. <a href="#/edit/${esc(d.day.id)}"><b>Review and send</b></a></p>` : ""}
      ${d.sent ? changedBox(d.sent.version, d.sent.summary, d.sent.sentAt) + programView(d.sent.data, d.dir) + (d.isJunior ? gotIt(d.confirmed, d.sent.id) : "") : empty("This day hasn't been sent yet.")}
    </main>`,
    bind: (root) => bindGotIt(root, render),
  };
}

function itemFields(item, dir) {
  const i = item || { needs: {}, castIds: [] };
  return `${item ? `<input type="hidden" name="key" value="${esc(i.key)}">` : ""}
    <div class="grid2">${field("Scene no.", "scene", { value: i.scene, required: true })}${field("Pages", "pages", { value: i.pages, attrs: 'placeholder="2"' })}</div>
    ${field("Scene heading", "heading", { value: i.heading, attrs: 'placeholder="INT. House – Night"' })}
    ${field("Where", "location", { value: i.location, attrs: 'placeholder="House set"' })}
    <div class="grid2">${field("Start", "start", { type: "time", value: i.start })}${field("End", "end", { type: "time", value: i.end })}</div>
    <fieldset><legend>Cast in this scene</legend>${
      dir.actors.length ? dir.actors.map((a) => checkbox(`${a.name}${a.character ? ` “${a.character}”` : ""}`, "cast", i.castIds?.includes(a.id), a.id)).join("") : `<p class="muted small">No actors added to the film yet.</p>`
    }</fieldset>
    <fieldset><legend>What each department needs (leave blank if not needed)</legend>${dir.departments
      .map((d) => `<label class="needrow"><span>${esc(d.name)}</span><input name="need_${esc(d.id)}" value="${esc(i.needs?.[d.id] || "")}"></label>`)
      .join("")}</fieldset>
    ${textarea("Jobs for ADs (one per line)", "jobs", (i.jobs || []).map((j) => j.text).join("\n"))}`;
}

function readItem(fd, dir) {
  const needs = {};
  for (const d of dir.departments) {
    const v = (fd.get(`need_${d.id}`) || "").trim();
    if (v) needs[d.id] = v;
  }
  return {
    key: fd.get("key") || "",
    scene: fd.get("scene"),
    pages: fd.get("pages"),
    heading: fd.get("heading"),
    location: fd.get("location"),
    start: fd.get("start"),
    end: fd.get("end"),
    castIds: fd.getAll("cast"),
    needs,
    jobs: fd.get("jobs"),
  };
}

export async function edit({ params, render, go, me }) {
  const e = await rpc("editor_view", { p_day: params.day });
  const data = e.data;
  const dir = e.dir;
  const pv = e.preview;
  return {
    html: `${title(dayLabel(e.day), "Edit program sheet", `<div class="btnrow">${e.draft ? badge(`Draft v${e.draft} · not sent`, "warn") : badge(`Showing sent v${e.latestVersion}`, "dept")}<a href="#/day/${esc(e.day.id)}"><b>Back to sent version</b></a></div>`)}
    <main class="page">
      ${me.film.readOnly ? alert("This film has wrapped and is read-only.", "", "danger") : ""}
      ${!e.draft ? alert(`Any change you save starts draft v${(e.latestVersion || 0) + 1}. Crew only see it after it's sent.`, "", "info") : ""}
      ${
        pv
          ? `<section class="card strong-direction">${label(e.prevSent ? `Changes since v${e.prevSent}` : "Ready to send")}
            <ul class="plain">${pv.summary.map((s) => `<li>• ${esc(s)}</li>`).join("")}</ul>
            <p class="muted small">Will update: ${esc(pv.departments.join(", ") || "no departments")}${pv.actors.length ? `; actors: ${esc(pv.actors.join(", "))}` : ""}. ADs and interns always see the update.</p>
            ${e.canSend ? `<form id="send">${btn(`Approve &amp; send v${e.draft}`, "direction wide")}</form>` : `<p class="direction-text"><b>Only the Director or Co-director can send this.</b></p>`}
          </section>`
          : ""
      }
      <details class="card" ${data.items.length ? "" : "open"}><summary>Day settings — calls, location, actor times</summary>
        <form id="settings" class="stack">
          ${field("General call", "generalCall", { type: "time", value: data.generalCall, required: true })}
          ${field("Main location", "location", { value: data.location })}
          ${textarea("Notes for everyone on this sheet", "notes", data.notes)}
          <fieldset><legend>Departments called</legend>${dir.departments
            .map(
              (d) => `<div class="callrow">${checkbox(d.name, `called_${d.id}`, d.id in (data.deptCalls || {}))}<input type="time" name="call_${esc(d.id)}" aria-label="${esc(d.name)} call time" value="${esc(data.deptCalls?.[d.id] || "")}"></div>`,
            )
            .join("")}</fieldset>
          <fieldset><legend>Actor times (only fill for actors called)</legend>${dir.actors
            .map((a) => {
              const t = data.actorTimes?.[a.id] || {};
              return `<div class="actorbox"><p><b>${esc(a.name)}</b></p><div class="grid3">${field("Pickup", `pickup_${a.id}`, { type: "time", value: t.pickup })}${field("Makeup", `makeup_${a.id}`, { type: "time", value: t.makeup })}${field("On set", `onset_${a.id}`, { type: "time", value: t.onSet })}</div>${field("Costume", `costume_${a.id}`, { value: t.costume, attrs: 'placeholder="Look 3 — blue saree"' })}</div>`;
            })
            .join("") || `<p class="muted small">No actors yet.</p>`}</fieldset>
          ${btn("Save day settings", "direction wide")}
        </form>
      </details>
      ${data.items
        .map(
          (i) => `<details class="card ${i.cut ? "cut" : ""}"><summary><b class="${i.cut ? "struck" : ""}">Sc ${esc(i.scene)} ${i.heading ? `· ${esc(i.heading)}` : ""}</b><small>${
            i.cut ? `Cut${i.cutReason ? ` — ${esc(i.cutReason)}` : ""}` : `${i.start || "--:--"}–${i.end || "--:--"}`
          }</small></summary>
          ${i.cut ? "" : `<form class="stack item-form">${itemFields(i, dir)}${btn("Save scene", "direction wide")}</form>`}
          <div class="sep stack">
            ${
              i.cut
                ? `<form class="cut-form" data-key="${esc(i.key)}" data-restore="1">${btn("Put scene back", "outline wide")}</form>`
                : `<form class="cut-form stack" data-key="${esc(i.key)}">${field("Reason for cutting", "reason", { attrs: 'placeholder="e.g. moved to Day 17 — rain"' })}${btn("Cut this scene", "danger wide")}</form>`
            }
            <form class="remove-form" data-key="${esc(i.key)}"><button class="linkish">Remove (added by mistake)</button></form>
          </div></details>`,
        )
        .join("")}
      <details class="card add-scene" ${data.items.length ? "" : "open"}><summary><b>+ Add scene</b></summary>
        <form class="stack item-form">${itemFields(null, dir)}${btn("Add scene", "direction wide")}</form></details>
    </main>`,
    bind(root) {
      const saved = () => {
        toast("Saved to the draft. Nothing is sent until the Director or Co-director sends it.");
        render();
      };
      onForm(root, "#settings", async (fd) => {
        const deptCalls = {};
        for (const d of dir.departments) if (fd.get(`called_${d.id}`) === "on") deptCalls[d.id] = fd.get(`call_${d.id}`) || fd.get("generalCall");
        const actorTimes = {};
        for (const a of dir.actors)
          actorTimes[a.id] = { pickup: fd.get(`pickup_${a.id}`), makeup: fd.get(`makeup_${a.id}`), onSet: fd.get(`onset_${a.id}`), costume: fd.get(`costume_${a.id}`) };
        await rpc("save_day_settings", { p_day: e.day.id, p: { generalCall: fd.get("generalCall"), location: fd.get("location"), notes: fd.get("notes"), deptCalls, actorTimes } });
        saved();
      });
      onForm(root, ".item-form", async (fd) => {
        await rpc("save_item", { p_day: e.day.id, p: readItem(fd, dir) });
        saved();
      });
      onForm(root, ".cut-form", async (fd, form) => {
        await rpc("cut_item", { p_day: e.day.id, p_key: form.dataset.key, p_reason: fd.get("reason") || "", p_restore: form.dataset.restore === "1" });
        saved();
      });
      onForm(root, ".remove-form", async (_, form) => {
        await rpc("remove_item", { p_day: e.day.id, p_key: form.dataset.key });
        saved();
      });
      onForm(root, "#send", async () => {
        await rpc("send_version", { p_day: e.day.id });
        go(`tracker/${e.day.id}`);
      });
    },
  };
}

export async function tracker({ params, me, render }) {
  const t = await rpc("tracker", { p_day: params.day });
  const groups = {};
  for (const p of t.people) (groups[p.group] ||= []).push(p);
  const done = t.people.filter((p) => p.confirmedAt).length;
  const pct = t.people.length ? Math.round((done / t.people.length) * 100) : 0;
  return {
    html: `${title("Who has confirmed", `${dayLabel(t.day)} · v${t.version} sent ${fmtStamp(t.sentAt)}`, `<p><span class="huge dark">${done}</span> <span class="muted">of ${t.people.length} confirmed</span></p><div class="bar"><div style="width:${pct}%"></div></div>`)}
    <main class="page">
      ${t.people.length - done > 0 && !me.film.readOnly ? `<form id="remind">${btn(`Remind the ${t.people.length - done} not confirmed`, "outline wide")}</form>` : ""}
      ${Object.entries(groups)
        .map(([g, ps]) => {
          const waiting = ps.filter((p) => !p.confirmedAt).length;
          return `<section class="card ${waiting ? "strong-danger" : ""}"><div class="row">${label(esc(g))}<b class="${waiting ? "danger-text" : "ok"}">${ps.length - waiting}/${ps.length}</b></div>
            ${ps
              .map(
                (p) => `<div class="line"><span><b>${esc(p.name)}</b><small class="muted block">${esc(p.roleLabel)}</small></span>${
                  p.confirmedAt ? `<span class="ok small"><b>✓ ${fmtStamp(p.confirmedAt)}</b></span>` : p.phone ? `<a class="btn dept small" href="tel:${esc(p.phone)}">Call</a>` : `<span class="danger-text small"><b>Not yet</b></span>`
                }</div>`,
              )
              .join("")}</section>`;
        })
        .join("")}
    </main>`,
    bind(root) {
      onForm(root, "#remind", async () => {
        const r = await rpc("remind_unconfirmed", { p_day: params.day });
        toast(`Reminder sent to ${r.count} ${r.count === 1 ? "person" : "people"}.`);
        render();
      });
    },
  };
}

export async function today({ me, filmId, render }) {
  const v = await rpc("live_view", { p_film: filmId });
  const items = v.items || [];
  const idx = items.findIndex((i) => i.key === v.liveKey);
  const now = idx >= 0 ? items[idx] : null;
  const next = idx >= 0 ? items[idx + 1] : items[0];
  const jobs = items.flatMap((i) => (i.jobs || []).map((j) => ({ scene: i.scene, text: j.text })));
  return {
    refreshEvery: 30,
    html: `${watermark(me)}${title("On set now", v.day ? `Day ${v.day.dayNumber}` : "Today", `<p class="live"><span></span>LIVE · refreshes every 30 seconds</p>`)}<main class="page">
      ${
        !v.sent
          ? empty("No schedule has been sent for today.")
          : `<section class="hero purple"><p>Now shooting</p><p class="big2">${now ? `Sc ${esc(now.scene)}${now.heading ? ` · ${esc(now.heading)}` : ""}` : "Not started yet"}</p>${
              v.note ? `<p>${esc(v.note)}</p>` : ""
            }${v.updatedAt ? `<p class="small">Updated ${fmtStamp(v.updatedAt)}</p>` : ""}</section>
          ${next ? `<section class="card">${label(`Up next${next.start ? ` · about ${fmtTime(next.start)}` : ""}`)}<p><b>Sc ${esc(next.scene)}${next.heading ? ` · ${esc(next.heading)}` : ""}</b></p>${next.needs?.length ? `<p>Needs: ${esc(next.needs.join(", "))}</p>` : ""}</section>` : ""}
          ${jobs.length ? `<section class="card strong-direction">${label("Jobs for ADs today")}${jobs.map((j) => `<p><b>Sc ${esc(j.scene)}:</b> ${esc(j.text)}</p>`).join("")}</section>` : ""}
          ${v.canRelease && v.day ? link("Release someone early", `#/crew/${esc(v.day.id)}`, "outline wide") : ""}
          ${
            v.canEdit && !me.film.readOnly
              ? `<section class="card"><h2>Update live status</h2><form id="live" class="stack">
                  ${select("Now shooting", "key", [["", "Not started"], ...items.map((i) => [i.key, `Sc ${i.scene} ${i.heading || ""}`])], v.liveKey || "")}
                  ${field("Note (shot, setup)", "note", { value: v.note || "", attrs: 'placeholder="Shot 3 of 7 — mid shot, Amma at the window"' })}
                  ${btn("Update", "direction wide")}
                </form></section>`
              : ""
          }`
      }
    </main>`,
    bind(root) {
      onForm(root, "#live", async (fd) => {
        await rpc("set_live", { p_day: v.day.id, p_key: fd.get("key"), p_note: fd.get("note") });
        render();
      });
    },
  };
}
