import { memo, useMemo } from "react";
import { format, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/formatPreferences";
import type { UserPreferences } from "@/hooks/useAppData";

/**
 * TimeGrid - Shared time-based grid for Weekly and Daily calendar views
 * 
 * Features:
 * - Single vertical time scale on far left
 * - Adaptive time range based on earliest/latest tasks
 * - Task cards positioned by time, scaled by duration
 * - Horizontal scrolling when columns are too narrow
 */

export interface TimeGridTask {
  id: string;
  commitmentId?: string | null;
  title: string;
  isCompleted: boolean;
  timeStart?: string | null;
  timeEnd?: string | null;
  taskType?: "recurring" | "independent";
  instanceNumber?: number;
  totalInstances?: number;
  isDetached?: boolean;
  goalId?: string | null;
}

interface DayColumn {
  date: Date;
  dateKey: string;
  tasks: TimeGridTask[];
}

interface TimeGridProps {
  columns: DayColumn[];
  onTaskClick: (task: TimeGridTask, date: Date) => void;
  onToggleComplete: (task: TimeGridTask, date: Date) => void;
  timeFormat: UserPreferences["timeFormat"];
  minColumnWidth?: number; // Minimum width per day column in pixels
  className?: string;
}

// Hour slot height in pixels
const HOUR_HEIGHT = 60;
// Time scale width
const TIME_SCALE_WIDTH = 56;
// Minimum column width
const DEFAULT_MIN_COLUMN_WIDTH = 140;

// Parse time string to minutes from midnight
const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
};

// Calculate task position and height based on time
const getTaskStyle = (
  timeStart: string | null | undefined,
  timeEnd: string | null | undefined,
  startHour: number
): { top: number; height: number } | null => {
  if (!timeStart) return null;
  
  const startMinutes = timeToMinutes(timeStart);
  const endMinutes = timeEnd ? timeToMinutes(timeEnd) : startMinutes + 30; // Default 30min duration
  
  const minutesFromStart = startMinutes - startHour * 60;
  const duration = Math.max(endMinutes - startMinutes, 20); // Minimum 20min visual height
  
  return {
    top: (minutesFromStart / 60) * HOUR_HEIGHT,
    height: (duration / 60) * HOUR_HEIGHT,
  };
};

// Task card component
const TaskCard = memo(({
  task,
  date,
  style,
  onClick,
  onToggle,
}: {
  task: TimeGridTask;
  date: Date;
  style: { top: number; height: number };
  onClick: () => void;
  onToggle: () => void;
}) => {
  const instanceLabel = task.totalInstances && task.totalInstances > 1
    ? ` (${task.instanceNumber || 1}/${task.totalInstances})`
    : "";
  
  const isCompact = style.height < 40;
  
  return (
    <div
      className={cn(
        "absolute left-1 right-1 rounded-md px-2 transition-all cursor-pointer",
        "border overflow-hidden",
        task.isCompleted
          ? "bg-muted/40 border-muted-foreground/10 opacity-60"
          : "bg-card border-border/50 hover:border-border hover:shadow-sm"
      )}
      style={{
        top: `${style.top}px`,
        height: `${Math.max(style.height - 2, 18)}px`,
        minHeight: "18px",
      }}
      onClick={onClick}
    >
      <div className={cn(
        "flex items-start gap-1.5 h-full",
        isCompact ? "py-0.5" : "py-1"
      )}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={cn(
            "flex-shrink-0 text-xs leading-none mt-0.5",
            task.isCompleted ? "text-primary/70" : "text-muted-foreground/50 hover:text-primary"
          )}
        >
          {task.isCompleted ? "●" : "○"}
        </button>
        <span className={cn(
          "text-[11px] leading-tight flex-1 truncate",
          task.isCompleted && "line-through text-muted-foreground/60",
          !task.isCompleted && "text-foreground"
        )}>
          {task.title}{instanceLabel}
        </span>
      </div>
    </div>
  );
});
TaskCard.displayName = "TaskCard";

