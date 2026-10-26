// Tests the database rules exactly as the website uses them: every call runs as a logged-in
// Supabase user (role "authenticated", auth.uid() set) or as "anon".
// Run: DATABASE_URL=postgres://... node --test db.test.mjs  (database must have supabase-shim.sql + schema.sql)
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres@localhost/fs2" });
const today = (await pool.query("select today_ist()::text as d")).rows[0].d;
const tomorrow = (await pool.query("select (today_ist() + 1)::text as d")).rows[0].d;

async function as(userId, sql, params = []) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${userId ? "authenticated" : "anon"}`);
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    const r = await c.query(sql, params);
    await c.query("commit");
    return r.rows[0] ? Object.values(r.rows[0])[0] : null;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
const call = (user, fn, ...args) => as(user, `select ${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args);
const J = (v) => JSON.stringify(v); // jsonb arguments
const denied = async (p, msg) => assert.rejects(p, msg ? new RegExp(msg) : undefined);

async function user(username) {
  const r = await pool.query(
    "insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, extensions.crypt('Demo1234', extensions.gen_salt('bf')), $2) returning id",
    [`${username}@crew.snyp.io`, { username }],
  );
  return r.rows[0].id;
}

const U = {};
let film, film2, depts, day1, day2;

test("setup: company, film, people join with codes", async () => {
  for (const n of ["owner", "ep", "pm", "office", "director", "codir", "ad1", "ad2", "intern", "lightshead", "lights", "arthead", "mother", "hero", "outsider"]) U[n] = await user(n);
  await pool.query("insert into setup_secret values ('test-secret-123456')");

  assert.equal(await call(null, "setup_needed"), true);
  await denied(call(U.outsider, "setup_company", "wrong-secret-xxxx", "X", "Y"), "setup code is wrong");
  assert.deepEqual(await call(U.owner, "setup_company", "test-secret-123456", "Demo Productions", "Owner Person"), { ok: true });
  await denied(call(U.outsider, "setup_company", "test-secret-123456", "X", "Y"), "already been done");
  assert.equal(await call(null, "setup_needed"), false);

  film = (await call(U.owner, "create_film", "Demo Film", true, null)).filmId;
  const me = await call(U.owner, "me", film);
  assert.equal(me.member.role, "producer");
  depts = Object.fromEntries((await call(U.owner, "people_view", film)).departments.map((d) => [d.name, d.id]));

  const add = async (who, name, role, extra = {}) => {
    const { code } = await call(U.owner, "add_person", film, { name, role, ...extra });
    assert.match(code, /^[A-Z]{3}-[A-Z2-9]{6}$/);
    const info = await call(null, "code_info", code.toLowerCase().replace("-", " "));
    assert.equal(info.ok, true);
    assert.equal(info.name, name);
    await call(U[who], "claim_code", code);
    return code;
  };
  await add("ep", "Eshwar EP", "executive_producer");
  await add("pm", "Prakash PM", "production_manager");
  await add("office", "Oviya Office", "production_team");
  await add("director", "Dinesh Director", "director");
  await add("codir", "Kavya Co-director", "co_director");
  await add("ad1", "Arun 1st AD", "first_ad");
  await add("ad2", "Bala 2nd AD", "second_ad");
  await add("intern", "Ishaan Intern", "direction_intern", { accessEndsOn: tomorrow });
  await add("lightshead", "Gopal Gaffer", "department_head", { departmentId: depts.Lights, phone: "+919800000001" });
  const lightsCode = await add("lights", "Mani Lights", "department_crew", { departmentId: depts.Lights });
  await add("arthead", "Anita Art", "department_head", { departmentId: depts.Art });
  await add("mother", "Meena Mother", "actor", { character: "Amma" });
  await add("hero", "Hari Hero", "actor", { character: "Raja" });

  const used = await call(null, "code_info", lightsCode);
  assert.equal(used.ok, false);
  assert.match(used.reason, /already been used/);
  await denied(call(U.outsider, "claim_code", lightsCode), "can't be used");
});

