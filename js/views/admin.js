import { rpc } from "../api.js";
import { alert, avatar, badge, btn, checkbox, empty, esc, field, fmtStamp, fmtTenths, inr, onForm, select, toast, watermark } from "../ui.js";
import { recordsHeader } from "./crew.js";

const toPaise = (s) => {
  const n = Number(String(s || "").replace(/[,₹\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error("Enter the amount in rupees.");
  return Math.round(n * 100);
};

export async function contracts({ me, filmId, render }) {
  const list = await rpc("contracts_view", { p_film: filmId });
  const signed = list.filter((a) => a.contract?.signedOn).length;
  const ro = me.film.readOnly;
  return {
    html: `${watermark(me)}${recordsHeader(me, "Artists & contracts", "contracts")}<main class="page">
      <div class="chips">${badge("Producer only", "dark")}${badge(`${list.length} artists`)}${badge(`${signed} signed`, "dept")}${list.length - signed ? badge(`${list.length - signed} unsigned`, "danger") : ""}</div>
      <p class="muted small">Per-day amounts use approved (locked) crew lists only: call sheets worked × rate.</p>
      ${list.length ? "" : empty("Add actors under People first.")}
      ${list
        .map((a) => {
          const c = a.contract;
          const earned = c ? (c.deal === "per_day" ? Math.round((Number(c.ratePaise || 0) * Number(a.tenths)) / 10) : Number(c.totalPaise || 0)) : 0;
          const balance = earned - Number(a.paidPaise);
          return `<section class="card ${c && !c.signedOn ? "strong-danger" : ""}">
            <div class="row"><b>${esc(a.name)}${a.character ? ` <span class="muted">· “${esc(a.character)}”</span>` : ""}</b>${c ? badge(c.deal === "per_day" ? "Per day" : "Package", c.deal === "per_day" ? "everyone" : "direction") : ""}</div>
            ${!c ? `<p class="danger-text">No contract entered</p>` : `
              <p class="${c.signedOn ? "ok" : "danger-text"} small"><b>${c.signedOn ? `Contract signed · ${esc(c.signedOn)}` : `Contract not signed · ${fmtTenths(a.tenths)} call sheets shot`}</b></p>
              <div class="soft">
                ${c.deal === "per_day" ? `<div class="line"><span>Call sheets worked (approved days)</span><b>${fmtTenths(a.tenths)}</b></div><div class="line"><span>Rate per call sheet</span><b>${inr(c.ratePaise)}</b></div><div class="line"><span>Earned so far</span><b>${inr(earned)}</b></div>` : `<div class="line"><span>Package total</span><b>${inr(c.totalPaise)}</b></div>`}
                <div class="line"><span>Paid</span><b>${inr(a.paidPaise)}</b></div>
                <div class="line total"><span><b>Balance due</b></span><b class="${balance > 0 ? "danger-text" : "ok"}">${inr(balance)}</b></div>
              </div>
              ${ro ? "" : `<details><summary class="blue-text"><b>Record payment</b></summary><form class="pay stack" data-id="${esc(c.id)}">
                ${field("Amount (₹)", "amount", { required: true, attrs: 'inputmode="decimal"' })}${field("Paid on", "paidOn", { type: "date", value: me.today, required: true })}${field("Reference", "ref", { attrs: 'placeholder="UTR / cheque no."' })}${btn("Save payment", "primary wide")}</form></details>`}`}
            ${ro ? "" : `<details><summary class="muted"><b>${c ? "Edit contract" : "Add contract"}</b></summary><form class="deal stack" data-id="${esc(a.memberId)}">
              ${select("Deal", "deal", [["per_day", "Per day (per call sheet)"], ["package", "Package"]], c?.deal || "per_day")}
              ${field("Amount (₹) — day rate or package total", "amount", { required: true, value: c ? Number((c.deal === "per_day" ? c.ratePaise : c.totalPaise) || 0) / 100 : "", attrs: 'inputmode="decimal"' })}
              ${field("Signed on (leave empty if not signed)", "signedOn", { type: "date", value: c?.signedOn || "" })}
              ${field("Notes", "notes", { value: c?.notes || "" })}
              ${btn("Save contract", "dark wide")}</form></details>`}
          </section>`;
        })
        .join("")}
    </main>`,
    bind(root) {
      onForm(root, ".deal", async (fd, form) => {
        await rpc("save_contract", { p_member: form.dataset.id, p_deal: fd.get("deal"), p_amount_paise: toPaise(fd.get("amount")), p_signed_on: fd.get("signedOn") || null, p_notes: fd.get("notes") });
        render();
      });
      onForm(root, ".pay", async (fd, form) => {
        await rpc("record_payment", { p_contract: form.dataset.id, p_amount_paise: toPaise(fd.get("amount")), p_paid_on: fd.get("paidOn"), p_reference: fd.get("ref") });
        render();
      });
    },
  };
}

const ORDER = ["producer", "executive_producer", "production_manager", "production_team", "director", "co_director", "first_ad", "second_ad", "direction_intern", "department_head", "department_crew", "actor"];
const GROUPS = [
  ["Producers & production office", ["producer", "executive_producer", "production_manager", "production_team"]],
  ["Direction team", ["director", "co_director", "first_ad", "second_ad", "direction_intern"]],
  ["Departments", ["department_head", "department_crew"]],
  ["Actors", ["actor"]],
];

function channelSwitches(p, x) {
  // Per-person channel overrides: Role default / Unlock / Lock.
  const groups = {};
  for (const c of p.caps) (groups[c.group] ||= []).push(c);
  return `<form class="chan stack" data-id="${esc(x.id)}"><p><b>Channels for ${esc(x.name)}</b></p>
    <p class="muted small">“Role default” follows the Channels & access screen. Unlock or lock to make an exception for this person.</p>
    ${Object.entries(groups)
      .map(
        ([g, cs]) => `<p class="label">${esc(g)}</p>${cs
          .map((c) => {
            const o = x.overrides?.[c.cap];
            const v = o === true ? "on" : o === false ? "off" : "";
            const eff = x.effective?.includes(c.cap);
            return `<label class="chanrow"><span>${esc(c.label)}<small class="${eff ? "ok" : "muted"}">${eff ? "Unlocked" : "Locked"}</small></span>
              <select name="${esc(c.cap)}"><option value="" ${v === "" ? "selected" : ""}>Role default</option><option value="on" ${v === "on" ? "selected" : ""}>Unlock</option><option value="off" ${v === "off" ? "selected" : ""}>Lock</option></select></label>`;
          })
          .join("")}`,
      )
      .join("")}
    ${btn("Save channels", "dark wide")}</form>`;
}

export async function people({ me, filmId, render }) {
  const p = await rpc("people_view", { p_film: filmId });
  const ro = me.film.readOnly;
  const appUrl = location.origin + location.pathname;
  return {
    html: `${recordsHeader(me, "People & codes", "people")}<main class="page">
      ${
        p.canManage && !ro
          ? `<details class="card add-scene" id="addbox"><summary><b>+ Add a person</b></summary><form id="add" class="stack">
              ${field("Name", "name", { required: true })}
              ${select("Role", "role", p.assignable.map((a) => [a.role, a.label]), p.assignable.some((a) => a.role === "department_crew") ? "department_crew" : p.assignable[0]?.role)}
              ${select("Department (crew and heads)", "departmentId", [["", "—"], ...p.departments.map((d) => [d.id, d.name])])}
              ${field("Character (actors)", "character")}
              ${field("Mobile number", "phone", { type: "tel", attrs: 'placeholder="+91 98400 00000"' })}
              ${field("Access ends (required for interns)", "accessEndsOn", { type: "date" })}
              ${btn("Add &amp; create sign-up code", "primary wide")}
            </form></details>`
          : ""
      }
      ${GROUPS.map(([g, roles]) => {
        const list = p.members.filter((x) => roles.includes(x.role)).sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
        if (!list.length) return "";
        return `<section class="card"><p class="label">${esc(g)}</p>${list
          .map((x) => {
            const share = x.code
              ? `https://wa.me/${(x.phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(
                  `${me.film.title}: your ${x.code.purpose === "reset" ? "password reset" : "sign-up"} code is ${x.code.code}. Open ${appUrl}#/join and enter it. It works once and expires in 7 days.`,
                )}`
              : "";
            return `<div class="person">
              <div class="row"><span class="who-line">${avatar(x.name)}<span><b class="${x.active ? "" : "struck"}">${esc(x.name)}</b><small class="muted block">${esc(x.roleLabel)}${x.department ? ` · ${esc(x.department)}` : ""}${x.character ? ` · “${esc(x.character)}”` : ""}${x.accessEndsOn ? ` · until ${esc(x.accessEndsOn)}` : ""}${x.phone ? ` · ${esc(x.phone)}` : ""}</small></span></span>
                ${!x.active ? badge("Removed", "danger") : x.joined ? badge("Joined", "dept") : badge("Not joined", "warn")}</div>
              ${x.code ? `<div class="codebox"><span>${x.code.purpose === "reset" ? "Reset code" : "Sign-up code"} · works once</span><b>${esc(x.code.code)}</b></div>${x.manageable && !ro ? `<a class="btn dark wide small" target="_blank" rel="noreferrer" href="${share}">Send code on WhatsApp</a>` : ""}` : ""}
              ${
                (x.manageable || (p.isProducer && x.role !== "producer")) && !ro
                  ? `<details><summary class="blue-text"><b>Manage</b></summary><div class="stack">
                    ${
                      x.manageable
                        ? `<form class="code">${'<input type="hidden" name="id" value="' + esc(x.id) + '">'}${btn(x.joined ? "New password reset code" : "New sign-up code", "outline wide")}</form>
                      <form class="upd stack soft" data-id="${esc(x.id)}">
                        ${checkbox("Allow screenshots (no name watermark)", "shots", x.allowScreenshots)}
                        ${field("Mobile number", "phone", { type: "tel", value: x.phone || "" })}
                        ${field("Access ends", "accessEndsOn", { type: "date", value: x.accessEndsOn || "" })}
                        ${btn("Save", "dark wide")}
                      </form>`
                        : ""
                    }
                    ${p.isProducer && x.role !== "producer" ? channelSwitches(p, x) : ""}
                    ${x.manageable && !x.isMe ? `<form class="rm" data-id="${esc(x.id)}">${btn("Remove from this film", "danger wide")}</form>` : ""}
                  </div></details>`
                  : ""
              }
            </div>`;
          })
          .join("")}</section>`;
      }).join("")}
    </main>`,
    bind(root) {
      onForm(root, "#add", async (fd) => {
        const r = await rpc("add_person", { p_film: filmId, p: Object.fromEntries(fd.entries()) });
        toast(`${r.name} added. Sign-up code: ${r.code}`);
        render();
      });
      onForm(root, ".code", async (fd) => {
        const r = await rpc("issue_code", { p_member: fd.get("id") });
        toast(`${r.purpose === "reset" ? "Password reset" : "Sign-up"} code: ${r.code}`);
        render();
      });
      onForm(root, ".upd", async (fd, form) => {
        await rpc("update_member", { p_member: form.dataset.id, p: { phone: fd.get("phone"), accessEndsOn: fd.get("accessEndsOn"), allowScreenshots: fd.get("shots") === "on" } });
        return "Saved.";
      });
      onForm(root, ".chan", async (fd, form) => {
        const x = p.members.find((m) => m.id === form.dataset.id);
        for (const c of p.caps) {
          const v = fd.get(c.cap);
          const want = v === "on" ? true : v === "off" ? false : null;
          const had = x.overrides?.[c.cap] ?? null;
          if (want !== had) await rpc("set_member_access", { p_member: x.id, p_cap: c.cap, p_allowed: want });
        }
        toast("Channels saved.");
        render();
      });
      onForm(root, ".rm", async (_, form) => {
        if (!confirm("Remove this person from the film? Their access ends immediately.")) return;
        await rpc("remove_person", { p_member: form.dataset.id });
        render();
      });
    },
  };
}

export async function access({ me, filmId, render }) {
  const m = await rpc("access_matrix", { p_film: filmId });
  const sel = new URLSearchParams(location.hash.split("?")[1] || "").get("role") || "first_ad";
  const role = m.roles.find((r) => r.role === sel) || m.roles[0];
  const groups = {};
  for (const c of m.caps) (groups[c.group] ||= []).push(c);
  return {
    html: `${recordsHeader(me, "Channels & access", "access")}<main class="page">
      <p class="muted">Every channel always exists. You (the producer) see all of them. Pick a role to choose which channels are unlocked for everyone with that role. To make an exception for one person, use <b>People → Manage</b>.</p>
      <label class="field"><span>Role</span><select id="role">${m.roles.map((r) => `<option value="${esc(r.role)}" ${r.role === role.role ? "selected" : ""}>${esc(r.label)}</option>`).join("")}</select></label>
      <form id="f" class="stack">
        ${Object.entries(groups)
          .map(
            ([g, cs]) => `<section class="card"><p class="label">${esc(g)}</p>${cs
              .map((c) => {
                const def = role.defaults.includes(c.cap);
                const o = role.overrides[c.cap];
                const on = o ?? def;
                return `<label class="toggle"><span>${esc(c.label)}${o !== undefined && o !== def ? `<small class="warn-text">changed from default (${def ? "on" : "off"})</small>` : ""}</span>
                  <input type="checkbox" name="${esc(c.cap)}" ${on ? "checked" : ""} role="switch"></label>`;
              })
              .join("")}</section>`,
          )
          .join("")}
        ${btn(`Save for ${esc(role.label)}`, "dark wide")}
        <button type="button" class="linkish" id="reset">Reset ${esc(role.label)} to defaults</button>
      </form>
      ${alert("Changes apply straight away to everyone with this role, unless you've made an exception for a person.", "", "info")}
    </main>`,
    bind(root) {
      root.querySelector("#role").addEventListener("change", (e) => (location.hash = `#/access?role=${e.target.value}`));
      onForm(root, "#f", async (fd) => {
        for (const c of m.caps) {
          const want = fd.get(c.cap) === "on";
          const def = role.defaults.includes(c.cap);
          const cur = role.overrides[c.cap];
          const next = want === def ? null : want;
          if ((cur ?? null) !== next) await rpc("set_role_access", { p_film: filmId, p_role: role.role, p_cap: c.cap, p_allowed: next });
        }
        toast(`Saved for ${role.label}.`);
        render();
      });
      root.querySelector("#reset").addEventListener("click", async () => {
        for (const cap of Object.keys(role.overrides)) await rpc("set_role_access", { p_film: filmId, p_role: role.role, p_cap: cap, p_allowed: null });
        toast("Back to defaults.");
        render();
      });
    },
  };
}

