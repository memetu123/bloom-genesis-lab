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
 * - Compact mode: collapses empty time RANGES (not individual rows)
 *   spanning full width across all columns
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
const COLLAPSED_GAP_HEIGHT = 28;

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

// Gap detection: find empty time ranges across ALL columns
interface TimeGap {
  id: string;
  startMinutes: number;
  endMinutes: number;
}

const detectGaps = (
  columns: DayColumn[],
  visibleStartHour: number,
  visibleEndHour: number
): TimeGap[] => {
  // Collect all task time ranges across ALL columns
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
  if (merged.length > 0 && merged[0].start > visibleStartMin) {
    const gapEnd = merged[0].start;
    const gapStart = visibleStartMin;
    if (gapEnd - gapStart >= MIN_GAP_MINUTES) {
      gaps.push({
        id: `gap-${gapStart}-${gapEnd}`,
        startMinutes: gapStart,
        endMinutes: gapEnd,
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
        startMinutes: gapStart,
        endMinutes: gapEnd,
      });
    }
  }
  
  // Gap after last task
  if (merged.length > 0 && merged[merged.length - 1].end < visibleEndMin) {
    const gapStart = merged[merged.length - 1].end;
    const gapEnd = visibleEndMin;
    if (gapEnd - gapStart >= MIN_GAP_MINUTES) {
      gaps.push({
        id: `gap-${gapStart}-${gapEnd}`,
        startMinutes: gapStart,
        endMinutes: gapEnd,
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

// Build segments for compact mode rendering - shared across all columns
interface TimeSegment {
  type: "visible" | "collapsed";
  startMinutes: number;
  endMinutes: number;
  gapId?: string;
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
        type: "collapsed",
        startMinutes: gap.startMinutes,
        endMinutes: gap.endMinutes,
        gapId: gap.id,
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

// Calculate the Y offset for a given time in compact mode
const getCompactYOffset = (
  targetMinutes: number,
  segments: TimeSegment[]
): number => {
  let offset = 0;
  
  for (const seg of segments) {
    if (targetMinutes <= seg.startMinutes) {
      return offset;
    }
    
    if (seg.type === "collapsed") {
      if (targetMinutes <= seg.endMinutes) {
        // Target is within collapsed gap - shouldn't happen for tasks
        return offset;
      }
      offset += COLLAPSED_GAP_HEIGHT;
    } else {
      // Visible segment
      if (targetMinutes <= seg.endMinutes) {
        // Target is within this visible segment
        const minutesIntoSegment = targetMinutes - seg.startMinutes;
        return offset + (minutesIntoSegment / 60) * HOUR_HEIGHT;
      }
      const segmentHeight = ((seg.endMinutes - seg.startMinutes) / 60) * HOUR_HEIGHT;
      offset += segmentHeight;
    }
  }
  
  return offset;
};

// Collapsed gap block component - spans full width
const CollapsedGapBlock = memo(({
  segment,
  onToggle,
  timeScaleWidth,
}: {
  segment: TimeSegment;
  onToggle: () => void;
  timeScaleWidth: number;
}) => {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-2 px-3",
        "bg-muted/20 hover:bg-muted/40 border-y border-border/30",
        "text-xs text-muted-foreground/70 transition-colors",
        "cursor-pointer select-none"
      )}
      style={{ 
        height: COLLAPSED_GAP_HEIGHT,
        paddingLeft: timeScaleWidth + 8,
      }}
    >
      <ChevronRight className="h-3 w-3 flex-shrink-0" />
      <span className="font-medium">
        {formatGapTime(segment.startMinutes)} – {formatGapTime(segment.endMinutes)}
      </span>
    </button>
  );
});
CollapsedGapBlock.displayName = "CollapsedGapBlock";

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
  
  // Detect gaps for compact mode (shared across all columns)
  const gaps = useMemo(() => {
    if (!isCompactMode) return [];
    return detectGaps(columns, startHour, endHour);
  }, [columns, startHour, endHour, isCompactMode]);
  
  // Build time segments for compact mode (shared)
  const segments = useMemo(() => {
    if (!isCompactMode) return [];
    return buildTimeSegments(startHour, endHour, gaps, isGapExpanded);
  }, [isCompactMode, startHour, endHour, gaps, isGapExpanded]);
  
  // Calculate total height
  const gridHeight = useMemo(() => {
    if (!isCompactMode) {
      return hours.length * HOUR_HEIGHT;
    }
    
    return segments.reduce((total, seg) => {
      if (seg.type === "collapsed") {
        return total + COLLAPSED_GAP_HEIGHT;
      }
      const durationHours = (seg.endMinutes - seg.startMinutes) / 60;
      return total + durationHours * HOUR_HEIGHT;
    }, 0);
  }, [isCompactMode, segments, hours.length]);
  
  const today = new Date();
  
  // Handle gap toggle
  const handleGapToggle = useCallback((gapId: string) => {
    toggleGap(gapId);
  }, [toggleGap]);
  
  // Get task position in compact mode
  const getCompactTaskPosition = useCallback((
    taskStartMin: number,
    taskEndMin: number
  ): { top: number; height: number } => {
    const top = getCompactYOffset(taskStartMin, segments);
    const bottom = getCompactYOffset(taskEndMin, segments);
    const height = Math.max(bottom - top, 20);
    
    return { top, height };
  }, [segments]);
  
  // Render time scale for compact mode
  const renderCompactTimeScale = () => {
    const elements: React.ReactNode[] = [];
    let accumulatedOffset = 0;
    
    segments.forEach((seg, idx) => {
      if (seg.type === "collapsed") {
        // Collapsed gap placeholder in time scale
        elements.push(
          <div
            key={`time-gap-${idx}`}
            className="flex items-center justify-end pr-2 text-[10px] text-muted-foreground/40"
            style={{ height: COLLAPSED_GAP_HEIGHT }}
          >
            ···
          </div>
        );
        accumulatedOffset += COLLAPSED_GAP_HEIGHT;
      } else {
        // Visible time segment - render hour labels
        const segHeight = ((seg.endMinutes - seg.startMinutes) / 60) * HOUR_HEIGHT;
        
        elements.push(
          <div
            key={`time-seg-${idx}`}
            className="relative"
            style={{ height: segHeight }}
          >
            {(() => {
              const labels: React.ReactNode[] = [];
              // Find hours that fall within this segment
              for (let hour = Math.ceil(seg.startMinutes / 60); hour <= Math.floor(seg.endMinutes / 60); hour++) {
                const hourMin = hour * 60;
                if (hourMin < seg.startMinutes || hourMin > seg.endMinutes) continue;
                
                const offsetInSeg = ((hourMin - seg.startMinutes) / 60) * HOUR_HEIGHT;
                const timeStr = `${hour.toString().padStart(2, "0")}:00`;
                
                labels.push(
                  <div
                    key={hour}
                    className="absolute left-0 right-0 flex items-start justify-end pr-2 text-[11px] text-foreground/60 font-medium"
                    style={{ top: offsetInSeg }}
                  >
                    <span className="-translate-y-1/2">
                      {formatTime(timeStr, timeFormat)}
                    </span>
                  </div>
                );
              }
              return labels;
            })()}
          </div>
        );
        
        accumulatedOffset += segHeight;
      }
    });
    
    return elements;
  };
  
  // Render compact grid content for a single column
  const renderCompactColumnContent = (column: DayColumn) => {
    const scheduledTasks = column.tasks.filter(t => t.timeStart);
    const tasksWithLayout = calculateOverlappingLayout(scheduledTasks, startHour);
    
    // Map each segment to rendered content
    const elements: React.ReactNode[] = [];
    let accumulatedOffset = 0;
    
    segments.forEach((seg, idx) => {
      if (seg.type === "collapsed") {
        // Just a spacer for the collapsed gap (the actual gap block spans full width)
        elements.push(
          <div
            key={`col-gap-${idx}`}
            style={{ height: COLLAPSED_GAP_HEIGHT }}
          />
        );
        accumulatedOffset += COLLAPSED_GAP_HEIGHT;
      } else {
        // Visible segment with tasks
        const segHeight = ((seg.endMinutes - seg.startMinutes) / 60) * HOUR_HEIGHT;
        
        // Filter tasks that fall in this segment
        const tasksInSegment = tasksWithLayout.filter(t => {
          return t.position.startMin >= seg.startMinutes && t.position.startMin < seg.endMinutes;
        });
        
        elements.push(
          <div
            key={`col-seg-${idx}`}
            className="relative"
            style={{ height: segHeight }}
          >
            {/* Hour lines within segment */}
            {(() => {
              const lines: React.ReactNode[] = [];
              for (let hour = Math.ceil(seg.startMinutes / 60); hour <= Math.floor(seg.endMinutes / 60); hour++) {
                const hourMin = hour * 60;
                if (hourMin < seg.startMinutes || hourMin > seg.endMinutes) continue;
                
                const offsetInSeg = ((hourMin - seg.startMinutes) / 60) * HOUR_HEIGHT;
                lines.push(
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-t border-border/50"
                    style={{ top: offsetInSeg }}
                  />
                );
              }
              return lines;
            })()}
            
            {/* Tasks in this segment */}
            {tasksInSegment.map(({ task, position, column: col, totalColumns }) => {
              // Calculate position relative to segment start
              const topInSegment = ((position.startMin - seg.startMinutes) / 60) * HOUR_HEIGHT;
              
              return (
                <TaskCard
                  key={task.id}
                  task={task}
                  date={column.date}
                  position={{ top: topInSegment, height: position.height }}
                  column={col}
                  totalColumns={totalColumns}
                  onClick={() => onTaskClick(task, column.date)}
                  onToggle={() => onToggleComplete(task, column.date)}
                />
              );
            })}
          </div>
        );
        
        accumulatedOffset += segHeight;
      }
    });
    
    return elements;
  };
  
  // Render collapsed gap blocks (full width, outside columns)
  const renderCollapsedGapBlocks = () => {
    if (!isCompactMode) return null;
    
    let accumulatedOffset = 0;
    const blocks: React.ReactNode[] = [];
    
    segments.forEach((seg, idx) => {
      if (seg.type === "collapsed" && seg.gapId) {
        blocks.push(
          <div
            key={seg.gapId}
            className="absolute left-0 right-0 z-20"
            style={{ top: accumulatedOffset }}
          >
            <CollapsedGapBlock
              segment={seg}
              onToggle={() => handleGapToggle(seg.gapId!)}
              timeScaleWidth={TIME_SCALE_WIDTH}
            />
          </div>
        );
        accumulatedOffset += COLLAPSED_GAP_HEIGHT;
      } else {
        const segHeight = ((seg.endMinutes - seg.startMinutes) / 60) * HOUR_HEIGHT;
        accumulatedOffset += segHeight;
      }
    });
    
    return blocks;
  };
  
  return (
    <div className={cn("flex-1 overflow-auto", className)}>
      <div 
        className="flex min-w-max relative"
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
            <div>
              {renderCompactTimeScale()}
            </div>
          ) : (
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
          )}
        </div>
        
        {/* Day columns container */}
        <div className="flex flex-1 relative">
          {/* Collapsed gap blocks spanning all columns */}
          {renderCollapsedGapBlocks()}
          
          {/* Day columns */}
          {columns.map((column) => {
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
                  <div>
                    {renderCompactColumnContent(column)}
                  </div>
                ) : (
                  <div className="relative" style={{ height: gridHeight }}>
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
    </div>
  );
};

export default memo(TimeGrid);
