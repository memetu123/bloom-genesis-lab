import { format, addDays, isSameDay } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Unlink } from "lucide-react";
import { formatTime, formatDateShort } from "@/lib/formatPreferences";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { UserPreferences } from "@/hooks/useAppData";

/**
 * NotionWeekCalendar - Humanized 7-day calendar grid
 * Shows tasks inside each day cell, respects user preferences
 * 
 * Visual philosophy:
 * - Today column has subtle spatial emphasis
 * - Soft borders, whitespace-driven separation
 * - Time-based vertical rhythm (morning/afternoon/evening spacing)
 * - Repeated habits feel lighter across days
 * - Completed tasks softly fade
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

// Time period helpers for visual rhythm
const getTimePeriod = (timeStart: string | null): 'morning' | 'afternoon' | 'evening' | 'unscheduled' => {
  if (!timeStart) return 'unscheduled';
  const hour = parseInt(timeStart.split(':')[0], 10);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

// Check if a task is a repeated habit (appears multiple days)
const getTaskRepetitionCount = (
  taskTitle: string,
  commitmentId: string | null,
  allWeekTasks: DayTask[][]
): number => {
  if (!commitmentId) return 1;
  return allWeekTasks.filter(dayTasks => 
    dayTasks.some(t => t.commitmentId === commitmentId)
  ).length;
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

  // Collect all tasks for repetition detection
  const allWeekTasks = weekDays.map(d => d.tasks);

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
      {/* Day headers - softer styling */}
      <div className="grid grid-cols-7 border-b border-border/40">
        {weekDays.map(({ date }) => {
          const dayIsToday = isToday(date);
          return (
            <div
              key={format(date, "yyyy-MM-dd")}
              className={cn(
                "px-2 py-2.5 text-center",
                dayIsToday && "bg-primary/[0.03]"
              )}
            >
              <span className={cn(
                "text-xs font-medium uppercase tracking-wide",
                dayIsToday ? "text-primary" : "text-muted-foreground/70"
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
          
          // Visual weight based on activity (empty days feel lighter)
          const isLowActivity = totalTasks <= 1;
          const isFullyComplete = totalTasks > 0 && completedTasks === totalTasks;

          // Count visible tasks (max 6)
          const allSortedTasks = taskGroups.flatMap(g => g.tasks);
          const visibleCount = Math.min(allSortedTasks.length, 6);
          const remainingCount = allSortedTasks.length - 6;
          let taskCounter = 0;

          return (
            <div
              key={dateKey}
              className={cn(
                "p-2.5 min-h-[180px] transition-colors",
                // Soft vertical separation via subtle left border (except first)
                dayIndex > 0 && "border-l border-border/20",
                // Today column emphasis - very subtle background
                dayIsToday && "bg-primary/[0.02]",
                // Selected state
                dayIsSelected && !dayIsToday && "bg-accent/20",
                // Low activity days feel lighter
                isLowActivity && "opacity-90"
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
                    "text-sm font-medium",
                    dayIsToday ? "text-primary" : "text-foreground/80",
                    isFullyComplete && !dayIsToday && "text-muted-foreground"
                  )}
                >
                  {format(date, "d")}
                </span>
                {dayIsToday && (
                  <span className="text-[10px] text-primary/80 font-medium tracking-wide">
                    TODAY
                  </span>
                )}
              </div>

              {/* Tasks grouped by time period with visual rhythm */}
              <div className="space-y-1">
                {taskGroups.map((group, groupIndex) => {
                  // Add spacing between time periods (morning→afternoon→evening)
                  const periodSpacing = groupIndex > 0 ? 'mt-3' : '';
                  
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

                        // Check if this is a frequently repeated habit
                        const repetitionCount = getTaskRepetitionCount(
                          task.title,
                          task.commitmentId,
                          allWeekTasks
                        );
                        const isHighlyRepeated = repetitionCount >= 5;
                        const isModeratelyRepeated = repetitionCount >= 3;

                        const taskElement = (
                          <div
                            className={cn(
                              "w-full text-left text-xs py-1.5 px-2 rounded-md mb-1.5",
                              "transition-all duration-200",
                              // Base styling - softer borders
                              task.isCompleted 
                                ? "bg-muted/30 border border-transparent" 
                                : "bg-card border border-border/40 hover:border-border/60 hover:shadow-sm",
                              // Completed tasks soften visually
                              task.isCompleted && "opacity-60",
                              // Repeated habits get lighter treatment
                              !task.isCompleted && isHighlyRepeated && "opacity-75 border-border/25",
                              !task.isCompleted && isModeratelyRepeated && !isHighlyRepeated && "opacity-85 border-border/35"
                            )}
                          >
                            <div className="flex items-start gap-1.5">
                              <button
                                onClick={(e) => handleToggleComplete(e, task, date)}
                                className={cn(
                                  "flex-shrink-0 mt-0.5 transition-transform hover:scale-110",
                                  task.isCompleted ? "text-primary/70" : "text-muted-foreground/50 hover:text-primary"
                                )}
                                aria-label={task.isCompleted ? "Mark incomplete" : "Mark complete"}
                              >
                                {task.isCompleted ? "●" : "○"}
                              </button>
                              <button
                                onClick={(e) => handleTaskClick(e, task, date)}
                                className={cn(
                                  "text-left break-words flex-1",
                                  task.isCompleted && "line-through text-muted-foreground/70",
                                  !task.isCompleted && isHighlyRepeated && "text-foreground/80",
                                  !task.isCompleted && !isHighlyRepeated && "text-foreground/90"
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
                                    "text-muted-foreground/60",
                                    task.isCompleted && "text-muted-foreground/40"
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
                
                {/* Empty day - subtle placeholder feel */}
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