const ACTIONS = {
  company_created: "Created the company", film_created: "Created the film", joined_with_code: "Joined with a sign-up code",
  password_reset: "Reset their password", person_added: "Added a person", person_removed: "Removed a person",
  access_changed: "Changed someone's settings", join_code_issued: "Issued a sign-up code", reset_code_issued: "Issued a password reset code",
  channel_changed_for_role: "Changed a channel for a role", channel_changed_for_person: "Changed a channel for a person",
  day_created: "Added a shoot day", program_draft_edited: "Edited a program sheet draft", program_sent: "Sent a program sheet version",
  notice_posted: "Posted a notice", crew_list_started: "Started a crew list", crew_entry_added: "Added someone to a crew list",
  marked_absent: "Marked someone as didn't come", marked_present: "Marked someone as present", released_early: "Released someone early",
  crew_list_sent_for_approval: "Sent a crew list for approval", crew_list_approved_pm: "Approved a crew list (PM)",
  crew_list_approved_ep: "Approved and locked a crew list (EP)", crew_list_sent_back_pm: "Sent a crew list back (PM)",
  crew_list_sent_back_ep: "Sent a crew list back (EP)", crew_list_reopened: "Reopened a locked crew list",
  contract_saved: "Saved a contract", payment_recorded: "Recorded a payment",
};

export async function audit({ me, filmId }) {
  const rows = await rpc("audit_view", { p_film: filmId });
  return {
    html: `${recordsHeader(me, "Change log", "audit")}<main class="page tight">
      <p class="muted small">Every change, newest first. Nobody can edit or delete this log.</p>
      ${rows.length ? "" : empty("Nothing yet.")}
      ${rows
        .map(
          (r) => `<div class="logrow">${avatar(r.who, "sm")}<div><p><b>${esc(ACTIONS[r.action] ?? r.action)}</b>${r.after?.channel ? ` <span class="muted">(${esc(r.after.channel)} → ${r.after.allowed === null ? "default" : r.after.allowed ? "unlocked" : "locked"})</span>` : ""}</p><p class="muted small">${esc(r.who)} · ${fmtStamp(r.at)}</p></div></div>`,
        )
        .join("")}
    </main>`,
  };
}
