import { memo, useMemo } from "react";
import { format, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/formatPreferences";
import { useTimeDisplay } from "./TimeDisplayContext";
import type { UserPreferences } from "@/hooks/useAppData";

/**
 * TimeGrid - Shared time-based grid for Weekly and Daily calendar views
 * 
 * Features:
 * - Single vertical time scale on far left
 * - Adaptive time range based on earliest/latest tasks
 * - Task cards positioned by time, scaled by duration
 * - Horizontal scrolling when columns are too narrow
 * - Compact mode: hides all empty time, shows only tasks stacked chronologically
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
  minColumnWidth?: number;
  className?: string;
}

// Hour slot height in pixels (Full mode)
const HOUR_HEIGHT = 60;
// Time scale width
const TIME_SCALE_WIDTH = 56;
// Minimum column width
const DEFAULT_MIN_COLUMN_WIDTH = 140;
// Compact mode: fixed height per task card
const COMPACT_TASK_HEIGHT = 44;
// Compact mode: gap between task cards
const COMPACT_TASK_GAP = 4;

// Parse time string to minutes from midnight
const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
};

// Calculate task position and height based on time (Full mode)
const getTaskPosition = (
  timeStart: string | null | undefined,
  timeEnd: string | null | undefined,
  startHour: number
): { top: number; height: number; startMin: number; endMin: number } | null => {
  if (!timeStart) return null;
  
  const startMinutes = timeToMinutes(timeStart);
  const endMinutes = timeEnd ? timeToMinutes(timeEnd) : startMinutes + 30;
  
  const minutesFromStart = startMinutes - startHour * 60;
  const duration = Math.max(endMinutes - startMinutes, 20);
  
  return {
    top: (minutesFromStart / 60) * HOUR_HEIGHT,
    height: (duration / 60) * HOUR_HEIGHT,
    startMin: startMinutes,
    endMin: endMinutes,
  };
};

// Group overlapping tasks for side-by-side rendering (Full mode)
interface TaskWithPosition {
  task: TimeGridTask;
  position: { top: number; height: number; startMin: number; endMin: number };
  column: number;
  totalColumns: number;
}

const calculateOverlappingLayout = (
  tasks: TimeGridTask[],
  startHour: number
): TaskWithPosition[] => {
  const tasksWithPos = tasks
    .map(task => {
      const position = getTaskPosition(task.timeStart, task.timeEnd, startHour);
      return position ? { task, position } : null;
    })
    .filter((t): t is { task: TimeGridTask; position: NonNullable<ReturnType<typeof getTaskPosition>> } => t !== null)
    .sort((a, b) => a.position.startMin - b.position.startMin);
  
  if (tasksWithPos.length === 0) return [];
  
  const groups: { task: TimeGridTask; position: TaskWithPosition["position"] }[][] = [];
  
  tasksWithPos.forEach(item => {
    let addedToGroup = false;
    
    for (const group of groups) {
      const overlapsWithGroup = group.some(g => 
        item.position.startMin < g.position.endMin && 
        item.position.endMin > g.position.startMin
      );
      
      if (overlapsWithGroup) {
        group.push(item);
        addedToGroup = true;
        break;
      }
    }
    
    if (!addedToGroup) {
      groups.push([item]);
    }
  });
  
  const mergedGroups: typeof groups = [];
  groups.forEach(group => {
    const overlappingIdx = mergedGroups.findIndex(mg =>
      mg.some(mgItem =>
        group.some(gItem =>
          gItem.position.startMin < mgItem.position.endMin &&
          gItem.position.endMin > mgItem.position.startMin
        )
      )
    );
    
    if (overlappingIdx >= 0) {
      mergedGroups[overlappingIdx].push(...group);
    } else {
      mergedGroups.push([...group]);
    }
  });
  
  const result: TaskWithPosition[] = [];
  
  mergedGroups.forEach(group => {
    const totalColumns = Math.min(group.length, 3);
    
    group
      .sort((a, b) => a.position.startMin - b.position.startMin)
      .forEach((item, idx) => {
        result.push({
          task: item.task,
          position: item.position,
          column: idx % totalColumns,
          totalColumns,
        });
      });
  });
  
  return result;
};

// Task card component for Full mode
const TaskCard = memo(({
  task,
  date,
  position,
  column,
  totalColumns,
  onClick,
  onToggle,
}: {
  task: TimeGridTask;
  date: Date;
  position: { top: number; height: number };
  column: number;
  totalColumns: number;
  onClick: () => void;
  onToggle: () => void;
}) => {
  const instanceLabel = task.totalInstances && task.totalInstances > 1
    ? ` (${task.instanceNumber || 1}/${task.totalInstances})`
    : "";
  
  const isCompact = position.height < 40;
  
  const gapPx = 3;
  const widthPercent = 100 / totalColumns;
  const leftPercent = column * widthPercent;
  
  return (
    <div
      className={cn(
        "absolute rounded-md px-2 transition-all cursor-pointer",
        "border overflow-hidden",
        task.isCompleted
          ? "bg-muted/50 border-muted-foreground/20"
          : "bg-card border-border hover:border-foreground/20 hover:shadow-sm"
      )}
      style={{
        top: `${position.top}px`,
        height: `${Math.max(position.height - 2, 20)}px`,
        minHeight: "20px",
        left: `calc(${leftPercent}% + ${gapPx}px)`,
        width: `calc(${widthPercent}% - ${gapPx * 2}px)`,
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
            task.isCompleted ? "text-primary" : "text-muted-foreground hover:text-primary"
          )}
        >
          {task.isCompleted ? "●" : "○"}
        </button>
        <span className={cn(
          "text-[11px] leading-tight flex-1 truncate",
          task.isCompleted && "line-through text-muted-foreground",
          !task.isCompleted && "text-foreground"
        )}>
          {task.title}{instanceLabel}
        </span>
      </div>
    </div>
  );
});
TaskCard.displayName = "TaskCard";

// Compact task card - simplified for stacked list view
const CompactTaskCard = memo(({
  task,
  timeFormat,
  onClick,
  onToggle,
}: {
  task: TimeGridTask;
  timeFormat: UserPreferences["timeFormat"];
  onClick: () => void;
  onToggle: () => void;
}) => {
  const instanceLabel = task.totalInstances && task.totalInstances > 1
    ? ` (${task.instanceNumber || 1}/${task.totalInstances})`
    : "";
  
  const timeLabel = task.timeStart 
    ? formatTime(task.timeStart, timeFormat)
    : null;
  
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 rounded-md cursor-pointer transition-colors",
        "border",
        task.isCompleted
          ? "bg-muted/50 border-muted-foreground/20"
          : "bg-card border-border hover:border-foreground/20 hover:bg-muted/30"
      )}
      style={{ height: COMPACT_TASK_HEIGHT }}
      onClick={onClick}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={cn(
          "flex-shrink-0 text-sm",
          task.isCompleted ? "text-primary" : "text-muted-foreground hover:text-primary"
        )}
      >
        {task.isCompleted ? "●" : "○"}
      </button>
      <div className="flex-1 min-w-0">
        <span className={cn(
          "text-xs block truncate",
          task.isCompleted && "line-through text-muted-foreground",
          !task.isCompleted && "text-foreground"
        )}>
          {task.title}{instanceLabel}
        </span>
        {timeLabel && (
          <span className="text-[10px] text-muted-foreground">
            {timeLabel}
          </span>
        )}
      </div>
    </div>
  );
});
CompactTaskCard.displayName = "CompactTaskCard";

const TimeGrid = ({
  columns,
  onTaskClick,
  onToggleComplete,
  timeFormat,
  minColumnWidth = DEFAULT_MIN_COLUMN_WIDTH,
  className,
}: TimeGridProps) => {
  const { mode } = useTimeDisplay();
  const isCompactMode = mode === "compact";
  
  // Calculate adaptive time range based on tasks (Full mode only)
  const { startHour, endHour, hours } = useMemo(() => {
    let earliestHour = 9;
    let latestHour = 18;
    
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
    
    earliestHour = Math.max(0, earliestHour - 1);
    latestHour = Math.min(24, latestHour + 1);
    
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
  
  // Calculate heights for each column in compact mode
  const compactColumnHeights = useMemo(() => {
    if (!isCompactMode) return {};
    
    const heights: Record<string, number> = {};
    columns.forEach(col => {
      const taskCount = col.tasks.length;
      heights[col.dateKey] = taskCount > 0 
        ? taskCount * COMPACT_TASK_HEIGHT + (taskCount - 1) * COMPACT_TASK_GAP
        : COMPACT_TASK_HEIGHT; // Minimum height
    });
    return heights;
  }, [columns, isCompactMode]);
  
  // Find max height across all columns for compact mode
  const maxCompactHeight = useMemo(() => {
    if (!isCompactMode) return 0;
    const heights = Object.values(compactColumnHeights);
    return Math.max(...heights, COMPACT_TASK_HEIGHT);
  }, [compactColumnHeights, isCompactMode]);
  
  const gridHeight = isCompactMode 
    ? maxCompactHeight 
    : hours.length * HOUR_HEIGHT;
  
  const today = new Date();
  
  // Render compact mode column content
  const renderCompactColumn = (column: DayColumn) => {
    // Sort tasks chronologically by time
    const sortedTasks = [...column.tasks].sort((a, b) => {
      if (!a.timeStart && !b.timeStart) return 0;
      if (!a.timeStart) return 1;
      if (!b.timeStart) return -1;
      return timeToMinutes(a.timeStart) - timeToMinutes(b.timeStart);
    });
    
    if (sortedTasks.length === 0) {
      return (
        <div 
          className="flex items-center justify-center text-xs text-muted-foreground/40"
          style={{ height: COMPACT_TASK_HEIGHT }}
        >
          No tasks
        </div>
      );
    }
    
    return (
      <div className="flex flex-col" style={{ gap: COMPACT_TASK_GAP }}>
        {sortedTasks.map(task => (
          <CompactTaskCard
            key={task.id}
            task={task}
            timeFormat={timeFormat}
            onClick={() => onTaskClick(task, column.date)}
            onToggle={() => onToggleComplete(task, column.date)}
          />
        ))}
      </div>
    );
  };
  
  // Render full mode column content
  const renderFullColumn = (column: DayColumn) => {
    const scheduledTasks = column.tasks.filter(t => t.timeStart);
    const unscheduledTasks = column.tasks.filter(t => !t.timeStart);
    
    return (
      <>
        {/* Time grid area */}
        <div className="relative" style={{ height: hours.length * HOUR_HEIGHT }}>
          {/* Hour lines */}
          {hours.map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 border-t border-border/50"
              style={{ top: i * HOUR_HEIGHT }}
            />
          ))}
          
          {/* Scheduled task cards */}
          {calculateOverlappingLayout(scheduledTasks, startHour).map(({ task, position, column: col, totalColumns }) => (
            <TaskCard
              key={task.id}
              task={task}
              date={column.date}
              position={{ top: position.top, height: position.height }}
              column={col}
              totalColumns={totalColumns}
              onClick={() => onTaskClick(task, column.date)}
              onToggle={() => onToggleComplete(task, column.date)}
            />
          ))}
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
      </>
    );
  };
  
  return (
    <div className={cn("flex-1 overflow-auto", className)}>
      <div 
        className="flex min-w-max relative"
        style={{ minWidth: TIME_SCALE_WIDTH + columns.length * minColumnWidth }}
      >
        {/* Time scale - fixed left column (only in Full mode) */}
        {!isCompactMode && (
          <div 
            className="sticky left-0 z-10 bg-background border-r border-border/70"
            style={{ width: TIME_SCALE_WIDTH }}
          >
            {/* Empty header cell */}
            <div className="h-10 border-b border-border" />
            
            {/* Hour labels */}
            <div className="relative" style={{ height: gridHeight }}>
              {hours.map((hour, i) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 flex items-start justify-end pr-2 text-[11px] text-foreground/60 font-medium"
                  style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                >
                  <span className="-translate-y-1/2">
                    {formatTime(hour, timeFormat)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Day columns */}
        <div className="flex flex-1">
          {columns.map((column) => {
            const isToday = isSameDay(column.date, today);
            
            return (
              <div
                key={column.dateKey}
                className="flex-1 border-r border-border/50 last:border-r-0"
                style={{ minWidth: minColumnWidth }}
              >
                {/* Day header */}
                <div className={cn(
                  "h-10 px-2 flex items-center justify-center border-b",
                  isToday 
                    ? "border-b-2 border-primary bg-primary/[0.02]" 
                    : "border-border"
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
                      isToday 
                        ? "text-primary font-bold" 
                        : "text-foreground"
                    )}>
                      {format(column.date, "d")}
                    </span>
                  </div>
                </div>
                
                {/* Column content */}
                {isCompactMode ? (
                  <div className="p-2" style={{ minHeight: maxCompactHeight }}>
                    {renderCompactColumn(column)}
                  </div>
                ) : (
                  renderFullColumn(column)
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default memo(TimeGrid);
