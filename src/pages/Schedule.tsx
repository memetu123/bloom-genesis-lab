import { useState, useCallback, useMemo, memo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAppData, getWeekStartsOn } from "@/hooks/useAppData";
import { useScheduleData, ScheduleTask } from "@/hooks/useScheduleData";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isSameDay, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";
import { formatWeekRange, formatTime } from "@/lib/formatPreferences";
import CalendarLayout from "@/components/calendar/CalendarLayout";
import CalendarDateNav from "@/components/calendar/CalendarDateNav";
import TaskDetailModal from "@/components/TaskDetailModal";
import TaskCreateModal from "@/components/TaskCreateModal";
import MobileFAB from "@/components/mobile/MobileFAB";
import { cn } from "@/lib/utils";

/**
 * Schedule Page - Agenda-style chronological list view
 * Groups tasks by day with vertical scrolling
 * 
 * NOTE: This view is currently disabled for MVP.
 * Direct access to /schedule will redirect to /weekly with a toast notification.
 * The code is kept intact for future activation.
 */

// Redirect component for MVP - keeps architecture intact
const ScheduleRedirect = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    toast.info("Schedule view is coming soon");
    navigate("/weekly", { replace: true });
  }, [navigate]);
  
  return null;
};

// Format day header - "Today", "Tomorrow", or date
const formatDayHeader = (date: Date, dateFormat: string): string => {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, MMMM d");
};

