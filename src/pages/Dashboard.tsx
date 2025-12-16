import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Star, ChevronRight } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Dashboard Page - North Star Orientation
 * Answers: "What am I building my life around right now?"
 * Read-first, navigate-second. No planning, no execution.
 */

const MAX_FOCUSED_VISIONS = 3;
const MAX_THREE_YEAR_PER_VISION = 1;
const MAX_ONE_YEAR_PER_VISION = 2;
const MAX_NINETY_DAY_PER_VISION = 3;

const Dashboard = () => {
  const navigate = useNavigate();
  const { visions, goals, pillarsMap, loading } = useAppData();

  // Build focused visions with related goals (capped)
  const focusedVisions = useMemo(() => {
    const focused = visions
      .filter(v => v.is_focus && v.status === "active")
      .slice(0, MAX_FOCUSED_VISIONS);

    return focused.map(vision => {
      // Get goals for this vision
      const visionGoals = goals.filter(g => g.life_vision_id === vision.id && g.status !== "archived");

      const threeYearGoals = visionGoals.filter(g => g.goal_type === "three_year");
      const oneYearGoals = visionGoals.filter(g => g.goal_type === "one_year");
      const ninetyDayGoals = visionGoals.filter(g => g.goal_type === "ninety_day");

      return {
        id: vision.id,
        title: vision.title,
        pillar_name: pillarsMap.get(vision.pillar_id)?.name || "",
        threeYear: threeYearGoals.slice(0, MAX_THREE_YEAR_PER_VISION),
        oneYear: oneYearGoals.slice(0, MAX_ONE_YEAR_PER_VISION),
        ninetyDay: ninetyDayGoals.slice(0, MAX_NINETY_DAY_PER_VISION),
        hasMoreOneYear: oneYearGoals.length > MAX_ONE_YEAR_PER_VISION,
        hasMoreNinetyDay: ninetyDayGoals.length > MAX_NINETY_DAY_PER_VISION,
      };
    });
  }, [visions, goals, pillarsMap]);

  const totalFocusedVisions = visions.filter(v => v.is_focus && v.status === "active").length;
  const extraVisionCount = totalFocusedVisions - MAX_FOCUSED_VISIONS;

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <p className="text-muted-foreground text-center">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl animate-fade-in">
      {/* ========== HEADER ========== */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Star className="h-5 w-5 text-primary fill-primary" />
          What I'm building
        </h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/visions")}
          className="text-muted-foreground hover:text-foreground"
        >
          Change focus
        </Button>
      </div>

      {/* ========== FOCUSED VISIONS ========== */}
      {focusedVisions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Star className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No focused visions yet</p>
            <Button 
              variant="outline" 
              onClick={() => navigate("/visions")}
            >
              Set your focus
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {focusedVisions.map((vision) => (
            <Card key={vision.id} className="border-muted">
              <CardContent className="p-5">
                {/* Vision Header */}
                <div 
                  className="cursor-pointer mb-4"
                  onClick={() => navigate(`/vision/${vision.id}`)}
                >
                  <span className="text-xs text-primary font-medium uppercase tracking-wide">
                    {vision.pillar_name}
                  </span>
                  <h2 className="text-lg font-semibold text-foreground mt-0.5">
                    {vision.title}
                  </h2>
                </div>

                {/* 3-Year Direction (optional, max 1) */}
                {vision.threeYear.length > 0 && (
                  <div className="mb-4">
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">
                      3-Year Direction
                    </span>
                    <p className="text-sm text-muted-foreground mt-1">
                      {vision.threeYear[0].title}
                    </p>
                  </div>
                )}

                {/* 1-Year Goals (max 2) */}
                {vision.oneYear.length > 0 && (
                  <div className="mb-4">
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">
                      1-Year Goals
                    </span>
                    <ul className="mt-1 space-y-1">
                      {vision.oneYear.map(goal => (
                        <li key={goal.id} className="text-sm text-foreground">
                          {goal.title}
                        </li>
                      ))}
                    </ul>
                    {vision.hasMoreOneYear && (
                      <button
                        onClick={() => navigate(`/goals?vision=${vision.id}&type=one_year`)}
                        className="text-xs text-muted-foreground hover:text-primary mt-1 inline-flex items-center gap-1"
                      >
                        View all 1-year goals
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}

                {/* 90-Day Commitments (primary emphasis, max 3) */}
                {vision.ninetyDay.length > 0 && (
                  <div className="mb-4">
                    <span className="text-xs text-foreground font-medium uppercase tracking-wide">
                      90-Day Commitments
                    </span>
                    <ul className="mt-2 space-y-2">
                      {vision.ninetyDay.map(goal => (
                        <li key={goal.id} className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">
                            {goal.title}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {goal.status === "in_progress" || goal.status === "active" 
                              ? "Active" 
                              : "Planned"}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {vision.hasMoreNinetyDay && (
                      <button
                        onClick={() => navigate(`/goals?vision=${vision.id}&type=ninety_day`)}
                        className="text-xs text-muted-foreground hover:text-primary mt-2 inline-flex items-center gap-1"
                      >
                        View all 90-day plans
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}

                {/* Empty state for vision with no goals */}
                {vision.threeYear.length === 0 && 
                 vision.oneYear.length === 0 && 
                 vision.ninetyDay.length === 0 && (
                  <p className="text-sm text-muted-foreground mb-4">
                    Add a goal when it feels right
                  </p>
                )}

                {/* Vision Footer - Single bridge to action */}
                <div className="pt-3 border-t border-muted">
                  <button
                    onClick={() => navigate("/weekly")}
                    className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                  >
                    Plan this week
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Extra visions indicator */}
          {extraVisionCount > 0 && (
            <p className="text-center text-sm text-muted-foreground">
              +{extraVisionCount} more focused vision{extraVisionCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
