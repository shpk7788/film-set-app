import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ---------- enums ---------- */

export const filmRole = pgEnum("film_role", [
  "producer",
  "executive_producer",
  "production_manager",
  "production_team",
  "director",
  "co_director",
  "first_ad",
  "second_ad",
  "direction_intern",
  "department_head",
  "department_crew",
  "actor",
]);

export const filmStatus = pgEnum("film_status", ["shooting", "wrapped"]);
export const codePurpose = pgEnum("code_purpose", ["join", "reset"]);
export const versionStatus = pgEnum("version_status", ["draft", "sent"]);
export const crewListStatus = pgEnum("crew_list_status", [
  "draft",
  "awaiting_pm",
  "awaiting_ep",
  "locked",
]);
export const crewCategory = pgEnum("crew_category", ["artist", "crew", "junior_artist"]);
export const approvalStep = pgEnum("approval_step", ["pm", "ep", "reopen"]);
export const approvalDecision = pgEnum("approval_decision", ["approved", "sent_back", "reopened"]);
export const dealType = pgEnum("deal_type", ["per_day", "package"]);

/* ---------- companies, films, people ---------- */

export const people = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerPersonId: uuid("owner_person_id").references(() => people.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const films = pgTable("films", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  title: text("title").notNull(),
  status: filmStatus("status").notNull().default("shooting"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    filmId: uuid("film_id")
      .notNull()
      .references(() => films.id),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("departments_film_name").on(t.filmId, t.name)],
);

/** A person's place on one film. Created by the office before the person signs up. */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    filmId: uuid("film_id")
      .notNull()
      .references(() => films.id),
    personId: uuid("person_id").references(() => people.id),
    displayName: text("display_name").notNull(),
    role: filmRole("role").notNull(),
    departmentId: uuid("department_id").references(() => departments.id),
    characterName: text("character_name"),
    phone: text("phone"),
    canSeeScript: boolean("can_see_script").notNull().default(false),
    canSeeContacts: boolean("can_see_contacts").notNull().default(false),
    allowScreenshots: boolean("allow_screenshots").notNull().default(false),
    accessEndsOn: date("access_ends_on"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_film_person").on(t.filmId, t.personId),
    index("memberships_film").on(t.filmId),
  ],
);

