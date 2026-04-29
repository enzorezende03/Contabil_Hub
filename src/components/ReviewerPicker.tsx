import { useState } from "react";
import { Check, ChevronsUpDown, User2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useReviewers } from "@/hooks/use-reviewers";

interface ReviewerPickerProps {
  value: string | null;
  onChange: (userId: string, displayName: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  coordenacao: "Coordenação",
  analista: "Analista",
  assistente: "Assistente",
  estagiario: "Estagiário",
};

export function ReviewerPicker({ value, onChange, placeholder = "Selecionar revisora...", disabled }: ReviewerPickerProps) {
  const [open, setOpen] = useState(false);
  const { data: reviewers = [], isLoading } = useReviewers();
  const selected = reviewers.find((r) => r.user_id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled || isLoading}
          className="w-full justify-between h-9 font-normal text-sm"
        >
          <span className="flex items-center gap-2 min-w-0">
            <User2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="truncate">
              {selected ? (
                <>
                  {selected.display_name}
                  <span className="text-muted-foreground"> · {ROLE_LABEL[selected.role] || selected.role}</span>
                </>
              ) : (
                <span className="text-muted-foreground">{isLoading ? "Carregando..." : placeholder}</span>
              )}
            </span>
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar revisora..." className="h-9" />
          <CommandList>
            <CommandEmpty>Nenhuma candidata encontrada.</CommandEmpty>
            <CommandGroup>
              {reviewers.map((r) => (
                <CommandItem
                  key={r.user_id}
                  value={`${r.display_name} ${r.role}`}
                  onSelect={() => {
                    onChange(r.user_id, r.display_name);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <Check className={cn("w-3.5 h-3.5", value === r.user_id ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 min-w-0 truncate">
                    <span className="text-sm">{r.display_name}</span>
                    <span className="text-[11px] text-muted-foreground"> · {ROLE_LABEL[r.role] || r.role}</span>
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap",
                      r.pending_count === 0
                        ? "bg-success/15 text-success"
                        : r.pending_count <= 3
                        ? "bg-muted text-muted-foreground"
                        : r.pending_count <= 6
                        ? "bg-warning/15 text-warning-foreground"
                        : "bg-destructive/15 text-destructive"
                    )}
                  >
                    {r.pending_count} pend.
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
