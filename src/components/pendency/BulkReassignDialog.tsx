import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  options: Array<{ user_id: string; display_name: string }>;
  count: number;
  onConfirm: (userId: string) => Promise<void> | void;
}

export function BulkReassignDialog({ open, onOpenChange, options, count, onConfirm }: Props) {
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const filtered = options.filter((r) =>
    (r.display_name || "").toLowerCase().includes(search.toLowerCase()),
  );

  async function pick(userId: string) {
    setSaving(true);
    try {
      await onConfirm(userId);
      onOpenChange(false);
      setSearch("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reatribuir {count} pendência(s)</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Buscar responsável..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8"
        />
        <div className="max-h-72 overflow-y-auto space-y-0.5">
          {filtered.length === 0 && (
            <div className="text-[11px] text-muted-foreground p-2 text-center">
              Nenhum responsável encontrado
            </div>
          )}
          {filtered.map((r) => (
            <button
              key={r.user_id}
              type="button"
              disabled={saving}
              onClick={() => pick(r.user_id)}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-2 py-2 text-sm rounded hover:bg-muted transition",
                "disabled:opacity-50",
              )}
            >
              <span className="truncate">{r.display_name || "—"}</span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
