import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ChevronLeft, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays } from "date-fns";
import FocusFilter from "@/components/FocusFilter";
import NotionWeekCalendar from "@/components/weekly/NotionWeekCalendar";
import WeeklyTotals from "@/components/weekly/WeeklyTotals";
import TaskDetailModal from "@/components/TaskDetailModal";
import TaskCreateModal from "@/components/TaskCreateModal";
import type { TaskType } from "@/types/scheduling";

/**
 * Weekly Page - Notion-style weekly view with calendar grid
 * Tasks appear inside each day cell (both recurring and independent)
 */

interface DayTask {
  id: string;
  commitmentId: string | null;
  title: string;
  isCompleted: boolean;
  timeStart: string | null;
  timeEnd: string | null;
  taskType: TaskType;
  instanceNumber?: number;
  totalInstances?: number;
  isDetached?: boolean;
}

interface CommitmentData {
  id: string;
  title: string;
  frequency_json: { times_per_week: number };
  goal_id: string | null;
  checkin: {
    id: string;
    planned_count: number;
    actual_count: number;
  } | null;
  goal_is_focus: boolean | null;
}

interface GoalOption {
  id: string;
  title: string;
}

const getWeekStart = (date: Date): Date => {
  return startOfWeek(date, { weekStartsOn: 1 });
};

const getWeekEnd = (date: Date): Date => {
  return endOfWeek(date, { weekStartsOn: 1 });
};

