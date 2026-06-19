import { Button } from "@/components/ui/button";
import { X, Send, Pause, UserCog } from "lucide-react";

interface Props {
  count: number;
  canPause?: boolean;
  canReassign?: boolean;
  onClear: () => void;
  onCobrar: () => void;
  onPausar: () => void;
  onReatribuir: () => void;
}

export function BulkActionBar({
  count,
  canPause = true,
  canReassign = true,
  onClear,
  onCobrar,
  onPausar,
  onReatribuir,
}: Props) {
  if (count === 0) return null;
  return (
    <div className="sticky top-2 z-30 flex items-center gap-3 rounded-lg border bg-primary text-primary-foreground px-3 py-2 shadow-md">
      <button
        onClick={onClear}
        className="p-1 rounded hover:bg-primary-foreground/10"
        aria-label="Limpar seleção"
      >
        <X className="w-4 h-4" />
      </button>
      <span className="text-sm font-medium">
        {count} pendência{count > 1 ? "s" : ""} selecionada{count > 1 ? "s" : ""}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2.5 text-xs"
          onClick={onCobrar}
        >
          <Send className="w-3.5 h-3.5 mr-1" /> Cobrar em lote
        </Button>
        {canPause && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2.5 text-xs"
            onClick={onPausar}
          >
            <Pause className="w-3.5 h-3.5 mr-1" /> Pausar
          </Button>
        )}
        {canReassign && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2.5 text-xs"
            onClick={onReatribuir}
          >
            <UserCog className="w-3.5 h-3.5 mr-1" /> Reatribuir
          </Button>
        )}
      </div>
    </div>
  );
}
