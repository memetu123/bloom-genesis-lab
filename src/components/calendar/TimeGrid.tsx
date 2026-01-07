import { memo, useMemo, useCallback } from "react";
import { format, isSameDay } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
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
 * - Compact mode: collapses empty gaps >= MIN_GAP_MINUTES
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

// Hour slot height in pixels
const HOUR_HEIGHT = 60;
// Time scale width
const TIME_SCALE_WIDTH = 56;
// Minimum column width
const DEFAULT_MIN_COLUMN_WIDTH = 140;
// Minimum gap duration to collapse (in minutes)
const MIN_GAP_MINUTES = 60;
// Collapsed gap row height
const GAP_ROW_HEIGHT = 28;

// Parse time string to minutes from midnight
const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
};

// Calculate task position and height based on time
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

// Group overlapping tasks for side-by-side rendering
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

// Gap detection: find empty time ranges across all columns
interface TimeGap {
  id: string;
  startHour: number;
  endHour: number;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
}

const detectGaps = (
  columns: DayColumn[],
  visibleStartHour: number,
  visibleEndHour: number
): TimeGap[] => {
  // Collect all task time ranges across all columns
  const occupiedRanges: { start: number; end: number }[] = [];
  
  columns.forEach(col => {
    col.tasks.forEach(task => {
      if (task.timeStart) {
        const start = timeToMinutes(task.timeStart);
        const end = task.timeEnd ? timeToMinutes(task.timeEnd) : start + 30;
        occupiedRanges.push({ start, end });
      }
    });
  });
  
  if (occupiedRanges.length === 0) return [];
  
  // Sort and merge overlapping ranges
  occupiedRanges.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  
  occupiedRanges.forEach(range => {
    if (merged.length === 0) {
      merged.push({ ...range });
    } else {
      const last = merged[merged.length - 1];
      if (range.start <= last.end) {
        last.end = Math.max(last.end, range.end);
      } else {
        merged.push({ ...range });
      }
    }
  });
  
  // Find gaps between merged ranges (within visible bounds)
  const gaps: TimeGap[] = [];
  const visibleStartMin = visibleStartHour * 60;
  const visibleEndMin = visibleEndHour * 60;
  
  // Gap before first task
  if (merged.length > 0 && merged[0].start > visibleStartMin + MIN_GAP_MINUTES) {
    const gapEnd = merged[0].start;
    const gapStart = visibleStartMin;
    if (gapEnd - gapStart >= MIN_GAP_MINUTES) {
      gaps.push({
        id: `gap-${gapStart}-${gapEnd}`,
        startHour: Math.floor(gapStart / 60),
        endHour: Math.ceil(gapEnd / 60),
        startMinutes: gapStart,
        endMinutes: gapEnd,
        durationMinutes: gapEnd - gapStart,
      });
    }
  }
  
  // Gaps between tasks
  for (let i = 0; i < merged.length - 1; i++) {
    const gapStart = merged[i].end;
    const gapEnd = merged[i + 1].start;
    
    if (gapEnd - gapStart >= MIN_GAP_MINUTES) {
      gaps.push({
        id: `gap-${gapStart}-${gapEnd}`,
        startHour: Math.floor(gapStart / 60),
        endHour: Math.ceil(gapEnd / 60),
        startMinutes: gapStart,
        endMinutes: gapEnd,
        durationMinutes: gapEnd - gapStart,
      });
    }
  }
  
  // Gap after last task
  if (merged.length > 0 && merged[merged.length - 1].end < visibleEndMin - MIN_GAP_MINUTES) {
    const gapStart = merged[merged.length - 1].end;
    const gapEnd = visibleEndMin;
    if (gapEnd - gapStart >= MIN_GAP_MINUTES) {
      gaps.push({
        id: `gap-${gapStart}-${gapEnd}`,
        startHour: Math.floor(gapStart / 60),
        endHour: Math.ceil(gapEnd / 60),
        startMinutes: gapStart,
        endMinutes: gapEnd,
        durationMinutes: gapEnd - gapStart,
      });
    }
  }
  
  return gaps;
};

