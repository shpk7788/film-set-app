// Turns schedules and actor date lists — from Excel, PDF, photos or WhatsApp text — into structured data.
// Pure functions only (no browser APIs) so they can be tested on their own.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthOf = (w) => {
  const i = MONTHS.indexOf(String(w).toLowerCase().slice(0, 3));
  return i >= 0 && /^[a-z]+$/i.test(w) && (w.length === 3 || w.length >= 3) ? i + 1 : 0;
};
const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const valid = (y, m, d) => {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const fullYear = (y) => (y < 100 ? 2000 + y : y);

/** Dates with no year: use this year, or next year if that date is well in the past. */
function guessYear(m, d, today) {
  const t = new Date(`${today}T00:00:00Z`);
  let y = t.getUTCFullYear();
  if (valid(y, m, d) && Date.UTC(y, m - 1, d) < t.getTime() - 60 * 864e5) y += 1;
  return y;
}

function clean(text) {
  return String(text ?? "")
    .replace(/[–—−]/g, "-")
    .replace(/(\d)(st|nd|rd|th)\b/gi, "$1")
    .replace(/\s+(to|till|until|thru|through)\s+/gi, " - ");
}

/** One date written any common way (Indian day-first for numbers). Returns YYYY-MM-DD or null. */
export function parseDate(token, today) {
  const s = clean(token).trim().replace(/,/g, " ").replace(/\s+/g, " ");
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return valid(+m[1], +m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : null;
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/))) {
    const d = +m[1], mo = +m[2], y = m[3] ? fullYear(+m[3]) : guessYear(mo, d, today);
    return valid(y, mo, d) ? iso(y, mo, d) : null;
  }
  if ((m = s.match(/^(\d{1,2}) ([a-z]+)\.?(?: (\d{2,4}))?$/i)) && monthOf(m[2])) {
    const d = +m[1], mo = monthOf(m[2]), y = m[3] ? fullYear(+m[3]) : guessYear(mo, d, today);
    return valid(y, mo, d) ? iso(y, mo, d) : null;
  }
  if ((m = s.match(/^([a-z]+)\.? (\d{1,2})(?: (\d{2,4}))?$/i)) && monthOf(m[1])) {
    const mo = monthOf(m[1]), d = +m[2], y = m[3] ? fullYear(+m[3]) : guessYear(mo, d, today);
    return valid(y, mo, d) ? iso(y, mo, d) : null;
  }
  return null;
}

