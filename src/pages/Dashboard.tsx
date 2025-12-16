import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Star, ChevronRight, Calendar, Play, CalendarPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { format, startOfWeek, endOfWeek } from "date-fns";

/**
 * Dashboard Page - Execution Launchpad
 * Guides the user to their next concrete action
 */

interface WeeklySummary {
  total_commitments: number;
  completed_commitments: number;
  total_reps: number;
  completed_reps: number;
}

interface NextTask {
  id: string;
  title: string;
  duration: string | null;
  visionContext: string | null;
  pillarName: string | null;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { visions, goals, pillarsMap, loading: appDataLoading } = useAppData();
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [nextTask, setNextTask] = useState<NextTask | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Memoize week boundaries
  const currentWeekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const currentWeekEnd = useMemo(() => endOfWeek(currentWeekStart, { weekStartsOn: 1 }), [currentWeekStart]);
  const weekStartFormatted = format(currentWeekStart, "MMM d");
  const weekEndFormatted = format(currentWeekEnd, "MMM d");
  const today = useMemo(() => new Date(), []);
  const todayKey = format(today, "yyyy-MM-dd");
  const dayOfWeek = today.getDay();
  const dayName = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dayOfWeek];

  // Build focused visions with focused goal count
  const focusedVisions = useMemo(() => {
    const focused = visions.filter(v => v.is_focus && v.status === "active");
    return focused.map(vision => {
      const focusedGoalsCount = goals.filter(
        g => g.life_vision_id === vision.id && g.is_focus
      ).length;
      return {
        id: vision.id,
        title: vision.title,
        pillar_name: pillarsMap.get(vision.pillar_id)?.name || "",
        focused_goals_count: focusedGoalsCount,
      };
    });
  }, [visions, goals, pillarsMap]);

  // Fetch weekly summary and next task
  const fetchDashboardData = useCallback(async () => {
    if (!user) {
      setSummaryLoading(false);
      return;
    }

    try {
      const startDate = format(currentWeekStart, "yyyy-MM-dd");
      
      const [commitmentsResult, checkinsResult, completionsResult] = await Promise.all([
        supabase
          .from("weekly_commitments")
          .select("id, title, goal_id, frequency_json, recurrence_type, repeat_days_of_week, default_time_start, default_time_end")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .or("is_deleted.is.null,is_deleted.eq.false"),
        supabase
          .from("weekly_checkins")
          .select("planned_count, actual_count")
          .eq("user_id", user.id)
          .eq("period_start_date", startDate),
        supabase
          .from("commitment_completions")
          .select("commitment_id")
          .eq("user_id", user.id)
          .eq("completed_date", todayKey)
          .or("is_deleted.is.null,is_deleted.eq.false"),
      ]);

      const commitments = commitmentsResult.data || [];
      const checkins = checkinsResult.data || [];
      const todayCompletions = completionsResult.data || [];
      const completedIds = new Set(todayCompletions.map(c => c.commitment_id));

      // Weekly summary
      let completedCommitments = 0;
      let totalReps = 0;
      let completedReps = 0;

      checkins.forEach(c => {
        totalReps += c.planned_count;
        completedReps += c.actual_count;
        if (c.actual_count >= c.planned_count) {
          completedCommitments++;
        }
      });

      setWeeklySummary({
        total_commitments: commitments.length,
        completed_commitments: completedCommitments,
        total_reps: totalReps,
        completed_reps: completedReps
      });

      // Find next task for today (first incomplete task scheduled for today)
      let foundNextTask: NextTask | null = null;
      
      for (const commitment of commitments) {
        if (completedIds.has(commitment.id)) continue;

        const recurrenceType = commitment.recurrence_type || 'weekly';
        const daysOfWeek: string[] = commitment.repeat_days_of_week || [];
        
        // Check if should appear today
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

        // Calculate duration
        let duration: string | null = null;
        if (commitment.default_time_start && commitment.default_time_end) {
          const [startH, startM] = commitment.default_time_start.split(":").map(Number);
          const [endH, endM] = commitment.default_time_end.split(":").map(Number);
          const durationMin = (endH * 60 + endM) - (startH * 60 + startM);
          if (durationMin > 0) {
            duration = durationMin >= 60 
              ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}min`
              : `${durationMin} min`;
          }
        }

        // Get vision context
        let visionContext: string | null = null;
        let pillarName: string | null = null;
        
        if (commitment.goal_id) {
          const goal = goals.find(g => g.id === commitment.goal_id);
          if (goal?.life_vision_id) {
            const vision = visions.find(v => v.id === goal.life_vision_id);
            if (vision) {
              visionContext = vision.title;
              pillarName = pillarsMap.get(vision.pillar_id)?.name || null;
            }
          }
        }

        foundNextTask = {
          id: commitment.id,
          title: commitment.title,
          duration,
          visionContext,
          pillarName,
        };
        break;
      }

      setNextTask(foundNextTask);

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setSummaryLoading(false);
    }
  }, [user, currentWeekStart, todayKey, dayOfWeek, dayName, goals, visions, pillarsMap]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const loading = appDataLoading || summaryLoading;

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <p className="text-muted-foreground text-center">Loading...</p>
      </div>
    );
  }

  const weeklyProgress = weeklySummary && weeklySummary.total_reps > 0 
    ? Math.round((weeklySummary.completed_reps / weeklySummary.total_reps) * 100)
    : 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl animate-fade-in">
      {/* ========== THIS WEEK - Primary Section ========== */}
      <Card className="mb-6 border-primary/30 shadow-soft">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold text-foreground">This Week</h1>
            </div>
            <span className="text-sm text-muted-foreground">
              {weekStartFormatted} – {weekEndFormatted}
            </span>
          </div>

          {weeklySummary && weeklySummary.total_commitments > 0 ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  {weeklySummary.completed_commitments} of {weeklySummary.total_commitments} habits complete
                </span>
                <span className="text-lg font-semibold text-primary">{weeklyProgress}%</span>
              </div>
              <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-primary transition-all duration-500 rounded-full"
                  style={{ width: `${weeklyProgress}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground mb-5">
                {weeklySummary.completed_reps} of {weeklySummary.total_reps} total reps completed
              </p>
              <Button 
                size="lg" 
                className="w-full" 
                onClick={() => navigate("/daily")}
              >
                <Play className="h-4 w-4 mr-2" />
                Start now
              </Button>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground text-sm mb-4">No active commitments this week</p>
              <Button onClick={() => navigate("/onboarding")}>
                Set up your plan
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========== NEXT UP TODAY ========== */}
      <div className="mb-6">
        <h2 className="text-base font-semibold text-foreground mb-3">Next up today</h2>
        
        {nextTask ? (
          <Card 
            className="cursor-pointer hover:border-primary/40 transition-calm border-l-4 border-l-primary"
            onClick={() => navigate("/daily")}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground truncate">
                    {nextTask.title}
                    {nextTask.duration && (
                      <span className="text-muted-foreground font-normal ml-2">
                        – {nextTask.duration}
                      </span>
                    )}
                  </h3>
                  {nextTask.visionContext && (
                    <p className="text-sm text-muted-foreground mt-1">
                      From: {nextTask.visionContext}
                      {nextTask.pillarName && ` · ${nextTask.pillarName}`}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2" />
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground mb-4">You're clear for now</p>
              <Button 
                variant="outline"
                onClick={() => navigate("/daily")}
              >
                <CalendarPlus className="h-4 w-4 mr-2" />
                Plan today
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ========== FOCUSED VISIONS - Strategic Context ========== */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Star className="h-4 w-4 text-primary fill-primary" />
            Focused Visions
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/visions")}
            className="text-muted-foreground hover:text-foreground"
          >
            Change focus
          </Button>
        </div>

        {focusedVisions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center">
              <Star className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm mb-3">No focused visions</p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate("/visions")}
              >
                Set your focus
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {focusedVisions.map((vision) => (
              <Card 
                key={vision.id} 
                className="cursor-pointer hover:border-primary/40 transition-calm"
                onClick={() => navigate(`/vision/${vision.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-primary font-medium">
                        {vision.pillar_name}
                      </span>
                      <h3 className="font-medium text-foreground truncate">
                        {vision.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {vision.focused_goals_count > 0 
                          ? `${vision.focused_goals_count} goal${vision.focused_goals_count !== 1 ? 's' : ''} in focus`
                          : 'Add a goal when it feels right'}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
