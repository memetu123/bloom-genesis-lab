import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Check, LogOut, Target, ChevronRight, ChevronLeft, Minus, Plus, History } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";

/**
 * Dashboard Page - Weekly commitments checklist
 * Shows this week's habits with their goal lineage
 * Uses weekly_checkins to track per-week progress
 */

interface CommitmentWithCheckin {
  id: string;
  title: string;
  frequency_json: { times_per_week: number };
  checkin: {
    id: string;
    planned_count: number;
    actual_count: number;
  } | null;
  lineage: {
    ninety_day: string | null;
    one_year: string | null;
    three_year: string | null;
    vision: string | null;
    pillar: string | null;
  };
}

interface WeeklyHistory {
  period_start_date: string;
  planned_count: number;
  actual_count: number;
}

// Get Monday of the week for a given date (Europe/Istanbul timezone)
const getWeekStart = (date: Date): Date => {
  return startOfWeek(date, { weekStartsOn: 1 }); // Monday
};

// Get Sunday of the week for a given date
const getWeekEnd = (date: Date): Date => {
  return endOfWeek(date, { weekStartsOn: 1 }); // Sunday
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [commitments, setCommitments] = useState<CommitmentWithCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [historyData, setHistoryData] = useState<Record<string, WeeklyHistory[]>>({});

  // Format dates for display
  const weekStartFormatted = format(currentWeekStart, "MMM d");
  const weekEndFormatted = format(getWeekEnd(currentWeekStart), "MMM d, yyyy");
  const isCurrentWeek = format(currentWeekStart, "yyyy-MM-dd") === format(getWeekStart(new Date()), "yyyy-MM-dd");

  // Fetch or create weekly checkin for a commitment
  const ensureCheckin = useCallback(async (
    commitmentId: string, 
    plannedCount: number, 
    weekStart: Date, 
    weekEnd: Date
  ) => {
    if (!user) return null;

    const startDate = format(weekStart, "yyyy-MM-dd");
    const endDate = format(weekEnd, "yyyy-MM-dd");

    // Check if checkin exists
    const { data: existing } = await supabase
      .from("weekly_checkins")
      .select("*")
      .eq("weekly_commitment_id", commitmentId)
      .eq("period_start_date", startDate)
      .maybeSingle();

    if (existing) {
      return existing;
    }

    // Create new checkin
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

  // Fetch commitments with their goal lineage and checkins
  const fetchCommitments = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const weekStart = currentWeekStart;
      const weekEnd = getWeekEnd(weekStart);

      // Get weekly commitments
      const { data: rawCommitments, error: commitError } = await supabase
        .from("weekly_commitments")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (commitError) throw commitError;

      // Build lineage and checkins for each commitment
      const enrichedCommitments: CommitmentWithCheckin[] = await Promise.all(
        (rawCommitments || []).map(async (commitment) => {
          const frequency = commitment.frequency_json as { times_per_week: number };
          
          // Get or create checkin for this week
          const checkin = await ensureCheckin(
            commitment.id, 
            frequency.times_per_week, 
            weekStart, 
            weekEnd
          );
          
          let lineage = {
            ninety_day: null as string | null,
            one_year: null as string | null,
            three_year: null as string | null,
            vision: null as string | null,
            pillar: null as string | null
          };

          // If commitment is linked to a goal, fetch the lineage
          if (commitment.goal_id) {
            const { data: ninetyDay } = await supabase
              .from("goals")
              .select("*")
              .eq("id", commitment.goal_id)
              .maybeSingle();

            if (ninetyDay) {
              lineage.ninety_day = ninetyDay.title;

              if (ninetyDay.parent_goal_id) {
                const { data: oneYear } = await supabase
                  .from("goals")
                  .select("*")
                  .eq("id", ninetyDay.parent_goal_id)
                  .maybeSingle();

                if (oneYear) {
                  lineage.one_year = oneYear.title;

                  if (oneYear.parent_goal_id) {
                    const { data: threeYear } = await supabase
                      .from("goals")
                      .select("*")
                      .eq("id", oneYear.parent_goal_id)
                      .maybeSingle();

                    if (threeYear) {
                      lineage.three_year = threeYear.title;
                    }
                  }
                }
              }

              if (ninetyDay.life_vision_id) {
                const { data: vision } = await supabase
                  .from("life_visions")
                  .select("*")
                  .eq("id", ninetyDay.life_vision_id)
                  .maybeSingle();

                if (vision) {
                  lineage.vision = vision.title;
                }
              }

              const { data: pillar } = await supabase
                .from("pillars")
                .select("*")
                .eq("id", ninetyDay.pillar_id)
                .maybeSingle();

              if (pillar) {
                lineage.pillar = pillar.name;
              }
            }
          }

          return {
            id: commitment.id,
            title: commitment.title,
            frequency_json: frequency,
            checkin: checkin ? {
              id: checkin.id,
              planned_count: checkin.planned_count,
              actual_count: checkin.actual_count
            } : null,
            lineage
          };
        })
      );

      setCommitments(enrichedCommitments);
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

  // Update actual count for a checkin
  const updateActualCount = async (commitmentId: string, checkinId: string, delta: number) => {
    if (!user || updating) return;
    setUpdating(commitmentId);

    const commitment = commitments.find(c => c.id === commitmentId);
    if (!commitment?.checkin) return;

    const newCount = Math.max(0, commitment.checkin.actual_count + delta);

    try {
      const { error } = await supabase
        .from("weekly_checkins")
        .update({ actual_count: newCount })
        .eq("id", checkinId);

      if (error) throw error;

      setCommitments(prev =>
        prev.map(c =>
          c.id === commitmentId && c.checkin
            ? { ...c, checkin: { ...c.checkin, actual_count: newCount } }
            : c
        )
      );
    } catch (error: any) {
      console.error("Error updating count:", error);
      toast.error("Failed to update");
    } finally {
      setUpdating(null);
    }
  };

  // Fetch history for a commitment
  const fetchHistory = async (commitmentId: string) => {
    if (historyData[commitmentId]) return; // Already fetched

    const { data, error } = await supabase
      .from("weekly_checkins")
      .select("period_start_date, planned_count, actual_count")
      .eq("weekly_commitment_id", commitmentId)
      .order("period_start_date", { ascending: false })
      .limit(8);

    if (!error && data) {
      setHistoryData(prev => ({ ...prev, [commitmentId]: data }));
    }
  };

  // Navigate between weeks
  const goToPreviousWeek = () => {
    setCurrentWeekStart(prev => subWeeks(prev, 1));
  };

  const goToNextWeek = () => {
    setCurrentWeekStart(prev => addWeeks(prev, 1));
  };

  const goToCurrentWeek = () => {
    setCurrentWeekStart(getWeekStart(new Date()));
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading your commitments...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-foreground">Todayoum</h1>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Week navigation */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <Button variant="ghost" size="sm" onClick={goToPreviousWeek}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-foreground">
                {weekStartFormatted} – {weekEndFormatted}
              </h2>
              {!isCurrentWeek && (
                <button 
                  onClick={goToCurrentWeek}
                  className="text-sm text-primary hover:underline"
                >
                  Go to current week
                </button>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={goToNextWeek}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
          <p className="text-muted-foreground text-center text-sm">
            Track your weekly commitments and stay connected to your bigger goals.
          </p>
        </div>

        {commitments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">No commitments yet</p>
              <Button onClick={() => navigate("/onboarding")}>
                Set up your plan
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {commitments.map((commitment) => {
              const planned = commitment.checkin?.planned_count || commitment.frequency_json.times_per_week;
              const actual = commitment.checkin?.actual_count || 0;
              const progress = Math.min(actual / planned, 1);
              const isComplete = actual >= planned;

              return (
                <Card key={commitment.id} className="animate-fade-in">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Completion indicator */}
                      <div
                        className={`mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-calm ${
                          isComplete
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30"
                        }`}
                      >
                        {isComplete && <Check className="h-3.5 w-3.5" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Title and controls */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h3 className="font-medium text-foreground">{commitment.title}</h3>
                          <div className="flex items-center gap-2">
                            {/* Plus/Minus controls */}
                            {commitment.checkin && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => updateActualCount(commitment.id, commitment.checkin!.id, -1)}
                                  disabled={updating === commitment.id || actual === 0}
                                  className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-calm"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="text-sm font-medium text-foreground min-w-[3rem] text-center">
                                  {actual}/{planned}
                                </span>
                                <button
                                  onClick={() => updateActualCount(commitment.id, commitment.checkin!.id, 1)}
                                  disabled={updating === commitment.id}
                                  className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-calm"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                            
                            {/* History button */}
                            <Dialog>
                              <DialogTrigger asChild>
                                <button
                                  onClick={() => fetchHistory(commitment.id)}
                                  className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-calm"
                                  title="View history"
                                >
                                  <History className="h-3.5 w-3.5" />
                                </button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>{commitment.title} - History</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-2 mt-4">
                                  {historyData[commitment.id]?.length ? (
                                    historyData[commitment.id].map((week) => {
                                      const weekDate = new Date(week.period_start_date);
                                      const weekProgress = week.planned_count > 0 
                                        ? Math.min(week.actual_count / week.planned_count, 1) 
                                        : 0;
                                      return (
                                        <div key={week.period_start_date} className="flex items-center gap-3">
                                          <span className="text-sm text-muted-foreground w-24">
                                            {format(weekDate, "MMM d")}
                                          </span>
                                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                              className={`h-full rounded-full transition-all ${
                                                weekProgress >= 1 ? "bg-primary" : "bg-primary/50"
                                              }`}
                                              style={{ width: `${weekProgress * 100}%` }}
                                            />
                                          </div>
                                          <span className="text-sm font-medium w-12 text-right">
                                            {week.actual_count}/{week.planned_count}
                                          </span>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <p className="text-muted-foreground text-sm">No history yet</p>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3">
                          <div
                            className="h-full bg-primary transition-all duration-300 rounded-full"
                            style={{ width: `${progress * 100}%` }}
                          />
                        </div>

                        {/* Lineage */}
                        {commitment.lineage.pillar && (
                          <div className="text-xs text-muted-foreground flex items-center flex-wrap gap-1">
                            <span className="text-primary font-medium">{commitment.lineage.pillar}</span>
                            {commitment.lineage.vision && (
                              <>
                                <ChevronRight className="h-3 w-3" />
                                <span>{commitment.lineage.vision}</span>
                              </>
                            )}
                            {commitment.lineage.ninety_day && (
                              <>
                                <ChevronRight className="h-3 w-3" />
                                <span>90d: {commitment.lineage.ninety_day}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
