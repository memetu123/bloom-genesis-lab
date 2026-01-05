import { format, addDays, isSameDay } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Unlink } from "lucide-react";
import { formatTime, formatDateShort } from "@/lib/formatPreferences";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { UserPreferences } from "@/hooks/useAppData";

/**
 * NotionWeekCalendar - Humanized 7-day calendar grid
 * 
 * Visual philosophy:
 * - Today is the primary reading surface with full contrast
 * - Other days are slightly de-emphasized but remain readable
 * - Time-based vertical rhythm via spacing (strongest for Today)
 * - Recurring tasks maintain full legibility (no fading)
 * - Completed tasks softly recede
 */

interface DayTask {
  id: string;
  commitmentId: string | null;
  title: string;
  isCompleted: boolean;
  timeStart?: string | null;
  timeEnd?: string | null;
  taskType?: 'recurring' | 'independent';
  instanceNumber?: number;
  totalInstances?: number;
  isDetached?: boolean;
  goalId?: string | null;
}

interface WeekDay {
  date: Date;
  tasks: DayTask[];
}

interface NotionWeekCalendarProps {
  weekStart: Date;
  tasksByDate: Record<string, DayTask[]>;
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onTaskClick: (task: DayTask, date: Date) => void;
  onToggleComplete: (task: DayTask, date: Date) => void;
  weekStartsOn: 0 | 1;
  timeFormat: UserPreferences["timeFormat"];
  dateFormat: UserPreferences["dateFormat"];
  activePlanId?: string | null;
  planTitles?: Map<string, string>;
  commitmentGoalMap?: Map<string, string>;
}

