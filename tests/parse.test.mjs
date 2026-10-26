import test from "node:test";
import assert from "node:assert/strict";
import { parseDates, parseDate, parseTime, parseSchedule } from "../js/parse.js";

const today = "2026-10-27";
const actors = [{ id: "a1", name: "Hari Kumar", character: "Vetri" }, { id: "a2", name: "Meena", character: "Selvi" }];
const departments = [{ id: "d1", name: "Art" }, { id: "d2", name: "Costume" }];
const ctx = { actors, departments, today };

test("dates", () => {
  assert.deepEqual(parseDates("Nov 3-5, 12", today), ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-12"]);
  assert.deepEqual(parseDates("3rd to 5th November and 2 Dec", today), ["2026-11-03", "2026-11-04", "2026-11-05", "2026-12-02"]);
  assert.deepEqual(parseDates("03/11/2026 - 05/11/2026", today), ["2026-11-03", "2026-11-04", "2026-11-05"]);
  assert.deepEqual(parseDates("Available: 7, 8 & 9 Jan", today), ["2027-01-07", "2027-01-08", "2027-01-09"]);
  assert.equal(parseDate("5/11", today), "2026-11-05");
});

test("times", () => {
  assert.equal(parseTime("7.30 am"), "07:30");
  assert.equal(parseTime("7 pm"), "19:00");
  assert.equal(parseTime("19:15"), "19:15");
  assert.equal(parseTime("7"), "");
});

test("whatsapp text", () => {
  const msg = `DAY 3 - 5/11
Call 6.30 am
Location: Karaikudi house
Sc 46, 47 INT. House - Night 7:30-10:30 Cast: Hari, Meena
Sc 52 EXT. Street - Day 11 am Vetri
DAY 4 - 6/11
Sc 60 INT. Temple 9:00`;
  const { days } = parseSchedule(msg, ctx);
  assert.equal(days.length, 2);
  assert.equal(days[0].date, "2026-11-05");
  assert.equal(days[0].dayNumber, 3);
  assert.equal(days[0].generalCall, "06:30");
  assert.equal(days[0].location, "Karaikudi house");
  assert.deepEqual(days[0].items.map((i) => i.scene), ["46", "47", "52"]);
  assert.deepEqual(days[0].items[0].castIds.sort(), ["a1", "a2"]);
  assert.equal(days[0].items[0].start, "07:30");
  assert.equal(days[0].items[0].end, "10:30");
  assert.match(days[0].items[0].heading, /INT\. House/);
  assert.deepEqual(days[0].items[2].castIds, ["a1"]);
  assert.equal(days[1].items[0].start, "09:00");
});

test("sheet rows (pasted from Google Sheets)", () => {
  const tsv = "Shoot schedule\nDate\tSc No\tInt/Ext & Set\tTime\tArtists\tArt\n05/11/2026\t46\tINT. House\t7:30\tHari, Ravi\tLamp, curtains\n05/11/2026\t47\tINT. House\t9:00\tMeena\t\n06/11/2026\t60\tEXT. Temple\t8 am\tSelvi\t";
  const { days } = parseSchedule(tsv, ctx);
  assert.equal(days.length, 2);
  assert.equal(days[0].items.length, 2);
  assert.deepEqual(days[0].items[0].castIds, ["a1"]);
  assert.deepEqual(days[0].items[0].unknownCast, ["Ravi"]);
  assert.equal(days[0].items[0].needs.d1, "Lamp, curtains");
  assert.deepEqual(days[1].items[0].castIds, ["a2"]);
  assert.equal(days[1].items[0].start, "08:00");
});
