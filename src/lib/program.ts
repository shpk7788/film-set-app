import type { ProgramData, ProgramItem } from "@/db/schema";

export function emptyProgram(): ProgramData {
  return { location: "", generalCall: "07:00", deptCalls: {}, actorTimes: {}, notes: "", items: [] };
}

export type DeptSlice = {
  called: boolean;
  callTime: string;
  location: string;
  items: (ProgramItem & { need: string })[];
  cutItems: ProgramItem[];
};

export function deptSlice(data: ProgramData, departmentId: string): DeptSlice {
  const live = data.items.filter((i) => !i.cut && i.needs[departmentId] !== undefined);
  const called = departmentId in data.deptCalls || live.length > 0;
  return {
    called,
    callTime: data.deptCalls[departmentId] || data.generalCall,
    location: data.location,
    items: live.map((i) => ({ ...i, need: i.needs[departmentId] ?? "" })),
    cutItems: data.items.filter((i) => i.cut && i.needs[departmentId] !== undefined),
  };
}

export type ActorSlice = {
  called: boolean;
  times: ProgramData["actorTimes"][string];
  location: string;
  items: ProgramItem[];
  cutItems: ProgramItem[];
};

export function actorSlice(data: ProgramData, membershipId: string): ActorSlice {
  const items = data.items.filter((i) => !i.cut && i.castIds.includes(membershipId));
  return {
    called: items.length > 0 || membershipId in data.actorTimes,
    times: data.actorTimes[membershipId] ?? {},
    location: data.location,
    items,
    cutItems: data.items.filter((i) => i.cut && i.castIds.includes(membershipId)),
  };
}

/** Department ids called on this day (explicit call time, or needed by a live scene). */
export function calledDepartments(data: ProgramData): string[] {
  const ids = new Set(Object.keys(data.deptCalls));
  for (const i of data.items) if (!i.cut) for (const d of Object.keys(i.needs)) ids.add(d);
  return [...ids];
}

/** Actor membership ids called on this day. */
export function calledActors(data: ProgramData): string[] {
  const ids = new Set(Object.keys(data.actorTimes));
  for (const i of data.items) if (!i.cut) for (const a of i.castIds) ids.add(a);
  return [...ids];
}

const sliceKey = (s: DeptSlice | ActorSlice) =>
  JSON.stringify({ ...s, items: s.items.map((i) => ({ ...i, jobs: undefined })) });

/** Departments whose slice differs between versions (all called ones on a first version). */
export function changedDepartments(prev: ProgramData | null, next: ProgramData, allDeptIds: string[]): string[] {
  return allDeptIds.filter((d) => {
    const n = deptSlice(next, d);
    if (!prev) return n.called;
    const p = deptSlice(prev, d);
    if (!p.called && !n.called) return false;
    return sliceKey(p) !== sliceKey(n);
  });
}

export function changedActors(prev: ProgramData | null, next: ProgramData): string[] {
  const ids = new Set([...calledActors(next), ...(prev ? calledActors(prev) : [])]);
  return [...ids].filter((a) => {
    const n = actorSlice(next, a);
    if (!prev) return n.called;
    return sliceKey(actorSlice(prev, a)) !== sliceKey(n);
  });
}

/** Plain-language list of what changed, shown at the top of every call sheet. */
export function describeChanges(
  prev: ProgramData | null,
  next: ProgramData,
  names: { dept: (id: string) => string; actor: (id: string) => string },
): string[] {
  if (!prev) return ["First version of this day's schedule"];
  const out: string[] = [];
  if (prev.generalCall !== next.generalCall) out.push(`General call ${prev.generalCall} → ${next.generalCall}`);
  if (prev.location !== next.location) out.push(`Location changed to ${next.location || "—"}`);
  for (const [d, t] of Object.entries(next.deptCalls)) {
    const before = prev.deptCalls[d];
    if (before === undefined) out.push(`${names.dept(d)} now called at ${t}`);
    else if (before !== t) out.push(`${names.dept(d)} call ${before} → ${t}`);
  }
  for (const d of Object.keys(prev.deptCalls)) {
    if (!(d in next.deptCalls)) out.push(`${names.dept(d)} no longer called`);
  }
  const prevByKey = new Map(prev.items.map((i) => [i.key, i]));
  for (const i of next.items) {
    const p = prevByKey.get(i.key);
    const label = `Scene ${i.scene}`;
    if (!p) {
      if (!i.cut) out.push(`${label} added`);
      continue;
    }
    if (!p.cut && i.cut) out.push(`${label} cut${i.cutReason ? ` (${i.cutReason})` : ""}`);
    else if (p.cut && !i.cut) out.push(`${label} back on`);
    else if (!i.cut && (p.start !== i.start || p.end !== i.end)) out.push(`${label} now ${i.start}–${i.end}`);
  }
  for (const p of prev.items) {
    if (!next.items.some((i) => i.key === p.key) && !p.cut) out.push(`Scene ${p.scene} removed`);
  }
  for (const [a, t] of Object.entries(next.actorTimes)) {
    const b = prev.actorTimes[a];
    if (b && b.pickup !== t.pickup && t.pickup) out.push(`${names.actor(a)} pickup ${b.pickup ?? "—"} → ${t.pickup}`);
  }
  return out.length ? out : ["Small edits — no time or scene changes"];
}

export const fmtTenths = (t: number) => (t % 10 === 0 ? String(t / 10) : (t / 10).toFixed(1));
