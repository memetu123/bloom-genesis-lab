import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, RotateCcw, ExternalLink, Target, Telescope, Calendar, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { format } from "date-fns";

/**
 * Completed Page
 * A dedicated space for browsing and reflecting on completed visions, goals, and plans.
 * Items are grouped hierarchically: Vision → Goals → Plans
 */

interface CompletedGoal {
  id: string;
  title: string;
  goal_type: "three_year" | "one_year" | "ninety_day";
  completed_at: string | null;
  parent_goal_id: string | null;
  life_vision_id: string | null;
}

interface CompletedVision {
  id: string;
  title: string;
  pillar_name: string;
  completed_at: string | null;
  goals: CompletedGoal[];
}

interface OrphanGoalGroup {
  threeYearGoal: CompletedGoal | null;
  oneYearGoals: CompletedGoal[];
  ninetyDayPlans: CompletedGoal[];
}

const Completed = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [completedVisions, setCompletedVisions] = useState<CompletedVision[]>([]);
  const [completedGoals, setCompletedGoals] = useState<CompletedGoal[]>([]);
  const [expandedVisions, setExpandedVisions] = useState<Set<string>>(new Set());
  const [reactivating, setReactivating] = useState<string | null>(null);

  // Fetch completed items
  const fetchCompletedItems = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch completed visions with pillar info
      const { data: visions, error: visionsError } = await supabase
        .from("life_visions")
        .select(`
          id,
          title,
          completed_at,
          pillar:pillars(name)
        `)
        .eq("user_id", user.id)
        .eq("status", "completed")
        .eq("is_deleted", false)
        .order("completed_at", { ascending: false });

      if (visionsError) throw visionsError;

      // Fetch completed goals
      const { data: goals, error: goalsError } = await supabase
        .from("goals")
        .select("id, title, goal_type, completed_at, parent_goal_id, life_vision_id")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .eq("is_deleted", false)
        .order("completed_at", { ascending: false });

      if (goalsError) throw goalsError;

      // Map visions with their goals
      const visionsWithGoals: CompletedVision[] = (visions || []).map((v: any) => ({
        id: v.id,
        title: v.title,
        pillar_name: v.pillar?.name || "Unknown",
        completed_at: v.completed_at,
        goals: (goals || []).filter((g: CompletedGoal) => g.life_vision_id === v.id),
      }));

      setCompletedVisions(visionsWithGoals);
      setCompletedGoals(goals || []);
    } catch (error) {
      console.error("Error fetching completed items:", error);
      toast.error("Failed to load completed items");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCompletedItems();
  }, [fetchCompletedItems]);

  // Orphan goals (not linked to a completed vision)
  const orphanGoals = useMemo(() => {
    const visionIds = new Set(completedVisions.map(v => v.id));
    return completedGoals.filter(g => !g.life_vision_id || !visionIds.has(g.life_vision_id));
  }, [completedGoals, completedVisions]);

  // Group orphan goals by their hierarchy
  const orphanGoalGroups = useMemo((): OrphanGoalGroup[] => {
    const threeYears = orphanGoals.filter(g => g.goal_type === "three_year");
    const oneYears = orphanGoals.filter(g => g.goal_type === "one_year");
    const ninetyDays = orphanGoals.filter(g => g.goal_type === "ninety_day");

    // Group by 3-year parent
    const groups: OrphanGoalGroup[] = [];
    const usedOneYearIds = new Set<string>();
    const usedNinetyDayIds = new Set<string>();

    // Process 3-year goals with their children
    for (const threeYear of threeYears) {
      const childOneYears = oneYears.filter(oy => oy.parent_goal_id === threeYear.id);
      childOneYears.forEach(oy => usedOneYearIds.add(oy.id));
      
      const childNinetyDays: CompletedGoal[] = [];
      for (const oneYear of childOneYears) {
        const nds = ninetyDays.filter(nd => nd.parent_goal_id === oneYear.id);
        nds.forEach(nd => usedNinetyDayIds.add(nd.id));
        childNinetyDays.push(...nds);
      }

      groups.push({
        threeYearGoal: threeYear,
        oneYearGoals: childOneYears,
        ninetyDayPlans: childNinetyDays,
      });
    }

    // Orphan 1-year goals (no 3-year parent)
    const orphanOneYears = oneYears.filter(oy => !usedOneYearIds.has(oy.id) && !oy.parent_goal_id);
    for (const oneYear of orphanOneYears) {
      const nds = ninetyDays.filter(nd => nd.parent_goal_id === oneYear.id);
      nds.forEach(nd => usedNinetyDayIds.add(nd.id));
      groups.push({
        threeYearGoal: null,
        oneYearGoals: [oneYear],
        ninetyDayPlans: nds,
      });
    }

    // Orphan 90-day plans (no parent)
    const orphanNinetyDays = ninetyDays.filter(nd => !usedNinetyDayIds.has(nd.id) && !nd.parent_goal_id);
    if (orphanNinetyDays.length > 0) {
      groups.push({
        threeYearGoal: null,
        oneYearGoals: [],
        ninetyDayPlans: orphanNinetyDays,
      });
    }

    return groups;
  }, [orphanGoals]);

  // Toggle vision expansion
  const toggleVision = (visionId: string) => {
    setExpandedVisions(prev => {
      const next = new Set(prev);
      if (next.has(visionId)) {
        next.delete(visionId);
      } else {
        next.add(visionId);
      }
      return next;
    });
  };

  // Reactivate a vision
  const handleReactivateVision = async (visionId: string) => {
    setReactivating(visionId);
    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ status: "active", completed_at: null })
        .eq("id", visionId);

      if (error) throw error;
      toast.success("Vision reactivated");
      fetchCompletedItems();
    } catch (error) {
      console.error("Error reactivating vision:", error);
      toast.error("Failed to reactivate vision");
    } finally {
      setReactivating(null);
    }
  };

  // Reactivate a goal
  const handleReactivateGoal = async (goalId: string) => {
    setReactivating(goalId);
    try {
      const { error } = await supabase
        .from("goals")
        .update({ status: "active", completed_at: null })
        .eq("id", goalId);

      if (error) throw error;
      toast.success("Goal reactivated");
      fetchCompletedItems();
    } catch (error) {
      console.error("Error reactivating goal:", error);
      toast.error("Failed to reactivate goal");
    } finally {
      setReactivating(null);
    }
  };

  // Format completion date
  const formatCompletedDate = (dateStr: string | null): string => {
    if (!dateStr) return "Completed";
    try {
      return `Completed ${format(new Date(dateStr), "MMM d, yyyy")}`;
    } catch {
      return "Completed";
    }
  };

  // Get goal type label
  const getGoalTypeLabel = (goalType: string): string => {
    switch (goalType) {
      case "three_year": return "3-Year Goal";
      case "one_year": return "1-Year Goal";
      case "ninety_day": return "90-Day Plan";
      default: return "Goal";
    }
  };

  // Get goal type icon
  const getGoalTypeIcon = (goalType: string) => {
    switch (goalType) {
      case "three_year": return <Telescope className="h-3.5 w-3.5" />;
      case "one_year": return <Target className="h-3.5 w-3.5" />;
      case "ninety_day": return <Calendar className="h-3.5 w-3.5" />;
      default: return <Target className="h-3.5 w-3.5" />;
    }
  };

  // Count goals and plans under a vision
  const countChildren = (goals: CompletedGoal[]): string => {
    const goalCount = goals.filter(g => g.goal_type !== "ninety_day").length;
    const planCount = goals.filter(g => g.goal_type === "ninety_day").length;
    const parts: string[] = [];
    if (goalCount > 0) parts.push(`${goalCount} goal${goalCount > 1 ? "s" : ""}`);
    if (planCount > 0) parts.push(`${planCount} plan${planCount > 1 ? "s" : ""}`);
    return parts.join(" · ");
  };

  // Check if there are any completed items
  const hasCompletedItems = completedVisions.length > 0 || orphanGoals.length > 0;

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-5 w-80 mb-8" />
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Completed</h1>
        <p className="text-muted-foreground mt-1">
          Items you've completed, kept for reflection and reuse.
        </p>
      </div>

      {!hasCompletedItems ? (
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="py-12 text-center">
            <Star className="h-10 w-10 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground">No completed items yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Completed visions, goals, and plans will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Completed Visions */}
          {completedVisions.map((vision) => (
            <Collapsible
              key={vision.id}
              open={expandedVisions.has(vision.id)}
              onOpenChange={() => toggleVision(vision.id)}
            >
              <Card className="bg-card/50 border-border/50">
                <CollapsibleTrigger asChild>
                  <div className="p-4 cursor-pointer hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="mt-0.5">
                          {expandedVisions.has(vision.id) ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs font-normal">
                              Vision
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {vision.pillar_name}
                            </span>
                          </div>
                          <h3 className="font-medium text-foreground mt-1 truncate">
                            {vision.title}
                          </h3>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                            <span>{formatCompletedDate(vision.completed_at)}</span>
                            {vision.goals.length > 0 && (
                              <>
                                <span>·</span>
                                <span>{countChildren(vision.goals)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/vision/${vision.id}`);
                          }}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 text-muted-foreground hover:text-foreground"
                          disabled={reactivating === vision.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReactivateVision(vision.id);
                          }}
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Reactivate
                        </Button>
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  {vision.goals.length > 0 && (
                    <div className="px-4 pb-4 pl-11 space-y-2">
                      {vision.goals
                        .sort((a, b) => {
                          const order = { three_year: 0, one_year: 1, ninety_day: 2 };
                          return order[a.goal_type] - order[b.goal_type];
                        })
                        .map((goal) => (
                          <div
                            key={goal.id}
                            className="flex items-center justify-between p-3 rounded-md bg-muted/30 border border-border/30"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {getGoalTypeIcon(goal.goal_type)}
                                <span className="text-xs text-muted-foreground">
                                  {getGoalTypeLabel(goal.goal_type)}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-foreground/90 mt-0.5 truncate">
                                {goal.title}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatCompletedDate(goal.completed_at)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-muted-foreground"
                                onClick={() => navigate(`/goal/${goal.id}`)}
                              >
                                View
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-muted-foreground"
                                disabled={reactivating === goal.id}
                                onClick={() => handleReactivateGoal(goal.id)}
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}

          {/* Orphan Goals (not linked to a completed vision) */}
          {orphanGoalGroups.map((group, idx) => (
            <Card key={`orphan-${idx}`} className="bg-card/50 border-border/50">
              <CardContent className="p-4 space-y-2">
                {/* 3-year goal if exists */}
                {group.threeYearGoal && (
                  <div className="flex items-center justify-between p-3 rounded-md bg-muted/30 border border-border/30">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Telescope className="h-3.5 w-3.5" />
                        <span className="text-xs text-muted-foreground">3-Year Goal</span>
                      </div>
                      <p className="text-sm font-medium text-foreground/90 mt-0.5 truncate">
                        {group.threeYearGoal.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatCompletedDate(group.threeYearGoal.completed_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => navigate(`/goal/${group.threeYearGoal!.id}`)}
                      >
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        disabled={reactivating === group.threeYearGoal.id}
                        onClick={() => handleReactivateGoal(group.threeYearGoal!.id)}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* 1-year goals */}
                {group.oneYearGoals.map((goal) => (
                  <div
                    key={goal.id}
                    className="flex items-center justify-between p-3 rounded-md bg-muted/30 border border-border/30 ml-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Target className="h-3.5 w-3.5" />
                        <span className="text-xs text-muted-foreground">1-Year Goal</span>
                      </div>
                      <p className="text-sm font-medium text-foreground/90 mt-0.5 truncate">
                        {goal.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatCompletedDate(goal.completed_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => navigate(`/goal/${goal.id}`)}
                      >
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        disabled={reactivating === goal.id}
                        onClick={() => handleReactivateGoal(goal.id)}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}

                {/* 90-day plans */}
                {group.ninetyDayPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex items-center justify-between p-3 rounded-md bg-muted/30 border border-border/30 ml-8"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5" />
                        <span className="text-xs text-muted-foreground">90-Day Plan</span>
                      </div>
                      <p className="text-sm font-medium text-foreground/90 mt-0.5 truncate">
                        {plan.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatCompletedDate(plan.completed_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => navigate(`/goal/${plan.id}`)}
                      >
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        disabled={reactivating === plan.id}
                        onClick={() => handleReactivateGoal(plan.id)}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Completed;
