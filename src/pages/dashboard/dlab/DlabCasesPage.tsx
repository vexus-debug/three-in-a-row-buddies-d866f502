import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Plus, Search, ChevronRight, ChevronLeft, AlertTriangle, Zap, Pencil, Ban, User, PauseCircle, PlayCircle } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LAB_STAGES, WORK_TYPES, normalizeStage, stageLabel } from "@/config/dentalLab";
import { useLabCases, useUpdateLabCase, type LabCaseRow } from "@/hooks/useLabCases";
import { useStaff } from "@/hooks/useStaff";
import { useMoveCase, useHoldCase, useCreateDentalLabCase, clientOf, patientOf, isRush, isOverdue, isCancelled } from "@/hooks/useDentalLab";
import { CaseFiles } from "@/components/dlab/CaseFiles";
import { TeethPicker } from "@/components/dlab/TeethPicker";
import { HoldDialog } from "@/components/dlab/HoldDialog";
import { blockedReason, nextStage, prevStage, splitLegacyTeeth } from "@/lib/labWorkflow";
import { toast } from "@/hooks/use-toast";
import { useLabClientNames, canonicalClient, useClientPriceLookup } from "./dlabLinks";

/** Structured teeth, falling back to the legacy "Teeth:" line in instructions. */
const teethOf = (c: LabCaseRow): string[] => {
  const t = (c as any).teeth as string[] | undefined;
  return t && t.length ? t : splitLegacyTeeth(c.instructions).teeth;
};
const money = (n: number) => `₦${Number(n || 0).toLocaleString()}`;

