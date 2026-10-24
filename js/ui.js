// Small helpers for building screens as HTML strings. Everything shown from the database goes through esc().
export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
export function fmtTime(hhmm) {
  if (!hhmm) return "—";
  const [h, m] = String(hhmm).split(":").map(Number);
  if (Number.isNaN(h)) return esc(hhmm);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m ?? 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
export function fmtStamp(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
export const fmtTenths = (t) => (Number(t) % 10 === 0 ? String(Number(t) / 10) : (Number(t) / 10).toFixed(1));
export const inr = (paise) => `₹ ${(Number(paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const icon = {
  home: '<path d="M3 11 12 4l9 7v9H3z"/>',
  schedule: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  records: '<path d="M4 5h16v14H4z"/><path d="M4 10h16M9 5v14"/>',
  inbox: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
};
export const svg = (name, size = 24) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon[name]}</svg>`;

export const title = (t, eyebrow = "", extra = "") =>
  `<header class="ptitle">${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ""}<h1>${esc(t)}</h1>${extra}</header>`;

export const field = (label, name, opts = {}) => {
  const { type = "text", value = "", hint = "", required = false, attrs = "" } = opts;
  return `<label class="field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} ${attrs}>${hint ? `<small>${esc(hint)}</small>` : ""}</label>`;
};
export const textarea = (label, name, value = "", attrs = "") =>
  `<label class="field"><span>${esc(label)}</span><textarea name="${name}" rows="3" ${attrs}>${esc(value)}</textarea></label>`;
export const select = (label, name, options, value = "") =>
  `<label class="field"><span>${esc(label)}</span><select name="${name}">${options
    .map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`)
    .join("")}</select></label>`;
export const checkbox = (label, name, checked = false, value = "on") =>
  `<label class="check"><input type="checkbox" name="${name}" value="${esc(value)}" ${checked ? "checked" : ""}> <span>${esc(label)}</span></label>`;
export const btn = (label, tone = "primary", attrs = "") => `<button class="btn ${tone}" ${attrs}>${label}</button>`;
export const link = (label, href, tone = "primary") => `<a class="btn ${tone}" href="${href}">${label}</a>`;
export const badge = (t, tone = "neutral") => `<span class="badge ${tone}">${esc(t)}</span>`;
export const empty = (t) => `<p class="empty">${t}</p>`;
export const alert = (body, heading = "", tone = "warn") =>
  `<div class="alert ${tone}">${heading ? `<p class="alert-h">${esc(heading)}</p>` : ""}<div>${body}</div></div>`;

/** Faint name + time watermark. A web page can't block screenshots; this makes leaks traceable. */
export function watermark(me) {
  if (!me || me.member.allowScreenshots) return "";
  const line = esc(`${me.member.name} · ${me.member.roleLabel} · ${fmtStamp(Date.now())}`);
  const row = `${line}      ${line}      ${line}      ${line}`;
  return `<div class="wm" aria-hidden="true"><div>${Array.from({ length: 14 }, () => `<p>${row}</p>`).join("")}</div></div>`;
}

export function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

/**
 * Wires a form to an async handler. Typed values are kept if the handler throws (the error is shown
 * in the form); the button is disabled while saving. Return a string from the handler to show it as
 * a success message.
 */
export function onForm(root, selector, handler, { reset = false } = {}) {
  root.querySelectorAll(selector).forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitter = e.submitter;
      const fd = new FormData(form, submitter);
      let msg = form.querySelector(".form-msg");
      if (!msg) {
        msg = document.createElement("p");
        msg.className = "form-msg";
        msg.setAttribute("role", "alert");
        form.prepend(msg);
      }
      msg.className = "form-msg";
      msg.textContent = "";
      const buttons = [...form.querySelectorAll("button")];
      buttons.forEach((b) => (b.disabled = true));
      const label = submitter?.innerHTML;
      if (submitter) submitter.textContent = "Please wait…";
      try {
        const ok = await handler(fd, form, submitter);
        if (typeof ok === "string" && form.isConnected) {
          msg.className = "form-msg ok";
          msg.textContent = ok;
          if (reset) form.reset();
        }
      } catch (err) {
        msg.className = "form-msg error";
        msg.textContent = err.message || "Something went wrong.";
      } finally {
        if (form.isConnected) {
          buttons.forEach((b) => (b.disabled = false));
          if (submitter) submitter.innerHTML = label;
        }
      }
    });
  });
}

export const obj = (fd) => Object.fromEntries(fd.entries());