test("tables and internal functions are closed to the website", async () => {
  await denied(as(U.owner, "select count(*) from memberships"), "permission denied");
  await denied(as(U.owner, "select count(*) from contracts"), "permission denied");
  await denied(as(null, "select count(*) from signup_codes"), "permission denied");
  await denied(as(U.owner, "select member_can(m, 'contracts') from (select null::memberships m) s"), "permission denied");
  await denied(as(U.lights, "insert into audit_log (action, entity_type) values ('x','y')"), "permission denied");
  await denied(call(null, "me", film), "permission denied");
});

test("crew member sees only their own channels", async () => {
  const me = await call(U.lights, "me", film);
  assert.deepEqual(me.caps, []);
  for (const fn of ["contracts_view", "crew_hub", "days_list", "people_view", "audit_view", "live_view", "access_matrix"]) {
    await denied(call(U.lights, fn, film), "access|producer");
  }
  await denied(call(U.outsider, "me", film), "access");
});

test("schedule: co-director edits and sends; 1st AD can edit but not send", async () => {
  day1 = (await call(U.codir, "create_day", film, 1, today, "Studio, Floor 3", "07:00")).dayId;
  day2 = (await call(U.ad1, "create_day", film, 2, tomorrow, "Studio, Floor 3", "07:00")).dayId;
  const mother = (await call(U.codir, "directory", film).catch(() => null)) ?? null;
  assert.equal(mother, null, "directory() is internal");
  const dir = (await call(U.codir, "editor_view", day1)).dir;
  const M = Object.fromEntries(dir.actors.map((a) => [a.name, a.id]));

  for (const day of [day1, day2]) {
    await call(U.codir, "save_day_settings", day, {
      generalCall: "07:00", location: "Studio, Floor 3", notes: "",
      deptCalls: { [depts.Lights]: "07:00", [depts.Art]: "06:00" },
      actorTimes: { [M["Meena Mother"]]: { pickup: "05:15", makeup: "06:00", onSet: "07:30" } },
    });
    await call(U.codir, "save_item", day, { key: "s46", scene: "46", heading: "INT. House – Night", start: "07:30", end: "10:30",
      castIds: [M["Meena Mother"], M["Hari Hero"]], needs: { [depts.Lights]: "2×18K, smoke", [depts.Art]: "Dining set" }, jobs: "Bring Hero from makeup" });
    await call(U.ad1, "save_item", day, { key: "s48", scene: "48", heading: "EXT. Rooftop", start: "17:00", end: "19:00",
      castIds: [M["Hari Hero"]], needs: { [depts.Lights]: "Balloon light" } });
  }
  await denied(call(U.ad1, "send_version", day1), "access");
  await denied(call(U.lights, "save_item", day1, { scene: "99" }), "access");
  assert.equal((await call(U.codir, "send_version", day1)).version, 1);
  assert.equal((await call(U.director, "send_version", day2)).version, 1);
});

test("call sheets: each person gets only their slice", async () => {
  const l = await call(U.lights, "my_callsheet", day1);
  assert.equal(l.slice.kind, "department");
  assert.deepEqual(l.slice.items.map((i) => i.need), ["2×18K, smoke", "Balloon light"]);
  assert.ok(!JSON.stringify(l).includes("Dining set"), "Lights must not see Art's needs");
  assert.ok(!JSON.stringify(l).includes("Bring Hero"), "Crew must not see AD jobs");
  const a = await call(U.arthead, "my_callsheet", day1);
  assert.deepEqual(a.slice.items.map((i) => i.scene), ["46"]);
  const m = await call(U.mother, "my_callsheet", day1);
  assert.equal(m.slice.times.pickup, "05:15");
  assert.deepEqual(m.slice.items.map((i) => i.scene), ["46"]);
  assert.ok(!JSON.stringify(m).includes("smoke"));
  // Crew can't open the full program sheet
  await denied(call(U.lights, "day_view", day1), "access");
  // Producer can open anyone's call sheet
  const asArt = await call(U.owner, "callsheet_as", day1, "department", depts.Art);
  assert.deepEqual(asArt.slice.items.map((i) => i.need), ["Dining set"]);
  await denied(call(U.lights, "callsheet_as", day1, "department", depts.Art), "access");
});

test("schedule scope: intern today only, 2nd AD today and tomorrow", async () => {
  assert.ok(await call(U.intern, "day_view", day1));
  await denied(call(U.intern, "day_view", day2), "access");
  assert.ok(await call(U.ad2, "day_view", day2));
  const days = (await call(U.intern, "days_list", film)).days;
  assert.deepEqual(days.map((d) => d.dayNumber), [1]);
});

