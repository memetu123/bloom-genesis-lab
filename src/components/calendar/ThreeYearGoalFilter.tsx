import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * ThreeYearGoalFilter - Dropdown filter for 3-Year Goals
 * Shows in left rail of Weekly/Daily views
 */

interface ThreeYearGoal {
  id: string;
  title: string;
}

interface ThreeYearGoalFilterProps {
  goals: ThreeYearGoal[];
  selectedGoalId: string | null;
  onSelectGoal: (goalId: string | null) => void;
  className?: string;
}

const ThreeYearGoalFilter = ({
  goals,
  selectedGoalId,
  onSelectGoal,
  className,
}: ThreeYearGoalFilterProps) => {
  const selectedGoal = selectedGoalId 
    ? goals.find(g => g.id === selectedGoalId)
    : null;

  if (goals.length === 0) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          3-Year Focus
        </span>
        {selectedGoalId && (
          <button
            onClick={() => onSelectGoal(null)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
          >
            <X className="h-3 w-3" />
            <span>Clear</span>
          </button>
        )}
      </div>
      
      <Select
        value={selectedGoalId || "all"}
        onValueChange={(value) => onSelectGoal(value === "all" ? null : value)}
      >
        <SelectTrigger 
          className={cn(
            "h-7 text-[11px] bg-muted/30 border-border/50",
            selectedGoalId && "ring-1 ring-primary/20 bg-primary/5"
          )}
        >
          <SelectValue placeholder="All 3-Year Goals" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-[11px]">
            All 3-Year Goals
          </SelectItem>
          {goals.map((goal) => (
            <SelectItem key={goal.id} value={goal.id} className="text-[11px]">
              {goal.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default ThreeYearGoalFilter;
