/**
 * Demo data: one company, two films, a login for every role, a few shoot days.
 * Run with `npm run db:seed`. Every demo login uses the password: Demo1234
 * Refuses to run against a database that already has people in it.
 */
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import { count, eq } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "./schema";
import type { ProgramData } from "./schema";
import { DEFAULT_DEPARTMENTS } from "../lib/defaults";
import { addDays, todayIST } from "../lib/permissions";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  const [{ n }] = await db.select({ n: count() }).from(schema.people);
  if (n > 0) {
    console.log("Database already has people in it — not seeding.");
    return;
  }
  const passwordHash = await bcrypt.hash("Demo1234", 10);
  const today = todayIST();

  const person = async (name: string, username: string) =>
    (await db.insert(schema.people).values({ name, username, passwordHash }).returning())[0];

  const owner = await person("Company Owner", "owner");
  const [company] = await db.insert(schema.companies).values({ name: "Demo Productions", ownerPersonId: owner.id }).returning();

  /* ---------- Film 1 ---------- */
  const [film] = await db.insert(schema.films).values({ companyId: company.id, title: "Demo Film" }).returning();
  const depts = await db
    .insert(schema.departments)
    .values(DEFAULT_DEPARTMENTS.map((name) => ({ filmId: film.id, name })))
    .returning();
  const D = Object.fromEntries(depts.map((d) => [d.name, d.id])) as Record<string, string>;

  type R = (typeof schema.filmRole.enumValues)[number];
  const member = async (
    name: string,
    role: R,
    username: string | null,
    extra: Partial<typeof schema.memberships.$inferInsert> = {},
  ) => {
    const p = username ? await person(name, username) : null;
    return (
      await db
        .insert(schema.memberships)
        .values({ filmId: film.id, displayName: name, role, personId: p?.id ?? null, ...extra })
        .returning()
    )[0];
  };

  const producer = await member("Priya Producer", "producer", "producer");
  await member("Eshwar EP", "executive_producer", "ep");
  const pm = await member("Prakash PM", "production_manager", "pm");
  await member("Oviya Office", "production_team", "office");
  await member("Dinesh Director", "director", "director");
  const codir = await member("Kavya Co-director", "co_director", "codirector");
  await member("Arun 1st AD", "first_ad", "ad1");
  await member("Bala 2nd AD", "second_ad", "ad2");
  await member("Ishaan Intern", "direction_intern", "intern", { accessEndsOn: addDays(today, 30) });
  await member("Gopal Gaffer", "department_head", "lightshead", { departmentId: D["Lights"], phone: "+919800000001" });
  const mani = await member("Mani Lights", "department_crew", "lights", { departmentId: D["Lights"] });
  await member("Anita Art", "department_head", "arthead", { departmentId: D["Art"], phone: "+919800000002" });
  await member("Chitra Camera", "department_head", "camerahead", { departmentId: D["Camera"] });
  const hero = await member("Hari Hero", "actor", "hero", { characterName: "Raja", phone: "+919800000003" });
  const mother = await member("Meena Mother", "actor", "mother", { characterName: "Amma" });
  const villain = await member("Vikram Villain", "actor", null, { characterName: "Durai" });
  // Not joined yet: a sign-up code to try the sign-up flow.
  const newCrew = await member("Sam Sound", "department_crew", null, { departmentId: D["Sound"] });
  const expiry = new Date(Date.now() + 7 * 864e5);
  await db.insert(schema.signupCodes).values([
    { code: "SND-2345", filmId: film.id, membershipId: newCrew.id, purpose: "join", expiresAt: expiry },
    { code: "VIL-6789", filmId: film.id, membershipId: villain.id, purpose: "join", expiresAt: expiry },
  ]);

  /* ---------- Shoot days ---------- */
  const v1: ProgramData = {
    location: "Studio, Floor 3 · Gate 2",
    generalCall: "07:00",
    deptCalls: { [D["Lights"]]: "07:00", [D["Art"]]: "06:00", [D["Camera"]]: "07:00", [D["Costume"]]: "06:00" },
    actorTimes: {
      [hero.id]: { pickup: "05:45", makeup: "06:30", onSet: "07:30", costume: "Look 2 — white shirt" },
      [mother.id]: { pickup: "05:15", makeup: "06:00", onSet: "07:30", costume: "Look 3 — blue cotton saree" },
    },
    notes: "Bring rain covers for all equipment.",
    items: [
      { key: "s46", scene: "46", heading: "INT. House – Night", pages: "2", location: "House set", start: "07:30", end: "10:30", castIds: [hero.id, mother.id], needs: { [D["Lights"]]: "2×18K, smoke machine, blackout on windows", [D["Art"]]: "Dining set", [D["Camera"]]: "Slider" }, cut: false, jobs: [{ forRole: "second_ad", text: "Bring Hero from makeup by 07:15" }] },
      { key: "s47", scene: "47", heading: "EXT. Street – Day", pages: "1 5/8", location: "Back lot street", start: "11:00", end: "16:00", castIds: [hero.id], needs: { [D["Lights"]]: "Bounce boards, 1 generator", [D["Camera"]]: "Crane 20 ft", [D["Junior artists"]]: "40 junior artists" }, cut: false, jobs: [{ forRole: "second_ad", text: "40 junior artists ready at Gate 2 by 10:30" }] },
      { key: "s48", scene: "48", heading: "EXT. Rooftop", pages: "1", location: "Rooftop", start: "17:00", end: "19:00", castIds: [hero.id], needs: { [D["Lights"]]: "Balloon light" }, cut: false },
    ],
  };
  const v2: ProgramData = {
    ...v1,
    generalCall: "06:30",
    deptCalls: { ...v1.deptCalls, [D["Lights"]]: "06:30" },
    actorTimes: { ...v1.actorTimes, [mother.id]: { pickup: "04:45", makeup: "05:30", onSet: "06:30", costume: "Look 3 — blue cotton saree" } },
    items: [v1.items[0], v1.items[1], { ...v1.items[2], cut: true, cutReason: "Moved to Day 4 — rain" }],
  };

  const day = async (dayNumber: number, date: string) =>
    (await db.insert(schema.shootDays).values({ filmId: film.id, dayNumber, date }).returning())[0];
  const version = async (shootDayId: string, n: number, data: ProgramData, summary: string[]) =>
    (
      await db
        .insert(schema.programVersions)
        .values({ shootDayId, version: n, status: "sent", data, changeSummary: summary, sentByMembershipId: codir.id, sentAt: new Date(), editedByMembershipId: codir.id })
        .returning()
    )[0];

  const d1 = await day(1, addDays(today, -1));
  const d2 = await day(2, today);
  const d3 = await day(3, addDays(today, 1));
  await version(d1.id, 1, v1, ["First version of this day's schedule"]);
  const d2v1 = await version(d2.id, 1, v1, ["First version of this day's schedule"]);
  await version(d3.id, 1, v1, ["First version of this day's schedule"]);
  await version(d3.id, 2, v2, ["General call 07:00 → 06:30", "Lights call 07:00 → 06:30", "Scene 48 cut (Moved to Day 4 — rain)", "Meena Mother pickup 05:15 → 04:45"]);
  await db.update(schema.shootDays).set({ liveItemKey: "s46", liveNote: "Shot 3 of 7 — mid shot, Amma at the window", liveUpdatedAt: new Date() }).where(eq(schema.shootDays.id, d2.id));
  await db.insert(schema.confirmations).values({ versionId: d2v1.id, membershipId: mani.id });

  /* ---------- Crew lists ---------- */
  const crewList = async (shootDayId: string, status: "draft" | "locked") =>
    (await db.insert(schema.crewLists).values({ filmId: film.id, shootDayId, status, lockedAt: status === "locked" ? new Date() : null }).returning())[0];
  const yesterday = await crewList(d1.id, "draft");
  await db.insert(schema.crewEntries).values([
    { crewListId: yesterday.id, membershipId: hero.id, label: hero.displayName, category: "artist", calledTenths: 15, workedTenths: 15 },
    { crewListId: yesterday.id, membershipId: mother.id, label: mother.displayName, category: "artist", calledTenths: 15, workedTenths: 10, releasedAt: "18:00", releaseReason: "Scene moved", releasedByMembershipId: pm.id },
    { crewListId: yesterday.id, membershipId: mani.id, label: mani.displayName, category: "crew", departmentId: D["Lights"], calledTenths: 15, workedTenths: 15 },
    { crewListId: yesterday.id, label: "Junior artists — [supplier]", category: "junior_artist", departmentId: D["Junior artists"], headcount: 40, calledTenths: 10, workedTenths: 5, releasedAt: "13:00", releaseReason: "Finished early", releasedByMembershipId: pm.id },
  ]);
  await db.insert(schema.approvals).values([
    { crewListId: yesterday.id, step: "pm", decision: "approved", membershipId: pm.id },
  ]);
  // Lock only after the entries are in: locked lists refuse changes at the database level.
  await db.update(schema.crewLists).set({ status: "awaiting_ep" }).where(eq(schema.crewLists.id, yesterday.id));

  /* ---------- Contracts (producer only) ---------- */
  await db.insert(schema.contracts).values([
    { filmId: film.id, membershipId: mother.id, dealType: "per_day", ratePaise: 25000_00, signedOn: addDays(today, -40) },
    { filmId: film.id, membershipId: hero.id, dealType: "package", totalPaise: 50_00_000_00, signedOn: addDays(today, -60) },
    { filmId: film.id, membershipId: villain.id, dealType: "per_day", ratePaise: 15000_00 },
  ]);

  /* ---------- Notice ---------- */
  await db.insert(schema.notices).values({ filmId: film.id, authorMembershipId: producer.id, text: "Welcome to Demo Film. All call sheets come through this app from now on.", important: true });

  /* ---------- Film 2: Mani has a code to add it ---------- */
  const [film2] = await db.insert(schema.films).values({ companyId: company.id, title: "Second Film" }).returning();
  const depts2 = await db.insert(schema.departments).values(DEFAULT_DEPARTMENTS.map((name) => ({ filmId: film2.id, name }))).returning();
  const [maniOn2] = await db
    .insert(schema.memberships)
    .values({ filmId: film2.id, displayName: "Mani Lights", role: "department_head", departmentId: depts2.find((d) => d.name === "Lights")!.id })
    .returning();
  await db.insert(schema.signupCodes).values({ code: "LGT-4827", filmId: film2.id, membershipId: maniOn2.id, purpose: "join", expiresAt: expiry });

  console.log("Seeded. Logins (password Demo1234): owner, producer, ep, pm, office, director, codirector, ad1, ad2, intern, lightshead, lights, arthead, camerahead, hero, mother");
  console.log("Codes to try: SND-2345 (new sign-up), LGT-4827 (log in as 'lights' → Your movies → Add another movie)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