test("change v2: only affected people are re-notified; others keep their confirmation", async () => {
  const v1 = await call(U.lights, "my_callsheet", day2);
  await call(U.lights, "confirm_version", v1.versionId);
  const art1 = await call(U.arthead, "my_callsheet", day2);
  await call(U.arthead, "confirm_version", art1.versionId);
  await denied(call(U.outsider, "confirm_version", v1.versionId), "access");

  await call(U.codir, "cut_item", day2, "s48", "Moved — rain", false);
  await call(U.codir, "save_day_settings", day2, { generalCall: "06:30", location: "Studio, Floor 3", notes: "",
    deptCalls: { [depts.Lights]: "06:30", [depts.Art]: "06:00" }, actorTimes: {} });
  const prev = await call(U.codir, "editor_view", day2);
  assert.ok(prev.preview.summary.includes("Scene 48 cut (Moved — rain)"));
  assert.ok(prev.preview.departments.includes("Lights") && !prev.preview.departments.includes("Art"));
  await call(U.codir, "send_version", day2);

  const lightsInbox = await call(U.lights, "inbox", film);
  assert.ok(lightsInbox.some((n) => /Call sheet changed/.test(n.title)));
  const artInbox = await call(U.arthead, "inbox", film);
  assert.ok(!artInbox.some((n) => /Call sheet changed/.test(n.title)));
  const art2 = await call(U.arthead, "my_callsheet", day2);
  assert.equal(art2.confirmed, true, "Art's confirmation carries over");
  const l2 = await call(U.lights, "my_callsheet", day2);
  assert.equal(l2.confirmed, false, "Lights must confirm again");
  assert.equal(l2.slice.callTime, "06:30");

  const tr = await call(U.pm, "tracker", day2);
  assert.ok(tr.people.find((p) => p.name === "Gopal Gaffer").phone, "PM sees phones");
  const tr2 = await call(U.codir, "tracker", day2);
  assert.ok(tr2.people.length > 0);
  await denied(call(U.lights, "tracker", day2), "access");
});

test("crew list: release early, PM then EP approval, locked", async () => {
  await call(U.pm, "start_crew_list", day1);
  const cd = await call(U.pm, "crew_day", day1);
  const meena = cd.entries.find((e) => e.label === "Meena Mother");
  await denied(call(U.lights, "release_early", meena.id, 10, "18:00", "Scene moved"), "access");
  await denied(call(U.pm, "release_early", meena.id, 20, "18:00", "x"), "more than");
  await call(U.ad1, "release_early", meena.id, 5, "13:00", "Scene moved"); // 1st AD: today's list only
  await denied(call(U.ad1, "crew_hub", film), "access");
  await call(U.pm, "send_for_approval", day1);
  await denied(call(U.ep, "decide", day1, "approve", null), "Production Manager");
  await call(U.pm, "decide", day1, "approve", null);
  await denied(call(U.pm, "decide", day1, "approve", null), "Executive Producer");
  await call(U.ep, "decide", day1, "approve", null);
  const after = await call(U.pm, "crew_day", day1);
  assert.equal(after.list.status, "locked");
  assert.equal(after.entries.find((e) => e.label === "Meena Mother").releasedBy, "Arun 1st AD");
  await denied(call(U.pm, "release_early", meena.id, 5, "13:00", "x"), "waiting for approval or locked");
  await denied(pool.query("update crew_entries set worked_tenths = 20"), "locked");
  await denied(pool.query("delete from audit_log"), "append-only");
  await denied(call(U.pm, "reopen", day1, "fix"), "access");
});

test("contracts: producer only; pay from approved call sheets", async () => {
  const list = await call(U.owner, "contracts_view", film);
  const meena = list.find((a) => a.name === "Meena Mother");
  assert.equal(Number(meena.tenths), 5);
  await call(U.owner, "save_contract", meena.memberId, "per_day", 2500000, today, null);
  await denied(call(U.ep, "contracts_view", film), "access");
  await denied(call(U.pm, "save_contract", meena.memberId, "per_day", 1, null, null), "access");
  const audit = await call(U.ep, "audit_view", film);
  assert.ok(!audit.some((a) => a.action === "contract_saved"), "EP's change log hides money");
  assert.ok((await call(U.owner, "audit_view", film)).some((a) => a.action === "contract_saved"));
});

