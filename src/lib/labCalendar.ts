// Pure scheduling helpers for the dental lab Production Calendar.

export interface CalCase {
  due_date: string | null;
  status: string;
  work_type?: string | null;
  teeth?: string[] | null;
}

const CLOSED = ["delivered", "cancelled"];

/** Standard turnaround (working days → calendar days) by work type. */
export const TURNAROUND_DAYS: Record<string, number> = {
  "Zirconia crown": 5, "E.max crown": 5, "PFM crown": 6, "Bridge": 7, "Implant crown": 7,
  "Veneer": 6, "Inlay / Onlay": 5, "Full denture": 10, "Partial denture": 10,
  "Night guard": 3, "Clear aligner": 7, "Model / Study cast": 2,
};
export const DEFAULT_TURNAROUND = 5;

export const turnaroundFor = (workType?: string | null) =>
  (workType && TURNAROUND_DAYS[workType]) || DEFAULT_TURNAROUND;

/** Units a case consumes: number of teeth, minimum 1. */
export const unitsOf = (c: CalCase) => Math.max(1, c.teeth?.length || 0);

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function addDaysYmd(from: Date, days: number) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return ymd(d);
}

/** Whole days a case is late (0 when not late or closed). */
export function daysLate(c: CalCase, today = new Date()) {
  if (!c.due_date || CLOSED.includes(c.status)) return 0;
  const [y, m, d] = c.due_date.split("-").map(Number);
  const due = new Date(y, m - 1, d).getTime();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.max(0, Math.round((t - due) / 86400000));
}

export const isUnscheduled = (c: CalCase) => !c.due_date && !CLOSED.includes(c.status);

export type LoadLevel = "none" | "normal" | "busy" | "overloaded";

/** <70% normal, 70–90% busy, >90% overloaded. */
export function loadLevel(units: number, capacity: number): LoadLevel {
  if (units <= 0) return "none";
  if (capacity <= 0) return "overloaded";
  const pct = (units / capacity) * 100;
  if (pct > 90) return "overloaded";
  if (pct >= 70) return "busy";
  return "normal";
}

/** Units due per day, excluding cancelled cases. */
export function unitsByDay(cases: CalCase[]) {
  const m: Record<string, number> = {};
  cases.forEach((c) => {
    if (c.due_date && c.status !== "cancelled") m[c.due_date] = (m[c.due_date] || 0) + unitsOf(c);
  });
  return m;
}