// Format time for gap label
const formatGapTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};

// Task card component
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

// Collapsed gap row component
const GapRow = memo(({
  gap,
  isExpanded,
  onToggle,
}: {
  gap: TimeGap;
  isExpanded: boolean;
  onToggle: () => void;
}) => {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1",
        "bg-muted/30 hover:bg-muted/50 border-y border-border/30",
        "text-xs text-muted-foreground transition-colors",
        "cursor-pointer select-none"
      )}
      style={{ height: GAP_ROW_HEIGHT }}
    >
      {isExpanded ? (
        <ChevronDown className="h-3 w-3 flex-shrink-0" />
      ) : (
        <ChevronRight className="h-3 w-3 flex-shrink-0" />
      )}
      <span>
        {formatGapTime(gap.startMinutes)}–{formatGapTime(gap.endMinutes)}
      </span>
      <span className="text-muted-foreground/60">
        (no tasks)
      </span>
    </button>
  );
});
GapRow.displayName = "GapRow";

// Build segments for compact mode rendering
interface TimeSegment {
  type: "visible" | "gap";
  startMinutes: number;
  endMinutes: number;
  gap?: TimeGap;
}

const buildTimeSegments = (
  startHour: number,
  endHour: number,
  gaps: TimeGap[],
  isGapExpanded: (id: string) => boolean
): TimeSegment[] => {
  const segments: TimeSegment[] = [];
  const visibleStartMin = startHour * 60;
  const visibleEndMin = endHour * 60;
  
  if (gaps.length === 0) {
    return [{ type: "visible", startMinutes: visibleStartMin, endMinutes: visibleEndMin }];
  }
  
  let currentMin = visibleStartMin;
  
  gaps.forEach(gap => {
    // Add visible segment before this gap
    if (gap.startMinutes > currentMin) {
      segments.push({
        type: "visible",
        startMinutes: currentMin,
        endMinutes: gap.startMinutes,
      });
    }
    
    // Add the gap (either collapsed or expanded as visible)
    if (isGapExpanded(gap.id)) {
      segments.push({
        type: "visible",
        startMinutes: gap.startMinutes,
        endMinutes: gap.endMinutes,
      });
    } else {
      segments.push({
        type: "gap",
        startMinutes: gap.startMinutes,
        endMinutes: gap.endMinutes,
        gap,
      });
    }
    
    currentMin = gap.endMinutes;
  });
  
  // Add final visible segment after last gap
  if (currentMin < visibleEndMin) {
    segments.push({
      type: "visible",
      startMinutes: currentMin,
      endMinutes: visibleEndMin,
    });
  }
  
  return segments;
};