export const signupCodes = pgTable("signup_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  filmId: uuid("film_id")
    .notNull()
    .references(() => films.id),
  membershipId: uuid("membership_id")
    .notNull()
    .references(() => memberships.id),
  purpose: codePurpose("purpose").notNull().default("join"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  personId: uuid("person_id")
    .notNull()
    .references(() => people.id),
  currentFilmId: uuid("current_film_id").references(() => films.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- schedule ---------- */

export const shootDays = pgTable(
  "shoot_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    filmId: uuid("film_id")
      .notNull()
      .references(() => films.id),
    dayNumber: integer("day_number").notNull(),
    date: date("date").notNull(),
    /** Live status for the AD view */
    liveItemKey: text("live_item_key"),
    liveNote: text("live_note"),
    liveUpdatedAt: timestamp("live_updated_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("shoot_days_film_day").on(t.filmId, t.dayNumber)],
);

/** Shape of a program sheet version's content. */
export type ProgramItem = {
  key: string; // stable id for the scene within this day across versions
  scene: string; // "46"
  heading: string; // "INT. House – Night"
  pages: string; // "2"
  location: string;
  start: string; // "06:30"
  end: string; // "10:00"
  castIds: string[]; // membership ids of actors
  needs: Record<string, string>; // departmentId -> what that department needs
  cut: boolean;
  cutReason?: string;
  jobs?: { forRole: "second_ad" | "direction_intern" | "first_ad"; text: string }[];
};

export type ProgramData = {
  location: string;
  generalCall: string; // "06:30"
  deptCalls: Record<string, string>; // departmentId -> call time; presence = department called
  actorTimes: Record<string, { pickup?: string; makeup?: string; onSet?: string; costume?: string }>;
  notes: string;
  items: ProgramItem[];
};

export const programVersions = pgTable(
  "program_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shootDayId: uuid("shoot_day_id")
      .notNull()
      .references(() => shootDays.id),
    version: integer("version").notNull(),
    status: versionStatus("status").notNull().default("draft"),
    data: jsonb("data").$type<ProgramData>().notNull(),
    changeSummary: jsonb("change_summary").$type<string[]>(),
    editedByMembershipId: uuid("edited_by_membership_id").references(() => memberships.id),
    sentByMembershipId: uuid("sent_by_membership_id").references(() => memberships.id),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("program_versions_day_version").on(t.shootDayId, t.version)],
);

export const confirmations = pgTable(
  "confirmations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => programVersions.id),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("confirmations_version_member").on(t.versionId, t.membershipId)],
);

/* ---------- notices & notifications ---------- */

export const notices = pgTable("notices", {
  id: uuid("id").primaryKey().defaultRandom(),
  filmId: uuid("film_id")
    .notNull()
    .references(() => films.id),
  authorMembershipId: uuid("author_membership_id")
    .notNull()
    .references(() => memberships.id),
  text: text("text").notNull(),
  important: boolean("important").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const noticeReads = pgTable(
  "notice_reads",
  {
    noticeId: uuid("notice_id")
      .notNull()
      .references(() => notices.id),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notice_reads_pk").on(t.noticeId, t.membershipId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    filmId: uuid("film_id")
      .notNull()
      .references(() => films.id),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_member").on(t.membershipId, t.createdAt)],
);

/* ---------- crew lists & approvals ---------- */

export const crewLists = pgTable("crew_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  filmId: uuid("film_id")
    .notNull()
    .references(() => films.id),
  shootDayId: uuid("shoot_day_id")
    .notNull()
    .unique()
    .references(() => shootDays.id),
  status: crewListStatus("status").notNull().default("draft"),
  sentBackNote: text("sent_back_note"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
});

/** Call sheets are stored in tenths: 15 = 1.5 call sheets. */
export const crewEntries = pgTable(
  "crew_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    crewListId: uuid("crew_list_id")
      .notNull()
      .references(() => crewLists.id),
    membershipId: uuid("membership_id").references(() => memberships.id),
    label: text("label").notNull(),
    category: crewCategory("category").notNull(),
    departmentId: uuid("department_id").references(() => departments.id),
    headcount: integer("headcount").notNull().default(1),
    calledTenths: integer("called_tenths").notNull().default(10),
    workedTenths: integer("worked_tenths").notNull().default(10),
    releasedAt: text("released_at"),
    releaseReason: text("release_reason"),
    releasedByMembershipId: uuid("released_by_membership_id").references(() => memberships.id),
    present: boolean("present").notNull().default(true),
    addedOnDay: boolean("added_on_day").notNull().default(false),
  },
  (t) => [index("crew_entries_list").on(t.crewListId)],
);

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  crewListId: uuid("crew_list_id")
    .notNull()
    .references(() => crewLists.id),
  step: approvalStep("step").notNull(),
  decision: approvalDecision("decision").notNull(),
  note: text("note"),
  membershipId: uuid("membership_id")
    .notNull()
    .references(() => memberships.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- contracts & payments (producer only) ---------- */

export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  filmId: uuid("film_id")
    .notNull()
    .references(() => films.id),
  membershipId: uuid("membership_id")
    .notNull()
    .unique()
    .references(() => memberships.id),
  dealType: dealType("deal_type").notNull(),
  /** per-day rate in paise */
  ratePaise: bigint("rate_paise", { mode: "number" }),
  /** package total in paise */
  totalPaise: bigint("total_paise", { mode: "number" }),
  signedOn: date("signed_on"),
  notes: text("notes"),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractId: uuid("contract_id")
    .notNull()
    .references(() => contracts.id),
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  paidOn: date("paid_on").notNull(),
  reference: text("reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- audit log ---------- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    filmId: uuid("film_id").references(() => films.id),
    actorPersonId: uuid("actor_person_id").references(() => people.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_film_time").on(t.filmId, t.createdAt)],
);
