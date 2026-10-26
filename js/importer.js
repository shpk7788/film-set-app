// Reads uploaded files into rows or text. The heavy libraries load only when someone actually uploads.
import { parseDates, parseSchedule } from "./parse.js";

const CDN = "https://cdn.jsdelivr.net/npm";
let xlsxLib, pdfLib, ocrLib;

async function xlsx() {
  return (xlsxLib ||= import(`${CDN}/xlsx@0.18.5/xlsx.mjs`));
}
async function pdfjs() {
  if (!pdfLib) {
    pdfLib = import(`${CDN}/pdfjs-dist@4.10.38/build/pdf.min.mjs`).then((m) => {
      m.GlobalWorkerOptions.workerSrc = `${CDN}/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs`;
      return m;
    });
  }
  return pdfLib;
}
function tesseract() {
  return (ocrLib ||= new Promise((ok, fail) => {
    if (window.Tesseract) return ok(window.Tesseract);
    const s = document.createElement("script");
    s.src = `${CDN}/tesseract.js@5.1.1/dist/tesseract.min.js`;
    s.onload = () => ok(window.Tesseract);
    s.onerror = () => fail(new Error("Couldn't load the photo reader. Check your internet and try again."));
    document.head.append(s);
  }));
}

const kind = (file) => {
  const n = file.name.toLowerCase();
  if (/\.(xlsx|xls|xlsm|ods|csv|tsv)$/.test(n)) return "sheet";
  if (n.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/") || /\.(jpe?g|png|heic|webp)$/.test(n)) return "image";
  if (file.type.startsWith("text/") || n.endsWith(".txt")) return "text";
  return "unknown";
};

async function readSheet(file) {
  const X = await xlsx();
  const wb = X.read(await file.arrayBuffer(), { cellDates: true });
  const rows = [];
  for (const name of wb.SheetNames) {
    const r = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, dateNF: "dd/mm/yyyy", defval: "" });
    rows.push(...r);
  }
  return rows;
}

async function readPdf(file) {
  const P = await pdfjs();
  const doc = await P.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines = [];
  for (let p = 1; p <= Math.min(doc.numPages, 40); p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    // Group text pieces into lines by their height on the page; wide gaps become tabs (table columns).
    const byY = new Map();
    for (const it of items) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5] / 3);
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push({ x: it.transform[4], w: it.width, s: it.str });
    }
    [...byY.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, parts]) => {
        parts.sort((a, b) => a.x - b.x);
        let line = "", end = null;
        for (const pt of parts) {
          if (end != null) line += pt.x - end > 14 ? "\t" : pt.x - end > 1 ? " " : "";
          line += pt.s;
          end = pt.x + pt.w;
        }
        lines.push(line);
      });
  }
  return lines.join("\n");
}

async function readImage(file, onProgress) {
  const T = await tesseract();
  const { data } = await T.recognize(file, "eng", {
    logger: (m) => m.status === "recognizing text" && onProgress?.(Math.round(m.progress * 100)),
  });
  return data.text || "";
}

/** Any upload → { rows } or { text }. */
export async function readFile(file, onProgress) {
  const k = kind(file);
  if (k === "sheet") {
    if (/\.(csv|tsv)$/i.test(file.name)) {
      const t = await file.text();
      return { rows: t.split(/\r?\n/).map((l) => (l.includes("\t") ? l.split("\t") : splitCsv(l))) };
    }
    return { rows: await readSheet(file) };
  }
  if (k === "pdf") return { text: await readPdf(file) };
  if (k === "image") return { text: await readImage(file, onProgress), photo: true };
  if (k === "text") return { text: await file.text() };
  throw new Error("This file type isn't supported. Use Excel, PDF, a photo, or paste the text.");
}

function splitCsv(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

export const rowsToText = (rows) => rows.map((r) => r.map((c) => String(c ?? "").trim()).filter(Boolean).join("\t")).filter(Boolean).join("\n");

export function scheduleFrom(read, ctx) {
  return read.rows ? parseSchedule(read.rows, ctx) : parseSchedule(read.text || "", ctx);
}

export function datesFrom(read, today) {
  return parseDates(read.rows ? rowsToText(read.rows).replace(/\t/g, ", ") : read.text || "", today);
}
