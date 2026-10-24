import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  can,
  canSeeProgramForDate,
  isMembershipLive,
  scheduleScope,
  todayIST,
  type FilmRole,
} from "./permissions";

const m = (role: FilmRole, extra: Partial<{ active: boolean; accessEndsOn: string | null; canSeeContacts: boolean }> = {}) => ({
  role,
  active: true,
  accessEndsOn: null,
  ...extra,
});
const TODAY = "2026-10-25";

describe("contracts and money", () => {
  it("only the producer sees contracts", () => {
    expect(can(m("producer"), "contracts", TODAY)).toBe(true);
    for (const r of ["executive_producer", "production_manager", "production_team", "director", "actor"] as FilmRole[]) {
      expect(can(m(r), "contracts", TODAY)).toBe(false);
    }
  });
});

describe("schedule", () => {
  it("only director and co-director can send", () => {
    expect(can(m("director"), "program.send", TODAY)).toBe(true);
    expect(can(m("co_director"), "program.send", TODAY)).toBe(true);
    expect(can(m("first_ad"), "program.send", TODAY)).toBe(false);
    expect(can(m("first_ad"), "program.edit", TODAY)).toBe(true);
    expect(can(m("producer"), "program.edit", TODAY)).toBe(false);
  });

  it("scopes the program sheet by role", () => {
    expect(scheduleScope(m("first_ad"), TODAY)).toBe("full");
    expect(scheduleScope(m("second_ad"), TODAY)).toBe("today_tomorrow");
    expect(scheduleScope(m("direction_intern"), TODAY)).toBe("today");
    expect(scheduleScope(m("department_crew"), TODAY)).toBe("none");
    expect(scheduleScope(m("actor"), TODAY)).toBe("none");
  });

  it("2nd AD sees today and tomorrow only; intern today only", () => {
    expect(canSeeProgramForDate(m("second_ad"), "2026-10-26", TODAY)).toBe(true);
    expect(canSeeProgramForDate(m("second_ad"), "2026-10-27", TODAY)).toBe(false);
    expect(canSeeProgramForDate(m("direction_intern"), "2026-10-26", TODAY)).toBe(false);
    expect(canSeeProgramForDate(m("direction_intern"), TODAY, TODAY)).toBe(true);
  });
});

describe("crew lists and approvals", () => {
  it("PM approves step 1, EP approves step 2 and reopens", () => {
    expect(can(m("production_manager"), "crew.approve.pm", TODAY)).toBe(true);
    expect(can(m("executive_producer"), "crew.approve.pm", TODAY)).toBe(false);
    expect(can(m("executive_producer"), "crew.approve.ep", TODAY)).toBe(true);
    expect(can(m("executive_producer"), "crew.reopen", TODAY)).toBe(true);
    expect(can(m("production_manager"), "crew.reopen", TODAY)).toBe(false);
  });

  it("department crew and actors never see crew lists", () => {
    expect(can(m("department_crew"), "crew.view", TODAY)).toBe(false);
    expect(can(m("actor"), "crew.view", TODAY)).toBe(false);
    expect(can(m("director"), "crew.view", TODAY)).toBe(false);
  });
});

describe("access validity", () => {
  it("removed members and expired interns get nothing", () => {
    expect(can(m("producer", { active: false }), "contracts", TODAY)).toBe(false);
    const intern = m("direction_intern", { accessEndsOn: "2026-10-24" });
    expect(isMembershipLive(intern, TODAY)).toBe(false);
    expect(scheduleScope(intern, TODAY)).toBe("none");
    expect(isMembershipLive(m("direction_intern", { accessEndsOn: TODAY }), TODAY)).toBe(true);
  });

  it("contacts switch grants contacts only", () => {
    const crew = m("department_crew", { canSeeContacts: true });
    expect(can(crew, "contacts.view", TODAY)).toBe(true);
    expect(can(crew, "crew.view", TODAY)).toBe(false);
  });
});

describe("people management", () => {
  it("co-director can only create direction juniors", () => {
    expect(assignableRoles(m("co_director"), TODAY)).toEqual(["first_ad", "second_ad", "direction_intern"]);
  });
  it("nobody but the company owner creates a producer", () => {
    for (const r of ["producer", "production_manager", "production_team"] as FilmRole[]) {
      expect(assignableRoles(m(r), TODAY)).not.toContain("producer");
    }
    expect(assignableRoles(m("production_manager"), TODAY)).not.toContain("executive_producer");
    expect(assignableRoles(m("department_head"), TODAY)).toEqual([]);
  });
});

describe("todayIST", () => {
  it("rolls over at midnight India time", () => {
    expect(todayIST(new Date("2026-10-24T18:29:00Z"))).toBe("2026-10-24");
    expect(todayIST(new Date("2026-10-24T18:31:00Z"))).toBe("2026-10-25");
  });
});
