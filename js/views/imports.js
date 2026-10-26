// Upload or paste a program sheet / schedule, check what was read, then import it.
import { rpc } from "../api.js";
import { alert, badge, btn, esc, fmtTime, svg, title, toast } from "../ui.js";
import { dayLabel } from "./parts.js";

export const ACCEPT = ".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.pdf,.txt,image/*";

/** Upload / take photo / paste box. Everything ends up as editable text so mistakes can be fixed. */
export function readerBox(id, heading, sub) {
  return `<section class="card upl" id="${id}">
    <div class="uplhead"><span class="ticon t-sun">${svg("upload", 22)}</span><div><h2>${esc(heading)}</h2><p class="muted small">${esc(sub)}</p></div></div>
    <div class="uplbtns">
      <label class="btn direction"><input type="file" class="upfile" accept="${ACCEPT}" hidden>${svg("upload", 18)} Upload file</label>
      <label class="btn outline"><input type="file" class="upfile" accept="image/*" capture="environment" hidden>${svg("camera", 18)} Take photo</label>
    </div>
    <p class="muted small">Excel, Google Sheet, PDF, a photo of the printed sheet — or paste a WhatsApp message below. From Google Sheets you can also select the cells, copy and paste.</p>
    <label class="field"><span>Text that was read (you can fix it here)</span><textarea class="uptext" rows="6" placeholder="DAY 3 - 5/11&#10;Call 6.30 am&#10;Sc 46, 47 INT. House - Night 7:30-10:30 Cast: Hari, Meena"></textarea></label>
    <button type="button" class="btn soft wide upread">${svg("sparkle", 18)} Read it</button>
    <p class="form-msg upmsg" role="alert"></p>
    <div class="uppreview"></div>
  </section>`;
}

const rowsToTsv = (rows) =>
  rows
    .map((r) => r.map((c) => String(c ?? "").replace(/[\t\r\n]+/g, " ").trim()).join("\t"))
    .filter((l) => l.replace(/\t/g, "").trim())
    .join("\n");

/**
 * Wires a readerBox. ctx = {actors, departments, today}; opts.multi = whole schedule (days need dates);
 * opts.onImport(days, replace) saves and returns a message.
 */
export function bindReader(root, id, ctx, opts) {
  const box = root.querySelector(`#${id}`);
  if (!box) return;
  const text = box.querySelector(".uptext");
  const msg = box.querySelector(".upmsg");
  const out = box.querySelector(".uppreview");
  const say = (t, tone = "") => {
    msg.className = `form-msg upmsg ${tone}`;
    msg.textContent = t;
  };
  let parsed = null;

  const show = async () => {
    const { parseSchedule } = await import("../parse.js");
    parsed = parseSchedule(text.value, { ...ctx, singleDay: !opts.multi });
    if (!opts.multi && parsed.days.length > 1) {
      // One day's program sheet: put everything in one day.
      const first = parsed.days[0];
      parsed.days = [{ ...first, items: parsed.days.flatMap((d) => d.items), generalCall: parsed.days.find((d) => d.generalCall)?.generalCall || "", location: parsed.days.find((d) => d.location)?.location || "" }];
    }
    const scenes = parsed.days.reduce((n, d) => n + d.items.length, 0);
    if (!scenes) {
      out.innerHTML = "";
      return say("Couldn't find any scenes. Check that scene numbers are written like “Sc 12” or that the sheet has a Scene column.", "error");
    }
    say(`Found ${scenes} scene${scenes === 1 ? "" : "s"}${opts.multi ? ` over ${parsed.days.length} day${parsed.days.length === 1 ? "" : "s"}` : ""}. Check below, then save.`, "ok");
    out.innerHTML = preview(parsed, ctx, opts);
    wirePreview();
  };

  const wirePreview = () => {
    out.querySelectorAll("[data-save]").forEach((b) =>
      b.addEventListener("click", async () => {
        const days = collect();
        if (!days.length) return say("Tick at least one scene.", "error");
        if (opts.multi && days.some((d) => !d.date)) return say("Every day needs a date. Fill the empty date boxes.", "error");
        out.querySelectorAll("button").forEach((x) => (x.disabled = true));
        const label = b.innerHTML;
        b.textContent = "Saving…";
        try {
          const done = await opts.onImport(days, b.dataset.save === "replace");
          if (done) toast(done);
        } catch (e) {
          say(e.message || "Couldn't save.", "error");
          out.querySelectorAll("button").forEach((x) => (x.disabled = false));
          b.innerHTML = label;
        }
      }),
    );
  };

  const collect = () =>
    parsed.days
      .map((d, di) => {
        const g = (k) => out.querySelector(`[name="${k}_${di}"]`)?.value?.trim() || "";
        return {
          date: opts.multi ? g("date") : d.date,
          dayNumber: opts.multi && g("num") ? Number(g("num")) : d.dayNumber,
          label: d.label,
          location: g("loc"),
          generalCall: g("call"),
          items: d.items.filter((_, ii) => out.querySelector(`[name="use_${di}_${ii}"]`)?.checked).map(({ unknownCast, ...i }) => i),
        };
      })
      .filter((d) => d.items.length);

  box.querySelectorAll(".upfile").forEach((input) =>
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      out.innerHTML = "";
      say(`Reading ${file.name}…`);
      try {
        const { readFile } = await import("../importer.js");
        const r = await readFile(file, (p) => say(`Reading the photo… ${p}%`));
        text.value = r.rows ? rowsToTsv(r.rows) : r.text.trim();
        if (r.photo) say("Photo read. Photos are hard to read perfectly — please check the text and fix any mistakes.", "warn");
        await show();
        if (r.photo && parsed?.days?.length) say(`${msg.textContent} Photos can have mistakes — check the scene numbers and times.`, "ok");
      } catch (e) {
        say(e.message || "Couldn't read that file.", "error");
      }
    }),
  );
  box.querySelector(".upread").addEventListener("click", () => (text.value.trim() ? show() : say("Upload a file or paste some text first.", "error")));
}