export default function DlabCasesPage() {
  const { data: cases = [], isLoading } = useLabCases();
  const move = useMoveCase();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [tech, setTech] = useState("all");
  const [editing, setEditing] = useState(false);
  const technicians = useTechnicians();
  const techName = (id?: string | null) => technicians.find((t) => t.id === id)?.full_name;

  const visible = useMemo(() => cases.filter((c) => !isCancelled(c) &&
    (tech === "all" || (tech === "none" ? !c.technician_id : c.technician_id === tech)) &&
    (!q || [c.case_number, clientOf(c), patientOf(c), c.work_type].join(" ").toLowerCase().includes(q.toLowerCase()))), [cases, q, tech]);
  const open = cases.find((c) => c.id === openId) || null;

  const hold = useHoldCase();
  const [holdFor, setHoldFor] = useState<LabCaseRow | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const isHeld = (c: LabCaseRow) => c.status === "on_hold";

  /** Returns false when the move was refused. */
  const tryMove = (c: LabCaseRow, to: string) => {
    const from = isHeld(c) ? "on_hold" : normalizeStage(c.status);
    const why = blockedReason(from, to, (c as any).qc_status);
    if (why) {
      if (from === "on_hold" || !window.confirm(`${why} Move ${c.case_number} anyway? (admin override)`)) {
        toast({ title: "Move blocked", description: why, variant: "destructive" });
        return false;
      }
    }
    move.mutate({ id: c.id, status: to });
    return true;
  };
  const step = (c: LabCaseRow, dir: 1 | -1) => {
    const s = normalizeStage(c.status);
    const to = dir === 1 ? nextStage(s) : prevStage(s);
    if (to) tryMove(c, to);
  };
  const batchAdvance = () => {
    const list = visible.filter((c) => selected.includes(c.id) && !isHeld(c));
    let n = 0;
    for (const c of list) {
      const to = nextStage(normalizeStage(c.status));
      if (to && !blockedReason(normalizeStage(c.status), to, (c as any).qc_status)) { move.mutate({ id: c.id, status: to }); n++; }
    }
    toast({ title: `Advanced ${n} case${n === 1 ? "" : "s"}`, description: n < list.length ? `${list.length - n} skipped (QC not passed or already delivered).` : undefined });
    setSelected([]);
  };
  const toggleSel = (id: string) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const lanes = [{ key: "on_hold", label: "On Hold", hint: "Waiting on the clinic" }, ...LAB_STAGES];

  return (
    <div className="space-y-5">
      <PageHeader title="Case Board" description="Every case from received to delivered. Tap a case to see scans and files.">
        <Button onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" />New case</Button>
      </PageHeader>
      <div className="flex flex-wrap gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search case, clinic, patient…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={tech} onValueChange={setTech}>
          <SelectTrigger className="w-48" aria-label="Technician"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All technicians</SelectItem>
            <SelectItem value="none">Unassigned</SelectItem>
            {technicians.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        {selected.length > 0 && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={batchAdvance}>Advance {selected.length} selected<ChevronRight className="ml-0.5 h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
          </div>
        )}
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading cases…</p> : (
        <div className="flex gap-3 overflow-x-auto pb-3 snap-x">
          {lanes.map((stage) => {
            const held = stage.key === "on_hold";
            const list = visible.filter((c) => (held ? isHeld(c) : !isHeld(c) && normalizeStage(c.status) === stage.key));
            if (held && !list.length) return null;
            return (
              <div key={stage.key} className={`w-[260px] shrink-0 snap-start rounded-xl p-2 ${held ? "border border-warning/40 bg-warning/10" : "bg-muted/40"}`}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <div><p className="text-sm font-semibold">{stage.label}</p><p className="text-[11px] text-muted-foreground">{stage.hint}</p></div>
                  <Badge variant="secondary">{list.length}</Badge>
                </div>
                <div className="space-y-2">
                  {list.map((c) => (
                    <Card key={c.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => setOpenId(c.id)}>
                      <CardContent className="space-y-1.5 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {!held && stage.key !== "delivered" && <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggleSel(c.id)} aria-label={`Select ${c.case_number}`} />}
                            <span className="text-xs font-mono text-muted-foreground">{c.case_number}</span>
                          </span>
                          <div className="flex gap-1">
                            {isRush(c) && <Badge variant="destructive" className="px-1.5 text-[10px]"><Zap className="mr-0.5 h-3 w-3" />Rush</Badge>}
                            {isOverdue(c) && <Badge variant="outline" className="border-destructive px-1.5 text-[10px] text-destructive"><AlertTriangle className="mr-0.5 h-3 w-3" />Late</Badge>}
                            {(c as any).qc_status === "rework_needed" && <Badge variant="outline" className="border-warning px-1.5 text-[10px]">Rework</Badge>}
                          </div>
                        </div>
                        <p className="text-sm font-medium leading-tight">{teethOf(c).length ? <span className="font-mono text-xs text-primary">#{teethOf(c).join(", #")} · </span> : null}{c.work_type}</p>
                        <p className="text-xs text-muted-foreground">{clientOf(c)} · {patientOf(c)}</p>
                        {held && <p className="text-[11px] font-medium">{(c as any).hold_reason}</p>}
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{c.due_date ? `Due ${format(new Date(c.due_date), "d MMM")}` : ""}</span>
                          <span className="flex items-center gap-0.5"><User className="h-3 w-3" />{techName(c.technician_id) || "Unassigned"}</span>
                        </div>
                        <div className="flex justify-between pt-1" onClick={(e) => e.stopPropagation()}>
                          {held ? (
                            <Button size="sm" variant="ghost" className="h-7 w-full text-xs" onClick={() => hold.mutate({ id: c.id, reason: null })}><PlayCircle className="mr-1 h-3.5 w-3.5" />Release hold</Button>
                          ) : (<>
                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={stage.key === "pending"} onClick={() => step(c, -1)} aria-label="Move back"><ChevronLeft className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={stage.key === "delivered"} onClick={() => step(c, 1)}>Next stage<ChevronRight className="ml-0.5 h-3.5 w-3.5" /></Button>
                          </>)}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {!list.length && <p className="py-4 text-center text-xs text-muted-foreground">No cases</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={!!open} onOpenChange={(o) => { if (!o) { setOpenId(null); setEditing(false); } }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open && (
            <>
              <SheetHeader><SheetTitle>{open.case_number} · {open.work_type}</SheetTitle></SheetHeader>
              {editing ? <EditCase c={open} technicians={technicians} onDone={() => setEditing(false)} /> : (
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit case</Button>
                  {isHeld(open)
                    ? <Button size="sm" variant="outline" disabled={hold.isPending} onClick={() => hold.mutate({ id: open.id, reason: null })}><PlayCircle className="mr-1 h-3.5 w-3.5" />Release hold</Button>
                    : <Button size="sm" variant="outline" onClick={() => setHoldFor(open)}><PauseCircle className="mr-1 h-3.5 w-3.5" />Put on hold</Button>}
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
                    if (window.confirm(`Cancel case ${open.case_number}? It will be removed from the board and from billing.`)) { move.mutate({ id: open.id, status: "cancelled" }); setOpenId(null); }
                  }}><Ban className="mr-1 h-3.5 w-3.5" />Cancel case</Button>
                </div>
                {isHeld(open) && (
                  <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
                    <p className="font-medium">On hold{(open as any).hold_at ? ` since ${format(new Date((open as any).hold_at), "d MMM, HH:mm")}` : ""}</p>
                    <p>{(open as any).hold_reason}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Info label="Client clinic" value={clientOf(open)} />
                  <Info label="Doctor" value={open.clinic_doctor_name || "—"} />
                  <Info label="Patient" value={patientOf(open)} />
                  <Info label="Due" value={open.due_date ? format(new Date(open.due_date), "d MMM yyyy") : "—"} />
                  <Info label="Teeth" value={teethOf(open).join(", ") || "—"} />
                  <Info label="Shade" value={open.shade || "—"} />
                  <Info label="Material" value={open.material || "—"} />
                  <Info label="Fee" value={money(open.lab_fee)} />
                  <Info label="Stage" value={isHeld(open) ? "On hold" : stageLabel(open.status)} />
                  <Info label="QC" value={(open as any).qc_status || "pending"} />
                  <Info label="Technician" value={techName(open.technician_id) || "Unassigned"} />
                </div>
                {open.instructions && <div><p className="text-xs text-muted-foreground">Instructions</p><p className="whitespace-pre-wrap">{open.instructions}</p></div>}
                {!isHeld(open) && (
                <div>
                  <Label className="text-xs text-muted-foreground">Move to stage</Label>
                  <Select value={normalizeStage(open.status)} onValueChange={(v) => tryMove(open, v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{LAB_STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                )}
                <CaseFiles caseId={open.id} />
              </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {holdFor && (
        <HoldDialog open onOpenChange={(o) => { if (!o) setHoldFor(null); }} caseNumber={holdFor.case_number} patient={patientOf(holdFor)}
          doctor={holdFor.clinic_doctor_name || undefined} pending={hold.isPending}
          onConfirm={(reason) => hold.mutate({ id: holdFor.id, reason }, { onSuccess: () => setHoldFor(null) })} />
      )}
      <NewCaseDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

/** Lab staff who can be given cases (technicians first, then anyone active). */
function useTechnicians() {
  const { data = [] } = useStaff();
  return useMemo(() => {
    const active = data.filter((s) => (s.status || "active") === "active");
    const techs = active.filter((s) => /tech|lab|ceram|cad/i.test(`${s.role} ${s.specialty || ""}`));
    return techs.length ? techs : active;
  }, [data]);
}

function EditCase({ c, technicians, onDone }: { c: LabCaseRow; technicians: { id: string; full_name: string }[]; onDone: () => void }) {
  const update = useUpdateLabCase();
  const names = useLabClientNames();
  const legacy = splitLegacyTeeth(c.instructions);
  const initTeeth = ((c as any).teeth as string[] | undefined)?.length ? (c as any).teeth as string[] : legacy.teeth;
  const [teeth, setTeeth] = useState<string[]>(initTeeth);
  const [v, setV] = useState({
    client: clientOf(c) === "Walk-in client" ? "" : clientOf(c), doctor: c.clinic_doctor_name || "", patient: c.external_patient_name || "",
    work_type: c.work_type || WORK_TYPES[0], shade: c.shade || "", material: c.material || "", due_date: c.due_date || "",
    fee: String(c.lab_fee ?? ""), discount: String(c.discount ?? ""), instructions: ((c as any).teeth?.length ? c.instructions : legacy.rest) || "", rush: isRush(c), technician_id: c.technician_id || "none",
  });
  const set = (k: string, val: any) => setV((p) => ({ ...p, [k]: val }));
  const types = WORK_TYPES.includes(v.work_type) ? WORK_TYPES : [v.work_type, ...WORK_TYPES];
  const save = () => {
    const t = v.technician_id === "none" ? null : v.technician_id;
    update.mutate({
      id: c.id, external_client_name: canonicalClient(v.client, names), clinic_doctor_name: v.doctor, external_patient_name: v.patient,
      work_type: v.work_type, shade: v.shade, material: v.material, due_date: v.due_date || null,
      lab_fee: Number(v.fee || 0), discount: Number(v.discount || 0), instructions: v.instructions, teeth,
      urgency: v.rush ? "urgent" : "normal", is_urgent: v.rush, technician_id: t, assigned_technician_id: t,
    }, { onSuccess: onDone });
  };
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <F label="Client clinic *"><Input list="dlab-edit-clients" value={v.client} onChange={(e) => set("client", e.target.value)} />
        <datalist id="dlab-edit-clients">{names.map((n) => <option key={n} value={n} />)}</datalist></F>
      <F label="Doctor"><Input value={v.doctor} onChange={(e) => set("doctor", e.target.value)} /></F>
      <F label="Patient"><Input value={v.patient} onChange={(e) => set("patient", e.target.value)} /></F>
      <F label="Work type">
        <Select value={v.work_type} onValueChange={(x) => set("work_type", x)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{types.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
        </Select>
      </F>
      <div className="sm:col-span-2"><F label="Teeth"><TeethPicker value={teeth} onChange={setTeeth} /></F></div>
      <F label="Shade"><Input value={v.shade} onChange={(e) => set("shade", e.target.value)} /></F>
      <F label="Material"><Input value={v.material} onChange={(e) => set("material", e.target.value)} /></F>
      <F label="Due date"><Input type="date" value={v.due_date} onChange={(e) => set("due_date", e.target.value)} /></F>
      <F label="Technician"><TechSelect value={v.technician_id} onChange={(x) => set("technician_id", x)} technicians={technicians} /></F>
      <F label="Fee (₦)"><Input type="number" value={v.fee} onChange={(e) => set("fee", e.target.value)} /></F>
      <F label="Discount (₦)"><Input type="number" value={v.discount} onChange={(e) => set("discount", e.target.value)} /></F>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox checked={v.rush} onCheckedChange={(x) => set("rush", !!x)} />Rush case</label>
      <div className="sm:col-span-2"><F label="Instructions"><Textarea rows={4} value={v.instructions} onChange={(e) => set("instructions", e.target.value)} /></F></div>
      <div className="flex gap-2 sm:col-span-2">
        <Button onClick={save} disabled={!v.client.trim() || update.isPending}>{update.isPending ? "Saving…" : "Save changes"}</Button>
        <Button variant="outline" onClick={onDone}>Back</Button>
      </div>
    </div>
  );
}

function TechSelect({ value, onChange, technicians }: { value: string; onChange: (v: string) => void; technicians: { id: string; full_name: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Unassigned</SelectItem>
        {technicians.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>;
}

export function NewCaseDialog({ open, onOpenChange, defaultClient = "" }: { open: boolean; onOpenChange: (o: boolean) => void; defaultClient?: string }) {
  const create = useCreateDentalLabCase();
  const blank = { client: defaultClient, doctor: "", patient: "", work_type: WORK_TYPES[0], teeth: [] as string[], shade: "", material: "", due_date: "", fee: "", instructions: "", rush: false, technician_id: "none" };
  const technicians = useTechnicians();
  const [v, setV] = useState<Record<string, any>>(blank);
  const names = useLabClientNames();
  const priceFor = useClientPriceLookup();
  const [feeTouched, setFeeTouched] = useState(false);
  const agreed = priceFor(v.client, v.work_type);
  const set = (k: string, val: any) => setV((p) => {
    const next = { ...p, [k]: val };
    if (!feeTouched && (k === "client" || k === "work_type")) {
      const price = priceFor(next.client, next.work_type);
      if (price !== null) next.fee = String(price);
    }
    return next;
  });
  const submit = async () => {
    if (!v.client.trim()) return;
    await create.mutateAsync({ ...v, technician_id: v.technician_id === "none" ? null : v.technician_id, client: canonicalClient(v.client, names) });
    setFeeTouched(false);
    setV(blank);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (o) { setFeeTouched(false); setV({ ...blank, client: defaultClient }); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Receive a new case</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Client clinic *">
            <Input list="dlab-client-names" value={v.client} onChange={(e) => set("client", e.target.value)} onBlur={() => set("client", canonicalClient(v.client, names))} />
            <datalist id="dlab-client-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
          </F>
          <F label="Doctor"><Input value={v.doctor} onChange={(e) => set("doctor", e.target.value)} /></F>
          <F label="Patient"><Input value={v.patient} onChange={(e) => set("patient", e.target.value)} /></F>
          <F label="Work type">
            <Select value={v.work_type} onValueChange={(x) => set("work_type", x)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{WORK_TYPES.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <div className="sm:col-span-2"><F label="Teeth"><TeethPicker value={v.teeth} onChange={(t) => set("teeth", t)} /></F></div>
          <F label="Shade"><Input placeholder="e.g. A2" value={v.shade} onChange={(e) => set("shade", e.target.value)} /></F>
          <F label="Material"><Input value={v.material} onChange={(e) => set("material", e.target.value)} /></F>
          <F label="Due date"><Input type="date" value={v.due_date} onChange={(e) => set("due_date", e.target.value)} /></F>
          <F label="Fee (₦)">
            <Input type="number" value={v.fee} onChange={(e) => { setFeeTouched(true); set("fee", e.target.value); }} />
            {agreed !== null && <p className="text-[11px] text-muted-foreground">Agreed price for this clinic: {money(agreed)}{feeTouched && Number(v.fee) !== agreed ? " (changed)" : ""}</p>}
          </F>
          <F label="Technician"><TechSelect value={v.technician_id} onChange={(x) => set("technician_id", x)} technicians={technicians} /></F>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={v.rush} onCheckedChange={(c) => set("rush", !!c)} />Rush case</label>
          <div className="sm:col-span-2"><F label="Instructions"><Textarea rows={3} value={v.instructions} onChange={(e) => set("instructions", e.target.value)} /></F></div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={!v.client.trim() || create.isPending}>Save case</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}