const TimeGrid = ({
  columns,
  onTaskClick,
  onToggleComplete,
  timeFormat,
  minColumnWidth = DEFAULT_MIN_COLUMN_WIDTH,
  className,
}: TimeGridProps) => {
  const { mode, toggleGap, isGapExpanded } = useTimeDisplay();
  const isCompactMode = mode === "compact";
  
  // Calculate adaptive time range based on tasks
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
  
  // Detect gaps for compact mode
  const gaps = useMemo(() => {
    if (!isCompactMode) return [];
    return detectGaps(columns, startHour, endHour);
  }, [columns, startHour, endHour, isCompactMode]);
  
  // Build time segments for compact mode
  const segments = useMemo(() => {
    if (!isCompactMode) return [];
    return buildTimeSegments(startHour, endHour, gaps, isGapExpanded);
  }, [isCompactMode, startHour, endHour, gaps, isGapExpanded]);
  
  // Calculate total height for compact mode
  const compactGridHeight = useMemo(() => {
    if (!isCompactMode) return hours.length * HOUR_HEIGHT;
    
    return segments.reduce((total, seg) => {
      if (seg.type === "gap") {
        return total + GAP_ROW_HEIGHT;
      }
      const durationHours = (seg.endMinutes - seg.startMinutes) / 60;
      return total + durationHours * HOUR_HEIGHT;
    }, 0);
  }, [isCompactMode, segments, hours.length]);
  
  const gridHeight = isCompactMode ? compactGridHeight : hours.length * HOUR_HEIGHT;
  const today = new Date();
  
  // Handle gap toggle
  const handleGapToggle = useCallback((gapId: string) => {
    toggleGap(gapId);
  }, [toggleGap]);
  
  // Get task position in compact mode
  const getCompactTaskPosition = useCallback((
    taskStartMin: number,
    taskEndMin: number
  ): { top: number; height: number } | null => {
    let accumulatedOffset = 0;
    
    for (const seg of segments) {
      if (seg.type === "gap") {
        // Task can't be in a collapsed gap, skip
        accumulatedOffset += GAP_ROW_HEIGHT;
      } else {
        // Visible segment
        const segStart = seg.startMinutes;
        const segEnd = seg.endMinutes;
        const segHeight = ((segEnd - segStart) / 60) * HOUR_HEIGHT;
        
        if (taskStartMin >= segStart && taskStartMin < segEnd) {
          // Task starts in this segment
          const offsetInSeg = ((taskStartMin - segStart) / 60) * HOUR_HEIGHT;
          const taskDuration = taskEndMin - taskStartMin;
          const height = (taskDuration / 60) * HOUR_HEIGHT;
          
          return {
            top: accumulatedOffset + offsetInSeg,
            height: Math.max(height, 20),
          };
        }
        
        accumulatedOffset += segHeight;
      }
    }
    
    return null;
  }, [segments]);
  
  // Render time scale for compact mode
  const renderCompactTimeScale = () => {
    let accumulatedOffset = 0;
    const elements: React.ReactNode[] = [];
    
    segments.forEach((seg, idx) => {
      if (seg.type === "gap") {
        // Gap placeholder in time scale
        elements.push(
          <div
            key={`time-gap-${idx}`}
            className="flex items-center justify-end pr-2 text-[10px] text-muted-foreground/50 bg-muted/20"
            style={{ height: GAP_ROW_HEIGHT }}
          >
            ···
          </div>
        );
        accumulatedOffset += GAP_ROW_HEIGHT;
      } else {
        // Visible time segment - render hour labels
        const segStartHour = Math.ceil(seg.startMinutes / 60);
        const segEndHour = Math.floor(seg.endMinutes / 60);
        const segHeight = ((seg.endMinutes - seg.startMinutes) / 60) * HOUR_HEIGHT;
        
        elements.push(
          <div
            key={`time-seg-${idx}`}
            className="relative"
            style={{ height: segHeight }}
          >
            {Array.from({ length: segEndHour - segStartHour + 1 }, (_, i) => {
              const hour = segStartHour + i;
              const hourMin = hour * 60;
              if (hourMin < seg.startMinutes || hourMin >= seg.endMinutes) return null;
              
              const offsetInSeg = ((hourMin - seg.startMinutes) / 60) * HOUR_HEIGHT;
              const timeStr = `${hour.toString().padStart(2, "0")}:00`;
              
              return (
                <div
                  key={hour}
                  className="absolute left-0 right-0 flex items-start justify-end pr-2 text-[11px] text-foreground/60 font-medium"
                  style={{ top: offsetInSeg + 8 }}
                >
                  <span className="-translate-y-1/2">
                    {formatTime(timeStr, timeFormat)}
                  </span>
                </div>
              );
            })}
          </div>
        );
        
        accumulatedOffset += segHeight;
      }
    });
    
    return elements;
  };
  
  // Render grid content for compact mode
  const renderCompactGridContent = (column: DayColumn) => {
    let accumulatedOffset = 0;
    const elements: React.ReactNode[] = [];
    const scheduledTasks = column.tasks.filter(t => t.timeStart);
    
    segments.forEach((seg, idx) => {
      if (seg.type === "gap" && seg.gap) {
        // Render collapsed gap row
        elements.push(
          <GapRow
            key={`gap-${seg.gap.id}`}
            gap={seg.gap}
            isExpanded={isGapExpanded(seg.gap.id)}
            onToggle={() => handleGapToggle(seg.gap!.id)}
          />
        );
        accumulatedOffset += GAP_ROW_HEIGHT;
      } else {
        // Render visible segment with tasks
        const segHeight = ((seg.endMinutes - seg.startMinutes) / 60) * HOUR_HEIGHT;
        const segStartHour = seg.startMinutes / 60;
        
        // Filter tasks that fall in this segment
        const tasksInSegment = scheduledTasks.filter(t => {
          if (!t.timeStart) return false;
          const taskStart = timeToMinutes(t.timeStart);
          return taskStart >= seg.startMinutes && taskStart < seg.endMinutes;
        });
        
        elements.push(
          <div
            key={`seg-${idx}`}
            className="relative"
            style={{ height: segHeight }}
          >
            {/* Hour lines within segment */}
            {Array.from({ length: Math.ceil(segHeight / HOUR_HEIGHT) }, (_, i) => {
              const hourMin = seg.startMinutes + i * 60;
              if (hourMin % 60 !== 0) return null;
              const offsetInSeg = ((hourMin - seg.startMinutes) / 60) * HOUR_HEIGHT;
              
              return (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t border-border/50"
                  style={{ top: offsetInSeg + 8 }}
                />
              );
            })}
            
            {/* Tasks in this segment */}
            {calculateOverlappingLayout(tasksInSegment, segStartHour).map(({ task, position, column: col, totalColumns }) => (
              <TaskCard
                key={task.id}
                task={task}
                date={column.date}
                position={{ top: position.top + 8, height: position.height }}
                column={col}
                totalColumns={totalColumns}
                onClick={() => onTaskClick(task, column.date)}
                onToggle={() => onToggleComplete(task, column.date)}
              />
            ))}
          </div>
        );
        
        accumulatedOffset += segHeight;
      }
    });
    
    return elements;
  };
  
  return (
    <div className={cn("flex-1 overflow-auto", className)}>
      <div 
        className="flex min-w-max"
        style={{ minWidth: TIME_SCALE_WIDTH + columns.length * minColumnWidth }}
      >
        {/* Time scale - fixed left column */}
        <div 
          className="sticky left-0 z-10 bg-background border-r border-border/70"
          style={{ width: TIME_SCALE_WIDTH }}
        >
          {/* Empty header cell */}
          <div className="h-10 border-b border-border" />
          
          {/* Hour labels */}
          {isCompactMode ? (
            <div className="pt-2">
              {renderCompactTimeScale()}
            </div>
          ) : (
            <div className="relative pt-2" style={{ height: gridHeight }}>
              {hours.map((hour, i) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 flex items-start justify-end pr-2 text-[11px] text-foreground/60 font-medium"
                  style={{ top: i * HOUR_HEIGHT + 8, height: HOUR_HEIGHT }}
                >
                  <span className="-translate-y-1/2">
                    {formatTime(hour, timeFormat)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Day columns */}
        {columns.map((column, colIndex) => {
          const isToday = isSameDay(column.date, today);
          const scheduledTasks = column.tasks.filter(t => t.timeStart);
          const unscheduledTasks = column.tasks.filter(t => !t.timeStart);
          
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
              
              {/* Time grid area */}
              {isCompactMode ? (
                <div className="pt-2">
                  {renderCompactGridContent(column)}
                </div>
              ) : (
                <div className="relative pt-2" style={{ height: gridHeight }}>
                  {/* Hour lines */}
                  {hours.map((_, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 border-t border-border/50"
                      style={{ top: i * HOUR_HEIGHT + 8 }}
                    />
                  ))}
                  
                  {/* Scheduled task cards */}
                  {calculateOverlappingLayout(scheduledTasks, startHour).map(({ task, position, column: col, totalColumns }) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      date={column.date}
                      position={{ top: position.top + 8, height: position.height }}
                      column={col}
                      totalColumns={totalColumns}
                      onClick={() => onTaskClick(task, column.date)}
                      onToggle={() => onToggleComplete(task, column.date)}
                    />
                  ))}
                </div>
              )}
              
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