const Weekly = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [commitments, setCommitments] = useState<CommitmentData[]>([]);
  const [tasksByDate, setTasksByDate] = useState<Record<string, DayTask[]>>({});
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showFocusedOnly, setShowFocusedOnly] = useState(false);
  const [goals, setGoals] = useState<GoalOption[]>([]);

  // Task create modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Task detail modal state
  const [selectedTask, setSelectedTask] = useState<DayTask | null>(null);
  const [selectedTaskDate, setSelectedTaskDate] = useState<Date>(new Date());
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  const weekStartFormatted = format(currentWeekStart, "MMM d");
  const weekEndFormatted = format(getWeekEnd(currentWeekStart), "MMM d, yyyy");
  const isCurrentWeek = format(currentWeekStart, "yyyy-MM-dd") === format(getWeekStart(new Date()), "yyyy-MM-dd");

  const ensureCheckin = useCallback(async (
    commitmentId: string, 
    plannedCount: number, 
    weekStart: Date, 
    weekEnd: Date
  ) => {
    if (!user) return null;

    const startDate = format(weekStart, "yyyy-MM-dd");
    const endDate = format(weekEnd, "yyyy-MM-dd");

    const { data: existing } = await supabase
      .from("weekly_checkins")
      .select("*")
      .eq("weekly_commitment_id", commitmentId)
      .eq("period_start_date", startDate)
      .maybeSingle();

    if (existing) return existing;

    const { data: newCheckin, error } = await supabase
      .from("weekly_checkins")
      .insert({
        user_id: user.id,
        weekly_commitment_id: commitmentId,
        period_start_date: startDate,
        period_end_date: endDate,
        planned_count: plannedCount,
        actual_count: 0
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating checkin:", error);
      return null;
    }

    return newCheckin;
  }, [user]);

  const fetchCommitments = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const weekStart = currentWeekStart;
      const weekEnd = getWeekEnd(weekStart);
      const weekStartStr = format(weekStart, "yyyy-MM-dd");
      const weekEndStr = format(weekEnd, "yyyy-MM-dd");

      // Fetch all active recurring commitments
      const { data: rawCommitments, error: commitError } = await supabase
        .from("weekly_commitments")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (commitError) throw commitError;

      const enrichedCommitments: CommitmentData[] = await Promise.all(
        (rawCommitments || []).map(async (commitment) => {
          const frequency = commitment.frequency_json as { times_per_week: number };
          
          const checkin = await ensureCheckin(
            commitment.id, 
            frequency.times_per_week, 
            weekStart, 
            weekEnd
          );
          
          let goal_is_focus: boolean | null = null;

          if (commitment.goal_id) {
            const { data: goal } = await supabase
              .from("goals")
              .select("is_focus")
              .eq("id", commitment.goal_id)
              .maybeSingle();

            goal_is_focus = goal?.is_focus ?? null;
          }

          return {
            id: commitment.id,
            title: commitment.title,
            frequency_json: frequency,
            goal_id: commitment.goal_id,
            checkin: checkin ? {
              id: checkin.id,
              planned_count: checkin.planned_count,
              actual_count: checkin.actual_count
            } : null,
            goal_is_focus,
          };
        })
      );

      setCommitments(enrichedCommitments);

      // Build default times map
      const { data: commitmentsWithTimes } = await supabase
        .from("weekly_commitments")
        .select("id, default_time_start, default_time_end, repeat_frequency, repeat_times_per_period")
        .eq("user_id", user.id);
      
      const defaultTimesMap: Record<string, { start: string | null; end: string | null; timesPerPeriod: number }> = {};
      (commitmentsWithTimes || []).forEach((c: any) => {
        defaultTimesMap[c.id] = {
          start: c.default_time_start,
          end: c.default_time_end,
          timesPerPeriod: c.repeat_times_per_period || 1,
        };
      });

      // Build tasks for each day
      const tasksMap: Record<string, DayTask[]> = {};
      
      for (let i = 0; i < 7; i++) {
        const date = addDays(weekStart, i);
        const dateKey = format(date, "yyyy-MM-dd");
        tasksMap[dateKey] = [];

        // Add recurring tasks
        for (const commitment of enrichedCommitments) {
          const { data: completion } = await supabase
            .from("commitment_completions")
            .select("*, time_start, time_end, instance_number, is_detached")
            .eq("commitment_id", commitment.id)
            .eq("completed_date", dateKey)
            .maybeSingle();

          // Skip if this instance is detached (it will be fetched separately)
          if (completion?.is_detached) {
            continue;
          }

          const defaults = defaultTimesMap[commitment.id] || { start: null, end: null, timesPerPeriod: 1 };
          
          tasksMap[dateKey].push({
            id: `${commitment.id}-${dateKey}`,
            commitmentId: commitment.id,
            title: commitment.title,
            isCompleted: !!completion,
            timeStart: completion?.time_start || defaults.start,
            timeEnd: completion?.time_end || defaults.end,
            taskType: "recurring",
            instanceNumber: completion?.instance_number || 1,
            totalInstances: defaults.timesPerPeriod,
          });
        }

        // Fetch independent tasks for this date (including detached instances)
        const { data: independentTasks } = await supabase
          .from("commitment_completions")
          .select("*, is_detached")
          .eq("user_id", user.id)
          .eq("completed_date", dateKey)
          .or("task_type.eq.independent,is_detached.eq.true");

        for (const task of independentTasks || []) {
          // Check if there's a daily_task_instance for completion status
          const { data: taskInstance } = await supabase
            .from("daily_task_instances")
            .select("is_completed")
            .eq("completion_id", task.id)
            .maybeSingle();

          tasksMap[dateKey].push({
            id: task.id,
            commitmentId: task.is_detached ? task.commitment_id : null,
            title: task.title || "Untitled Task",
            isCompleted: taskInstance?.is_completed ?? false,
            timeStart: task.time_start,
            timeEnd: task.time_end,
            taskType: "independent",
            isDetached: task.is_detached ?? false,
          });
        }
      }

      setTasksByDate(tasksMap);
    } catch (error: any) {
      console.error("Error fetching commitments:", error);
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [user, currentWeekStart, ensureCheckin]);

  useEffect(() => {
    fetchCommitments();
  }, [fetchCommitments]);

  // Fetch goals for dropdown
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

  const handleTaskClick = (task: DayTask, date: Date) => {
    setSelectedTask(task);
    setSelectedTaskDate(date);
    setTaskModalOpen(true);
  };

  const goToPreviousWeek = () => setCurrentWeekStart(prev => subWeeks(prev, 1));
  const goToNextWeek = () => setCurrentWeekStart(prev => addWeeks(prev, 1));
  const goToCurrentWeek = () => setCurrentWeekStart(getWeekStart(new Date()));

  // Filter commitments based on focus toggle
  const filteredCommitments = showFocusedOnly
    ? commitments.filter(c => c.goal_is_focus === true)
    : commitments;

  // Filter tasks by date based on focused commitments
  const filteredTasksByDate: Record<string, DayTask[]> = {};
  const focusedCommitmentIds = new Set(filteredCommitments.map(c => c.id));
  
  Object.entries(tasksByDate).forEach(([dateKey, tasks]) => {
    // Include recurring tasks from focused commitments AND all independent tasks
    filteredTasksByDate[dateKey] = tasks.filter(t => 
      t.taskType === "independent" || focusedCommitmentIds.has(t.commitmentId || "")
    );
  });

  const hasAnyTasks = Object.values(filteredTasksByDate).some(tasks => tasks.length > 0);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <p className="text-muted-foreground text-center">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium text-foreground">Weekly</h1>
        <div className="flex items-center gap-2">
          <FocusFilter
            showFocusedOnly={showFocusedOnly}
            onToggle={() => setShowFocusedOnly(!showFocusedOnly)}
          />
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8"
            onClick={() => setCreateModalOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between mb-6 border-b border-border pb-4">
        <button 
          onClick={goToPreviousWeek}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-calm"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>
        <div className="text-center">
          <h2 className="text-base font-medium text-foreground">
            {weekStartFormatted} – {weekEndFormatted}
          </h2>
          {!isCurrentWeek && (
            <button 
              onClick={goToCurrentWeek}
              className="text-xs text-primary hover:underline mt-1"
            >
              Go to current week
            </button>
          )}
        </div>
        <button 
          onClick={goToNextWeek}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-calm"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {!hasAnyTasks && filteredCommitments.length === 0 ? (
        <div className="border border-border p-12 text-center">
          <p className="text-muted-foreground text-sm mb-4">
            {showFocusedOnly 
              ? "No tasks linked to focused goals" 
              : "No tasks yet"}
          </p>
          {!showFocusedOnly && (
            <Button variant="outline" size="sm" onClick={() => setCreateModalOpen(true)}>
              Add your first task
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Notion-style calendar */}
          <NotionWeekCalendar
            weekStart={currentWeekStart}
            tasksByDate={filteredTasksByDate}
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            onTaskClick={handleTaskClick}
          />

          {/* Weekly totals (only for recurring) */}
          {filteredCommitments.length > 0 && (
            <WeeklyTotals
              commitments={filteredCommitments.map(c => ({
                id: c.id,
                title: c.title,
                planned: c.checkin?.planned_count || c.frequency_json.times_per_week,
                actual: c.checkin?.actual_count || 0,
              }))}
            />
          )}
        </>
      )}

      {/* Task create modal */}
      <TaskCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        defaultDate={selectedDate}
        defaultTaskType="recurring"
        goals={goals}
        onSuccess={fetchCommitments}
        weekStart={currentWeekStart}
      />

      {/* Task detail modal */}
      <TaskDetailModal
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        task={selectedTask}
        date={selectedTaskDate}
        onUpdate={fetchCommitments}
      />
    </div>
  );
};

export default Weekly;
