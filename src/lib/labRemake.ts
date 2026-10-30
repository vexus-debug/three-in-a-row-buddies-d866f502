// Remake & warranty rules for dental lab cases.

export const REMAKE_FAULTS = [
  { key: "lab", label: "Lab fault", hint: "Free remake — internal error (over-milled margin, wrong shade)", billable: false },
  { key: "clinic", label: "Clinic fault", hint: "Billable remake — new impression, changed prep or shade", billable: true },
  { key: "material", label: "Material failure", hint: "Supplier claim — fractured disc, defective blank", billable: false },
] as const;

export type RemakeFault = (typeof REMAKE_FAULTS)[number]["key"];

export const REMAKE_REASONS = ["Fit", "Shade", "Fracture", "Contact / occlusion", "New impression", "Prep changed", "Other"];

/** Remakes are rushed back with this many days turnaround. */
export const REMAKE_TURNAROUND_DAYS = 2;

/** "LC-2026-0042-R1" → "LC-2026-0042". */
export const baseCaseNumber = (n: string) => (n || "").replace(/-R\d+$/i, "");

/** Next free remake number for a case, looking at every existing case number. */
export function nextRemakeNumber(caseNumber: string, existing: string[]): string {
  const base = baseCaseNumber(caseNumber);
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-R(\\d+)$`, "i");
  const max = existing.reduce((m, n) => { const x = re.exec(n || ""); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `${base}-R${max + 1}`;
}

/** Lab fee charged on the remake: only clinic-fault remakes are billed. */
export const remakeFee = (fault: RemakeFault, originalFee: number) =>
  REMAKE_FAULTS.find((f) => f.key === fault)?.billable ? Number(originalFee || 0) : 0;

/** A case already has an open remake when a child is not delivered or cancelled. */
export const hasOpenRemake = (parentId: string, cases: { parent_case_id?: string | null; status?: string | null }[]) =>
  cases.some((c) => c.parent_case_id === parentId && !["delivered", "cancelled"].includes(c.status || ""));

export function remakeDueDate(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + REMAKE_TURNAROUND_DAYS);
  return d.toISOString().slice(0, 10);
}

/** Remake % grouped by a key (clinic, work type, technician). */
export function remakeRateBy<T>(cases: T[], remakes: T[], key: (c: T) => string) {
  const total = new Map<string, number>();
  cases.forEach((c) => total.set(key(c), (total.get(key(c)) || 0) + 1));
  const rm = new Map<string, number>();
  remakes.forEach((c) => rm.set(key(c), (rm.get(key(c)) || 0) + 1));
  return [...rm.entries()]
    .map(([name, n]) => ({ name, remakes: n, total: total.get(name) || n, pct: Math.round((n / (total.get(name) || n)) * 100) }))
    .sort((a, b) => b.pct - a.pct || b.remakes - a.remakes);
}
