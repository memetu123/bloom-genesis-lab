import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ChevronLeft, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays } from "date-fns";
import FocusFilter from "@/components/FocusFilter";
import NotionWeekCalendar from "@/components/weekly/NotionWeekCalendar";
import WeeklyTotals from "@/components/weekly/WeeklyTotals";

/**
 * Weekly Page - Notion-style weekly view with calendar grid
 * Tasks appear inside each day cell
 */

interface DayTask {
  id: string;
  commitmentId: string;
  title: string;
  isCompleted: boolean;
  timeStart: string | null;
  timeEnd: string | null;
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

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const [timesPerWeek, setTimesPerWeek] = useState("3");
  const [saving, setSaving] = useState(false);

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

      // Fetch completions for each day of the week with time data
      const tasksMap: Record<string, DayTask[]> = {};
      
      // Also fetch default times from commitments
      const { data: commitmentsWithTimes } = await supabase
        .from("weekly_commitments")
        .select("id, default_time_start, default_time_end")
        .eq("user_id", user.id);
      
      const defaultTimesMap: Record<string, { start: string | null; end: string | null }> = {};
      (commitmentsWithTimes || []).forEach((c: any) => {
        defaultTimesMap[c.id] = {
          start: c.default_time_start,
          end: c.default_time_end,
        };
      });
      
      for (let i = 0; i < 7; i++) {
        const date = addDays(weekStart, i);
        const dateKey = format(date, "yyyy-MM-dd");
        tasksMap[dateKey] = [];

        for (const commitment of enrichedCommitments) {
          const { data: completion } = await supabase
            .from("commitment_completions")
            .select("*, time_start, time_end")
            .eq("commitment_id", commitment.id)
            .eq("completed_date", dateKey)
            .maybeSingle();

          const defaults = defaultTimesMap[commitment.id] || { start: null, end: null };
          
          tasksMap[dateKey].push({
            id: `${commitment.id}-${dateKey}`,
            commitmentId: commitment.id,
            title: commitment.title,
            isCompleted: !!completion,
            timeStart: completion?.time_start || defaults.start,
            timeEnd: completion?.time_end || defaults.end,
          });
        }
      }

      setTasksByDate(tasksMap);
    } catch (error: any) {
      console.error("Error fetching commitments:", error);
      toast.error("Failed to load commitments");
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

  const handleAddCommitment = async () => {
    if (!user || !newTitle.trim()) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from("weekly_commitments")
        .insert({
          user_id: user.id,
          title: newTitle.trim(),
          goal_id: selectedGoalId || null,
          frequency_json: { times_per_week: parseInt(timesPerWeek) || 3 },
          commitment_type: "habit",
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      setNewTitle("");
      setSelectedGoalId("");
      setTimesPerWeek("3");
      setDialogOpen(false);
      toast.success("Commitment created");
      fetchCommitments();
    } catch (error: any) {
      console.error("Error adding commitment:", error);
      toast.error("Failed to add commitment");
    } finally {
      setSaving(false);
    }
  };

  const handleTaskClick = async (task: DayTask, date: Date) => {
    if (!user) return;
    const dateKey = format(date, "yyyy-MM-dd");

    try {
      // Find the commitment to get checkin info
      const commitment = commitments.find(c => c.id === task.commitmentId);
      
      if (task.isCompleted) {
        // Remove completion
        await supabase
          .from("commitment_completions")
          .delete()
          .eq("commitment_id", task.commitmentId)
          .eq("completed_date", dateKey);

        // Decrement actual_count
        if (commitment?.checkin) {
          await supabase
            .from("weekly_checkins")
            .update({ actual_count: Math.max(0, commitment.checkin.actual_count - 1) })
            .eq("id", commitment.checkin.id);
        }
      } else {
        // Add completion
        await supabase.from("commitment_completions").insert({
          user_id: user.id,
          commitment_id: task.commitmentId,
          completed_date: dateKey,
        });

        // Increment actual_count
        if (commitment?.checkin) {
          await supabase
            .from("weekly_checkins")
            .update({ actual_count: commitment.checkin.actual_count + 1 })
            .eq("id", commitment.checkin.id);
        }
      }

      // Refresh data
      fetchCommitments();
    } catch (error: any) {
      console.error("Error toggling task:", error);
      toast.error("Failed to update task");
    }
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
    filteredTasksByDate[dateKey] = tasks.filter(t => 
      focusedCommitmentIds.has(t.commitmentId)
    );
  });

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
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Weekly Commitment</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="title">What will you commit to?</Label>
                  <Input
                    id="title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g., Exercise, Read, Meditate"
                  />
                </div>
                <div>
                  <Label>Times per week</Label>
                  <Select value={timesPerWeek} onValueChange={setTimesPerWeek}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7].map(n => (
                        <SelectItem key={n} value={n.toString()}>
                          {n}x per week
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Link to goal (optional)</Label>
                  <Select value={selectedGoalId} onValueChange={setSelectedGoalId}>
                    <SelectTrigger>
                      <SelectValue placeholder="No goal linked" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No goal linked</SelectItem>
                      {goals.map(goal => (
                        <SelectItem key={goal.id} value={goal.id}>
                          {goal.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  onClick={handleAddCommitment} 
                  disabled={saving || !newTitle.trim()}
                  className="w-full"
                >
                  {saving ? "Saving..." : "Add Commitment"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
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

      {filteredCommitments.length === 0 ? (
        <div className="border border-border p-12 text-center">
          <p className="text-muted-foreground text-sm mb-4">
            {showFocusedOnly 
              ? "No commitments linked to focused goals" 
              : "No weekly commitments yet"}
          </p>
          {!showFocusedOnly && (
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              Add your first commitment
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

          {/* Weekly totals */}
          <WeeklyTotals
            commitments={filteredCommitments.map(c => ({
              id: c.id,
              title: c.title,
              planned: c.checkin?.planned_count || c.frequency_json.times_per_week,
              actual: c.checkin?.actual_count || 0,
            }))}
          />
        </>
      )}
    </div>
  );
};

export default Weekly;
