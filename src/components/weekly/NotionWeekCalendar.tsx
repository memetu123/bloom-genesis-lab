import { format, addDays, isSameDay } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Unlink } from "lucide-react";
import { formatTime, formatDateShort } from "@/lib/formatPreferences";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { UserPreferences } from "@/hooks/useAppData";

/**
 * NotionWeekCalendar - Notion-style 7-day calendar grid
 * Shows tasks inside each day cell, respects user preferences
 * 
 * Plan differentiation (Calendar views - Interaction-based reveal):
 * - "All tasks" mode: tasks linked to ANY plan get a subtle neutral left border
 * - Tasks without a plan: no border
 * - When a specific plan is selected: NO borders shown (uniform appearance)
 * - Plan identity revealed via hover tooltip (desktop) or long-press (mobile)
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
  /** Map of plan IDs to plan titles for tooltip display */
  planTitles?: Map<string, string>;
  /** Map of commitment IDs to their linked goal IDs */
  commitmentGoalMap?: Map<string, string>;
}

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

  /**
   * Get the linked plan ID for a task
   * For independent tasks: use goalId directly
   * For recurring tasks: lookup via commitmentGoalMap
   */
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

  return (
    <div className="border border-border">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {weekDays.map(({ date }) => (
          <div
            key={format(date, "yyyy-MM-dd")}
            className="px-2 py-2 text-center border-r border-border last:border-r-0"
          >
            <span className="text-xs font-medium text-muted-foreground uppercase">
              {format(date, "EEE")}
            </span>
          </div>
        ))}
      </div>

      {/* Day cells with tasks */}
      <div className="grid grid-cols-7">
        {weekDays.map(({ date, tasks }) => {
          const dateKey = format(date, "yyyy-MM-dd");
          const dayIsToday = isToday(date);
          const dayIsSelected = isSelected(date);

          // Sort tasks chronologically: scheduled first (by time), then unscheduled
          const sortedTasks = [...tasks].sort((a, b) => {
            // Both have times - sort by time
            if (a.timeStart && b.timeStart) {
              return a.timeStart.localeCompare(b.timeStart);
            }
            // Only a has time - a comes first
            if (a.timeStart && !b.timeStart) return -1;
            // Only b has time - b comes first
            if (!a.timeStart && b.timeStart) return 1;
            // Neither has time - maintain order
            return 0;
          });

          const visibleTasks = sortedTasks.slice(0, 6);
          const remainingCount = sortedTasks.length - 6;

          return (
            <div
              key={dateKey}
              className={`
                border-r border-border last:border-r-0 p-2 min-h-[180px]
                ${dayIsSelected ? "bg-accent/30" : ""}
              `}
            >
              {/* Date number - clickable to go to daily view */}
              <div 
                onClick={() => handleDayClick(date)}
                className="flex items-center justify-between mb-2 cursor-pointer hover:bg-muted/30 -mx-2 -mt-2 px-2 pt-2 pb-1 transition-calm"
              >
                <span
                  className={`
                    text-sm font-medium
                    ${dayIsToday ? "text-primary" : "text-foreground"}
                  `}
                >
                  {format(date, "d")}
                </span>
                {dayIsToday && (
                  <span className="text-[10px] text-primary font-medium">
                    TODAY
                  </span>
                )}
              </div>

              {/* Tasks - show max 6, no inner scroll */}
              <div className="space-y-1">
                {visibleTasks.map((task) => {
                  const timeDisplay = task.timeStart ? formatTime(task.timeStart, timeFormat) : null;
                  const instanceLabel = task.totalInstances && task.totalInstances > 1
                    ? ` (${task.instanceNumber || 1}/${task.totalInstances})`
                    : "";
                  
                  // Get linked plan ID for this task
                  const taskPlanId = getTaskPlanId(task);
                  const planTitle = taskPlanId ? planTitles.get(taskPlanId) : null;
                  
                  // Border logic (Calendar view - Interaction-based reveal):
                  // - "All tasks" mode (no plan selected): tasks with ANY plan get subtle neutral border
                  // - Tasks without a plan: no border
                  // - Specific plan selected: NO borders (uniform appearance)
                  const showPlanBorder = !activePlanId && taskPlanId;
                  
                  // Show tooltip with plan name on hover (only in "All tasks" mode when task has a plan)
                  const showPlanTooltip = !activePlanId && taskPlanId && planTitle;
                    
                  const taskElement = (
                    <div
                      className={`
                        w-full text-left text-xs py-0.5 px-1 rounded-sm
                        hover:bg-muted/50 transition-calm
                        ${task.isCompleted ? "text-muted-foreground" : "text-foreground"}
                        ${showPlanBorder ? "border-l border-l-muted-foreground/30 pl-2" : ""}
                      `}
                    >
                      <div className="flex items-start gap-1">
                        <button
                          onClick={(e) => handleToggleComplete(e, task, date)}
                          className={`flex-shrink-0 hover:scale-110 transition-transform ${task.isCompleted ? "text-primary" : "hover:text-primary"}`}
                          aria-label={task.isCompleted ? "Mark incomplete" : "Mark complete"}
                        >
                          {task.isCompleted ? "●" : "○"}
                        </button>
                        <button
                          onClick={(e) => handleTaskClick(e, task, date)}
                          className={`text-left break-words flex-1 ${task.isCompleted ? "line-through" : ""}`}
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
                            <span className="text-muted-foreground">
                              {timeDisplay}
                            </span>
                          )}
                          {task.taskType === "independent" && !task.isDetached && (
                            <span className="text-[9px] bg-muted px-1 rounded">1x</span>
                          )}
                          {task.isDetached && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">
                                  <Unlink className="h-3 w-3 text-muted-foreground/60" />
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

                  // Wrap in tooltip if showing plan tint
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
                {remainingCount > 0 && (
                  <button
                    onClick={() => handleDayClick(date)}
                    className="text-[11px] text-primary hover:underline pl-1 pt-1"
                  >
                    +{remainingCount} more
                  </button>
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