const TimeGrid = ({
  columns,
  onTaskClick,
  onToggleComplete,
  timeFormat,
  minColumnWidth = DEFAULT_MIN_COLUMN_WIDTH,
  className,
}: TimeGridProps) => {
  // Calculate adaptive time range based on tasks
  const { startHour, endHour, hours } = useMemo(() => {
    let earliestHour = 9; // Default start
    let latestHour = 18; // Default end
    
    columns.forEach(col => {
      col.tasks.forEach(task => {
        if (task.timeStart) {
          const hour = parseInt(task.timeStart.split(":")[0], 10);
          earliestHour = Math.min(earliestHour, hour);
        }
        if (task.timeEnd) {
          const hour = parseInt(task.timeEnd.split(":")[0], 10);
          latestHour = Math.max(latestHour, hour + 1);
        } else if (task.timeStart) {
          const hour = parseInt(task.timeStart.split(":")[0], 10);
          latestHour = Math.max(latestHour, hour + 1);
        }
      });
    });
    
    // Add buffer
    earliestHour = Math.max(0, earliestHour - 1);
    latestHour = Math.min(24, latestHour + 1);
    
    // Generate hour labels
    const hourLabels: string[] = [];
    for (let h = earliestHour; h < latestHour; h++) {
      hourLabels.push(`${h.toString().padStart(2, "0")}:00`);
    }
    
    return {
      startHour: earliestHour,
      endHour: latestHour,
      hours: hourLabels,
    };
  }, [columns]);
  
  const gridHeight = hours.length * HOUR_HEIGHT;
  const today = new Date();
  
  return (
    <div className={cn("flex-1 overflow-auto", className)}>
      <div 
        className="flex min-w-max"
        style={{ minWidth: TIME_SCALE_WIDTH + columns.length * minColumnWidth }}
      >
        {/* Time scale - fixed left column */}
        <div 
          className="sticky left-0 z-10 bg-background border-r border-border"
          style={{ width: TIME_SCALE_WIDTH }}
        >
          {/* Empty header cell */}
          <div className="h-10 border-b border-border" />
          
          {/* Hour labels */}
          <div className="relative" style={{ height: gridHeight }}>
            {hours.map((hour, i) => (
              <div
                key={hour}
                className="absolute left-0 right-0 flex items-start justify-end pr-2 text-[11px] text-muted-foreground"
                style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              >
                <span className="-translate-y-1/2">
                  {formatTime(hour, timeFormat)}
                </span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Day columns */}
        {columns.map((column, colIndex) => {
          const isToday = isSameDay(column.date, today);
          
          // Separate scheduled and unscheduled tasks
          const scheduledTasks = column.tasks.filter(t => t.timeStart);
          const unscheduledTasks = column.tasks.filter(t => !t.timeStart);
          
          return (
            <div
              key={column.dateKey}
              className={cn(
                "flex-1 border-r border-border/50 last:border-r-0",
                isToday && "bg-primary/[0.03]"
              )}
              style={{ minWidth: minColumnWidth }}
            >
              {/* Day header */}
              <div className={cn(
                "h-10 px-2 flex items-center justify-center border-b border-border",
                isToday && "bg-primary/[0.05]"
              )}>
                <div className="text-center">
                  <span className={cn(
                    "text-xs uppercase tracking-wide block",
                    isToday ? "text-primary font-semibold" : "text-muted-foreground font-medium"
                  )}>
                    {format(column.date, "EEE")}
                  </span>
                  <span className={cn(
                    "text-sm block",
                    isToday ? "text-primary font-semibold" : "text-foreground/80"
                  )}>
                    {format(column.date, "d")}
                  </span>
                </div>
              </div>
              
              {/* Time grid area */}
              <div className="relative" style={{ height: gridHeight }}>
                {/* Hour lines */}
                {hours.map((_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-border/30"
                    style={{ top: i * HOUR_HEIGHT }}
                  />
                ))}
                
                {/* Scheduled task cards */}
                {scheduledTasks.map(task => {
                  const style = getTaskStyle(task.timeStart, task.timeEnd, startHour);
                  if (!style) return null;
                  
                  return (
                    <TaskCard
                      key={task.id}
                      task={task}
                      date={column.date}
                      style={style}
                      onClick={() => onTaskClick(task, column.date)}
                      onToggle={() => onToggleComplete(task, column.date)}
                    />
                  );
                })}
              </div>
              
              {/* Unscheduled tasks section */}
              {unscheduledTasks.length > 0 && (
                <div className="border-t border-border p-2 bg-muted/20">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
                    No time
                  </div>
                  <div className="space-y-1">
                    {unscheduledTasks.map(task => (
                      <div
                        key={task.id}
                        className={cn(
                          "flex items-center gap-1.5 text-[11px] px-1.5 py-1 rounded cursor-pointer",
                          "hover:bg-muted/50 transition-colors",
                          task.isCompleted && "opacity-60"
                        )}
                        onClick={() => onTaskClick(task, column.date)}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleComplete(task, column.date);
                          }}
                          className={cn(
                            "flex-shrink-0",
                            task.isCompleted ? "text-primary/70" : "text-muted-foreground/50 hover:text-primary"
                          )}
                        >
                          {task.isCompleted ? "●" : "○"}
                        </button>
                        <span className={cn(
                          "truncate",
                          task.isCompleted && "line-through text-muted-foreground/60"
                        )}>
                          {task.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default memo(TimeGrid);
