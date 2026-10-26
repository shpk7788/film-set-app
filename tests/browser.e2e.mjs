// End-to-end run of the real website in a phone-sized browser against mock-supabase.mjs.
// Usage: BASE=http://localhost:4000 CHROME=/path/to/chrome PLAYWRIGHT=/path/to/playwright-core/index.mjs SHOTS=/tmp/shots node browser.e2e.mjs
const { chromium } = await import(process.env.PLAYWRIGHT || "playwright-core");
const BASE = process.env.BASE || "http://localhost:4000";
const SHOTS = process.env.SHOTS || "";
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) failures++;
};
const shot = async (p, name) => { if (SHOTS) { await p.waitForTimeout(700); await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); } };
// The app loads Excel/PDF readers from a CDN; serve local copies so the test runs offline.
import { readFileSync } from "node:fs";
const LIBS = process.env.LIBS || "";
const cdn = { "xlsx@0.18.5/xlsx.mjs": "xlsx/xlsx.mjs", "pdfjs-dist@4.10.38/build/pdf.min.mjs": "pdfjs-dist/build/pdf.min.mjs", "pdfjs-dist@4.10.38/build/pdf.worker.min.mjs": "pdfjs-dist/build/pdf.worker.min.mjs" };
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route("https://cdn.jsdelivr.net/npm/**", (r) => {
    const key = Object.keys(cdn).find((k) => r.request().url().endsWith(k));
    return key && LIBS ? r.fulfill({ body: readFileSync(`${LIBS}/${cdn[key]}`), contentType: "text/javascript", headers: { "access-control-allow-origin": "*" } }) : r.abort();
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); failures++; });
  return p;
};
const waitText = (p, t) => p.getByText(t, { exact: false }).first().waitFor({ timeout: 15000 });
async function fill(p, map) {
  for (const [name, value] of Object.entries(map)) await p.fill(`[name="${name}"]`, String(value));
}
async function openAdd(p) {
  const box = p.locator("#addbox");
  await box.waitFor();
  if (!(await box.evaluate((d) => d.open))) await box.locator("summary").click();
}
async function login(p, user, pw = "Demo1234x") {
  await p.goto(`${BASE}/#/login`);
  await fill(p, { username: user, password: pw });
  await p.getByRole("button", { name: "Log in" }).click();
  await p.waitForURL(/#\/(home|films)/);
}

// 1. First-time setup and the first film
const owner = await newPage();
await owner.goto(`${BASE}/#/setup`);
await waitText(owner, "First-time setup");
await fill(owner, { secret: "wrong-secret-0000", company: "Demo Productions", name: "Priya Producer", username: "priya", password: "Demo1234x", confirm: "Demo1234x" });
await owner.getByRole("button", { name: "Create my company" }).click();
await waitText(owner, "setup code is wrong");
check(await owner.locator('[name="company"]').inputValue() === "Demo Productions", "typed values survive an error");
await fill(owner, { secret: "test-setup-secret-1234" });
await owner.getByRole("button", { name: "Create my company" }).click();
await waitText(owner, "Create a new film");
await fill(owner, { title: "Demo Film" });
await owner.getByRole("button", { name: "Create film" }).click();
await owner.waitForURL(/#\/home/);
await waitText(owner, "Producer");
check(true, "setup → company → film, owner lands as producer");

// 2. Producer adds people; each gets a code
const people = [
  ["Kavya Co-director", "co_director", {}],
  ["Arun 1st AD", "first_ad", {}],
  ["Ishaan Intern", "direction_intern", { accessEndsOn: "2099-01-01" }],
  ["Prakash PM", "production_manager", {}],
  ["Eshwar EP", "executive_producer", {}],
  ["Mani Lights", "department_crew", { dept: "Lights" }],
  ["Anita Art", "department_head", { dept: "Art" }],
  ["Meena Mother", "actor", { character: "Amma" }],
];
await owner.goto(`${BASE}/#/people`);
for (const [name, role, extra] of people) {
  await openAdd(owner);
  await fill(owner, { name });
  await owner.selectOption('[name="role"]', role);
  if (extra.dept) await owner.selectOption('[name="departmentId"]', { label: extra.dept });
  if (extra.character) await fill(owner, { character: extra.character });
  if (extra.accessEndsOn) await fill(owner, { accessEndsOn: extra.accessEndsOn });
  await owner.getByRole("button", { name: /Add & create sign-up code/ }).click();
  await owner.locator(".person", { hasText: name }).waitFor();
}
const codes = {};
for (const [name] of people) codes[name] = (await owner.locator(".person", { hasText: name }).locator(".codebox b").textContent()).trim();
check(Object.values(codes).every((c) => /^[A-Z]{3}-[A-Z2-9]{6}$/.test(c)), "every person has a one-time code");
await shot(owner, "01-people");

// 3. Everyone signs up with their own code
const usernames = { "Kavya Co-director": "kavya", "Arun 1st AD": "arun", "Ishaan Intern": "ishaan", "Prakash PM": "prakash", "Eshwar EP": "eshwar", "Mani Lights": "mani", "Anita Art": "anita", "Meena Mother": "meena" };
const pages = {};
for (const [name] of people) {
  const p = await newPage();
  await p.goto(`${BASE}/#/join`);
  await fill(p, { code: codes[name].toLowerCase().replace("-", " ") });
  await p.getByRole("button", { name: "Next" }).click();
  await waitText(p, "Is this you?");
  if (name === "Mani Lights") {
    check(await p.getByText("Lights call sheet").isVisible(), "confirm screen lists the code's channels");
    await shot(p, "02-confirm");
  }
  await p.getByRole("link", { name: "Yes, that's me" }).click();
  await fill(p, { username: usernames[name], password: "Demo1234x", confirm: "Demo1234x" });
  await p.getByRole("button", { name: "Finish" }).click();
  await waitText(p, "You're in");
  pages[name] = p;
}
check(true, "all 8 people signed up");
const reuse = await newPage();
await reuse.goto(`${BASE}/#/join/${codes["Mani Lights"]}`);
await waitText(reuse, "already been used");
check(true, "a used code is refused");

// 4. Co-director builds and sends today's schedule
const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const cd = pages["Kavya Co-director"];
await cd.goto(`${BASE}/#/schedule`);
await waitText(cd, "Add a shoot day");
await fill(cd, { date: today, location: "Studio, Floor 3" });
await cd.getByRole("button", { name: "Create day" }).click();
await cd.waitForURL(/#\/edit\//);
await waitText(cd, "Day settings");
await cd.locator("label.check", { hasText: "Lights" }).first().locator("input").check();
await cd.locator("label.check", { has: cd.locator("span", { hasText: /^Art$/ }) }).first().locator("input").check();
await cd.getByRole("button", { name: "Save day settings" }).click();
await waitText(cd, "Ready to send");
const add = cd.locator("details.add-scene");
if (!(await add.evaluate((d) => d.open))) await add.locator("summary").click();
await add.locator('[name="scene"]').fill("46");
await add.locator('[name="heading"]').fill("INT. House – Night");
await add.locator('[name="start"]').fill("07:30");
await add.locator('[name="end"]').fill("10:30");
await add.locator("label.check", { hasText: "Meena Mother" }).locator("input").check();
const need = (d) => add.locator(".needrow").filter({ has: cd.locator("span", { hasText: new RegExp(`^${d}$`) }) }).locator("input");
await need("Lights").fill("2×18K, smoke machine");
await need("Art").fill("Dining set");
await add.getByRole("button", { name: "Add scene" }).click();
await cd.locator("details.card summary", { hasText: "Sc 46" }).waitFor();
await waitText(cd, "Ready to send");
await shot(cd, "03-editor");
await cd.getByRole("button", { name: /Approve & send v1/ }).click();
await cd.waitForURL(/#\/tracker\//);
await waitText(cd, "Who has confirmed");
check(true, "co-director sent v1 and sees the tracker");
await shot(cd, "04-tracker");

const ad1 = pages["Arun 1st AD"];
await ad1.goto(cd.url().replace("tracker", "edit"));
await waitText(ad1, "Edit program sheet");
check((await ad1.getByRole("button", { name: /Approve & send/ }).count()) === 0, "1st AD has no send button");

// 5. Lights sees only Lights; Got it
const lights = pages["Mani Lights"];
await lights.goto(`${BASE}/#/home`);
await waitText(lights, "Lights crew call");
check(await lights.getByText("2×18K, smoke machine").isVisible(), "Lights sees its need");
check(!(await lights.getByText("Dining set").count()), "Lights does not see Art's need");
check((await lights.locator(".bottom a").count()) === 3, "crew nav: Home, Inbox, Menu only");
await shot(lights, "05-lights-home");
await lights.getByRole("button", { name: "Got it" }).click();
await waitText(lights, "You confirmed this version");
check(true, "Got it confirms");

// 6. Producer opens anyone's call sheet
await owner.goto(`${BASE}/#/schedule`);
await owner.locator(".daycard").first().click();
await owner.getByRole("link", { name: "Open any call sheet" }).click();
await owner.locator("a.line").filter({ has: owner.locator("b", { hasText: /^Art$/ }) }).click();
await waitText(owner, "Dining set");
check(!(await owner.getByText("2×18K").count()), "producer sees Art's sheet exactly as Art does");
await shot(owner, "06-viewas-art");

// 7. Crew list: release early, PM then EP approval
const pm = pages["Prakash PM"];
await pm.goto(`${BASE}/#/crew`);
await pm.locator("a.line").first().click();
await pm.getByRole("button", { name: "Start crew list" }).click();
await waitText(pm, "Send for approval");
const meena = pm.locator(".entry", { hasText: "Meena Mother" });
await meena.locator("summary").click();
await meena.locator('label.pick:has(input[value="5"])').click();
await meena.locator('[name="at"]').fill("13:00");
await meena.locator('label.pill:has(input[value="Scene moved"])').click();
await meena.getByRole("button", { name: "Save" }).click();
await waitText(pm, "Released 13:00 by Prakash PM");
check(true, "release early recorded with who did it");
await shot(pm, "07-crew-day");
await pm.getByRole("button", { name: "Send for approval" }).click();
await waitText(pm, "Waiting for Production Manager");
await pm.getByRole("button", { name: "Approve" }).click();
await waitText(pm, "PM approved · waiting for EP");
const ep = pages["Eshwar EP"];
await ep.goto(pm.url());
await ep.getByRole("button", { name: "Approve" }).click();
await waitText(ep, "Approved & locked");
check(true, "PM → EP approval locks the day");

// 8. Contracts: producer only; pay = approved call sheets × rate
await owner.goto(`${BASE}/#/contracts`);
const mcard = owner.locator("section.card", { hasText: "Meena Mother" });
await mcard.locator("summary", { hasText: "Add contract" }).click();
await mcard.locator('[name="amount"]').fill("25,000");
await mcard.getByRole("button", { name: "Save contract" }).click();
await owner.locator("section.card", { hasText: "Meena Mother" }).getByText("₹ 12,500").first().waitFor();
check(true, "0.5 approved call sheet × ₹25,000 = ₹12,500");
await shot(owner, "08-contracts");
await pm.goto(`${BASE}/#/contracts`);
await waitText(pm, "don't have access");
check(true, "PM cannot open contracts");

// 9. Producer unlocks a channel for a role, then locks it for one person
await owner.goto(`${BASE}/#/access?role=first_ad`);
await waitText(owner, "Channels & access");
await owner.locator("label.toggle", { hasText: "Crew lists & history" }).locator("input").check();
await owner.getByRole("button", { name: /Save for 1st AD/ }).click();
await waitText(owner, "changed from default");
await shot(owner, "09-access");
await ad1.goto(`${BASE}/#/home`);
await ad1.reload();
await ad1.locator(".bottom a", { hasText: "Records" }).waitFor();
await ad1.goto(`${BASE}/#/crew`);
await waitText(ad1, "Approved & locked");
check(true, "unlocking Crew lists for 1st AD works");
await owner.goto(`${BASE}/#/people`);
const arun = owner.locator(".person", { hasText: "Arun 1st AD" });
await arun.locator("summary", { hasText: "Manage" }).click();
await arun.locator('select[name="crew.view"]').selectOption("off");
await arun.getByRole("button", { name: "Save channels" }).click();
await waitText(owner, "Channels saved");
await ad1.goto(`${BASE}/#/crew`);
await ad1.reload();
await waitText(ad1, "don't have access");
check(true, "locking it for one person overrides the role");

// 10. Intern: today only, live view
const intern = pages["Ishaan Intern"];
await intern.goto(`${BASE}/#/today`);
await waitText(intern, "Now shooting");
await shot(intern, "10-intern-live");
check(true, "intern sees the live view");

// 12. "Everyone" ticks every department in day settings
const dayId = cd.url().match(/#\/(?:tracker|edit)\/([^/?]+)/)[1];
await cd.goto(`${BASE}/#/edit/${dayId}`);
await waitText(cd, "Day settings");
await cd.locator("details", { hasText: "Day settings" }).first().locator("summary").click();
await cd.locator("#allDepts").check();
const deptBoxes = cd.locator("#settings .callrow input[type=checkbox]");
check((await deptBoxes.count()) > 3 && (await deptBoxes.evaluateAll((els) => els.every((e) => e.checked))), "Everyone ticks all departments");
await cd.fill("#allTime", "06:15");
await cd.click("#applyAll");
check((await cd.locator('#settings input[name^="call_"]').evaluateAll((els) => els.every((e) => e.value === "06:15"))), "same call time applied to every department");
await shot(cd, "12-everyone");

// 13. Artists: producer adds an artist and the dates they're NOT available (pasted WhatsApp message)
const ymd = (n) => new Date(Date.now() + 330 * 60000 + n * 864e5).toISOString().slice(0, 10);
const dmy = (d) => d.split("-").reverse().join("/");
const tomorrow = ymd(1);
await owner.goto(`${BASE}/#/artists`);
await waitText(owner, "Meena Mother");
const addart = owner.locator("#addart");
if (!(await addart.evaluate((d) => d.open))) await addart.locator("summary").click();
await addart.locator('[name="name"]').fill("Hari Kumar");
await addart.locator('[name="character"]').fill("Vetri");
await addart.getByRole("button", { name: "Add artist" }).click();
await owner.locator(".artcard", { hasText: "Hari Kumar" }).waitFor();
await owner.locator(".artcard", { hasText: "Hari Kumar" }).click();
await waitText(owner, "Add dates they've given");
await owner.fill("#datetext", `Sir, Hari can't come ${dmy(tomorrow)}. Rest all ok`);
await owner.locator(".seg label", { hasText: "NOT available" }).click();
await owner.click("#readdates");
await waitText(owner, "Found 1 date");
await owner.click("#savedates");
await owner.locator(".cd.no").first().waitFor();
check((await owner.locator(".cd.no").count()) === 1, "WhatsApp date saved as not available");
await owner.locator(`.cd[data-date="${ymd(3)}"]`).click();
await owner.locator(`.cd.yes[data-date="${ymd(3)}"]`).waitFor();
check(true, "tapping a date marks it available");

// 14. Co-director uploads a schedule as a WhatsApp message — new day created, names matched
await cd.goto(`${BASE}/#/upload`);
await waitText(cd, "Your shooting schedule");
await cd.fill("#sched .uptext", `DAY 2 - ${dmy(tomorrow)}\nCall 6.30 am\nLocation: Temple street\nSc 50 INT. Temple - Day 9:00-11:00 Cast: Vetri\nSc 51 EXT. Street 11.30 am Cast: Meena, Ravi`);
await cd.click("#sched .upread");
await waitText(cd, "Found 2 scenes over 1 day");
check(await cd.getByText("Not matched: Ravi").isVisible(), "unknown cast names are flagged");
await shot(cd, "13-upload-preview");
await cd.getByRole("button", { name: "Save to the schedule as drafts" }).click();
await cd.waitForURL(/#\/schedule$/);
await cd.locator(".daycard", { hasText: "Day 2" }).waitFor();
check(true, "schedule upload created Day 2 as a draft");
await cd.locator(".daycard", { hasText: "Day 2" }).click();
await cd.getByRole("link", { name: /Edit draft/ }).click();
await waitText(cd, "Artist date clash");
check(await cd.getByText("Hari Kumar isn't available").isVisible(), "editor warns that an artist isn't available");
check((await cd.locator("details.card summary", { hasText: "Sc 50" }).count()) === 1, "imported scene is in the draft");

// 15. Artist page shows their scenes and the clash
await owner.goto(`${BASE}/#/artists`);
await owner.locator(".artcard", { hasText: "Hari Kumar" }).getByText("1 clash").waitFor();
await owner.locator(".artcard", { hasText: "Hari Kumar" }).click();
await waitText(owner, "they said not available");
check(await owner.getByText("Sc 50 · INT. Temple").first().isVisible(), "artist page lists their scenes");
await shot(owner, "14-artist");

// 16. Import a program sheet from Excel and from a PDF into today's draft
if (LIBS) {
  const XLSX = await import(`${LIBS}/xlsx/xlsx.mjs`);
  XLSX.set_fs(await import("node:fs"));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["PROGRAM SHEET"], ["Sc No", "Int/Ext & Set", "Time", "Artists", "Art"], ["60", "INT. Kitchen", "13:00", "Meena", "Brass vessels"], ["61", "INT. Kitchen", "14:30", "Vetri", ""]]), "Day");
  const xfile = `${SHOTS || "/tmp"}/program.xlsx`;
  XLSX.writeFile(wb, xfile);
  await cd.goto(`${BASE}/#/edit/${dayId}`);
  await waitText(cd, "Import program sheet");
  await cd.locator("details.imp summary").click();
  await cd.locator("#prog .upfile").first().setInputFiles(xfile);
  await waitText(cd, "Found 2 scenes");
  await cd.getByRole("button", { name: "Add these scenes to the draft" }).click();
  await cd.locator("details.card summary", { hasText: "Sc 61" }).waitFor();
  check(true, "Excel program sheet imported into the day");

  const pdfPage = await newPage();
  await pdfPage.setContent(`<table style="font:16px sans-serif" cellpadding="12"><tr><th>Scene</th><th>Set</th><th>Time</th><th>Cast</th></tr><tr><td>70</td><td>EXT. Beach</td><td>16:00</td><td>Hari Kumar</td></tr><tr><td>71</td><td>EXT. Beach</td><td>17:30</td><td>Meena</td></tr></table>`);
  const pfile = `${SHOTS || "/tmp"}/program.pdf`;
  await pdfPage.pdf({ path: pfile });
  await cd.reload();
  await waitText(cd, "Import program sheet");
  if (!(await cd.locator("details.imp").evaluate((d) => d.open))) await cd.locator("details.imp summary").click();
  await cd.locator("#prog .upfile").first().setInputFiles(pfile);
  await waitText(cd, "Found 2 scenes");
  await shot(cd, "15-pdf-preview");
  await cd.getByRole("button", { name: "Add these scenes to the draft" }).click();
  await cd.locator("details.card summary", { hasText: "Sc 71" }).waitFor();
  check(true, "PDF program sheet imported into the day");
}

// 11. Add another movie with a code (login stays the same)
await owner.goto(`${BASE}/#/owner`);
await fill(owner, { title: "Second Film" });
await owner.getByRole("button", { name: "Create film" }).click();
await owner.waitForURL(/#\/home/);
await owner.goto(`${BASE}/#/people`);
await openAdd(owner);
await fill(owner, { name: "Mani Lights" });
await owner.selectOption('[name="role"]', "department_head");
await owner.selectOption('[name="departmentId"]', { label: "Lights" });
await owner.getByRole("button", { name: /Add & create sign-up code/ }).click();
await owner.locator(".person", { hasText: "Mani Lights" }).waitFor();
const code2 = (await owner.locator(".person", { hasText: "Mani Lights" }).locator(".codebox b").textContent()).trim();
await lights.goto(`${BASE}/#/films`);
await fill(lights, { code: code2 });
await lights.getByRole("button", { name: "Add movie" }).click();
await lights.getByRole("button", { name: /add this movie/ }).click();
await lights.waitForURL(/#\/home/);
await lights.goto(`${BASE}/#/films`);
await lights.locator("button.film", { hasText: "Second Film" }).waitFor();
check((await lights.locator("button.film").count()) === 2, "Your movies shows both films");
await shot(lights, "11-films");

await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
