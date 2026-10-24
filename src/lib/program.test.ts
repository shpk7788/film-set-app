import { describe, expect, it } from "vitest";
import type { ProgramData } from "@/db/schema";
import { actorSlice, changedActors, changedDepartments, deptSlice, describeChanges } from "./program";

const LIGHTS = "d-lights";
const ART = "d-art";
const MOTHER = "m-mother";
const HERO = "m-hero";

const v1: ProgramData = {
  location: "Studio, Floor 3",
  generalCall: "07:00",
  deptCalls: { [LIGHTS]: "07:00", [ART]: "06:00" },
  actorTimes: { [MOTHER]: { pickup: "05:15", makeup: "06:00", onSet: "07:30" } },
  notes: "",
  items: [
    { key: "a", scene: "46", heading: "INT. House – Night", pages: "2", location: "House set", start: "07:00", end: "10:00", castIds: [HERO, MOTHER], needs: { [LIGHTS]: "2×18K, smoke", [ART]: "Dining set" }, cut: false },
    { key: "b", scene: "48", heading: "EXT. Rooftop", pages: "1", location: "Rooftop", start: "14:00", end: "17:00", castIds: [HERO], needs: { [LIGHTS]: "Balloon light" }, cut: false },
  ],
};

const v2: ProgramData = {
  ...v1,
  generalCall: "06:30",
  deptCalls: { [LIGHTS]: "06:30", [ART]: "06:00" },
  actorTimes: { [MOTHER]: { pickup: "04:45", makeup: "05:30", onSet: "06:30" } },
  items: [v1.items[0], { ...v1.items[1], cut: true, cutReason: "rain" }],
};

describe("slices", () => {
  it("a department only sees scenes that need it", () => {
    const art = deptSlice(v1, ART);
    expect(art.items.map((i) => i.scene)).toEqual(["46"]);
    expect(art.items[0].need).toBe("Dining set");
    expect(deptSlice(v1, LIGHTS).items).toHaveLength(2);
  });

  it("cut scenes move out of the live list", () => {
    const lights = deptSlice(v2, LIGHTS);
    expect(lights.items.map((i) => i.scene)).toEqual(["46"]);
    expect(lights.cutItems.map((i) => i.scene)).toEqual(["48"]);
  });

  it("an actor sees only their scenes and times", () => {
    const m = actorSlice(v1, MOTHER);
    expect(m.items.map((i) => i.scene)).toEqual(["46"]);
    expect(m.times.pickup).toBe("05:15");
  });
});

describe("who is affected", () => {
  it("first version goes to every called department and actor", () => {
    expect(changedDepartments(null, v1, [LIGHTS, ART, "d-camera"]).sort()).toEqual([ART, LIGHTS].sort());
    expect(changedActors(null, v1).sort()).toEqual([HERO, MOTHER].sort());
  });

  it("only departments whose slice changed are re-notified", () => {
    // Lights: call time changed + rooftop cut. Art: unchanged.
    expect(changedDepartments(v1, v2, [LIGHTS, ART])).toEqual([LIGHTS]);
    // Hero loses the rooftop scene; Mother's pickup moved.
    expect(changedActors(v1, v2).sort()).toEqual([HERO, MOTHER].sort());
  });
});

describe("change summary", () => {
  it("describes the changes in plain words", () => {
    const lines = describeChanges(v1, v2, { dept: (d) => (d === LIGHTS ? "Lights" : "Art"), actor: () => "Mother" });
    expect(lines).toContain("General call 07:00 → 06:30");
    expect(lines).toContain("Lights call 07:00 → 06:30");
    expect(lines).toContain("Scene 48 cut (rain)");
    expect(lines).toContain("Mother pickup 05:15 → 04:45");
  });
});