// Task card for schedule view - reuses same anatomy
const ScheduleTaskCard = memo(({
  task,
  timeFormat,
  onClick,
  onToggle,
}: {
  task: ScheduleTask;
  timeFormat: "12h" | "24h";
  onClick: () => void;
  onToggle: () => void;
}) => {
  const instanceLabel = task.totalInstances && task.totalInstances > 1
    ? ` (${task.instanceNumber || 1}/${task.totalInstances})`
    : "";

  const timeDisplay = task.timeStart
    ? `${formatTime(task.timeStart, timeFormat)}${task.timeEnd ? ` – ${formatTime(task.timeEnd, timeFormat)}` : ""}`
    : null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 py-2.5 px-3 rounded-lg cursor-pointer transition-all",
        "border",
        task.isCompleted
          ? "bg-muted/30 border-muted-foreground/10"
          : "bg-card border-border hover:border-foreground/15 hover:shadow-sm"
      )}
      onClick={onClick}
    >
      {/* Completion circle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={cn(
          "flex-shrink-0 text-sm mt-0.5",
          task.isCompleted ? "text-primary" : "text-muted-foreground hover:text-primary"
        )}
      >
        {task.isCompleted ? "●" : "○"}
      </button>

      {/* Task content */}
      <div className="flex-1 min-w-0">
        <span className={cn(
          "text-sm block",
          task.isCompleted && "line-through text-muted-foreground",
          !task.isCompleted && "text-foreground"
        )}>
          {task.title}{instanceLabel}
        </span>
        
        {/* Time and goal context */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {timeDisplay && (
            <span className="text-xs text-muted-foreground">
              {timeDisplay}
            </span>
          )}
          {task.goalTitle && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {task.goalTitle}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
ScheduleTaskCard.displayName = "ScheduleTaskCard";

// Day group component
const DayGroup = memo(({
  date,
  tasks,
  dateFormat,
  timeFormat,
  onTaskClick,
  onToggle,
}: {
  date: Date;
  tasks: ScheduleTask[];
  dateFormat: string;
  timeFormat: "12h" | "24h";
  onTaskClick: (task: ScheduleTask) => void;
  onToggle: (task: ScheduleTask) => void;
}) => {
  const isCurrentDay = isToday(date);
  
  // Separate all-day tasks (no time) and timed tasks
  const allDayTasks = tasks.filter(t => !t.timeStart);
  const timedTasks = tasks
    .filter(t => t.timeStart)
    .sort((a, b) => (a.timeStart || "").localeCompare(b.timeStart || ""));

  return (
    <div className="mb-6">
      {/* Day header */}
      <div className={cn(
        "sticky top-0 z-10 py-2 px-1 mb-2 bg-background",
        isCurrentDay && "border-l-2 border-primary pl-3"
      )}>
        <h3 className={cn(
          "text-sm font-semibold",
          isCurrentDay ? "text-primary" : "text-foreground"
        )}>
          {formatDayHeader(date, dateFormat)}
        </h3>
        <span className="text-xs text-muted-foreground">
          {format(date, "MMMM d, yyyy")}
        </span>
      </div>

      {/* Tasks */}
      <div className="space-y-2">
        {/* All-day tasks first */}
        {allDayTasks.map(task => (
          <ScheduleTaskCard
            key={task.id}
            task={task}
            timeFormat={timeFormat}
            onClick={() => onTaskClick(task)}
            onToggle={() => onToggle(task)}
          />
        ))}
        
        {/* Timed tasks */}
        {timedTasks.map(task => (
          <ScheduleTaskCard
            key={task.id}
            task={task}
            timeFormat={timeFormat}
            onClick={() => onTaskClick(task)}
            onToggle={() => onToggle(task)}
          />
        ))}
      </div>
      
      {/* Empty day message */}
      {tasks.length === 0 && (
        <p className="text-sm text-muted-foreground py-3 px-1">
          No tasks scheduled
        </p>
      )}
    </div>
  );
});
DayGroup.displayName = "DayGroup";

const Schedule = () => {
  // MVP: Redirect to weekly view - Schedule is coming soon
  // Remove this line and the ScheduleRedirect return to re-enable
  return <ScheduleRedirect />;
  
  // Original implementation below (kept for future activation)
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { preferences, goals } = useAppData();
  const isMobile = useIsMobile();
  const weekStartsOn = getWeekStartsOn(preferences.startOfWeek);

  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn })
  );
  const [showFocusedOnly, setShowFocusedOnly] = useState(false);

  // Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ScheduleTask | null>(null);
  const [selectedTaskDate, setSelectedTaskDate] = useState<Date>(new Date());
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  // Calculate week end
  const currentWeekEnd = useMemo(() =>
    endOfWeek(currentWeekStart, { weekStartsOn }),
    [currentWeekStart, weekStartsOn]
  );

  // Use schedule data hook (reuses weekly data logic)
  const { tasksByDate, loading, refetch, updateTaskCompletion } = useScheduleData(
    currentWeekStart,
    currentWeekEnd
  );

  const weekRangeObj = formatWeekRange(currentWeekStart, currentWeekEnd, preferences.dateFormat);
  const weekRange = `${weekRangeObj.start} – ${weekRangeObj.end}`;
  const isCurrentWeek = format(currentWeekStart, "yyyy-MM-dd") ===
    format(startOfWeek(new Date(), { weekStartsOn }), "yyyy-MM-dd");

  // Handlers
  const handleTaskClick = useCallback((task: ScheduleTask, date: Date) => {
    setSelectedTask(task);
    setSelectedTaskDate(date);
    setTaskModalOpen(true);
  }, []);

  const handleToggleComplete = useCallback(async (task: ScheduleTask, date: Date) => {
    if (!user) return;
    const dateKey = format(date, "yyyy-MM-dd");
    const newCompleted = !task.isCompleted;

    // Optimistic update
    updateTaskCompletion(task.id, dateKey, newCompleted);

    try {
      if (task.taskType === "independent") {
        const { data: existingInstance } = await supabase
          .from("daily_task_instances")
          .select("id, is_completed")
          .eq("completion_id", task.id)
          .maybeSingle();

        if (existingInstance) {
          await supabase
            .from("daily_task_instances")
            .update({ is_completed: newCompleted })
            .eq("id", existingInstance.id);
        } else {
          await supabase
            .from("daily_task_instances")
            .insert({
              user_id: user.id,
              completion_id: task.id,
              is_completed: true,
            });
        }
      } else {
        if (task.isCompleted) {
          await supabase
            .from("commitment_completions")
            .delete()
            .eq("commitment_id", task.commitmentId)
            .eq("completed_date", dateKey);
        } else {
          await supabase
            .from("commitment_completions")
            .insert({
              user_id: user.id,
              commitment_id: task.commitmentId,
              completed_date: dateKey,
              instance_number: task.instanceNumber || 1,
            });
        }
      }
    } catch (error) {
      console.error("Error toggling completion:", error);
      toast.error("Failed to update task");
      updateTaskCompletion(task.id, dateKey, !newCompleted);
    }
  }, [user, updateTaskCompletion]);

  const goToPreviousWeek = useCallback(() =>
    setCurrentWeekStart(prev => subWeeks(prev, 1)), []);
  const goToNextWeek = useCallback(() =>
    setCurrentWeekStart(prev => addWeeks(prev, 1)), []);
  const goToCurrentWeek = useCallback(() =>
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn })), [weekStartsOn]);

  // Filter tasks based on focus toggle
  const filteredTasksByDate = useMemo(() => {
    if (!showFocusedOnly) return tasksByDate;
    const result: Record<string, ScheduleTask[]> = {};
    Object.entries(tasksByDate).forEach(([dateKey, tasks]) => {
      result[dateKey] = tasks.filter(t => t.visionIsFocus !== false);
    });
    return result;
  }, [tasksByDate, showFocusedOnly]);

  // Get sorted dates with tasks
  const sortedDates = useMemo(() => {
    return Object.keys(filteredTasksByDate)
      .sort()
      .map(dateKey => ({
        dateKey,
        date: parseISO(dateKey),
        tasks: filteredTasksByDate[dateKey] || [],
      }));
  }, [filteredTasksByDate]);

  // Calculate totals
  const { totalPlanned, totalActual } = useMemo(() => {
    let planned = 0;
    let actual = 0;
    Object.values(filteredTasksByDate).forEach(tasks => {
      planned += tasks.length;
      actual += tasks.filter(t => t.isCompleted).length;
    });
    return { totalPlanned: planned, totalActual: actual };
  }, [filteredTasksByDate]);

  // Goals for task creation
  const goalOptions = useMemo(() =>
    goals
      .filter(g => g.goal_type === "ninety_day" && !g.is_deleted && g.status !== "archived")
      .map(g => ({ id: g.id, title: g.title })),
    [goals]
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Date navigation header
  const headerContent = (
    <CalendarDateNav
      dateLabel={weekRange}
      onPrev={goToPreviousWeek}
      onNext={goToNextWeek}
      onToday={goToCurrentWeek}
      showTodayButton={!isCurrentWeek}
    />
  );

  // Schedule content - vertical list
  const scheduleContent = (
    <div className={cn(
      "flex-1 overflow-y-auto px-4 py-4",
      isMobile && "pb-20"
    )}>
      <div className="max-w-2xl mx-auto">
        {sortedDates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {showFocusedOnly
                ? "No focused tasks this week"
                : "No tasks scheduled this week"}
            </p>
          </div>
        ) : (
          sortedDates.map(({ dateKey, date, tasks }) => (
            <DayGroup
              key={dateKey}
              date={date}
              tasks={tasks}
              dateFormat={preferences.dateFormat}
              timeFormat={preferences.timeFormat}
              onTaskClick={(task) => handleTaskClick(task, date)}
              onToggle={(task) => handleToggleComplete(task, date)}
            />
          ))
        )}
      </div>
    </div>
  );

  // Mobile view
  if (isMobile) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-4 py-2">
          {headerContent}
        </div>

        {scheduleContent}

        <MobileFAB onClick={() => setCreateModalOpen(true)} />

        <TaskCreateModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
          defaultDate={new Date()}
          goals={goalOptions}
          onSuccess={refetch}
          weekStart={currentWeekStart}
        />
        <TaskDetailModal
          open={taskModalOpen}
          onOpenChange={setTaskModalOpen}
          task={selectedTask}
          date={selectedTaskDate}
          onUpdate={refetch}
        />
      </div>
    );
  }

  // Desktop/Tablet
  return (
    <>
      <CalendarLayout
        totalPlanned={totalPlanned}
        totalActual={totalActual}
        onAddTask={() => setCreateModalOpen(true)}
        showFocusedOnly={showFocusedOnly}
        onToggleFocus={() => setShowFocusedOnly(!showFocusedOnly)}
        headerContent={headerContent}
      >
        {scheduleContent}
      </CalendarLayout>

      <TaskCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        defaultDate={new Date()}
        goals={goalOptions}
        onSuccess={refetch}
        weekStart={currentWeekStart}
      />

      <TaskDetailModal
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        task={selectedTask}
        date={selectedTaskDate}
        onUpdate={refetch}
      />
    </>
  );
};

export default Schedule;
