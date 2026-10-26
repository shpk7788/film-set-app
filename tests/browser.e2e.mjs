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
const shot = (p, name) => (SHOTS ? p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) : null);
const newPage = async () => {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
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
await cd.locator("label.check", { hasText: "Art" }).first().locator("input").check();
await cd.getByRole("button", { name: "Save day settings" }).click();
await waitText(cd, "Add scene");
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
