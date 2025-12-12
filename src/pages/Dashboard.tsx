import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Star, ChevronRight, Target, Calendar, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { format, startOfWeek, endOfWeek } from "date-fns";

/**
 * Dashboard Page - Overview of focused items and weekly progress
 * Consumes visions/goals/pillars from global AppDataProvider
 */

interface WeeklySummary {
  total_commitments: number;
  completed_commitments: number;
  total_reps: number;
  completed_reps: number;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { visions, goals, pillarsMap, loading: appDataLoading } = useAppData();
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Memoize to prevent infinite re-renders
  const currentWeekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const currentWeekEnd = useMemo(() => endOfWeek(currentWeekStart, { weekStartsOn: 1 }), [currentWeekStart]);
  const weekStartFormatted = format(currentWeekStart, "MMM d");
  const weekEndFormatted = format(currentWeekEnd, "MMM d");

  // Build focused visions with focused goals from cached data
  const focusedVisions = useMemo(() => {
    const focused = visions.filter(v => v.is_focus && v.status === "active");
    return focused.map(vision => ({
      id: vision.id,
      title: vision.title,
      pillar_name: pillarsMap.get(vision.pillar_id)?.name || "",
      focused_goals: goals
        .filter(g => g.life_vision_id === vision.id && g.is_focus)
        .map(g => ({ id: g.id, title: g.title, goal_type: g.goal_type }))
    }));
  }, [visions, goals, pillarsMap]);

  // Fetch only weekly summary (page-specific data)
  const fetchWeeklySummary = useCallback(async () => {
    if (!user) {
      setSummaryLoading(false);
      return;
    }

    try {
      const startDate = format(currentWeekStart, "yyyy-MM-dd");
      
      const [commitmentsResult, checkinsResult] = await Promise.all([
        supabase
          .from("weekly_commitments")
          .select("id, frequency_json")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .or("is_deleted.is.null,is_deleted.eq.false"),
        supabase
          .from("weekly_checkins")
          .select("planned_count, actual_count")
          .eq("user_id", user.id)
          .eq("period_start_date", startDate),
      ]);

      const commitments = commitmentsResult.data || [];
      const checkins = checkinsResult.data || [];

      const totalCommitments = commitments.length;
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
        total_commitments: totalCommitments,
        completed_commitments: completedCommitments,
        total_reps: totalReps,
        completed_reps: completedReps
      });
    } catch (error) {
      console.error("Error fetching weekly summary:", error);
    } finally {
      setSummaryLoading(false);
    }
  }, [user, currentWeekStart]);

  useEffect(() => {
    fetchWeeklySummary();
  }, [fetchWeeklySummary]);

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
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Welcome section */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Your focus areas and weekly progress at a glance.
        </p>
      </div>

      {/* Weekly Summary Card */}
      <Card className="mb-8 cursor-pointer hover:border-primary/50 transition-calm" onClick={() => navigate("/weekly")}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-foreground">This Week</h2>
            </div>
            <span className="text-sm text-muted-foreground">
              {weekStartFormatted} – {weekEndFormatted}
            </span>
          </div>

          {weeklySummary && weeklySummary.total_commitments > 0 ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">
                  {weeklySummary.completed_commitments} of {weeklySummary.total_commitments} habits complete
                </span>
                <span className="text-lg font-semibold text-primary">{weeklyProgress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${weeklyProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {weeklySummary.completed_reps}/{weeklySummary.total_reps} total reps
                </span>
                <Button variant="ghost" size="sm" className="text-primary">
                  View details
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground text-sm mb-2">No active commitments this week</p>
              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate("/onboarding"); }}>
                Set up your plan
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Focused Visions Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Star className="h-5 w-5 text-primary fill-primary" />
            Focused Visions
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/visions")}
          >
            Manage
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        {focusedVisions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center">
              <Star className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">No focused visions</p>
              <Button 
                variant="link" 
                size="sm"
                onClick={() => navigate("/visions")}
              >
                Set your focus
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {focusedVisions.map((vision) => (
              <Card 
                key={vision.id} 
                className="border-primary/20 bg-primary/5 cursor-pointer hover:border-primary/40 transition-calm"
                onClick={() => navigate(`/vision/${vision.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <span className="text-xs text-primary font-medium">{vision.pillar_name}</span>
                      <h3 className="font-medium text-foreground">{vision.title}</h3>
                      {vision.focused_goals.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {vision.focused_goals.map((goal) => (
                            <button
                              key={goal.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/goal/${goal.id}`);
                              }}
                              className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full hover:bg-primary/20 transition-calm"
                            >
                              {goal.goal_type === "three_year" ? "3Y" : goal.goal_type === "one_year" ? "1Y" : "90D"}: {goal.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-3">
        <Card 
          className="cursor-pointer hover:border-primary/50 transition-calm"
          onClick={() => navigate("/goals")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <Target className="h-8 w-8 text-primary" />
            <div>
              <h3 className="font-medium text-foreground">All Goals</h3>
              <p className="text-xs text-muted-foreground">View by level</p>
            </div>
          </CardContent>
        </Card>
        <Card 
          className="cursor-pointer hover:border-primary/50 transition-calm"
          onClick={() => navigate("/weekly")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <Check className="h-8 w-8 text-primary" />
            <div>
              <h3 className="font-medium text-foreground">Weekly</h3>
              <p className="text-xs text-muted-foreground">Track habits</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;