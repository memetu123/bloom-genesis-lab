import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addDays, subDays, parseISO, startOfWeek, endOfWeek } from "date-fns";
import FocusFilter from "@/components/FocusFilter";

/**
 * Daily Page - Notion-style daily view with time slots
 * Shows tasks in a timeline format
 */

interface DailyTask {
  id: string;
  commitmentId: string;
  title: string;
  scheduledTime: string | null;
  isCompleted: boolean;
  checkinId: string;
  goalIsFocus: boolean | null;
}

const Daily = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFocusedOnly, setShowFocusedOnly] = useState(false);

  // Get date from URL or use today
  const dateParam = searchParams.get("date");
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

  const formattedDate = format(selectedDate, "EEEE, MMM d");
  const dateKey = format(selectedDate, "yyyy-MM-dd");

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
      const weekStartStr = format(weekStart, "yyyy-MM-dd");
      const weekEndStr = format(weekEnd, "yyyy-MM-dd");

      // Fetch all active commitments
      const { data: commitments, error: commitError } = await supabase
        .from("weekly_commitments")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true);

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

        // Check completion for this specific date
        const { data: completion } = await supabase
          .from("commitment_completions")
          .select("*")
          .eq("commitment_id", commitment.id)
          .eq("completed_date", dateKey)
          .maybeSingle();

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

        dailyTasks.push({
          id: `${commitment.id}-${dateKey}`,
          commitmentId: commitment.id,
          title: commitment.title,
          scheduledTime: null, // Can be enhanced later with scheduled times
          isCompleted: !!completion,
          checkinId: checkinData?.id || "",
          goalIsFocus,
        });
      }

      setTasks(dailyTasks);
    } catch (error: any) {
      console.error("Error fetching tasks:", error);
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [user, selectedDate, dateKey]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const toggleTaskCompletion = async (task: DailyTask) => {
    if (!user) return;

    try {
      if (task.isCompleted) {
        // Remove completion
        await supabase
          .from("commitment_completions")
          .delete()
          .eq("commitment_id", task.commitmentId)
          .eq("completed_date", dateKey);

        // Decrement actual_count
        if (task.checkinId) {
          const { data: checkin } = await supabase
            .from("weekly_checkins")
            .select("actual_count")
            .eq("id", task.checkinId)
            .single();

          if (checkin) {
            await supabase
              .from("weekly_checkins")
              .update({ actual_count: Math.max(0, checkin.actual_count - 1) })
              .eq("id", task.checkinId);
          }
        }
      } else {
        // Add completion
        await supabase.from("commitment_completions").insert({
          user_id: user.id,
          commitment_id: task.commitmentId,
          completed_date: dateKey,
        });

        // Increment actual_count
        if (task.checkinId) {
          const { data: checkin } = await supabase
            .from("weekly_checkins")
            .select("actual_count")
            .eq("id", task.checkinId)
            .single();

          if (checkin) {
            await supabase
              .from("weekly_checkins")
              .update({ actual_count: checkin.actual_count + 1 })
              .eq("id", task.checkinId);
          }
        }
      }

      // Update local state
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, isCompleted: !t.isCompleted } : t
        )
      );
    } catch (error: any) {
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
    ? tasks.filter((t) => t.goalIsFocus === true)
    : tasks;

  // Group tasks by time (for now, all unscheduled)
  const timeSlots = ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <p className="text-muted-foreground text-center">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium text-foreground">Daily View</h1>
        <FocusFilter
          showFocusedOnly={showFocusedOnly}
          onToggle={() => setShowFocusedOnly(!showFocusedOnly)}
        />
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

      {/* Tasks list (Notion-style) */}
      {filteredTasks.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-sm">
            {showFocusedOnly
              ? "No focused tasks for this day"
              : "No tasks for this day"}
          </p>
        </div>
      ) : (
        <div className="border border-border">
          {/* All tasks section */}
          <div className="border-b border-border px-4 py-2 bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Tasks
            </span>
          </div>
          <div className="divide-y divide-border">
            {filteredTasks.map((task) => (
              <button
                key={task.id}
                onClick={() => toggleTaskCompletion(task)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-calm"
              >
                <span className="text-base">
                  {task.isCompleted ? "●" : "○"}
                </span>
                <span
                  className={`text-sm ${
                    task.isCompleted
                      ? "text-muted-foreground line-through"
                      : "text-foreground"
                  }`}
                >
                  {task.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Back to weekly link */}
      <div className="mt-8 text-center">
        <button
          onClick={() => navigate("/weekly")}
          className="text-sm text-primary hover:underline"
        >
          ← Back to Weekly View
        </button>
      </div>
    </div>
  );
};

export default Daily;
