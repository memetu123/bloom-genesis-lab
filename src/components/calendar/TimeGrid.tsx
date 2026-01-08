import { memo, useMemo, useState, useCallback, useRef, useEffect } from "react";
import { format, isSameDay, parseISO } from "date-fns";
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
 * - Drag and drop to reschedule tasks
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
  isMuted?: boolean; // For 3-Year goal filter - visually de-emphasized
}

interface DayColumn {
  date: Date;
  dateKey: string;
  tasks: TimeGridTask[];
}

interface DragInfo {
  task: TimeGridTask;
  sourceDate: Date;
  sourceDateKey: string;
  offsetY: number; // Mouse offset from top of card
  startY: number; // Initial mouse Y position
  startX: number; // Initial mouse X position
}

interface DropTarget {
  dateKey: string;
  date: Date;
  timeMinutes: number;
}

interface TimeGridProps {
  columns: DayColumn[];
  onTaskClick: (task: TimeGridTask, date: Date) => void;
  onToggleComplete: (task: TimeGridTask, date: Date) => void;
  onTaskDrop?: (task: TimeGridTask, sourceDate: Date, targetDate: Date, newTimeStart: string, newTimeEnd: string) => void;
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

// Task card component for Full mode with drag support
const TaskCard = memo(({
  task,
  date,
  dateKey,
  position,
  column,
  totalColumns,
  onClick,
  onToggle,
  onDragStart,
  isDragging,
}: {
  task: TimeGridTask;
  date: Date;
  dateKey: string;
  position: { top: number; height: number };
  column: number;
  totalColumns: number;
  onClick: () => void;
  onToggle: () => void;
  onDragStart: (e: React.MouseEvent | React.TouchEvent) => void;
  isDragging: boolean;
}) => {
  const instanceLabel = task.totalInstances && task.totalInstances > 1
    ? ` (${task.instanceNumber || 1}/${task.totalInstances})`
    : "";
  
  const isCompact = position.height < 40;
  
  const gapPx = 3;
  const widthPercent = 100 / totalColumns;
  const leftPercent = column * widthPercent;
  
  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't start drag if clicking the toggle button
    if ((e.target as HTMLElement).closest('button')) return;
    onDragStart(e);
  };
  
  const handleTouchStart = (e: React.TouchEvent) => {
    // Don't start drag if clicking the toggle button
    if ((e.target as HTMLElement).closest('button')) return;
    onDragStart(e);
  };
  
  return (
    <div
      className={cn(
        "absolute rounded-md px-2 transition-all select-none",
        "border overflow-hidden",
        isDragging && "opacity-30",
        task.isMuted && !task.isCompleted && "opacity-40",
        task.isCompleted
          ? "bg-muted/50 border-muted-foreground/20"
          : task.isMuted
            ? "bg-muted/30 border-border/50"
            : "bg-card border-border hover:border-foreground/20 hover:shadow-sm cursor-grab active:cursor-grabbing"
      )}
      style={{
        top: `${position.top}px`,
        height: `${Math.max(position.height - 2, 20)}px`,
        minHeight: "20px",
        left: `calc(${leftPercent}% + ${gapPx}px)`,
        width: `calc(${widthPercent}% - ${gapPx * 2}px)`,
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onClick={(e) => {
        // Only trigger click if not dragging
        if (!isDragging) {
          onClick();
        }
      }}
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
          !task.isCompleted && !task.isMuted && "text-foreground",
          task.isMuted && !task.isCompleted && "text-muted-foreground"
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
        task.isMuted && !task.isCompleted && "opacity-40",
        task.isCompleted
          ? "bg-muted/50 border-muted-foreground/20"
          : task.isMuted
            ? "bg-muted/30 border-border/50"
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
          !task.isCompleted && !task.isMuted && "text-foreground",
          task.isMuted && !task.isCompleted && "text-muted-foreground"
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
  onTaskDrop,
  timeFormat,
  minColumnWidth = DEFAULT_MIN_COLUMN_WIDTH,
  className,
}: TimeGridProps) => {
  const { mode } = useTimeDisplay();
  const isCompactMode = mode === "compact";
  
  // Drag state
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  
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
  
  // Helper: Convert pixel position to time
  const pixelToTime = useCallback((pixelY: number): { hours: number; minutes: number } => {
    const minutesFromStart = (pixelY / HOUR_HEIGHT) * 60;
    const totalMinutes = startHour * 60 + minutesFromStart;
    const hours = Math.floor(totalMinutes / 60);
    // Snap to 15-minute increments
    const minutes = Math.round((totalMinutes % 60) / 15) * 15;
    return { hours: Math.max(0, Math.min(23, hours)), minutes: minutes % 60 };
  }, [startHour]);
  
  // Helper: Format time from hours and minutes
  const formatTimeFromParts = (hours: number, minutes: number): string => {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  };
  
  // Start dragging
  const handleDragStart = useCallback((task: TimeGridTask, date: Date, dateKey: string, e: React.MouseEvent | React.TouchEvent) => {
    if (isCompactMode) return; // No drag in compact mode
    
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    
    // Calculate offset from top of card
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const offsetY = clientY - rect.top;
    
    setDragInfo({
      task,
      sourceDate: date,
      sourceDateKey: dateKey,
      offsetY,
      startY: clientY,
      startX: clientX,
    });
    setIsDragging(true);
    
    // Prevent text selection
    e.preventDefault();
  }, [isCompactMode]);
  
  // Handle drag movement
  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragInfo || !columnsRef.current) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    // Find which column we're over
    const columnsContainer = columnsRef.current;
    const columnElements = columnsContainer.querySelectorAll('[data-column-key]');
    
    let targetColumn: DayColumn | null = null;
    let targetColumnElement: Element | null = null;
    
    columnElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) {
        const dateKey = el.getAttribute('data-column-key');
        const col = columns.find(c => c.dateKey === dateKey);
        if (col) {
          targetColumn = col;
          targetColumnElement = el;
        }
      }
    });
    
    if (targetColumn && targetColumnElement) {
      const rect = targetColumnElement.getBoundingClientRect();
      const headerHeight = 40; // Height of day header
      const relativeY = clientY - rect.top - headerHeight;
      const { hours, minutes } = pixelToTime(Math.max(0, relativeY));
      
      setDropTarget({
        dateKey: targetColumn.dateKey,
        date: targetColumn.date,
        timeMinutes: hours * 60 + minutes,
      });
    } else {
      setDropTarget(null);
    }
  }, [dragInfo, columns, pixelToTime]);
  
  // Handle drag end
  const handleMouseUp = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragInfo || !dropTarget || !onTaskDrop) {
      setDragInfo(null);
      setDropTarget(null);
      setIsDragging(false);
      return;
    }
    
    // Calculate new time
    const newStartHours = Math.floor(dropTarget.timeMinutes / 60);
    const newStartMinutes = dropTarget.timeMinutes % 60;
    const newTimeStart = formatTimeFromParts(newStartHours, newStartMinutes);
    
    // Calculate duration and new end time
    let duration = 30; // Default 30 min
    if (dragInfo.task.timeStart && dragInfo.task.timeEnd) {
      const startMin = timeToMinutes(dragInfo.task.timeStart);
      const endMin = timeToMinutes(dragInfo.task.timeEnd);
      duration = endMin - startMin;
    }
    
    const newEndMinutes = dropTarget.timeMinutes + duration;
    const newEndHours = Math.floor(newEndMinutes / 60);
    const newEndMins = newEndMinutes % 60;
    const newTimeEnd = formatTimeFromParts(Math.min(23, newEndHours), newEndMins % 60);
    
    // Trigger the drop callback
    onTaskDrop(
      dragInfo.task,
      dragInfo.sourceDate,
      dropTarget.date,
      newTimeStart,
      newTimeEnd
    );
    
    setDragInfo(null);
    setDropTarget(null);
    setIsDragging(false);
  }, [dragInfo, dropTarget, onTaskDrop]);
  
  // Set up global mouse/touch listeners for dragging
  useEffect(() => {
    if (!isDragging) return;
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleMouseMove, { passive: false });
    document.addEventListener('touchend', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleMouseMove);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);
  
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
    
    // Calculate drop indicator position
    const showDropIndicator = dropTarget && dropTarget.dateKey === column.dateKey;
    const dropIndicatorTop = showDropIndicator 
      ? ((dropTarget.timeMinutes - startHour * 60) / 60) * HOUR_HEIGHT
      : 0;
    
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
          
          {/* Drop indicator */}
          {showDropIndicator && (
            <div 
              className="absolute left-1 right-1 h-0.5 bg-primary rounded-full z-20 pointer-events-none"
              style={{ top: dropIndicatorTop }}
            />
          )}
          
          {/* Scheduled task cards */}
          {calculateOverlappingLayout(scheduledTasks, startHour).map(({ task, position, column: col, totalColumns }) => {
            const isBeingDragged = dragInfo?.task.id === task.id && dragInfo?.sourceDateKey === column.dateKey;
            
            return (
              <TaskCard
                key={task.id}
                task={task}
                date={column.date}
                dateKey={column.dateKey}
                position={{ top: position.top, height: position.height }}
                column={col}
                totalColumns={totalColumns}
                onClick={() => onTaskClick(task, column.date)}
                onToggle={() => onToggleComplete(task, column.date)}
                onDragStart={(e) => handleDragStart(task, column.date, column.dateKey, e)}
                isDragging={isBeingDragged}
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
        <div className="flex flex-1" ref={columnsRef}>
          {columns.map((column) => {
            const isToday = isSameDay(column.date, today);
            
            return (
              <div
                key={column.dateKey}
                data-column-key={column.dateKey}
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
