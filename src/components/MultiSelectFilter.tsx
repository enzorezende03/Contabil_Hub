import { useMemo, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MultiSelectOption = { value: string; label: string };

type Props = {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  allLabel: string;
  className?: string;
  width?: string;
};

export function MultiSelectFilter({ options, value, onChange, allLabel, className, width }: Props) {
  const [open, setOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(value), [value]);

  const label = useMemo(() => {
    if (value.length === 0) return allLabel;
    if (value.length === 1) {
      return options.find((o) => o.value === value[0])?.label ?? allLabel;
    }
    return `${value.length} selecionados`;
  }, [value, options, allLabel]);

  const toggle = (v: string) => {
    if (selectedSet.has(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-8 text-xs px-2 flex items-center justify-between gap-1 rounded-md border border-input bg-background hover:bg-accent/40 flex-shrink-0",
            className,
          )}
          style={width ? { width } : undefined}
        >
          <span className="truncate">{label}</span>
          <span className="flex items-center gap-1 flex-shrink-0">
            {value.length > 0 && (
              <X
                className="h-3 w-3 opacity-60 hover:opacity-100"
                onClick={clear}
              />
            )}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-1 w-56" align="start">
        <button
          type="button"
          onClick={() => onChange([])}
          className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent flex items-center justify-between"
        >
          <span className="font-medium">{allLabel}</span>
          {value.length === 0 && <Check className="h-3 w-3" />}
        </button>
        <div className="h-px bg-border my-1" />
        <div className="max-h-64 overflow-auto">
          {options.map((opt) => {
            const selected = selectedSet.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent flex items-center gap-2"
              >
                <span
                  className={cn(
                    "h-3.5 w-3.5 rounded border flex items-center justify-center flex-shrink-0",
                    selected ? "bg-primary border-primary text-primary-foreground" : "border-input",
                  )}
                >
                  {selected && <Check className="h-2.5 w-2.5" />}
                </span>
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
        {value.length > 0 && (
          <>
            <div className="h-px bg-border my-1" />
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-center px-2 py-1.5 text-xs rounded hover:bg-accent text-muted-foreground"
            >
              Limpar
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
