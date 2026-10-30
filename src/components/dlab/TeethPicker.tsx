import { FDI_LOWER, FDI_UPPER } from "@/lib/labWorkflow";
import { cn } from "@/lib/utils";

export function TeethPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (t: string) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  const row = (teeth: string[]) => (
    <div className="grid grid-cols-16 gap-0.5" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
      {teeth.map((t) => (
        <button key={t} type="button" onClick={() => toggle(t)} aria-pressed={value.includes(t)}
          className={cn("rounded border py-1 text-[10px] font-mono transition-colors",
            value.includes(t) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted")}>
          {t}
        </button>
      ))}
    </div>
  );
  return (
    <div className="space-y-1">
      {row(FDI_UPPER)}
      {row(FDI_LOWER)}
      <p className="text-[11px] text-muted-foreground">{value.length ? `Selected: ${value.join(", ")}` : "Tap teeth (FDI)"}</p>
    </div>
  );
}
