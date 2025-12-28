import { useEffect, useState, useCallback, useMemo, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Unlink } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useAppData, getWeekStartsOn } from "@/hooks/useAppData";
import { useDailyData, DailyTask } from "@/hooks/useDailyData";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, addDays, subDays, parseISO } from "date-fns";
import { formatDateWithDay, formatTime, formatTimeRange } from "@/lib/formatPreferences";
import FocusFilter from "@/components/FocusFilter";
import AddIconButton from "@/components/AddIconButton";
import TaskDetailModal from "@/components/TaskDetailModal";
import TaskCreateModal from "@/components/TaskCreateModal";

/**
 * Daily Page - Notion-style daily view with time slots
 * OPTIMIZED: Uses useDailyData hook for single-batch fetching
 */

// Memoized task item component with plan border indicator
const TaskItem = memo(({ 
  task, 
  timeFormat, 
  onToggle, 
  onClick 
}: { 
  task: DailyTask; 
  timeFormat: "12h" | "24h";
  onToggle: () => void;
  onClick: () => void;
}) => {
  const timeDisplay = task.timeStart 
    ? formatTimeRange(task.timeStart, task.timeEnd || null, timeFormat)
    : null;
  
  const instanceLabel = task.totalInstances && task.totalInstances > 1
    ? ` (${task.instanceNumber || 1}/${task.totalInstances})`
    : "";

  // Border logic (Calendar view - Interaction-based reveal):
  // Daily view always shows borders for plan-linked tasks (no "plan selection" mode)
  // Tasks with a plan: subtle neutral left border
  // Tasks without a plan: no border
  const showPlanBorder = !!task.goalId;

  return (
    <div className={`
      flex items-start gap-3 py-2 hover:bg-muted/30 -mx-2 px-2 rounded transition-calm
      ${showPlanBorder ? "border-l border-l-muted-foreground/30 ml-0 pl-3" : ""}
    `}>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`flex-shrink-0 text-lg ${task.isCompleted ? "text-primary" : "hover:text-primary"}`}
      >
        {task.isCompleted ? "●" : "○"}
      </button>
      <button
        onClick={onClick}
        className="flex-1 text-left"
      >
        <span className={`text-sm ${task.isCompleted ? "text-muted-foreground line-through" : "text-foreground"}`}>
          {task.title}{instanceLabel}
        </span>
        {(timeDisplay || task.taskType === "independent" || task.isDetached) && (
          <div className="flex items-center gap-2 mt-0.5">
            {timeDisplay && (
              <span className="text-xs text-muted-foreground">{timeDisplay}</span>
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
          </div>
        )}
      </button>
    </div>
  );
});
TaskItem.displayName = 'TaskItem';

const Daily = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { preferences, goals } = useAppData();
  const weekStartsOn = getWeekStartsOn(preferences.startOfWeek);
  
  const [showFocusedOnly, setShowFocusedOnly] = useState(false);
  const [selectedTask, setSelectedTask] = useState<DailyTask | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  // Get date from URL
  const dateParam = searchParams.get("date");
  const taskIdParam = searchParams.get("taskId");
  
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (dateParam) {
      try {
        return parseISO(dateParam);
      } catch {
        return new Date();
      }
    }
    return new Date();
  });

  // Use centralized data hook
  const { tasks, loading, refetch, updateTaskCompletion } = useDailyData(
    selectedDate,
    weekStartsOn
  );

  // Store taskId to open modal after loading
  useEffect(() => {
    if (taskIdParam) {
      setPendingTaskId(taskIdParam);
    }
  }, [taskIdParam]);

  // Open task modal when tasks are loaded and we have a pending taskId
  useEffect(() => {
    if (pendingTaskId && !loading && tasks.length > 0) {
      const task = tasks.find(t => t.commitmentId === pendingTaskId);
      if (task) {
        setSelectedTask(task);
        setModalOpen(true);
      }
      setPendingTaskId(null);
    }
  }, [pendingTaskId, loading, tasks]);

  const formattedDate = formatDateWithDay(selectedDate, preferences.dateFormat);
  const dateKey = format(selectedDate, "yyyy-MM-dd");

  // Stable handlers
  const handleTaskClick = useCallback((task: DailyTask) => {
    setSelectedTask(task);
    setModalOpen(true);
  }, []);

  const handleToggleComplete = useCallback(async (task: DailyTask) => {
    if (!user) return;
    const newCompleted = !task.isCompleted;
    
    // Optimistic update
    updateTaskCompletion(task.id, newCompleted);
    
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
        // Check if completion record exists
        const { data: existingCompletion } = await supabase
          .from("commitment_completions")
          .select("id")
          .eq("commitment_id", task.commitmentId)
          .eq("completed_date", dateKey)
          .maybeSingle();

        if (existingCompletion) {
          // Update the is_completed flag
          await supabase
            .from("commitment_completions")
            .update({ is_completed: !task.isCompleted })
            .eq("id", existingCompletion.id);
        } else {
          // Create new completion record
          await supabase
            .from("commitment_completions")
            .insert({
              user_id: user.id,
              commitment_id: task.commitmentId,
              completed_date: dateKey,
              instance_number: task.instanceNumber || 1,
              is_completed: true,
            });
        }
      }
    } catch (error) {
      console.error("Error toggling completion:", error);
      toast.error("Failed to update task");
      // Rollback optimistic update
      updateTaskCompletion(task.id, !newCompleted);
    }
  }, [user, dateKey, updateTaskCompletion]);

  const goToPreviousDay = useCallback(() => {
    const newDate = subDays(selectedDate, 1);
    setSelectedDate(newDate);
    navigate(`/daily?date=${format(newDate, "yyyy-MM-dd")}`, { replace: true });
  }, [selectedDate, navigate]);

  const goToNextDay = useCallback(() => {
    const newDate = addDays(selectedDate, 1);
    setSelectedDate(newDate);
    navigate(`/daily?date=${format(newDate, "yyyy-MM-dd")}`, { replace: true });
  }, [selectedDate, navigate]);

  const goToToday = useCallback(() => {
    const today = new Date();
    setSelectedDate(today);
    navigate(`/daily?date=${format(today, "yyyy-MM-dd")}`, { replace: true });
  }, [navigate]);

  const isToday = format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

  // Filter tasks based on focus toggle - memoized
  const filteredTasks = useMemo(() => 
    showFocusedOnly
      ? tasks.filter(t => t.taskType === "independent" || t.goalIsFocus === true)
      : tasks,
    [showFocusedOnly, tasks]
  );

  // Separate tasks - memoized
  const { scheduledTasks, unscheduledTasks } = useMemo(() => ({
    scheduledTasks: filteredTasks
      .filter(t => t.timeStart)
      .sort((a, b) => (a.timeStart || "").localeCompare(b.timeStart || "")),
    unscheduledTasks: filteredTasks.filter(t => !t.timeStart)
  }), [filteredTasks]);

  // Time slots
  const timeSlots = useMemo(() => [
    "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
    "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"
  ], []);

  // Group tasks by hour - memoized
  const getTasksForSlot = useCallback((slot: string) => {
    const slotHour = slot.split(":")[0];
    return scheduledTasks.filter(t => {
      if (!t.timeStart) return false;
      const taskHour = t.timeStart.split(":")[0];
      return taskHour === slotHour;
    });
  }, [scheduledTasks]);

  // Goals for dropdown - memoized
  const goalOptions = useMemo(() => 
    goals.filter(g => g.goal_type === "ninety_day").map(g => ({ id: g.id, title: g.title })),
    [goals]
  );

  // Daily progress
  const dailyCompleted = filteredTasks.filter(t => t.isCompleted).length;
  const dailyTotal = filteredTasks.length;

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <p className="text-muted-foreground text-center">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl" style={{ maxHeight: '80vh' }}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-medium text-foreground">Daily View</h1>
          {dailyTotal > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
              {dailyCompleted}/{dailyTotal} completed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <FocusFilter
            showFocusedOnly={showFocusedOnly}
            onToggle={() => setShowFocusedOnly(!showFocusedOnly)}
          />
          <AddIconButton
            onClick={() => setCreateModalOpen(true)}
            tooltip="Add task"
          />
        </div>
      </div>

      {/* Date navigation */}
      <div className="flex items-center justify-between mb-8 border-b border-border pb-4">
        <button
          onClick={goToPreviousDay}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-calm"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>
        <div className="text-center">
          <h2 className="text-base font-medium text-foreground uppercase tracking-wide">
            {formattedDate}
          </h2>
          {!isToday && (
            <button
              onClick={goToToday}
              className="text-xs text-primary hover:underline mt-1"
            >
              Go to today
            </button>
          )}
        </div>
        <button
          onClick={goToNextDay}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-calm"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-sm mb-4">
            {showFocusedOnly
              ? "No focused tasks for this day"
              : "No tasks for this day"}
          </p>
          <Button variant="outline" size="sm" onClick={() => setCreateModalOpen(true)}>
            Add a task
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Scheduled tasks - Timeline view */}
          {scheduledTasks.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
                Scheduled
              </h3>
              <div className="border border-border">
                {timeSlots.map((slot) => {
                  const slotTasks = getTasksForSlot(slot);
                  if (slotTasks.length === 0) return null;

                  return (
                    <div key={slot} className="flex border-b border-border last:border-b-0">
                      <div className="w-16 py-2 px-2 text-xs text-muted-foreground border-r border-border">
                        {formatTime(slot, preferences.timeFormat)}
                      </div>
                      <div className="flex-1 py-1 px-2">
                        {slotTasks.map((task) => (
                          <TaskItem
                            key={task.id}
                            task={task}
                            timeFormat={preferences.timeFormat}
                            onToggle={() => handleToggleComplete(task)}
                            onClick={() => handleTaskClick(task)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unscheduled tasks */}
          {unscheduledTasks.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
                No Time Assigned
              </h3>
              <div className="border border-border p-3 space-y-1">
                {unscheduledTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    timeFormat={preferences.timeFormat}
                    onToggle={() => handleToggleComplete(task)}
                    onClick={() => handleTaskClick(task)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Task create modal */}
      <TaskCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        defaultDate={selectedDate}
        goals={goalOptions}
        onSuccess={refetch}
      />

      {/* Task detail modal */}
      <TaskDetailModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        task={selectedTask}
        date={selectedDate}
        onUpdate={refetch}
      />
    </div>
  );
};

export default Daily;
