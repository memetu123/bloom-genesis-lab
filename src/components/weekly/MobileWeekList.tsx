import { format, addDays, isSameDay } from "date-fns";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Unlink, ChevronRight } from "lucide-react";
import { formatTime } from "@/lib/formatPreferences";
import type { UserPreferences } from "@/hooks/useAppData";

/**
 * MobileWeekList - Mobile-optimized vertical list for weekly tasks
 * Displays days as collapsible sections with compact task rows
 * 
 * Plan differentiation: When a specific plan is active, tasks from that plan
 * show an olive left border; tasks from other plans show a muted neutral border.
 * In "All tasks" mode, no borders are shown.
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

interface MobileWeekListProps {
  weekStart: Date;
  tasksByDate: Record<string, DayTask[]>;
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onTaskClick: (task: DayTask, date: Date) => void;
  onToggleComplete: (task: DayTask, date: Date) => void;
  timeFormat: UserPreferences["timeFormat"];
  activePlanId?: string | null;
  /** Map of plan IDs to plan titles for tooltip display */
  planTitles?: Map<string, string>;
  /** Map of commitment IDs to their linked goal IDs */
  commitmentGoalMap?: Map<string, string>;
}

const MobileWeekList = ({
  weekStart,
  tasksByDate,
  selectedDate,
  onDateSelect,
  onTaskClick,
  onToggleComplete,
  timeFormat,
  activePlanId,
  planTitles = new Map(),
  commitmentGoalMap = new Map(),
}: MobileWeekListProps) => {
  const navigate = useNavigate();
  const [longPressedTaskId, setLongPressedTaskId] = useState<string | null>(null);

  /**
   * Get the linked plan ID for a task
   */
  const getTaskPlanId = (task: DayTask): string | null => {
    if (task.goalId) return task.goalId;
    if (task.commitmentId) return commitmentGoalMap.get(task.commitmentId) || null;
    return null;
  };

  // Generate 7 days starting from weekStart
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const dateKey = format(date, "yyyy-MM-dd");
    return {
      date,
      dateKey,
      tasks: tasksByDate[dateKey] || [],
    };
  });

  const isToday = (date: Date) => isSameDay(date, new Date());

  const handleDayClick = (date: Date) => {
    navigate(`/daily?date=${format(date, "yyyy-MM-dd")}`);
  };

  const handleTaskToggle = (e: React.MouseEvent, task: DayTask, date: Date) => {
    e.stopPropagation();
    onToggleComplete(task, date);
  };

  // Long press handler for mobile plan tooltip
  const handleTouchStart = (taskId: string) => {
    const timer = setTimeout(() => {
      setLongPressedTaskId(taskId);
    }, 500);
    return () => clearTimeout(timer);
  };

  const handleTouchEnd = () => {
    setTimeout(() => setLongPressedTaskId(null), 2000);
  };

  return (
    <div className="space-y-2">
      {weekDays.map(({ date, dateKey, tasks }) => {
        const dayIsToday = isToday(date);
        
        // Sort tasks chronologically
        const sortedTasks = [...tasks].sort((a, b) => {
          if (a.timeStart && b.timeStart) return a.timeStart.localeCompare(b.timeStart);
          if (a.timeStart && !b.timeStart) return -1;
          if (!a.timeStart && b.timeStart) return 1;
          return 0;
        });

        return (
          <div 
            key={dateKey} 
            className="bg-card border border-border rounded-lg overflow-hidden"
          >
            {/* Day header - tappable to go to daily view */}
            <button
              onClick={() => handleDayClick(date)}
              className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={`
                  text-base font-semibold
                  ${dayIsToday ? "text-primary" : "text-foreground"}
                `}>
                  {format(date, "EEE")}
                </span>
                <span className={`
                  text-sm
                  ${dayIsToday ? "text-primary" : "text-muted-foreground"}
                `}>
                  {format(date, "MMM d")}
                </span>
                {dayIsToday && (
                  <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded font-medium">
                    TODAY
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {tasks.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {tasks.filter(t => t.isCompleted).length}/{tasks.length}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>

            {/* Tasks list */}
            {sortedTasks.length > 0 && (
              <div className="divide-y divide-border/50">
                {sortedTasks.map((task) => {
                  const timeDisplay = task.timeStart ? formatTime(task.timeStart, timeFormat) : null;
                  
                  // Get linked plan ID for this task
                  const taskPlanId = getTaskPlanId(task);
                  const planTitle = taskPlanId ? planTitles.get(taskPlanId) : null;
                  
                  // Border logic: Only show borders when a plan is active
                  // - Active plan tasks: olive border
                  // - Other plan tasks: muted neutral border
                  // - No plan selected ("All tasks"): no borders
                  const isActivePlanTask = activePlanId && taskPlanId === activePlanId;
                  const isOtherPlanTask = activePlanId && taskPlanId && taskPlanId !== activePlanId;
                  
                  // Show plan name on long press (only when plan is active)
                  const showPlanLabel = longPressedTaskId === task.id && activePlanId && taskPlanId && planTitle;
                  
                  return (
                    <div
                      key={task.id}
                      onClick={() => onTaskClick(task, date)}
                      onTouchStart={() => handleTouchStart(task.id)}
                      onTouchEnd={handleTouchEnd}
                      className={`
                        flex items-center gap-3 px-4 py-3 min-h-[48px] relative
                        hover:bg-muted/20 active:bg-muted/30 transition-colors cursor-pointer
                        ${isActivePlanTask ? "border-l-2 border-l-primary/60" : ""}
                        ${isOtherPlanTask ? "border-l-2 border-l-muted-foreground/40" : ""}
                      `}
                    >
                      {/* Plan label popup on long press */}
                      {showPlanLabel && (
                        <div className="absolute top-0 left-4 -translate-y-full bg-popover border border-border shadow-md px-2 py-1 rounded text-xs text-foreground z-10">
                          Plan: {planTitle}
                        </div>
                      )}
                      
                      {/* Completion toggle - 44px tap target */}
                      <button
                        onClick={(e) => handleTaskToggle(e, task, date)}
                        className={`
                          w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0
                          ${task.isCompleted 
                            ? "bg-primary border-primary text-primary-foreground" 
                            : "border-border hover:border-primary"
                          }
                        `}
                        aria-label={task.isCompleted ? "Mark incomplete" : "Mark complete"}
                      >
                        {task.isCompleted && (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>

                      {/* Task content */}
                      <div className="flex-1 min-w-0">
                        <p className={`
                          text-sm leading-tight line-clamp-2
                          ${task.isCompleted ? "line-through text-muted-foreground" : "text-foreground"}
                        `}>
                          {task.title}
                          {task.totalInstances && task.totalInstances > 1 && (
                            <span className="text-muted-foreground"> ({task.instanceNumber || 1}/{task.totalInstances})</span>
                          )}
                        </p>
                        
                        {/* Secondary info row */}
                        <div className="flex items-center gap-2 mt-0.5">
                          {timeDisplay && (
                            <span className="text-xs text-muted-foreground/70">
                              {timeDisplay}
                            </span>
                          )}
                          {task.taskType === "independent" && !task.isDetached && (
                            <span className="text-[10px] bg-muted text-muted-foreground px-1 rounded">
                              1x
                            </span>
                          )}
                          {task.isDetached && (
                            <Unlink className="h-3 w-3 text-muted-foreground/50" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {sortedTasks.length === 0 && (
              <div className="px-4 py-3 text-sm text-muted-foreground/60">
                No tasks
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MobileWeekList;
