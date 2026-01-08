import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GoalType } from "@/types/todayoum";

/**
 * GoalTypeBadge - Displays the goal type as a subtle badge
 * Used near page titles to answer "what kind of item is this?"
 */

const GOAL_TYPE_CONFIG: Record<GoalType, { label: string; className: string }> = {
  three_year: { 
    label: "3-Year Goal", 
    className: "bg-primary/10 text-primary border-primary/20" 
  },
  one_year: { 
    label: "1-Year Goal", 
    className: "bg-secondary/50 text-secondary-foreground border-secondary" 
  },
  ninety_day: { 
    label: "90-Day Plan", 
    className: "bg-muted text-muted-foreground border-muted-foreground/20" 
  }
};

interface GoalTypeBadgeProps {
  goalType: GoalType;
  className?: string;
}

const GoalTypeBadge = ({ goalType, className }: GoalTypeBadgeProps) => {
  const config = GOAL_TYPE_CONFIG[goalType];
  
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "text-xs font-normal px-2 py-0.5",
        config.className,
        className
      )}
    >
      {config.label}
    </Badge>
  );
};

export default GoalTypeBadge;
