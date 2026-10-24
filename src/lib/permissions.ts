/**
 * Central permission rules. Mirrors the "Roles and permissions" tables in the build spec.
 * Every page and server action must check one of these before reading or writing data.
 * Keep this file free of database access so it stays easy to test.
 */

export type FilmRole =
  | "producer"
  | "executive_producer"
  | "production_manager"
  | "production_team"
  | "director"
  | "co_director"
  | "first_ad"
  | "second_ad"
  | "direction_intern"
  | "department_head"
  | "department_crew"
  | "actor";

export const ROLE_LABELS: Record<FilmRole, string> = {
  producer: "Producer",
  executive_producer: "Executive Producer",
  production_manager: "Production Manager",
  production_team: "Production team",
  director: "Director",
  co_director: "Co-director",
  first_ad: "1st AD",
  second_ad: "2nd / 3rd AD",
  direction_intern: "Direction intern",
  department_head: "Department head",
  department_crew: "Department crew",
  actor: "Actor",
};

export const ALL_ROLES = Object.keys(ROLE_LABELS) as FilmRole[];

export type Capability =
  | "notice.post"
  | "program.edit"
  | "program.send"
  | "live.view"
  | "live.edit"
  | "tracker.view"
  | "crew.view"
  | "crew.edit"
  | "crew.release"
  | "crew.approve.pm"
  | "crew.approve.ep"
  | "crew.reopen"
  | "contracts"
  | "people.view"
  | "people.manage"
  | "audit.view"
  | "contacts.view";

export type ScheduleScope = "full" | "today_tomorrow" | "today" | "none";

export type MemberLike = {
  role: FilmRole;
  active: boolean;
  accessEndsOn: string | null; // YYYY-MM-DD
  canSeeContacts?: boolean;
};

const OFFICE: FilmRole[] = ["producer", "executive_producer", "production_manager", "production_team"];
const SCHEDULE_OWNERS: FilmRole[] = ["director", "co_director"];

const CAPS: Record<Capability, FilmRole[]> = {
  "notice.post": [...OFFICE, ...SCHEDULE_OWNERS],
  "program.edit": [...SCHEDULE_OWNERS, "first_ad"],
  "program.send": SCHEDULE_OWNERS,
  "live.view": [...OFFICE, ...SCHEDULE_OWNERS, "first_ad", "second_ad", "direction_intern"],
  "live.edit": [...SCHEDULE_OWNERS, "first_ad"],
  "tracker.view": [...OFFICE, ...SCHEDULE_OWNERS, "first_ad"],
  "crew.view": OFFICE,
  "crew.edit": ["production_manager", "production_team"],
  "crew.release": ["executive_producer", "production_manager", "production_team", "first_ad"],
  "crew.approve.pm": ["production_manager"],
  "crew.approve.ep": ["executive_producer"],
  "crew.reopen": ["executive_producer"],
  contracts: ["producer"],
  "people.view": [...OFFICE, "co_director"],
  "people.manage": ["producer", "production_manager", "production_team", "co_director"],
  "audit.view": ["producer", "executive_producer"],
  "contacts.view": [...OFFICE, ...SCHEDULE_OWNERS, "first_ad"],
};

/** Today's date in India (YYYY-MM-DD), the shoot's working calendar. */
export function todayIST(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A membership grants nothing once removed or past its end date. */
export function isMembershipLive(m: MemberLike, today: string = todayIST()): boolean {
  if (!m.active) return false;
  if (m.accessEndsOn && m.accessEndsOn < today) return false;
  return true;
}

/** After wrap, only the producer, EP and PM keep (read-only) access to the records. */
export function canAccessWrappedFilm(role: FilmRole): boolean {
  return role === "producer" || role === "executive_producer" || role === "production_manager";
}

export function can(m: MemberLike, cap: Capability, today: string = todayIST()): boolean {
  if (!isMembershipLive(m, today)) return false;
  if (cap === "contacts.view" && m.canSeeContacts) return true;
  return CAPS[cap].includes(m.role);
}

export function scheduleScope(m: MemberLike, today: string = todayIST()): ScheduleScope {
  if (!isMembershipLive(m, today)) return "none";
  if ([...OFFICE, ...SCHEDULE_OWNERS, "first_ad"].includes(m.role)) return "full";
  if (m.role === "second_ad") return "today_tomorrow";
  if (m.role === "direction_intern") return "today";
  return "none";
}

/** Whether a shoot day's full program sheet is visible to this member. */
export function canSeeProgramForDate(m: MemberLike, date: string, today: string = todayIST()): boolean {
  const scope = scheduleScope(m, today);
  if (scope === "full") return true;
  if (scope === "today_tomorrow") return date === today || date === addDays(today, 1);
  if (scope === "today") return date === today;
  return false;
}

/** Roles a member may give out when creating people and codes. */
export function assignableRoles(m: MemberLike, today: string = todayIST()): FilmRole[] {
  if (!can(m, "people.manage", today)) return [];
  if (m.role === "producer") return ALL_ROLES.filter((r) => r !== "producer");
  if (m.role === "co_director") return ["first_ad", "second_ad", "direction_intern"];
  return ALL_ROLES.filter((r) => r !== "producer" && r !== "executive_producer");
}

/** Roles that receive their own slice of a call sheet and must confirm it. */
export function receivesCallSheet(role: FilmRole): "department" | "actor" | "direction" | "office" {
  if (role === "department_head" || role === "department_crew") return "department";
  if (role === "actor") return "actor";
  if (["director", "co_director", "first_ad", "second_ad", "direction_intern"].includes(role)) return "direction";
  return "office";
}
