import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserPreferences, getWeekStartsOn } from "@/hooks/useUserPreferences";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, addDays, subDays, parseISO, startOfWeek, endOfWeek } from "date-fns";
import { formatDateWithDay, formatTime, formatTimeRange } from "@/lib/formatPreferences";
import FocusFilter from "@/components/FocusFilter";
import AddIconButton from "@/components/AddIconButton";
import TaskDetailModal from "@/components/TaskDetailModal";
import TaskCreateModal from "@/components/TaskCreateModal";
import type { TaskType } from "@/types/scheduling";

/**
 * Daily Page - Notion-style daily view with time slots
 * Shows tasks in a timeline format with time scheduling
 */

interface DailyTask {
  id: string;
  commitmentId: string | null;
  title: string;
  timeStart: string | null;
  timeEnd: string | null;
  isCompleted: boolean;
  taskType: TaskType;
  instanceNumber?: number;
  totalInstances?: number;
  goalIsFocus: boolean | null;
  isDetached?: boolean;
}

const Daily = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { preferences } = useUserPreferences();
  const weekStartsOn = getWeekStartsOn(preferences.startOfWeek);
  
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [goals, setGoals] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFocusedOnly, setShowFocusedOnly] = useState(false);
  const [selectedTask, setSelectedTask] = useState<DailyTask | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  // Get date and taskId from URL
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

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const weekStart = startOfWeek(selectedDate, { weekStartsOn });
      const weekEnd = endOfWeek(selectedDate, { weekStartsOn });
      const weekStartStr = format(weekStart, "yyyy-MM-dd");
      const weekEndStr = format(weekEnd, "yyyy-MM-dd");

      // Fetch all active recurring commitments with their default times (exclude soft-deleted)
      const { data: commitments, error: commitError } = await supabase
        .from("weekly_commitments")
        .select("*, default_time_start, default_time_end, flexible_time, repeat_times_per_period")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .or("is_deleted.is.null,is_deleted.eq.false");

      if (commitError) throw commitError;

      const dailyTasks: DailyTask[] = [];

      for (const commitment of commitments || []) {
        // Get or create weekly checkin
        const { data: existingCheckin } = await supabase
          .from("weekly_checkins")
          .select("*")
          .eq("weekly_commitment_id", commitment.id)
          .eq("period_start_date", weekStartStr)
          .maybeSingle();

        let checkinData = existingCheckin;

        if (!checkinData) {
          const frequency = commitment.frequency_json as { times_per_week: number };
          const { data: newCheckin } = await supabase
            .from("weekly_checkins")
            .insert({
              user_id: user.id,
              weekly_commitment_id: commitment.id,
              period_start_date: weekStartStr,
              period_end_date: weekEndStr,
              planned_count: frequency.times_per_week,
              actual_count: 0,
            })
            .select()
            .single();
          checkinData = newCheckin;
        }

        // Check completion for this specific date (including detached instances)
        const { data: completion } = await supabase
          .from("commitment_completions")
          .select("*, time_start, time_end, is_flexible_time, instance_number, is_detached")
          .eq("commitment_id", commitment.id)
          .eq("completed_date", dateKey)
          .maybeSingle();

        // Skip if this instance is detached (it will be fetched separately)
        if (completion?.is_detached) {
          continue;
        }

        // Get goal focus status
        let goalIsFocus: boolean | null = null;
        if (commitment.goal_id) {
          const { data: goal } = await supabase
            .from("goals")
            .select("is_focus")
            .eq("id", commitment.goal_id)
            .maybeSingle();
          goalIsFocus = goal?.is_focus ?? null;
        }

        // Use completion time if exists, otherwise use default time from commitment
        const timeStart = completion?.time_start || commitment.default_time_start || null;
        const timeEnd = completion?.time_end || commitment.default_time_end || null;
        const timesPerPeriod = commitment.repeat_times_per_period || 1;

        dailyTasks.push({
          id: `${commitment.id}-${dateKey}`,
          commitmentId: commitment.id,
          title: commitment.title,
          timeStart,
          timeEnd,
          isCompleted: !!completion,
          taskType: "recurring",
          instanceNumber: completion?.instance_number || 1,
          totalInstances: timesPerPeriod,
          goalIsFocus,
        });
      }

      // Fetch independent tasks for this date (including detached instances, exclude deleted)
      const { data: independentTasks } = await supabase
        .from("commitment_completions")
        .select("*, is_detached")
        .eq("user_id", user.id)
        .eq("completed_date", dateKey)
        .or("task_type.eq.independent,is_detached.eq.true")
        .or("is_deleted.is.null,is_deleted.eq.false");

      for (const task of independentTasks || []) {
        // Check if there's a daily_task_instance for completion status
        const { data: taskInstance } = await supabase
          .from("daily_task_instances")
          .select("is_completed")
          .eq("completion_id", task.id)
          .maybeSingle();

        dailyTasks.push({
          id: task.id,
          commitmentId: task.is_detached ? task.commitment_id : null,
          title: task.title || "Untitled Task",
          timeStart: task.time_start,
          timeEnd: task.time_end,
          isCompleted: taskInstance?.is_completed ?? false,
          taskType: "independent",
          goalIsFocus: null,
          isDetached: task.is_detached ?? false,
        });
      }

      setTasks(dailyTasks);
    } catch (error: any) {
      console.error("Error fetching tasks:", error);
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [user, selectedDate, dateKey, weekStartsOn]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Fetch goals for create modal
  useEffect(() => {
    if (!user) return;
    const fetchGoals = async () => {
      const { data } = await supabase
        .from("goals")
        .select("id, title")
        .eq("user_id", user.id)
        .eq("goal_type", "ninety_day");
      setGoals(data || []);
    };
    fetchGoals();
  }, [user]);

  const handleTaskClick = (task: DailyTask) => {
    setSelectedTask(task);
    setModalOpen(true);
  };

  const handleToggleComplete = async (task: DailyTask) => {
    if (!user) return;
    
    try {
      if (task.taskType === "independent") {
        // For independent tasks, toggle daily_task_instances
        const { data: existingInstance } = await supabase
          .from("daily_task_instances")
          .select("id, is_completed")
          .eq("completion_id", task.id)
          .maybeSingle();

        if (existingInstance) {
          await supabase
            .from("daily_task_instances")
            .update({ is_completed: !existingInstance.is_completed })
            .eq("id", existingInstance.id);
        } else {
          // Create instance if it doesn't exist
          await supabase
            .from("daily_task_instances")
            .insert({
              user_id: user.id,
              completion_id: task.id,
              is_completed: true,
            });
        }
      } else {
        // For recurring tasks, toggle commitment_completions
        if (task.isCompleted) {
          // Remove the completion record
          await supabase
            .from("commitment_completions")
            .delete()
            .eq("commitment_id", task.commitmentId)
            .eq("completed_date", dateKey);
        } else {
          // Create a completion record
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
      
      // Refresh tasks
      fetchTasks();
    } catch (error) {
      console.error("Error toggling completion:", error);
      toast.error("Failed to update task");
    }
  };

  const goToPreviousDay = () => {
    const newDate = subDays(selectedDate, 1);
    setSelectedDate(newDate);
    navigate(`/daily?date=${format(newDate, "yyyy-MM-dd")}`, { replace: true });
  };

  const goToNextDay = () => {
    const newDate = addDays(selectedDate, 1);
    setSelectedDate(newDate);
    navigate(`/daily?date=${format(newDate, "yyyy-MM-dd")}`, { replace: true });
  };

  const goToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    navigate(`/daily?date=${format(today, "yyyy-MM-dd")}`, { replace: true });
  };

  const isToday = format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

  // Filter tasks based on focus toggle
  const filteredTasks = showFocusedOnly
    ? tasks.filter((t) => t.taskType === "independent" || t.goalIsFocus === true)
    : tasks;

  // Separate tasks with scheduled time from unscheduled
  const scheduledTasks = filteredTasks
    .filter((t) => t.timeStart)
    .sort((a, b) => (a.timeStart || "").localeCompare(b.timeStart || ""));
  
  const unscheduledTasks = filteredTasks.filter((t) => !t.timeStart);

  // Generate time slots for the timeline
  const timeSlots = [
    "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
    "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"
  ];

  // Group scheduled tasks by hour
  const getTasksForSlot = (slot: string) => {
    const slotHour = slot.split(":")[0];
    return scheduledTasks.filter((t) => {
      if (!t.timeStart) return false;
      const taskHour = t.timeStart.split(":")[0];
      return taskHour === slotHour;
    });
  };

  const getInstanceLabel = (task: DailyTask) => {
    if (task.totalInstances && task.totalInstances > 1) {
      return ` #${task.instanceNumber || 1}`;
    }
    return "";
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <p className="text-muted-foreground text-center">Loading...</p>
      </div>
    );
  }

  // Calculate daily progress
  const dailyCompleted = filteredTasks.filter(t => t.isCompleted).length;
  const dailyTotal = filteredTasks.length;

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
            <div className="border border-border">
              <div className="border-b border-border px-4 py-2 bg-muted/30">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Scheduled
                </span>
              </div>
              <div className="divide-y divide-border">
                {timeSlots.map((slot) => {
                  const slotTasks = getTasksForSlot(slot);
                  if (slotTasks.length === 0) return null;
                  
                  return (
                    <div key={slot} className="flex">
                      {/* Time column */}
                      <div className="w-20 flex-shrink-0 px-3 py-2 text-xs text-muted-foreground border-r border-border bg-muted/10">
                        {formatTime(slot, preferences.timeFormat)}
                      </div>
                      <div className="flex-1 py-1">
                        {slotTasks.map((task) => (
                          <div
                            key={task.id}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-calm"
                          >
                            <button
                              onClick={() => handleToggleComplete(task)}
                              className={`text-sm hover:scale-110 transition-transform ${task.isCompleted ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                              aria-label={task.isCompleted ? "Mark incomplete" : "Mark complete"}
                            >
                              {task.isCompleted ? "●" : "○"}
                            </button>
                            <button
                              onClick={() => handleTaskClick(task)}
                              className={`text-sm flex-1 text-left ${
                                task.isCompleted
                                  ? "text-muted-foreground line-through"
                                  : "text-foreground"
                              }`}
                            >
                              {task.title}
                              {getInstanceLabel(task)}
                            </button>
                            <span className="text-xs text-muted-foreground">
                              {formatTimeRange(task.timeStart, task.timeEnd, preferences.timeFormat)}
                            </span>
                            {task.taskType === "independent" && (
                              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                1x
                              </span>
                            )}
                          </div>
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
            <div className="border border-border">
              <div className="border-b border-border px-4 py-2 bg-muted/30">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  No Time Assigned
                </span>
              </div>
              <div className="divide-y divide-border">
                {unscheduledTasks.map((task) => (
                  <div
                    key={task.id}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-calm"
                  >
                    <button
                      onClick={() => handleToggleComplete(task)}
                      className={`text-base hover:scale-110 transition-transform ${task.isCompleted ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                      aria-label={task.isCompleted ? "Mark incomplete" : "Mark complete"}
                    >
                      {task.isCompleted ? "●" : "○"}
                    </button>
                    <button
                      onClick={() => handleTaskClick(task)}
                      className={`text-sm flex-1 text-left ${
                        task.isCompleted
                          ? "text-muted-foreground line-through"
                          : "text-foreground"
                      }`}
                    >
                      {task.title}
                      {getInstanceLabel(task)}
                    </button>
                    {task.taskType === "independent" && (
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        1x
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Back to weekly link */}
      <div className="mt-8 text-center">
        <button
          onClick={() => navigate("/weekly")}
          className="text-sm text-primary hover:underline"
        >
          ← Back to weekly view
        </button>
      </div>

      {/* Task create modal */}
      <TaskCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        defaultDate={selectedDate}
        goals={goals}
        onSuccess={fetchTasks}
        weekStart={startOfWeek(selectedDate, { weekStartsOn })}
      />

      {/* Task detail modal */}
      <TaskDetailModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        task={selectedTask}
        date={selectedDate}
        onUpdate={fetchTasks}
      />
    </div>
  );
};

export default Daily;
