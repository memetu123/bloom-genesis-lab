import { ReactNode } from "react";
import { Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * CalendarLeftRail - Persistent left sidebar for calendar views
 * Contains:
 * - Overall progress section (scrollable)
 * - Primary action buttons (Add task, Focus toggle)
 */

interface ProgressItem {
  id: string;
  title: string;
  planned: number;
  actual: number;
  goalTitle?: string | null;
}

interface CalendarLeftRailProps {
  // Progress data
  totalPlanned: number;
  totalActual: number;
  progressItems?: ProgressItem[];
  
  // Actions
  onAddTask: () => void;
  showFocusedOnly: boolean;
  onToggleFocus: () => void;
  
  // Optional children for additional content
  children?: ReactNode;
  
  className?: string;
}

const CalendarLeftRail = ({
  totalPlanned,
  totalActual,
  progressItems = [],
  onAddTask,
  showFocusedOnly,
  onToggleFocus,
  children,
  className,
}: CalendarLeftRailProps) => {
  const overallProgress = totalPlanned > 0 ? Math.min(totalActual / totalPlanned, 1) : 0;
  
  // Group progress items by goal
  const groupedByGoal: Record<string, { title: string; items: ProgressItem[] }> = {};
  const independentItems: ProgressItem[] = [];
  
  progressItems.forEach((item) => {
    if (item.goalTitle) {
      if (!groupedByGoal[item.goalTitle]) {
        groupedByGoal[item.goalTitle] = { title: item.goalTitle, items: [] };
      }
      groupedByGoal[item.goalTitle].items.push(item);
    } else {
      independentItems.push(item);
    }
  });
  
  const goalGroups = Object.values(groupedByGoal);
  
  return (
    <aside className={cn(
      "w-64 shrink-0 border-r border-border bg-sidebar-background",
      "flex flex-col h-full",
      className
    )}>
      {/* Primary Actions - Fixed at top */}
      <div className="p-4 border-b border-border space-y-2">
        <Button 
          onClick={onAddTask}
          className="w-full justify-start gap-2"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Add task
        </Button>
        
        <Button
          variant={showFocusedOnly ? "secondary" : "ghost"}
          onClick={onToggleFocus}
          className="w-full justify-start gap-2"
          size="sm"
        >
          <Star className={cn(
            "h-4 w-4",
            showFocusedOnly && "fill-current"
          )} />
          {showFocusedOnly ? "Showing focused" : "Show focused only"}
        </Button>
      </div>
      
      {/* Progress Section - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Overall progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Progress
            </span>
            <span className="text-sm font-medium text-foreground">
              {totalActual}/{totalPlanned}
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${overallProgress * 100}%` }}
            />
          </div>
        </div>
        
        {/* Grouped progress items */}
        {(goalGroups.length > 0 || independentItems.length > 0) && (
          <div className="space-y-4 mt-6">
            {/* Goal groups */}
            {goalGroups.map((group) => (
              <div key={group.title}>
                <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2 truncate">
                  {group.title}
                </h4>
                <div className="space-y-1.5 pl-2">
                  {group.items.map((item) => {
                    const isComplete = item.actual >= item.planned;
                    return (
                      <div key={item.id} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {isComplete ? "●" : "○"}
                        </span>
                        <span className="text-[11px] text-foreground flex-1 truncate">
                          {item.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {item.actual}/{item.planned}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            
            {/* Independent items */}
            {independentItems.length > 0 && (
              <div>
                <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  One-time tasks
                </h4>
                <div className="space-y-1.5 pl-2">
                  {independentItems.map((item) => {
                    const isComplete = item.actual >= item.planned;
                    return (
                      <div key={item.id} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {isComplete ? "●" : "○"}
                        </span>
                        <span className="text-[11px] text-foreground flex-1 truncate">
                          {item.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {item.actual}/{item.planned}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Additional children content */}
        {children}
      </div>
    </aside>
  );
};

export default CalendarLeftRail;
