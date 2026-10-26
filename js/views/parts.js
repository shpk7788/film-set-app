import { rpc } from "../api.js";
import { alert, badge, esc, fmtStamp, fmtTime, svg } from "../ui.js";

export const has = (me, cap) => me.caps.includes(cap);
export const anySchedule = (me) => has(me, "schedule.all") || has(me, "schedule.today") || has(me, "schedule.tomorrow");

export function changedBox(version, summary, sentAt) {
  if (!version || version <= 1 || !summary?.length) return "";
  return alert(`<ul class="plain">${summary.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`, `Updated ${fmtStamp(sentAt)} · version ${version}`);
}

/** A department's or actor's own call sheet. */
export function sliceView(slice) {
  if (!slice) return "";
  const notes = slice.notes ? `<p class="muted pre">${esc(slice.notes)}</p>` : "";
  const cut = (slice.cutItems || [])
    .map((i) => `<p class="muted"><s>Sc ${esc(i.scene)}</s> — cancelled${i.cutReason ? ` (${esc(i.cutReason)})` : ""}${slice.kind === "department" ? ", not needed" : ""}</p>`)
    .join("");
  if (slice.kind === "department") {
    return `<section class="hero blue"><p class="hlabel">${esc(slice.department)} crew call</p><p class="huge">${fmtTime(slice.callTime)}</p><p>${esc(slice.location || "Location to be confirmed")}</p></section>
      <section class="card"><p class="label">What ${esc(slice.department)} needs</p>
        ${slice.items.length ? "" : `<p class="muted">No scene-specific needs listed.</p>`}
        ${slice.items
          .map((i) => `<div class="item"><p><b>Sc ${esc(i.scene)}${i.heading ? ` · ${esc(i.heading)}` : ""}${i.start ? ` · ${fmtTime(i.start)}` : ""}</b></p><p>${esc(i.need)}</p></div>`)
          .join("")}
        ${cut ? `<div class="sep">${cut}</div>` : ""}${notes}
      </section>`;
  }
  const t = slice.times || {};
  return `<section class="hero sun">${slice.character ? `<p class="hlabel">${slice.name ? `${esc(slice.name)} · ` : ""}Playing “${esc(slice.character)}”</p>` : `<p class="hlabel">Your call</p>`}
      ${t.onSet ? `<p class="huge">${fmtTime(t.onSet)}</p><p>Ready on set</p>` : `<p class="big2">Time to be confirmed</p><p>You'll get an update when it's set</p>`}
      <div class="stats3"><div><b>${fmtTime(t.pickup)}</b><small>Car pickup</small></div><div><b>${fmtTime(t.makeup)}</b><small>Makeup</small></div><div><b>${esc(String(slice.items.length))}</b><small>Scenes</small></div></div></section>
    <section class="card"><p class="label">Your scenes</p>
      ${slice.items.map((i) => `<p><b>Sc ${esc(i.scene)}${i.heading ? ` · ${esc(i.heading)}` : ""}${i.pages ? ` · ${esc(i.pages)} pg` : ""}</b></p>`).join("") || `<p class="muted">No scenes listed.</p>`}
      ${t.costume ? `<p class="label">Costume</p><p>${esc(t.costume)}</p>` : ""}
      <p class="label">Location</p><p>${esc(slice.location || "To be confirmed")}</p>${cut}${notes}
    </section>`;
}

export function gotIt(confirmed, versionId) {
  if (confirmed) return `<p class="confirmed">${svg("check", 22)} You confirmed this version</p>`;
  return `<button class="btn dept wide xl gotit" data-confirm="${esc(versionId)}">${svg("check", 24)} Got it</button>`;
}

export function bindGotIt(root, render) {
  root.querySelectorAll("[data-confirm]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await rpc("confirm_version", { p_version: b.dataset.confirm });
        celebrate(b);
        setTimeout(render, 650);
      } catch (e) {
        b.disabled = false;
        b.insertAdjacentHTML("afterend", `<p class="form-msg error">${esc(e.message)}</p>`);
      }
    }),
  );
}

/** A small burst of colour on success — makes confirming feel good. */
export function celebrate(el) {
  try { navigator.vibrate?.(18); } catch {}
  el.classList.add("done");
  el.innerHTML = `${svg("check", 24)} Done!`;
  const colors = ["#4338ca", "#7c3aed", "#db2777", "#f97362", "#f59e0b", "#16a34a", "#0284c7"];
  for (let i = 0; i < 18; i++) {
    const s = document.createElement("i");
    s.className = "spark";
    const a = (i / 18) * Math.PI * 2;
    const d = 70 + Math.random() * 60;
    s.style.cssText = `--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d * 0.7}px;background:${colors[i % colors.length]};transform:rotate(${i * 20}deg)`;
    el.append(s);
  }
}

export function noticeCard(n, canPost, memberCount) {
  return `<div class="notice">
    <p class="ntag">${n.important ? "IMPORTANT · " : ""}${fmtStamp(n.createdAt)}${n.author ? ` · ${esc(n.author)}` : ""}</p>
    <p class="pre">${esc(n.text)}</p>
    ${n.important && canPost && n.gotCount != null ? `<p class="muted small">${n.gotCount} of ${memberCount} have tapped Got it</p>` : ""}
    ${n.important ? (n.mine ? `<p class="ok small"><b>✓ Got it</b></p>` : `<button class="btn soft small" data-notice="${esc(n.id)}">Got it</button>`) : ""}
  </div>`;
}

export function bindNotices(root, render) {
  root.querySelectorAll("[data-notice]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      await rpc("confirm_notice", { p_notice: b.dataset.notice }).catch(() => (b.disabled = false));
      render();
    }),
  );
}

export const dayLabel = (d) => `Day ${d.dayNumber} · ${new Date(`${String(d.date).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}`;
export const statusBadge = (s) =>
  ({ draft: badge("Draft"), awaiting_pm: badge("Waiting for PM", "warn"), awaiting_ep: badge("PM approved · waiting for EP", "warn"), locked: badge("Approved & locked", "dept") })[s] ?? badge("Not started");
