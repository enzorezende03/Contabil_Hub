import type { TeamMember } from "@/lib/types";
import { Label } from "@/components/ui/label";

interface Props {
  members: TeamMember[];
  value: string[];
  onChange: (v: string[]) => void;
  excludeId?: string;
  disabled?: boolean;
}

/** Lets the user pick other collaborators who share the same activity (trabalho colaborativo). */
export function CoAssigneePicker({ members, value, onChange, excludeId, disabled }: Props) {
  const options = members.filter((m) => m.id !== excludeId);
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="col-span-2">
      <Label className="text-xs">Trabalho colaborativo (outras colaboradoras na mesma atividade)</Label>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {options.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma outra colaboradora disponível</span>}
        {options.map((m) => {
          const on = value.includes(m.id);
          return (
            <button
              type="button"
              key={m.id}
              disabled={disabled}
              onClick={() => toggle(m.id)}
              className={`px-2 py-0.5 rounded-full text-xs border transition-colors disabled:opacity-50 ${on ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:bg-muted"}`}
            >
              {m.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** True if the user is the main assignee or a co-assignee. */
export const isInvolved = (d: { assignee: string; coAssignees?: string[] }, userId: string) =>
  d.assignee === userId || (d.coAssignees ?? []).includes(userId);
