import { ReactNode } from "react";
import { Plus, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * CalendarLeftRail - Persistent left sidebar for calendar views
 * Contains:
 * - Icon actions at top (Add task, Focus toggle)
 * - Overall progress section
 * - Task list (for daily view)
 */

interface ProgressItem {
  id: string;
  title: string;
  planned: number;
  actual: number;
  goalTitle?: string | null;
}

export interface TaskListItem {
  id: string;
  title: string;
  isCompleted: boolean;
  goalTitle?: string | null;
}

interface CalendarLeftRailProps {
  // Progress data
  totalPlanned: number;
  totalActual: number;
  progressItems?: ProgressItem[];
  
  // Task list (for daily view)
  taskList?: TaskListItem[];
  onTaskClick?: (taskId: string) => void;
  onTaskToggle?: (taskId: string) => void;
  
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
  taskList = [],
  onTaskClick,
  onTaskToggle,
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
  
  // Group tasks by goal for task list
  const tasksByGoal: Record<string, { title: string; tasks: TaskListItem[] }> = {};
  const standaloneTasks: TaskListItem[] = [];
  
  taskList.forEach((task) => {
    if (task.goalTitle) {
      if (!tasksByGoal[task.goalTitle]) {
        tasksByGoal[task.goalTitle] = { title: task.goalTitle, tasks: [] };
      }
      tasksByGoal[task.goalTitle].tasks.push(task);
    } else {
      standaloneTasks.push(task);
    }
  });
  
  const taskGoalGroups = Object.values(tasksByGoal);
  
  return (
    <aside className={cn(
      "w-56 shrink-0 border-r border-border bg-sidebar-background",
      "flex flex-col h-full",
      className
    )}>
      {/* Icon Actions - Sticky at top */}
      <div className="sticky top-0 z-10 bg-sidebar-background px-3 py-2 flex items-center gap-2 border-b border-border/50">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onAddTask}
              className={cn(
                "p-1.5 rounded-full transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              <Plus className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            Add task
          </TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleFocus}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                showFocusedOnly
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Star className={cn("h-4 w-4", showFocusedOnly && "fill-current")} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            {showFocusedOnly ? "Showing focused only" : "Show focused only"}
          </TooltipContent>
        </Tooltip>
      </div>
      
      {/* Progress Section - Scrollable */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {/* Overall progress */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Progress
            </span>
            <span className="text-xs text-muted-foreground">
              {totalActual}/{totalPlanned}
            </span>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${overallProgress * 100}%` }}
            />
          </div>
        </div>
        
        {/* Grouped progress items (for weekly view) */}
        {(goalGroups.length > 0 || independentItems.length > 0) && (
          <div className="space-y-3 mt-4">
            {/* Goal groups */}
            {goalGroups.map((group) => (
              <div key={group.title}>
                <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 truncate">
                  {group.title}
                </h4>
                <div className="space-y-1 pl-1.5">
                  {group.items.map((item) => {
                    const isComplete = item.actual >= item.planned;
                    return (
                      <div key={item.id} className="flex items-center gap-1.5">
                        <span className={cn(
                          "text-[10px] flex-shrink-0",
                          isComplete ? "text-primary" : "text-muted-foreground"
                        )}>
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
                <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                  One-time tasks
                </h4>
                <div className="space-y-1 pl-1.5">
                  {independentItems.map((item) => {
                    const isComplete = item.actual >= item.planned;
                    return (
                      <div key={item.id} className="flex items-center gap-1.5">
                        <span className={cn(
                          "text-[10px] flex-shrink-0",
                          isComplete ? "text-primary" : "text-muted-foreground"
                        )}>
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
        
        {/* Task list for daily view */}
        {taskList.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border/50">
            <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Today's Tasks
            </h3>
            <div className="space-y-3">
              {/* Tasks grouped by goal */}
              {taskGoalGroups.map((group) => (
                <div key={group.title}>
                  <h4 className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide mb-1.5 truncate">
                    {group.title}
                  </h4>
                  <div className="space-y-0.5">
                    {group.tasks.map((task) => (
                      <div 
                        key={task.id} 
                        className={cn(
                          "flex items-center gap-1.5 py-0.5 px-1 -mx-1 rounded",
                          "hover:bg-muted/50 cursor-pointer transition-colors"
                        )}
                        onClick={() => onTaskClick?.(task.id)}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onTaskToggle?.(task.id);
                          }}
                          className={cn(
                            "text-[11px] flex-shrink-0",
                            task.isCompleted ? "text-primary" : "text-muted-foreground hover:text-primary"
                          )}
                        >
                          {task.isCompleted ? "●" : "○"}
                        </button>
                        <span className={cn(
                          "text-[11px] flex-1 truncate",
                          task.isCompleted ? "line-through text-muted-foreground" : "text-foreground"
                        )}>
                          {task.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              
              {/* Standalone tasks (no goal) */}
              {standaloneTasks.length > 0 && (
                <div>
                  {taskGoalGroups.length > 0 && (
                    <h4 className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide mb-1.5">
                      Other
                    </h4>
                  )}
                  <div className="space-y-0.5">
                    {standaloneTasks.map((task) => (
                      <div 
                        key={task.id} 
                        className={cn(
                          "flex items-center gap-1.5 py-0.5 px-1 -mx-1 rounded",
                          "hover:bg-muted/50 cursor-pointer transition-colors"
                        )}
                        onClick={() => onTaskClick?.(task.id)}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onTaskToggle?.(task.id);
                          }}
                          className={cn(
                            "text-[11px] flex-shrink-0",
                            task.isCompleted ? "text-primary" : "text-muted-foreground hover:text-primary"
                          )}
                        >
                          {task.isCompleted ? "●" : "○"}
                        </button>
                        <span className={cn(
                          "text-[11px] flex-1 truncate",
                          task.isCompleted ? "line-through text-muted-foreground" : "text-foreground"
                        )}>
                          {task.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Additional children content */}
        {children}
      </div>
    </aside>
  );
};

export default CalendarLeftRail;
