import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, LogOut, Target, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

/**
 * Dashboard Page - Weekly commitments checklist
 * Shows this week's habits with their goal lineage
 */

interface CommitmentWithLineage {
  id: string;
  title: string;
  frequency_json: { times_per_week: number };
  completions_this_week: number;
  lineage: {
    ninety_day: string | null;
    one_year: string | null;
    three_year: string | null;
    vision: string | null;
    pillar: string | null;
  };
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [commitments, setCommitments] = useState<CommitmentWithLineage[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);

  // Fetch commitments with their goal lineage
  useEffect(() => {
    if (!user) return;

    const fetchCommitments = async () => {
      try {
        // Get weekly commitments
        const { data: rawCommitments, error: commitError } = await supabase
          .from("weekly_commitments")
          .select("*")
          .eq("user_id", user.id)
          .eq("is_active", true);

        if (commitError) throw commitError;

        // Get completions for this week
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const { data: completions, error: compError } = await supabase
          .from("commitment_completions")
          .select("*")
          .eq("user_id", user.id)
          .gte("completed_date", startOfWeek.toISOString().split("T")[0]);

        if (compError) throw compError;

        // Build lineage for each commitment
        const enrichedCommitments: CommitmentWithLineage[] = await Promise.all(
          (rawCommitments || []).map(async (commitment) => {
            const weekCompletions = completions?.filter(c => c.commitment_id === commitment.id).length || 0;
            
            let lineage = {
              ninety_day: null as string | null,
              one_year: null as string | null,
              three_year: null as string | null,
              vision: null as string | null,
              pillar: null as string | null
            };

            // If commitment is linked to a goal, fetch the lineage
            if (commitment.goal_id) {
              // Get 90-day goal
              const { data: ninetyDay } = await supabase
                .from("goals")
                .select("*")
                .eq("id", commitment.goal_id)
                .maybeSingle();

              if (ninetyDay) {
                lineage.ninety_day = ninetyDay.title;

                // Get 1-year goal
                if (ninetyDay.parent_goal_id) {
                  const { data: oneYear } = await supabase
                    .from("goals")
                    .select("*")
                    .eq("id", ninetyDay.parent_goal_id)
                    .maybeSingle();

                  if (oneYear) {
                    lineage.one_year = oneYear.title;

                    // Get 3-year goal
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

                // Get vision
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

                // Get pillar
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
              frequency_json: commitment.frequency_json as { times_per_week: number },
              completions_this_week: weekCompletions,
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
    };

    fetchCommitments();
  }, [user]);

  // Toggle completion for today
  const toggleCompletion = async (commitmentId: string) => {
    if (!user || completing) return;
    setCompleting(commitmentId);

    const today = new Date().toISOString().split("T")[0];

    try {
      // Check if already completed today
      const { data: existing } = await supabase
        .from("commitment_completions")
        .select("*")
        .eq("commitment_id", commitmentId)
        .eq("completed_date", today)
        .maybeSingle();

      if (existing) {
        // Remove completion
        await supabase
          .from("commitment_completions")
          .delete()
          .eq("id", existing.id);

        setCommitments(prev =>
          prev.map(c =>
            c.id === commitmentId
              ? { ...c, completions_this_week: c.completions_this_week - 1 }
              : c
          )
        );
      } else {
        // Add completion
        await supabase.from("commitment_completions").insert({
          commitment_id: commitmentId,
          user_id: user.id,
          completed_date: today
        });

        setCommitments(prev =>
          prev.map(c =>
            c.id === commitmentId
              ? { ...c, completions_this_week: c.completions_this_week + 1 }
              : c
          )
        );
      }
    } catch (error: any) {
      console.error("Error toggling completion:", error);
      toast.error("Failed to update");
    } finally {
      setCompleting(null);
    }
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
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-foreground mb-2">This Week</h2>
          <p className="text-muted-foreground">
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
              const progress = Math.min(
                commitment.completions_this_week / commitment.frequency_json.times_per_week,
                1
              );
              const isComplete = commitment.completions_this_week >= commitment.frequency_json.times_per_week;

              return (
                <Card key={commitment.id} className="animate-fade-in">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Check button */}
                      <button
                        onClick={() => toggleCompletion(commitment.id)}
                        disabled={completing === commitment.id}
                        className={`mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-calm ${
                          isComplete
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30 hover:border-primary/50"
                        }`}
                      >
                        {isComplete && <Check className="h-3.5 w-3.5" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        {/* Title and progress */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h3 className="font-medium text-foreground">{commitment.title}</h3>
                          <span className="text-sm text-muted-foreground whitespace-nowrap">
                            {commitment.completions_this_week}/{commitment.frequency_json.times_per_week}
                          </span>
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