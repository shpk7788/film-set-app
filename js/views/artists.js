// Artist list, each artist's dates (availability) and the scenes they're in.
import { rpc } from "../api.js";
import { alert, avatar, badge, btn, esc, field, fmtTime, onForm, svg, title, toast } from "../ui.js";
import { ACCEPT } from "./imports.js";

const short = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const long = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export async function artists({ filmId, render, me }) {
  const a = await rpc("artists_list", { p_film: filmId });
  const total = a.artists.length;
  const clashes = a.artists.reduce((n, x) => n + x.conflicts, 0);
  return {
    html: `${title("Artists", `${total} ${total === 1 ? "actor" : "actors"}`)}<main class="page">
      ${clashes ? alert(`${clashes} scene${clashes === 1 ? " is" : "s are"} on a date an artist said they're not available. Tap the red ones below.`, "Date clashes", "danger") : ""}
      ${total > 5 ? `<label class="field search"><span class="sr">Search artists</span><input id="find" type="search" placeholder="Search by name or character" autocomplete="off"></label>` : ""}
      <div class="artlist">
      ${a.artists
        .map(
          (x) => `<a class="card artcard" href="#/artist/${esc(x.id)}" data-find="${esc(`${x.name} ${x.character || ""}`.toLowerCase())}">
          ${avatar(x.name)}
          <span class="ttext"><b>${esc(x.name)}</b>${x.character ? `<small class="muted block">as “${esc(x.character)}”</small>` : ""}
            <small class="block">${x.scenes} scene${x.scenes === 1 ? "" : "s"} · ${x.availableDays ? `${x.availableDays} day${x.availableDays === 1 ? "" : "s"} given${x.nextAvailable ? `, next ${short(x.nextAvailable)}` : ""}` : `<span class="muted">No dates yet</span>`}</small></span>
          ${x.conflicts ? badge(`${x.conflicts} clash${x.conflicts === 1 ? "" : "es"}`, "danger") : !x.joined ? badge("Not joined", "neutral") : ""}
          <span class="chev">${svg("chev", 18)}</span>
        </a>`,
        )
        .join("") || `<p class="empty">No artists yet.${a.canAdd ? " Add the first one below." : ""}</p>`}
      </div>
      ${
        a.canAdd && !me.film.readOnly
          ? `<details class="card add-scene" id="addart" ${total ? "" : "open"}><summary><b>+ Add an artist</b></summary>
            <form id="newart" class="stack">
              <input type="hidden" name="role" value="actor">
              ${field("Name", "name", { required: true, attrs: 'placeholder="e.g. Hari Kumar" autocomplete="off"' })}
              ${field("Character", "character", { attrs: 'placeholder="e.g. Vetri"' })}
              ${field("Phone (optional)", "phone", { type: "tel", attrs: 'inputmode="tel"' })}
              ${btn("Add artist", "direction wide")}
            </form></details>`
          : ""
      }
    </main>`,
    bind(root) {
      root.querySelector("#find")?.addEventListener("input", (e) => {
        const q = e.target.value.trim().toLowerCase();
        root.querySelectorAll("[data-find]").forEach((c) => (c.hidden = q && !c.dataset.find.includes(q)));
      });
      onForm(root, "#newart", async (fd) => {
        const r = await rpc("add_person", { p_film: filmId, p: Object.fromEntries(fd.entries()) });
        toast(`${r.name} added. Their sign-up code: ${r.code}`);
        render();
      });
    },
  };
}

/** Months to show: from this month (or the first date) to the last date or scene, at least 3 months. */
function monthsFor(today, dates) {
  const all = [today, ...dates].map((d) => String(d).slice(0, 7)).sort();
  let [y, m] = (all[0] < today.slice(0, 7) ? all[0] : today.slice(0, 7)).split("-").map(Number);
  const last = all[all.length - 1];
  const out = [];
  while (out.length < 14) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(key);
    if (key >= last && out.length >= 3) break;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

function calendar(today, dates, scenes, canEdit) {
  const status = new Map(dates.map((d) => [String(d.date).slice(0, 10), d]));
  const shoot = new Map();
  for (const s of scenes) {
    const k = String(s.date).slice(0, 10);
    shoot.set(k, (shoot.get(k) || 0) + 1);
  }
  const months = monthsFor(today, [...status.keys(), ...shoot.keys()]);
  return months
    .map((ym) => {
      const [y, m] = ym.split("-").map(Number);
      const first = new Date(Date.UTC(y, m - 1, 1));
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const lead = (first.getUTCDay() + 6) % 7; // Monday first
      const cells = [];
      for (let i = 0; i < lead; i++) cells.push(`<span></span>`);
      for (let d = 1; d <= days; d++) {
        const k = `${ym}-${String(d).padStart(2, "0")}`;
        const st = status.get(k);
        const cls = [st ? (st.available ? "yes" : "no") : "", shoot.has(k) ? "shoot" : "", k === today ? "now" : "", k < today ? "past" : ""].join(" ");
        const tip = `${long(k)}: ${st ? (st.available ? "available" : "not available") : "no info"}${shoot.has(k) ? ` · ${shoot.get(k)} scene${shoot.get(k) === 1 ? "" : "s"}` : ""}${st?.note ? ` · ${st.note}` : ""}`;
        cells.push(
          canEdit
            ? `<button type="button" class="cd ${cls}" data-date="${k}" data-state="${st ? (st.available ? "yes" : "no") : ""}" aria-label="${esc(tip)}" title="${esc(tip)}">${d}</button>`
            : `<span class="cd ${cls}" title="${esc(tip)}">${d}</span>`,
        );
      }
      return `<div class="month"><p class="mname">${first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
        <div class="cal"><i>M</i><i>T</i><i>W</i><i>T</i><i>F</i><i>S</i><i>S</i>${cells.join("")}</div></div>`;
    })
    .join("");
}

export async function artist({ params, render, me }) {
  const v = await rpc("artist_view", { p_member: params.id });
  const a = v.artist;
  const edit = v.canEdit && !me.film.readOnly;
  const given = v.dates.filter((d) => d.available && String(d.date).slice(0, 10) >= v.today).length;
  const clashes = v.scenes.filter((s) => s.available === false);
  const byDay = [];
  for (const s of v.scenes) {
    let g = byDay.find((x) => x.dayId === s.dayId);
    if (!g) byDay.push((g = { dayId: s.dayId, dayNumber: s.dayNumber, date: s.date, status: s.status, available: s.available, scenes: [] }));
    g.scenes.push(s);
  }
  return {
    html: `<a class="back" href="#/artists">${svg("chev", 16)} Artists</a>
    <main class="page">
      <section class="hero sun artisthero">
        <div class="who-line">${avatar(a.name, "lg")}<span><p class="big2">${esc(a.name)}</p>${a.character ? `<p>as “${esc(a.character)}”</p>` : ""}</span></div>
        <div class="stats3"><div><b>${v.scenes.length}</b><small>Scenes</small></div><div><b>${given}</b><small>Dates given</small></div><div><b>${clashes.length}</b><small>Clashes</small></div></div>
        ${a.phone ? `<a class="btn light small" href="tel:${esc(a.phone)}">Call ${esc(a.name.split(" ")[0])}</a>` : ""}
      </section>
      ${clashes.length ? alert(clashes.map((s) => `<p>Sc ${esc(s.scene)} on <b>Day ${s.dayNumber} · ${short(s.date)}</b> — they said not available.</p>`).join(""), "Date clash", "danger") : ""}

      <section class="card"><div class="row"><p class="label">Dates</p><span class="legend"><i class="yes"></i>Available <i class="no"></i>Not <i class="shoot"></i>Shooting</span></div>
        ${edit ? `<p class="muted small">Tap a date to change it: available → not available → clear.</p>` : ""}
        <div class="months">${calendar(v.today, v.dates, v.scenes, edit)}</div>
      </section>

      ${
        edit
          ? `<details class="card add-scene" id="adddates" ${v.dates.length ? "" : "open"}><summary><b>${svg("calendar", 18)} Add dates they've given</b><small>WhatsApp, Excel, PDF or photo</small></summary>
          <div class="stack">
            <div class="uplbtns"><label class="btn outline"><input type="file" class="datefile" accept="${ACCEPT}" hidden>${svg("upload", 18)} Upload file</label>
              <label class="btn outline"><input type="file" class="datefile" accept="image/*" capture="environment" hidden>${svg("camera", 18)} Take photo</label></div>
            <label class="field"><span>Paste the message or type the dates</span><textarea id="datetext" rows="4" placeholder="Nov 3 to 7, 12, 15-18 and Dec 2&#10;or 03/11/2026 - 07/11/2026"></textarea></label>
            <div class="seg" role="radiogroup"><label><input type="radio" name="mode" value="yes" checked><span>Available on these</span></label><label><input type="radio" name="mode" value="no"><span>NOT available on these</span></label></div>
            ${field("Note (optional)", "dnote", { attrs: 'id="dnote" placeholder="e.g. only till 6 pm"' })}
            <button type="button" class="btn soft wide" id="readdates">${svg("sparkle", 18)} Find the dates</button>
            <p class="form-msg" id="datemsg" role="alert"></p>
            <div id="datepreview"></div>
          </div></details>`
          : ""
      }

      <section class="card"><p class="label">Scenes</p>
        ${
          byDay.length
            ? byDay
                .map(
                  (g) => `<a class="dayscenes ${g.available === false ? "clash" : ""}" href="#/day/${esc(g.dayId)}">
              <div class="row"><b>Day ${g.dayNumber} · ${long(g.date)}</b>${g.available === false ? badge("Not available", "danger") : g.available ? badge("Available", "dept") : ""}${g.status === "draft" ? badge("Draft", "warn") : ""}</div>
              ${g.scenes.map((s) => `<p class="small">Sc ${esc(s.scene)}${s.heading ? ` · ${esc(s.heading)}` : ""}${s.start ? ` · ${fmtTime(s.start)}` : ""}${s.location ? ` · <span class="muted">${esc(s.location)}</span>` : ""}</p>`).join("")}
            </a>`,
                )
                .join("")
            : `<p class="muted">Not in any scene yet.</p>`
        }
      </section>
    </main>`,
    bind(root) {
      root.querySelectorAll(".cd[data-date]").forEach((b) =>
        b.addEventListener("click", async () => {
          const next = { "": true, yes: false, no: null }[b.dataset.state];
          b.disabled = true;
          try {
            await rpc("set_availability", { p_member: a.id, p_dates: [b.dataset.date], p_available: next, p_note: "" });
            b.dataset.state = next === true ? "yes" : next === false ? "no" : "";
            b.classList.toggle("yes", next === true);
            b.classList.toggle("no", next === false);
            try { navigator.vibrate?.(8); } catch {}
          } catch (e) {
            toast(e.message);
          }
          b.disabled = false;
        }),
      );

      const text = root.querySelector("#datetext");
      if (!text) return;
      const msg = root.querySelector("#datemsg");
      const out = root.querySelector("#datepreview");
      const say = (t, tone = "") => {
        msg.className = `form-msg ${tone}`;
        msg.textContent = t;
      };
      let found = [];
      const find = async () => {
        const { parseDates } = await import("../parse.js");
        found = parseDates(text.value, v.today);
        if (!found.length) {
          out.innerHTML = "";
          return say("Couldn't find any dates. Try writing them like “Nov 3-7, 12” or “03/11/2026”.", "error");
        }
        const no = root.querySelector('[name="mode"]:checked').value === "no";
        say(`Found ${found.length} date${found.length === 1 ? "" : "s"}. Untick any that are wrong.`, "ok");
        out.innerHTML = `<div class="datechips">${found.map((d) => `<label class="pick ${no ? "no" : "yes"}"><input type="checkbox" value="${d}" checked><span>${long(d)}</span></label>`).join("")}</div>
          ${btn(`Save as ${no ? "NOT available" : "available"}`, `${no ? "danger" : "direction"} wide`, 'type="button" id="savedates"')}`;
        out.querySelector("#savedates").addEventListener("click", async (e) => {
          const picked = [...out.querySelectorAll("input:checked")].map((i) => i.value);
          if (!picked.length) return say("Tick at least one date.", "error");
          e.target.disabled = true;
          try {
            await rpc("set_availability", { p_member: a.id, p_dates: picked, p_available: !no, p_note: root.querySelector("#dnote").value });
            toast(`Saved ${picked.length} date${picked.length === 1 ? "" : "s"} for ${a.name}.`);
            render();
          } catch (err) {
            e.target.disabled = false;
            say(err.message, "error");
          }
        });
      };
      root.querySelector("#readdates").addEventListener("click", () => (text.value.trim() ? find() : say("Paste a message, type dates or upload a file first.", "error")));
      root.querySelectorAll('[name="mode"]').forEach((r) => r.addEventListener("change", () => found.length && find()));
      root.querySelectorAll(".datefile").forEach((input) =>
        input.addEventListener("change", async () => {
          const file = input.files?.[0];
          input.value = "";
          if (!file) return;
          say(`Reading ${file.name}…`);
          try {
            const { readFile, rowsToText } = await import("../importer.js");
            const r = await readFile(file, (p) => say(`Reading the photo… ${p}%`));
            text.value = r.rows ? rowsToText(r.rows).replace(/\t/g, ", ") : r.text.trim();
            await find();
          } catch (err) {
            say(err.message || "Couldn't read that file.", "error");
          }
        }),
      );
    },
  };
}
