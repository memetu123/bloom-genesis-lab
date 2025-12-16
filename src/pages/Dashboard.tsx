import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star, ChevronRight } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FocusModal } from "@/components/FocusModal";

/**
 * Dashboard Page - North Star Orientation
 * Answers: "What am I building my life around right now?"
 * Read-first, navigate-second. No planning, no execution.
 */

const MAX_FOCUSED_VISIONS = 3;
const MAX_THREE_YEAR_PER_VISION = 2;
const MAX_ONE_YEAR_PER_VISION = 2;
const MAX_NINETY_DAY_PER_VISION = 3;

const Dashboard = () => {
  const navigate = useNavigate();
  const { visions, goals, pillarsMap, loading } = useAppData();
  const [focusModalOpen, setFocusModalOpen] = useState(false);

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
        hasMoreThreeYear: threeYearGoals.length > MAX_THREE_YEAR_PER_VISION,
        hasMoreOneYear: oneYearGoals.length > MAX_ONE_YEAR_PER_VISION,
        hasMoreNinetyDay: ninetyDayGoals.length > MAX_NINETY_DAY_PER_VISION,
        extraThreeYearCount: threeYearGoals.length - MAX_THREE_YEAR_PER_VISION,
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
          onClick={() => setFocusModalOpen(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          Set your focus
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
              onClick={() => setFocusModalOpen(true)}
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
                {/* Vision Header - No indentation, label top-right */}
                <div 
                  className="cursor-pointer mb-4"
                  onClick={() => navigate(`/vision/${vision.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold text-foreground">
                      {vision.title}
                    </h2>
                    {vision.pillar_name && (
                      <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {vision.pillar_name}
                      </span>
                    )}
                  </div>
                </div>

                {/* 3-Year Direction - No indentation, stacked muted lines, no bullets */}
                {vision.threeYear.length > 0 && (
                  <div className="mb-4">
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">
                      3-Year Direction
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {vision.threeYear.map(goal => (
                        <p key={goal.id} className="text-sm text-muted-foreground">
                          {goal.title}
                        </p>
                      ))}
                      {vision.hasMoreThreeYear && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/goals?vision=${vision.id}&type=three_year`);
                          }}
                          className="text-xs text-muted-foreground/70 hover:text-muted-foreground mt-0.5"
                        >
                          +{vision.extraThreeYearCount} more long-term direction{vision.extraThreeYearCount !== 1 ? 's' : ''}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 1-Year Goals - Single-level indent (~10px) */}
                {vision.oneYear.length > 0 && (
                  <div className="mb-4 pl-2.5">
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">
                      1-Year Goals
                    </span>
                    <ul className="mt-1 space-y-1">
                      {vision.oneYear.map(goal => (
                        <li key={goal.id} className="text-sm text-foreground flex items-baseline gap-2">
                          <span className="text-muted-foreground/70 text-xs leading-none">•</span>
                          <span>{goal.title}</span>
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

                {/* 90-Day Commitments - Two-level indent (~20px), primary emphasis, clickable */}
                {vision.ninetyDay.length > 0 && (
                  <div className="mb-4 pl-5">
                    <span className="text-xs text-foreground font-medium uppercase tracking-wide">
                      90-Day Commitments
                    </span>
                    <ul className="mt-2 space-y-2">
                      {vision.ninetyDay.map(goal => (
                        <li 
                          key={goal.id} 
                          className="flex items-baseline gap-2 cursor-pointer hover:bg-muted/50 rounded-md p-1.5 -ml-1.5 transition-colors"
                          onClick={() => navigate(`/goal/${goal.id}`)}
                        >
                          <span className="text-muted-foreground/70 text-xs leading-none">•</span>
                          <span className="flex-1 flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">
                              {goal.title}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {goal.status === "in_progress" || goal.status === "active" 
                                ? "Active" 
                                : "Planned"}
                            </span>
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

      {/* Focus Modal */}
      <FocusModal open={focusModalOpen} onOpenChange={setFocusModalOpen} />
    </div>
  );
};

export default Dashboard;