function addDays(isoDate, n) {
  const t = new Date(`${isoDate}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
function range(a, b) {
  if (!a || !b || b < a) return a ? [a] : [];
  const out = [];
  for (let d = a; d <= b && out.length < 366; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Every date mentioned in a message like "Nov 3-7, 12, 15 to 18 and Dec 2" or "03/11/2026 - 07/11/2026".
 * Returns sorted, unique YYYY-MM-DD strings.
 */
export function parseDates(text, today) {
  let s = clean(text).toLowerCase();
  const found = new Set();
  const add = (list) => list.forEach((d) => d && found.add(d));
  // Year mentioned anywhere applies to dates written without one.
  const yearHit = s.match(/\b(20\d{2})\b/);
  const yearFor = (mo, d) => (yearHit ? +yearHit[1] : guessYear(mo, d, today));

  // ISO dates (and ranges)
  s = s.replace(/(\d{4}-\d{1,2}-\d{1,2})(?:\s*-\s*(\d{4}-\d{1,2}-\d{1,2}))?/g, (_, a, b) => {
    add(b ? range(parseDate(a, today), parseDate(b, today)) : [parseDate(a, today)]);
    return " ";
  });
  // Numeric day-first dates: 3/11, 03.11.2026, 3/11/26 (and ranges "3/11 - 7/11")
  const num = /(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?/;
  s = s.replace(new RegExp(`${num.source}(?:\\s*-\\s*${num.source})?`, "g"), (_, d1, m1, y1, d2, m2, y2) => {
    const a = valid(y1 ? fullYear(+y1) : yearFor(+m1, +d1), +m1, +d1) ? iso(y1 ? fullYear(+y1) : yearFor(+m1, +d1), +m1, +d1) : null;
    if (d2) {
      const b = valid(y2 ? fullYear(+y2) : yearFor(+m2, +d2), +m2, +d2) ? iso(y2 ? fullYear(+y2) : yearFor(+m2, +d2), +m2, +d2) : null;
      add(range(a, b));
    } else add([a]);
    return " ";
  });

  // Month names with day numbers before or after: "nov 3-7, 12" / "3 - 7 november" / "3, 4 & 5 dec"
  const tokens = [...s.matchAll(/([a-z]{3,})|(\d{1,2})(?:\s*-\s*(\d{1,2}))?/g)].map((t) =>
    t[1] ? { month: monthOf(t[1]) } : { a: +t[2], b: t[3] ? +t[3] : null },
  );
  let lastMonth = 0;
  tokens.forEach((t, i) => {
    if (t.month !== undefined) {
      if (t.month) lastMonth = t.month;
      return;
    }
    // Prefer a month name right after the numbers ("3-7 nov"), else the last one seen, else the next one.
    const next = tokens.slice(i + 1).find((x) => x.month !== undefined && x.month);
    const nextIsMonth = tokens[i + 1]?.month;
    const mo = nextIsMonth || lastMonth || next?.month || 0;
    if (!mo) return;
    const y = yearFor(mo, t.a);
    if (!valid(y, mo, t.a)) return;
    if (t.b && t.b >= t.a && valid(y, mo, t.b)) add(range(iso(y, mo, t.a), iso(y, mo, t.b)));
    else if (t.b && t.b < t.a) {
      // "28-3 dec" style runs across a month end: from the 28th of the previous month
      const pm = mo === 1 ? 12 : mo - 1, py = mo === 1 ? y - 1 : y;
      if (valid(py, pm, t.a) && valid(y, mo, t.b)) add(range(iso(py, pm, t.a), iso(y, mo, t.b)));
    } else add([iso(y, mo, t.a)]);
  });
  return [...found].sort();
}

/** "7:30", "7.30 am", "19:00", "7 pm" → "HH:MM", or "". */
export function parseTime(raw) {
  const m = String(raw ?? "").trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i);
  if (!m) return "";
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const ap = (m[3] || "").toLowerCase().replace(/\./g, "");
  if (!m[2] && !ap) return "";
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : "";
}

const TIME_RX = /(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)\s*(?:-|to)\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)|(\d{1,2}[:.]\d{2}\s*(?:am|pm|a\.m\.|p\.m\.)?|\d{1,2}\s*(?:am|pm))/i;

function timesIn(text) {
  const m = clean(text).match(TIME_RX);
  if (!m) return { start: "", end: "" };
  if (m[1]) {
    let a = m[1].trim(), b = m[2].trim();
    // "7:30-10:30 am" → both am
    const apB = b.match(/(am|pm)/i)?.[1];
    if (apB && !/(am|pm)/i.test(a)) a += ` ${apB}`;
    return { start: parseTime(a), end: parseTime(b) };
  }
  return { start: parseTime(m[3]), end: "" };
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9஀-௿ఀ-౿ऀ-ॿ ]/g, " ").replace(/\s+/g, " ").trim();

/** Finds actors by full name, first name or character name. */
export function matchCast(names, actors) {
  const ids = new Set();
  const unknown = [];
  for (const raw of names) {
    const n = norm(raw);
    if (!n || n.length < 2) continue;
    const hit = actors.find((a) => {
      const full = norm(a.name), first = full.split(" ")[0], ch = norm(a.character);
      return n === full || n === first || (ch && n === ch) || (n.length > 3 && (full.includes(n) || (ch && ch.includes(n))));
    });
    if (hit) ids.add(hit.id);
    else unknown.push(String(raw).trim());
  }
  return { ids: [...ids], unknown };
}

/** Actors whose name or character appears anywhere in a line of text. */
function castInLine(line, actors) {
  const l = ` ${norm(line)} `;
  return actors
    .filter((a) => {
      const full = norm(a.name), ch = norm(a.character);
      return (full && l.includes(` ${full} `)) || (ch && ch.length > 2 && l.includes(` ${ch} `)) || (full.split(" ")[0].length > 3 && l.includes(` ${full.split(" ")[0]} `));
    })
    .map((a) => a.id);
}

const splitNames = (s) => String(s ?? "").split(/\s*(?:,|\/|&|\+|;|\band\b|\n)\s*/i).map((x) => x.trim()).filter(Boolean);

const HEADERS = {
  scene: /^(sc|scn|sc\.? ?no\.?|scene|scene ?no\.?|scene ?#|scenes|#)$/i,
  date: /^(date|shoot ?date|dt)$/i,
  day: /^(day|day ?no\.?|shoot ?day|sd)$/i,
  heading: /(int|ext|i\/e|description|synopsis|scene ?desc|scene ?heading|set|heading|details)/i,
  location: /^(location|loc|place|spot|venue)$/i,
  time: /^(time|start|from|start ?time|timing|call)$/i,
  end: /^(end|to|till|end ?time|wrap)$/i,
  dn: /^(d\/n|day\/night|dn|d \/ n)$/i,
  cast: /(cast|artist|actor|character|char|artistes)/i,
  pages: /^(pages?|pgs?|pg\.?|length)$/i,
  notes: /(note|remark|requirement|props|special|extras|junior)/i,
};

function mapHeader(row, departments) {
  const map = {};
  row.forEach((cell, i) => {
    const h = String(cell ?? "").trim();
    if (!h) return;
    const dep = departments.find((d) => norm(d.name) === norm(h) || norm(h).startsWith(`${norm(d.name)} `));
    if (dep) {
      (map.needs ||= []).push({ i, dept: dep.id });
      return;
    }
    for (const [key, rx] of Object.entries(HEADERS)) {
      if (map[key] === undefined && rx.test(h)) {
        map[key] = i;
        return;
      }
    }
  });
  return map;
}

/**
 * Reads a table (rows of cells, first rows may be titles) into days of scenes.
 * ctx: { actors:[{id,name,character}], departments:[{id,name}], today, singleDay? }
 */
export function parseTable(rows, ctx) {
  const cells = rows.map((r) => r.map((c) => (c == null ? "" : String(c).trim())));
  let hi = -1, map = null;
  for (let i = 0; i < Math.min(cells.length, 15); i++) {
    const m = mapHeader(cells[i], ctx.departments || []);
    if (m.scene !== undefined && Object.keys(m).length >= 2) {
      hi = i;
      map = m;
      break;
    }
  }
  if (!map) return parseText(cells.map((r) => r.filter(Boolean).join("  ")).join("\n"), ctx);

  const days = [];
  const warnings = [];
  let cur = null;
  const startDay = (date, label, dayNumber) => {
    let d = days.find((x) => x.date && x.date === date);
    if (!d) {
      d = { date: date || "", label: label || (date ? date : "Day"), dayNumber: dayNumber || null, location: "", generalCall: "", items: [] };
      days.push(d);
    }
    cur = d;
  };
  for (const row of cells.slice(hi + 1)) {
    const filled = row.filter(Boolean);
    if (!filled.length) continue;
    const get = (k) => (map[k] !== undefined ? row[map[k]] || "" : "");
    const scene = get("scene");
    // A title row between days, e.g. "DAY 3 — 05/11/2026"
    if (!scene && filled.length <= 2) {
      const t = filled.join(" ");
      const dt = findDate(t, ctx.today);
      const dn = t.match(/\bday\s*[-:#]?\s*(\d{1,3})\b/i);
      if (dt || dn) startDay(dt, t, dn ? +dn[1] : null);
      continue;
    }
    if (!scene) continue;
    const dateCell = get("date");
    const dayCell = get("day");
    const dt = dateCell ? parseDate(dateCell, ctx.today) || findDate(dateCell, ctx.today) : "";
    const dn = String(dayCell).match(/(\d{1,3})/);
    if (dt && (!cur || cur.date !== dt)) startDay(dt, dateCell, dn ? +dn[1] : null);
    else if (!cur) startDay(ctx.singleDay ? "" : "", dayCell ? `Day ${dayCell}` : "Day", dn ? +dn[1] : null);
    const castCell = get("cast");
    const { ids, unknown } = castCell ? matchCast(splitNames(castCell), ctx.actors || []) : { ids: castInLine(row.join(" "), ctx.actors || []), unknown: [] };
    let start = parseTime(get("time")), end = parseTime(get("end"));
    if (!start && get("time")) ({ start, end } = timesIn(get("time")));
    const needs = {};
    for (const n of map.needs || []) if (row[n.i]) needs[n.dept] = row[n.i];
    const heading = [get("heading"), get("dn")].filter(Boolean).join(" – ");
    for (const sc of splitScenes(scene)) {
      cur.items.push({ scene: sc, heading, location: get("location"), start, end, pages: get("pages"), castIds: ids, unknownCast: unknown, needs, notes: get("notes") });
    }
  }
  if (days.some((d) => !d.date) && !ctx.singleDay) warnings.push("Some days have no date — set them before saving.");
  return { days: days.filter((d) => d.items.length), warnings };
}

function splitScenes(s) {
  return String(s)
    .split(/\s*(?:,|&|\/|\band\b|\+)\s*/i)
    .map((x) => x.replace(/^(sc(ene)?s?\.?\s*(no\.?)?\s*[-:#]?\s*)/i, "").trim())
    .filter((x) => /^\d{1,4}[a-z]?$/i.test(x));
}

/** First date found anywhere in a string. */
function findDate(text, today) {
  const t = clean(text);
  const m =
    t.match(/\d{4}-\d{1,2}-\d{1,2}/) ||
    t.match(/\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/) ||
    t.match(/\b\d{1,2}\s+[a-z]{3,}\.?(?:,?\s+\d{2,4})?\b/i) ||
    t.match(/\b[a-z]{3,}\.?\s+\d{1,2}(?:,?\s+\d{4})?\b/i);
  return m ? parseDate(m[0], today) : null;
}

/**
 * Reads free text (WhatsApp message, PDF text, photo OCR) into days of scenes.
 * Understands lines like "DAY 3 - 5/11", "Call 6.30 am", "Sc 46, 47 INT. House - Night 7:30-10:30 Cast: Hari, Meena".
 */
export function parseText(text, ctx) {
  const lines = clean(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const days = [];
  const warnings = [];
  let cur = null;
  const startDay = (date, label, dayNumber) => {
    cur = { date: date || "", label, dayNumber: dayNumber || null, location: "", generalCall: "", items: [] };
    days.push(cur);
  };
  for (const line of lines) {
    const sceneM =
      line.match(/\b(?:sc(?:ene)?s?\.?\s*(?:no\.?)?\s*[-:#]?\s*)(\d{1,4}[a-z]?(?:\s*(?:,|&|\/|and)\s*\d{1,4}[a-z]?)*)/i) ||
      line.match(/^\s*(\d{1,4}[a-z]?)[\s.)-]+(?=(?:int|ext|i\/e)\b)/i);
    const dayM = line.match(/\bday\s*[-:#]?\s*(\d{1,3})\b/i);
    const dt = findDate(line, ctx.today);
    if (!sceneM && (dayM || (dt && line.length < 40))) {
      startDay(dt, line, dayM ? +dayM[1] : null);
      continue;
    }
    if (!sceneM) {
      if (!cur) startDay("", "Day", null);
      const call = line.match(/\bcall(?:\s*time)?\s*[:-]?\s*(.+)$/i);
      if (call && !cur.generalCall) cur.generalCall = timesIn(call[1]).start;
      const loc = line.match(/^(?:location|loc|venue|place)\s*[:-]\s*(.+)$/i);
      if (loc && !cur.location) cur.location = loc[1].trim();
      continue;
    }
    if (!cur) startDay("", "Day", null);
    const rest = line.slice((sceneM.index || 0) + sceneM[0].length);
    const head = (rest.match(/\b((?:int|ext|i\/e)\.?[^0-9]*?)(?=\s*(?:\d{1,2}[:.]\d{2}|\d{1,2}\s*(?:am|pm)|cast\b|artists?\b|loc(?:ation)?\b|$))/i)?.[1] || "").replace(/[\s,;-]+$/, "").trim();
    const castM = line.match(/\b(?:cast|artists?|actors?|characters?)\s*[:-]\s*(.+?)(?=\s*\b(?:loc(?:ation)?|notes?|time)\s*[:-]|$)/i);
    const { ids, unknown } = castM ? matchCast(splitNames(castM[1]), ctx.actors || []) : { ids: castInLine(line, ctx.actors || []), unknown: [] };
    const locM = line.match(/\b(?:loc(?:ation)?|venue)\s*[:-]\s*([^,;]+)/i);
    const { start, end } = timesIn(rest);
    for (const sc of splitScenes(sceneM[1])) {
      cur.items.push({ scene: sc, heading: head, location: locM ? locM[1].trim() : "", start, end, pages: "", castIds: ids, unknownCast: unknown, needs: {}, notes: "" });
    }
  }
  if (days.some((d) => d.items.length && !d.date) && !ctx.singleDay) warnings.push("Some days have no date — set them before saving.");
  return { days: days.filter((d) => d.items.length), warnings };
}

/** Tab-separated text (copied from Excel / Google Sheets) → rows; otherwise null. */
export function asTable(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (lines.length >= 2 && lines.filter((l) => l.includes("\t")).length >= Math.ceil(lines.length * 0.6)) return lines.map((l) => l.split("\t"));
  return null;
}

/** Any input → { days, warnings }. */
export function parseSchedule(input, ctx) {
  if (Array.isArray(input)) return parseTable(input, ctx);
  const t = asTable(input);
  return t ? parseTable(t, ctx) : parseText(input, ctx);
}