test("producer unlocks and locks channels by role and by person", async () => {
  const ad1Id = (await call(U.owner, "people_view", film)).members.find((m) => m.name === "Arun 1st AD").id;
  await denied(call(U.ad1, "crew_hub", film), "access");
  await call(U.owner, "set_role_access", film, "first_ad", "crew.view", true);
  assert.ok(Array.isArray(await call(U.ad1, "crew_hub", film)), "role unlock works");
  await call(U.owner, "set_member_access", ad1Id, "crew.view", false);
  await denied(call(U.ad1, "crew_hub", film), "access");
  await call(U.owner, "set_member_access", ad1Id, "crew.view", null);
  assert.ok(Array.isArray(await call(U.ad1, "crew_hub", film)), "back to role setting");
  await call(U.owner, "set_role_access", film, "first_ad", "crew.view", null);
  await denied(call(U.ad1, "crew_hub", film), "access");

  // Lock a default: intern loses the live view
  await call(U.owner, "set_role_access", film, "direction_intern", "live.view", false);
  await denied(call(U.intern, "live_view", film), "access");
  await call(U.owner, "set_role_access", film, "direction_intern", "live.view", null);
  assert.ok(await call(U.intern, "live_view", film));

  await denied(call(U.pm, "set_role_access", film, "first_ad", "crew.view", true), "producer");
  await denied(call(U.owner, "set_role_access", film, "producer", "contracts", false), "always has");
  const matrix = await call(U.owner, "access_matrix", film);
  assert.equal(matrix.roles.length, 11);
  assert.ok(matrix.caps.length >= 20);
});

test("people: co-director manages only direction juniors", async () => {
  const pv = await call(U.codir, "people_view", film);
  assert.deepEqual(pv.assignable.map((a) => a.role), ["first_ad", "second_ad", "direction_intern"]);
  await denied(call(U.codir, "add_person", film, { name: "X", role: "producer" }), "can't give out");
  await denied(call(U.pm, "add_person", film, { name: "X", role: "executive_producer" }), "can't give out");
  await denied(call(U.codir, "add_person", film, { name: "Y", role: "direction_intern" }), "end date");
  const lights = (await call(U.owner, "people_view", film)).members.find((m) => m.name === "Mani Lights");
  await denied(call(U.codir, "issue_code", lights.id), "can't manage");
});

test("forgot password: reset code sets a new password", async () => {
  const lights = (await call(U.pm, "people_view", film)).members.find((m) => m.name === "Mani Lights");
  const { code, purpose } = await call(U.pm, "issue_code", lights.id);
  assert.equal(purpose, "reset");
  const info = await call(null, "code_info", code);
  assert.equal(info.purpose, "reset");
  assert.equal(info.username, "lights");
  await denied(call(null, "reset_password", code, "short"), "8 characters");
  assert.equal((await call(null, "reset_password", code, "NewPass2026")).username, "lights");
  const ok = await pool.query("select encrypted_password = extensions.crypt('NewPass2026', encrypted_password) as ok from auth.users where id = $1", [U.lights]);
  assert.equal(ok.rows[0].ok, true);
  await denied(call(null, "reset_password", code, "Another2026"), "can't be used");
});

test("add another movie with that film's own code", async () => {
  film2 = (await call(U.owner, "create_film", "Second Film", false, "Someone Else")).filmId;
  // Owner isn't producer on film 2 → can't add people there; set up via SQL as the test harness.
  const m = await pool.query("insert into memberships (film_id, display_name, role) values ($1, 'Mani Lights', 'department_crew') returning id", [film2]);
  const code = (await pool.query("select new_code($1, 'join') as c", [m.rows[0].id])).rows[0].c;
  const info = await call(U.lights, "code_info", code);
  assert.equal(info.film, "Second Film");
  await call(U.lights, "claim_code", code);
  const mine = await call(U.lights, "my_films");
  assert.deepEqual(mine.films.map((f) => f.title).sort(), ["Demo Film", "Second Film"]);
  await denied(call(U.lights, "me", film2).then(() => call(U.lights, "contracts_view", film2)), "access");
});

