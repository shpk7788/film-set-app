import type { FilmRole } from "./permissions";

export type Channel = { label: string; tone: "everyone" | "dept" | "production" | "direction" | "dark" };

/** What a role can see, in plain words — shown before someone joins a film. */
export function channelsFor(role: FilmRole, departmentName: string | null): Channel[] {
  const out: Channel[] = [{ label: "Notices for everyone", tone: "everyone" }];
  switch (role) {
    case "department_head":
    case "department_crew":
      out.push({ label: `${departmentName ?? "Your department"} call sheet`, tone: "dept" });
      break;
    case "actor":
      out.push({ label: "Your own call sheet", tone: "dept" });
      break;
    case "direction_intern":
      out.push({ label: "Today's shooting and your jobs", tone: "direction" });
      break;
    case "second_ad":
      out.push({ label: "Today's and tomorrow's schedule", tone: "direction" });
      break;
    case "first_ad":
      out.push({ label: "Full schedule and live shooting view", tone: "direction" });
      break;
    case "director":
    case "co_director":
      out.push({ label: "Full schedule — edit and send", tone: "direction" });
      break;
    case "production_team":
    case "production_manager":
      out.push({ label: "Full schedule (view)", tone: "direction" });
      out.push({ label: "Crew lists and history", tone: "production" });
      break;
    case "executive_producer":
      out.push({ label: "Full schedule (view)", tone: "direction" });
      out.push({ label: "Crew lists, history and approvals", tone: "production" });
      break;
    case "producer":
      out.push({ label: "Full schedule (view)", tone: "direction" });
      out.push({ label: "Crew lists and history", tone: "production" });
      out.push({ label: "Contracts and payments", tone: "dark" });
      break;
  }
  return out;
}