function preview(parsed, ctx, opts) {
  const aname = Object.fromEntries(ctx.actors.map((a) => [a.id, a.name]));
  const dname = Object.fromEntries(ctx.departments.map((d) => [d.id, d.name]));
  const existing = new Map((ctx.days || []).map((d) => [String(d.date).slice(0, 10), d.dayNumber]));
  const unknown = [...new Set(parsed.days.flatMap((d) => d.items.flatMap((i) => i.unknownCast || [])))];
  return `${parsed.warnings.map((w) => alert(esc(w))).join("")}
    ${unknown.length ? alert(`Not in the artist list: <b>${esc(unknown.join(", "))}</b>. Add them under Artists first if they should get a call sheet, then read again.`, "Some names didn't match") : ""}
    ${parsed.days
      .map(
        (d, di) => `<div class="impday">
        ${
          opts.multi
            ? `<div class="grid2"><label class="field"><span>Date</span><input type="date" name="date_${di}" value="${esc(d.date)}"></label><label class="field"><span>Day no.</span><input type="number" min="1" inputmode="numeric" name="num_${di}" value="${esc(d.dayNumber ?? "")}" placeholder="auto"></label></div>
               ${d.date && existing.has(d.date) ? `<p class="small direction-text">Adds to Day ${existing.get(d.date)} (already in the schedule) as a draft.</p>` : d.date ? `<p class="small ok">New shoot day</p>` : ""}`
            : ""
        }
        <div class="grid2"><label class="field"><span>General call</span><input type="time" name="call_${di}" value="${esc(d.generalCall)}"></label><label class="field"><span>Location</span><input name="loc_${di}" value="${esc(d.location)}" placeholder="Keep as is"></label></div>
        ${d.items
          .map(
            (i, ii) => `<label class="impitem"><input type="checkbox" name="use_${di}_${ii}" checked>
            <span><b>Sc ${esc(i.scene)}${i.heading ? ` · ${esc(i.heading)}` : ""}</b>
              <small class="muted block">${i.start ? `${fmtTime(i.start)}${i.end ? `–${fmtTime(i.end)}` : ""}` : "Time TBC"}${i.location ? ` · ${esc(i.location)}` : ""}${i.pages ? ` · ${esc(i.pages)} pg` : ""}</small>
              ${i.castIds.length ? `<small class="block">Cast: ${esc(i.castIds.map((a) => aname[a]).join(", "))}</small>` : ""}
              ${i.unknownCast?.length ? `<small class="block danger-text">Not matched: ${esc(i.unknownCast.join(", "))}</small>` : ""}
              ${Object.keys(i.needs || {}).length ? `<small class="block">${Object.entries(i.needs).map(([k, v]) => `${esc(dname[k])}: ${esc(v)}`).join(" · ")}</small>` : ""}
            </span></label>`,
          )
          .join("")}
      </div>`,
      )
      .join("")}
    <div class="stack">${
      opts.multi
        ? btn(`Save to the schedule as drafts`, "direction wide", 'type="button" data-save="add"')
        : `${btn("Add these scenes to the draft", "direction wide", 'type="button" data-save="add"')}${btn("Replace all scenes in the draft", "outline wide", 'type="button" data-save="replace"')}`
    }
    <p class="muted small">Nothing goes to the crew until the Director or Co-director sends it.</p></div>`;
}

/** Page: upload a whole shooting schedule (many days at once). */
export async function uploadSchedule({ filmId, go }) {
  const ctx = await rpc("import_context", { p_film: filmId });
  return {
    html: `${title("Upload schedule", "Schedule")}<main class="page">
      ${readerBox("sched", "Your shooting schedule", "Every day and scene in one go. Days that don't exist yet are created.")}
      ${ctx.days.length ? `<section class="card"><p class="label">Already in the schedule</p><div class="chips">${ctx.days.map((d) => badge(dayLabel(d))).join("")}</div></section>` : ""}
    </main>`,
    bind(root) {
      bindReader(root, "sched", ctx, {
        multi: true,
        async onImport(days) {
          const r = await rpc("import_schedule", { p_film: filmId, p_days: days });
          go("schedule");
          return `Saved ${r.scenes} scenes over ${r.days} days${r.newDays ? ` (${r.newDays} new)` : ""}. Review each day and send.`;
        },
      });
    },
  };
}
