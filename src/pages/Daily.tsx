import { useEffect, useState, useCallback, useMemo } from "react";
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
 * 
 * OPTIMIZATION: All data is fetched in a single batch, then processed in-memory
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

  // Day name mapping for checking which days to show
  const dayIndexToName: Record<number, string> = useMemo(() => ({
    0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat"
  }), []);

  /**
   * OPTIMIZED: Single batch fetch for all daily data
   * - Fetches all data in parallel
   * - Processes everything in memory
   * - No N+1 queries
   */
  const fetchDailyData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const weekStart = startOfWeek(selectedDate, { weekStartsOn });
      const weekEnd = endOfWeek(selectedDate, { weekStartsOn });
      const weekStartStr = format(weekStart, "yyyy-MM-dd");
      const weekEndStr = format(weekEnd, "yyyy-MM-dd");

      // BATCH FETCH: All data in parallel (single request each)
      const [
        commitmentsResult,
        checkinsResult,
        completionsResult,
        independentTasksResult,
        taskInstancesResult,
        goalsResult
      ] = await Promise.all([
        // 1. All active weekly commitments
        supabase
          .from("weekly_commitments")
          .select("*")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .or("is_deleted.is.null,is_deleted.eq.false"),
        
        // 2. Weekly checkins for this week
        supabase
          .from("weekly_checkins")
          .select("*")
          .eq("user_id", user.id)
          .eq("period_start_date", weekStartStr),
        
        // 3. Completions for this specific date
        supabase
          .from("commitment_completions")
          .select("*")
          .eq("user_id", user.id)
          .eq("completed_date", dateKey)
          .or("is_deleted.is.null,is_deleted.eq.false"),
        
        // 4. Independent tasks for this date
        supabase
          .from("commitment_completions")
          .select("*")
          .eq("user_id", user.id)
          .eq("completed_date", dateKey)
          .or("task_type.eq.independent,is_detached.eq.true")
          .or("is_deleted.is.null,is_deleted.eq.false"),
        
        // 5. All daily task instances for the user
        supabase
          .from("daily_task_instances")
          .select("*")
          .eq("user_id", user.id),
        
        // 6. All goals (for focus status and dropdown)
        supabase
          .from("goals")
          .select("id, title, is_focus, goal_type")
          .eq("user_id", user.id)
          .or("is_deleted.is.null,is_deleted.eq.false")
      ]);

      if (commitmentsResult.error) throw commitmentsResult.error;

      const rawCommitments = commitmentsResult.data || [];
      const existingCheckins = checkinsResult.data || [];
      const allCompletions = completionsResult.data || [];
      const independentTasks = independentTasksResult.data || [];
      const taskInstances = taskInstancesResult.data || [];
      const allGoals = goalsResult.data || [];

      // Build lookup maps for O(1) access
      const checkinByCommitmentId = new Map(
        existingCheckins.map(c => [c.weekly_commitment_id, c])
      );
      const goalFocusMap = new Map(
        allGoals.map(g => [g.id, g.is_focus])
      );
      const taskInstanceMap = new Map(
        taskInstances.map(ti => [ti.completion_id, ti])
      );
      const completionByCommitmentId = new Map(
        allCompletions.filter(c => c.commitment_id).map(c => [c.commitment_id, c])
      );

      // Create missing checkins in batch
      const checkinsToCreate: any[] = [];
      for (const commitment of rawCommitments) {
        if (!checkinByCommitmentId.has(commitment.id)) {
          const frequency = commitment.frequency_json as { times_per_week: number };
          checkinsToCreate.push({
            user_id: user.id,
            weekly_commitment_id: commitment.id,
            period_start_date: weekStartStr,
            period_end_date: weekEndStr,
            planned_count: frequency.times_per_week || 1,
            actual_count: 0
          });
        }
      }

      // Batch insert new checkins if any
      if (checkinsToCreate.length > 0) {
        await supabase
          .from("weekly_checkins")
          .insert(checkinsToCreate);
      }

      // Build daily tasks (all in memory)
      const dailyTasks: DailyTask[] = [];
      const dayOfWeek = selectedDate.getDay();
      const dayName = dayIndexToName[dayOfWeek];

      for (const commitment of rawCommitments) {
        const recurrenceType = commitment.recurrence_type || 'weekly';
        const daysOfWeek = commitment.repeat_days_of_week || [];
        
        // Check if task should appear on this day
        let shouldShow = false;
        if (recurrenceType === 'daily') {
          shouldShow = true;
        } else if (recurrenceType === 'weekly') {
          if (daysOfWeek.length === 0) {
            shouldShow = dayOfWeek >= 1 && dayOfWeek <= 5;
          } else {
            shouldShow = daysOfWeek.includes(dayName);
          }
        }

        if (!shouldShow) continue;

        const completion = completionByCommitmentId.get(commitment.id);

        // Skip if this instance is detached
        if (completion?.is_detached) {
          continue;
        }

        const goalIsFocus = commitment.goal_id ? goalFocusMap.get(commitment.goal_id) ?? null : null;
        const timeStart = completion?.time_start || commitment.default_time_start || null;
        const timeEnd = completion?.time_end || commitment.default_time_end || null;
        const timesPerDay = commitment.times_per_day || 1;

        dailyTasks.push({
          id: `${commitment.id}-${dateKey}`,
          commitmentId: commitment.id,
          title: commitment.title,
          timeStart,
          timeEnd,
          isCompleted: !!completion,
          taskType: "recurring",
          instanceNumber: completion?.instance_number || 1,
          totalInstances: timesPerDay,
          goalIsFocus,
        });
      }

      // Add independent/detached tasks
      for (const task of independentTasks) {
        const taskInstance = taskInstanceMap.get(task.id);

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
      
      // Set goals for dropdown (all goals, filter ninety_day for UI)
      const ninety_day_goals = allGoals.filter(g => g.goal_type === "ninety_day");
      setGoals(ninety_day_goals.map(g => ({ id: g.id, title: g.title })));

    } catch (error: any) {
      console.error("Error fetching daily data:", error);
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [user, selectedDate, dateKey, weekStartsOn, dayIndexToName]);

  // Single useEffect with stable dependencies
  useEffect(() => {
    if (user) {
      fetchDailyData();
    }
  }, [user, dateKey, fetchDailyData]);

  const handleTaskClick = (task: DailyTask) => {
    setSelectedTask(task);
    setModalOpen(true);
  };

  const handleToggleComplete = async (task: DailyTask) => {
    if (!user) return;
    const newCompleted = !task.isCompleted;
    
    // Optimistic update - immediately update UI
    setTasks(prev => prev.map(t => 
      t.id === task.id ? { ...t, isCompleted: newCompleted } : t
    ));
    
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
      // Rollback optimistic update on error
      setTasks(prev => prev.map(t => 
        t.id === task.id ? { ...t, isCompleted: !newCompleted } : t
      ));
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
                            {task.timeEnd && (
                              <span className="text-xs text-muted-foreground">
                                {formatTimeRange(task.timeStart!, task.timeEnd, preferences.timeFormat)}
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
                    className="flex items-center gap-2 px-4 py-3 hover:bg-muted/30 transition-calm"
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
                    {task.taskType === "independent" && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        one-time
                      </span>
                    )}
                    {task.isDetached && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        detached
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Back to weekly view link */}
      <div className="mt-8 pt-4 border-t border-border">
        <button
          onClick={() => navigate("/weekly")}
          className="text-sm text-muted-foreground hover:text-foreground transition-calm flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to weekly view
        </button>
      </div>

      {/* Task Create Modal */}
      <TaskCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        defaultDate={selectedDate}
        goals={goals}
        onSuccess={() => fetchDailyData()}
      />

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          task={{
            id: selectedTask.id,
            commitmentId: selectedTask.commitmentId,
            title: selectedTask.title,
            timeStart: selectedTask.timeStart,
            timeEnd: selectedTask.timeEnd,
            isCompleted: selectedTask.isCompleted,
            taskType: selectedTask.taskType,
            instanceNumber: selectedTask.instanceNumber,
            isDetached: selectedTask.isDetached,
          }}
          date={selectedDate}
          onUpdate={() => fetchDailyData()}
        />
      )}
    </div>
  );
};

export default Daily;
