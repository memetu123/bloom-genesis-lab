import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star, ChevronRight, Target } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import type { GoalType } from "@/types/todayoum";

/**
 * Goals Page
 * Lists all goals grouped by type with focus toggle
 */

interface Goal {
  id: string;
  title: string;
  description: string | null;
  goal_type: GoalType;
  is_focus: boolean;
  life_vision_id: string | null;
  parent_goal_id: string | null;
}

interface Vision {
  id: string;
  title: string;
}

interface GoalWithRelations extends Goal {
  vision_title?: string;
  parent_title?: string;
}

const GOAL_TYPE_CONFIG: Record<GoalType, { label: string; order: number }> = {
  three_year: { label: "3-Year Goals", order: 1 },
  one_year: { label: "1-Year Goals", order: 2 },
  ninety_day: { label: "90-Day Plans", order: 3 },
};

const Goals = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [goals, setGoals] = useState<GoalWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingFocus, setUpdatingFocus] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        // Fetch all goals
        const { data: goalsData, error: goalsError } = await supabase
          .from("goals")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });

        if (goalsError) throw goalsError;

        // Fetch visions for labels
        const { data: visionsData } = await supabase
          .from("life_visions")
          .select("id, title")
          .eq("user_id", user.id);

        const visionsMap: Record<string, string> = {};
        (visionsData || []).forEach(v => {
          visionsMap[v.id] = v.title;
        });

        // Build goals map for parent titles
        const goalsMap: Record<string, string> = {};
        (goalsData || []).forEach(g => {
          goalsMap[g.id] = g.title;
        });

        // Enrich goals with relation titles
        const enrichedGoals: GoalWithRelations[] = (goalsData || []).map(g => ({
          ...g,
          vision_title: g.life_vision_id ? visionsMap[g.life_vision_id] : undefined,
          parent_title: g.parent_goal_id ? goalsMap[g.parent_goal_id] : undefined,
        }));

        setGoals(enrichedGoals);
      } catch (error: any) {
        console.error("Error fetching goals:", error);
        toast.error("Failed to load goals");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const toggleFocus = async (goalId: string, currentFocus: boolean) => {
    if (updatingFocus) return;
    setUpdatingFocus(goalId);

    try {
      const { error } = await supabase
        .from("goals")
        .update({ is_focus: !currentFocus })
        .eq("id", goalId);

      if (error) throw error;

      setGoals(prev =>
        prev.map(g => g.id === goalId ? { ...g, is_focus: !currentFocus } : g)
      );
      toast.success(currentFocus ? "Removed from focus" : "Added to focus");
    } catch (error: any) {
      console.error("Error toggling focus:", error);
      toast.error("Failed to update focus");
    } finally {
      setUpdatingFocus(null);
    }
  };

  // Group goals by type
  const groupedGoals = goals.reduce<Record<GoalType, GoalWithRelations[]>>((acc, goal) => {
    if (!acc[goal.goal_type]) {
      acc[goal.goal_type] = [];
    }
    acc[goal.goal_type].push(goal);
    return acc;
  }, {} as Record<GoalType, GoalWithRelations[]>);

  // Sort goal types by order
  const sortedTypes = (Object.keys(groupedGoals) as GoalType[]).sort(
    (a, b) => GOAL_TYPE_CONFIG[a].order - GOAL_TYPE_CONFIG[b].order
  );

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <p className="text-muted-foreground text-center">Loading goals...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">My Goals</h1>
        <p className="text-muted-foreground mt-1">
          View and focus on goals at every level of your plan.
        </p>
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">No goals yet</p>
            <p className="text-sm text-muted-foreground">
              Create goals through the onboarding or vision detail pages.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {sortedTypes.map((goalType) => (
            <div key={goalType}>
              <h2 className="text-lg font-medium text-foreground mb-3">
                {GOAL_TYPE_CONFIG[goalType].label}
              </h2>
              <div className="space-y-2">
                {groupedGoals[goalType].map((goal) => (
                  <Card key={goal.id} className="transition-calm">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        {/* Focus toggle */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFocus(goal.id, goal.is_focus);
                          }}
                          disabled={updatingFocus === goal.id}
                          className="flex-shrink-0 p-1 rounded-full hover:bg-muted transition-calm disabled:opacity-50"
                          title={goal.is_focus ? "Remove from focus" : "Add to focus"}
                        >
                          <Star
                            className={`h-5 w-5 transition-calm ${
                              goal.is_focus 
                                ? "fill-primary text-primary" 
                                : "text-muted-foreground"
                            }`}
                          />
                        </button>

                        {/* Goal content */}
                        <div 
                          className="flex-1 cursor-pointer"
                          onClick={() => navigate(`/goal/${goal.id}`)}
                        >
                          <h3 className="font-medium text-foreground">{goal.title}</h3>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            {goal.vision_title && (
                              <span>Vision: {goal.vision_title}</span>
                            )}
                            {goal.parent_title && (
                              <>
                                {goal.vision_title && <span>•</span>}
                                <span>Parent: {goal.parent_title}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <ChevronRight 
                          className="h-5 w-5 text-muted-foreground flex-shrink-0 cursor-pointer"
                          onClick={() => navigate(`/goal/${goal.id}`)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Goals;