test("expired intern and wrapped film", async () => {
  await pool.query("update memberships set access_ends_on = today_ist() - 1 where display_name = 'Ishaan Intern'");
  await denied(call(U.intern, "me", film), "access");
  await pool.query("update films set status = 'wrapped' where id = $1", [film]);
  await denied(call(U.lights, "me", film), "access");
  assert.ok(await call(U.pm, "me", film), "PM keeps read access after wrap");
  await denied(call(U.owner, "post_notice", film, "hi", false), "wrapped");
  await pool.query("update films set status = 'shooting' where id = $1", [film]);
});


test("import: one day's program sheet and a whole schedule", async () => {
  const dir = (await call(U.codir, "editor_view", day1)).dir;
  const meena = dir.actors.find((a) => a.name === "Meena Mother").id;
  const r = await call(U.codir, "import_items", day1, J([
    { scene: "50", heading: "EXT. Temple – Day", start: "11:00", end: "13:00", castIds: [meena, "not-a-real-id"], needs: { [depts.Art]: "Temple props", bogus: "x" }, notes: "40 junior artists at Gate 2" },
    { scene: "", heading: "ignored — no scene number" },
  ]), false, null, null);
  assert.ok(r.ok);
  const ed = await call(U.codir, "editor_view", day1);
  const s50 = ed.data.items.find((i) => i.scene === "50");
  assert.deepEqual(s50.castIds, [meena], "unknown cast ids are dropped");
  assert.deepEqual(Object.keys(s50.needs), [depts.Art], "unknown departments are dropped");
  assert.equal(s50.jobs[0].text, "40 junior artists at Gate 2");
  assert.equal(ed.data.items.filter((i) => i.scene === "50").length, 1);
  await denied(call(U.lights, "import_items", day1, J([{ scene: "1" }]), false, null, null), "access");

  const far = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const res = await call(U.codir, "import_schedule", film, J([
    { date: far(30), label: "Day 30", dayNumber: 30, location: "Pollachi", generalCall: "06:00", items: [{ scene: "70", castIds: [meena] }, { scene: "71" }] },
    { date: far(31), label: "Day 31", items: [{ scene: "72", castIds: [meena] }] },
    { date: today, label: "today", items: [{ scene: "51" }] },
  ]));
  assert.equal(res.days, 3);
  assert.equal(res.newDays, 2, "existing day reused, two new days made");
  assert.equal(res.scenes, 4);
  const days = (await call(U.codir, "days_list", film)).days;
  assert.ok(days.some((d) => d.dayNumber === 30));
  await denied(call(U.codir, "import_schedule", film, J([{ label: "no date", items: [] }])), "date");
});

test("artists: list, dates, scenes and conflicts", async () => {
  const list = await call(U.pm, "artists_list", film);
  const meena = list.artists.find((a) => a.name === "Meena Mother");
  assert.ok(meena.scenes >= 1);
  const far = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  await call(U.pm, "set_availability", meena.id, [far(30), far(32)], true, "From manager");
  await call(U.pm, "set_availability", meena.id, [far(31)], false, null);
  const v = await call(U.codir, "artist_view", meena.id);
  assert.equal(v.dates.length, 3);
  const s72 = v.scenes.find((s) => s.scene === "72");
  assert.equal(s72.available, false, "scene on a date she's not available is flagged");
  assert.equal(s72.status, "draft", "editors see draft scenes");
  const after = await call(U.codir, "artists_list", film); // drafts count for people who edit schedules
  assert.equal(after.artists.find((a) => a.name === "Meena Mother").conflicts, 1);
  // The day editor warns about it too
  const day31 = (await call(U.codir, "days_list", film)).days.find((d) => String(d.date).slice(0, 10) === far(31));
  assert.ok((await call(U.codir, "editor_view", day31.id)).unavailable.includes(meena.id));
  // Clearing dates
  await call(U.pm, "set_availability", meena.id, [far(32)], null, null);
  assert.equal((await call(U.pm, "artist_view", meena.id)).dates.length, 2);
  // Permissions
  await denied(call(U.lights, "artists_list", film), "access");
  await denied(call(U.ad1, "set_availability", meena.id, [far(30)], true, null), "access");
  assert.ok(await call(U.ad1, "artist_view", meena.id), "1st AD can view artists");
  await denied(call(U.mother, "artist_view", meena.id), "access");
});

test.after(() => pool.end());