// Time period helpers for visual rhythm spacing
const getTimePeriod = (timeStart: string | null): 'morning' | 'afternoon' | 'evening' | 'unscheduled' => {
  if (!timeStart) return 'unscheduled';
  const hour = parseInt(timeStart.split(':')[0], 10);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

const NotionWeekCalendar = ({
  weekStart,
  tasksByDate,
  selectedDate,
  onDateSelect,
  onTaskClick,
  onToggleComplete,
  weekStartsOn,
  timeFormat,
  dateFormat,
  activePlanId,
  planTitles = new Map(),
  commitmentGoalMap = new Map(),
}: NotionWeekCalendarProps) => {
  const navigate = useNavigate();

  const getTaskPlanId = (task: DayTask): string | null => {
    if (task.goalId) return task.goalId;
    if (task.commitmentId) return commitmentGoalMap.get(task.commitmentId) || null;
    return null;
  };

  // Generate 7 days starting from weekStart
  const weekDays: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const dateKey = format(date, "yyyy-MM-dd");
    return {
      date,
      tasks: tasksByDate[dateKey] || [],
    };
  });

  const handleDayClick = (date: Date) => {
    navigate(`/daily?date=${format(date, "yyyy-MM-dd")}`);
  };

  const handleTaskClick = (e: React.MouseEvent, task: DayTask, date: Date) => {
    e.stopPropagation();
    onTaskClick(task, date);
  };

  const handleToggleComplete = (e: React.MouseEvent, task: DayTask, date: Date) => {
    e.stopPropagation();
    onToggleComplete(task, date);
  };

  const isToday = (date: Date) => isSameDay(date, new Date());
  const isSelected = (date: Date) => isSameDay(date, selectedDate);

  // Group tasks by time period for visual rhythm
  const groupTasksByPeriod = (tasks: DayTask[]) => {
    const sorted = [...tasks].sort((a, b) => {
      if (a.timeStart && b.timeStart) return a.timeStart.localeCompare(b.timeStart);
      if (a.timeStart && !b.timeStart) return -1;
      if (!a.timeStart && b.timeStart) return 1;
      return 0;
    });

    const groups: { period: string; tasks: DayTask[] }[] = [];
    let currentPeriod = '';
    
    for (const task of sorted) {
      const period = getTimePeriod(task.timeStart || null);
      if (period !== currentPeriod) {
        groups.push({ period, tasks: [task] });
        currentPeriod = period;
      } else {
        groups[groups.length - 1].tasks.push(task);
      }
    }
    
    return groups;
  };

  return (
    <div className="rounded-lg overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border/30">
        {weekDays.map(({ date }) => {
          const dayIsToday = isToday(date);
          return (
            <div
              key={format(date, "yyyy-MM-dd")}
              className={cn(
                "px-2 py-2.5 text-center",
                dayIsToday && "bg-primary/[0.04]"
              )}
            >
              <span className={cn(
                "text-xs uppercase tracking-wide",
                dayIsToday 
                  ? "text-primary font-semibold" 
                  : "text-muted-foreground font-medium"
              )}>
                {format(date, "EEE")}
              </span>
            </div>
          );
        })}
      </div>

      {/* Day cells with tasks */}
      <div className="grid grid-cols-7">
        {weekDays.map(({ date, tasks }, dayIndex) => {
          const dateKey = format(date, "yyyy-MM-dd");
          const dayIsToday = isToday(date);
          const dayIsSelected = isSelected(date);
          const taskGroups = groupTasksByPeriod(tasks);
          const totalTasks = tasks.length;
          const completedTasks = tasks.filter(t => t.isCompleted).length;
          
          // Fully complete days get subtle treatment
          const isFullyComplete = totalTasks > 0 && completedTasks === totalTasks;

          // Count visible tasks (max 6)
          const allSortedTasks = taskGroups.flatMap(g => g.tasks);
          const remainingCount = allSortedTasks.length - 6;
          let taskCounter = 0;

          return (
            <div
              key={dateKey}
              className={cn(
                "p-2.5 min-h-[180px] transition-colors",
                // Soft vertical separation
                dayIndex > 0 && "border-l border-border/15",
                // Today column - subtle but clear emphasis
                dayIsToday && "bg-primary/[0.035]",
                // Selected state for non-today
                dayIsSelected && !dayIsToday && "bg-accent/20"
              )}
            >
              {/* Date number - clickable to go to daily view */}
              <div 
                onClick={() => handleDayClick(date)}
                className={cn(
                  "flex items-center justify-between mb-3 cursor-pointer rounded-md -mx-1 px-1 py-0.5 transition-calm",
                  "hover:bg-muted/40"
                )}
              >
                <span
                  className={cn(
                    "text-sm",
                    dayIsToday 
                      ? "text-primary font-semibold" 
                      : "text-foreground/70 font-medium",
                    isFullyComplete && !dayIsToday && "text-muted-foreground"
                  )}
                >
                  {format(date, "d")}
                </span>
                {dayIsToday && (
                  <span className="text-[10px] text-primary font-semibold tracking-wide">
                    TODAY
                  </span>
                )}
              </div>

              {/* Tasks grouped by time period with visual rhythm */}
              <div className="space-y-1">
                {taskGroups.map((group, groupIndex) => {
                  // Spacing between time periods - stronger for Today
                  const periodSpacing = groupIndex > 0 
                    ? (dayIsToday ? 'mt-4' : 'mt-2.5') 
                    : '';
                  
                  return (
                    <div key={group.period} className={periodSpacing}>
                      {group.tasks.map((task) => {
                        taskCounter++;
                        if (taskCounter > 6) return null;

                        const timeDisplay = task.timeStart ? formatTime(task.timeStart, timeFormat) : null;
                        const instanceLabel = task.totalInstances && task.totalInstances > 1
                          ? ` (${task.instanceNumber || 1}/${task.totalInstances})`
                          : "";
                        
                        const taskPlanId = getTaskPlanId(task);
                        const planTitle = taskPlanId ? planTitles.get(taskPlanId) : null;
                        const showPlanTooltip = !activePlanId && taskPlanId && planTitle;

                        const taskElement = (
                          <div
                            className={cn(
                              "w-full text-left text-xs py-1.5 px-2 rounded-md mb-1.5",
                              "transition-all duration-200",
                              // Base styling
                              task.isCompleted 
                                ? "bg-muted/25 border border-transparent" 
                                : "bg-card border border-border/30 hover:border-border/50 hover:shadow-sm",
                              // Completed tasks recede
                              task.isCompleted && "opacity-55",
                              // Non-today columns are slightly de-emphasized
                              !dayIsToday && !task.isCompleted && "opacity-90"
                            )}
                          >
                            <div className="flex items-start gap-1.5">
                              <button
                                onClick={(e) => handleToggleComplete(e, task, date)}
                                className={cn(
                                  "flex-shrink-0 mt-0.5 transition-transform hover:scale-110",
                                  task.isCompleted 
                                    ? "text-primary/70" 
                                    : dayIsToday 
                                      ? "text-muted-foreground/60 hover:text-primary"
                                      : "text-muted-foreground/50 hover:text-primary"
                                )}
                                aria-label={task.isCompleted ? "Mark incomplete" : "Mark complete"}
                              >
                                {task.isCompleted ? "●" : "○"}
                              </button>
                              <button
                                onClick={(e) => handleTaskClick(e, task, date)}
                                className={cn(
                                  "text-left break-words flex-1",
                                  task.isCompleted && "line-through text-muted-foreground/60",
                                  // Today tasks: full contrast
                                  !task.isCompleted && dayIsToday && "text-foreground font-medium",
                                  // Other days: slightly lighter
                                  !task.isCompleted && !dayIsToday && "text-foreground/85"
                                )}
                              >
                                {task.title}{instanceLabel}
                              </button>
                            </div>
                            {(timeDisplay || task.taskType === "independent" || task.isDetached) && (
                              <button
                                onClick={(e) => handleTaskClick(e, task, date)}
                                className="flex items-center gap-1 pl-4 mt-0.5 w-full text-left"
                              >
                                {timeDisplay && (
                                  <span className={cn(
                                    task.isCompleted && "text-muted-foreground/40",
                                    !task.isCompleted && dayIsToday && "text-muted-foreground/80",
                                    !task.isCompleted && !dayIsToday && "text-muted-foreground/60"
                                  )}>
                                    {timeDisplay}
                                  </span>
                                )}
                                {task.taskType === "independent" && !task.isDetached && (
                                  <span className="text-[9px] bg-muted/50 px-1 rounded text-muted-foreground/60">1x</span>
                                )}
                                {task.isDetached && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex">
                                        <Unlink className="h-3 w-3 text-muted-foreground/40" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      Detached from recurring task
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </button>
                            )}
                          </div>
                        );

                        if (showPlanTooltip) {
                          return (
                            <Tooltip key={task.id}>
                              <TooltipTrigger asChild>
                                {taskElement}
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Plan: {planTitle}
                              </TooltipContent>
                            </Tooltip>
                          );
                        }

                        return <div key={task.id}>{taskElement}</div>;
                      })}
                    </div>
                  );
                })}
                
                {remainingCount > 0 && (
                  <button
                    onClick={() => handleDayClick(date)}
                    className="text-[11px] text-primary/70 hover:text-primary hover:underline pl-1 pt-1 transition-colors"
                  >
                    +{remainingCount} more
                  </button>
                )}
                
                {/* Empty day placeholder */}
                {totalTasks === 0 && (
                  <div className="h-12" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NotionWeekCalendar;
