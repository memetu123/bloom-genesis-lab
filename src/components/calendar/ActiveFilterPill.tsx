import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ActiveFilterPill - Shows active 3-Year Goal filter near calendar header
 * Subtle indicator with clear action
 */

interface ActiveFilterPillProps {
  goalTitle: string;
  onClear: () => void;
  className?: string;
}

const ActiveFilterPill = ({ goalTitle, onClear, className }: ActiveFilterPillProps) => {
  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full",
      "bg-primary/10 text-primary text-[11px] font-medium",
      "border border-primary/20",
      className
    )}>
      <span className="text-muted-foreground">3-Year:</span>
      <span className="truncate max-w-[120px]">{goalTitle}</span>
      <button
        onClick={onClear}
        className="p-0.5 hover:bg-primary/10 rounded-full transition-colors"
        aria-label="Clear filter"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
};

export default ActiveFilterPill;
