import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star, ChevronDown, MoreHorizontal, ArrowRight, Plus, ChevronRight } from "lucide-react";
import { useAppData, Goal as GlobalGoal } from "@/hooks/useAppData";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import AddIconButton from "@/components/AddIconButton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Dashboard Page - My North Star
 * The single strategy surface where users define direction, see hierarchy, and navigate into execution.
 * Direction. Clarity. Intent.
 */

interface VisionWithHierarchy {
  id: string;
  title: string;
  pillar_name: string;
  is_focus: boolean;
  threeYear: GlobalGoal[];
  oneYear: GlobalGoal[];
  ninetyDay: GlobalGoal[];
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { visions, goals, pillars, pillarsMap, loading, refetchVisions, refetchGoals } = useAppData();
  const [otherVisionsExpanded, setOtherVisionsExpanded] = useState(false);
  const [expandedVisionIds, setExpandedVisionIds] = useState<Set<string>>(new Set());
  
  // Add vision dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedPillarId, setSelectedPillarId] = useState("");
  const [saving, setSaving] = useState(false);

  // Mobile action sheet state
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileSheetVision, setMobileSheetVision] = useState<VisionWithHierarchy | null>(null);
  
  // Mobile FAB action sheet state
  const [fabSheetOpen, setFabSheetOpen] = useState(false);

  // Build focused visions with full hierarchy (no caps)
  const focusedVisions = useMemo((): VisionWithHierarchy[] => {
    const focused = visions.filter(v => v.is_focus && v.status === "active");

    return focused.map(vision => {
      const visionGoals = goals.filter(g => g.life_vision_id === vision.id && g.status !== "archived" && !g.is_deleted);

      return {
        id: vision.id,
        title: vision.title,
        pillar_name: pillarsMap.get(vision.pillar_id)?.name || "",
        is_focus: true,
        threeYear: visionGoals.filter(g => g.goal_type === "three_year"),
        oneYear: visionGoals.filter(g => g.goal_type === "one_year"),
        ninetyDay: visionGoals.filter(g => g.goal_type === "ninety_day"),
      };
    });
  }, [visions, goals, pillarsMap]);

  // Non-focused active visions with hierarchy
  const nonFocusedVisions = useMemo((): VisionWithHierarchy[] => {
    return visions
      .filter(v => !v.is_focus && v.status === "active")
      .map(vision => {
        const visionGoals = goals.filter(g => g.life_vision_id === vision.id && g.status !== "archived" && !g.is_deleted);
        return {
          id: vision.id,
          title: vision.title,
          pillar_name: pillarsMap.get(vision.pillar_id)?.name || "",
          is_focus: false,
          threeYear: visionGoals.filter(g => g.goal_type === "three_year"),
          oneYear: visionGoals.filter(g => g.goal_type === "one_year"),
          ninetyDay: visionGoals.filter(g => g.goal_type === "ninety_day"),
        };
      });
  }, [visions, goals, pillarsMap]);

  const handleToggleFocus = async (visionId: string, currentFocus: boolean) => {
    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ is_focus: !currentFocus })
        .eq("id", visionId);

      if (error) throw error;
      refetchVisions();
    } catch (err) {
      toast.error("Failed to update focus");
    }
  };

  const handleAddVision = async () => {
    if (!user || !newTitle.trim() || !selectedPillarId) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from("life_visions")
        .insert({
          user_id: user.id,
          pillar_id: selectedPillarId,
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          status: "active",
          is_focus: true, // New visions are focused by default
        });

      if (error) throw error;

      setNewTitle("");
      setNewDescription("");
      setSelectedPillarId("");
      setAddDialogOpen(false);
      refetchVisions();
      toast.success("Vision created");
    } catch (error) {
      console.error("Error adding vision:", error);
      toast.error("Failed to add vision");
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveVision = async (visionId: string) => {
    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ status: "archived" })
        .eq("id", visionId);

      if (error) throw error;
      refetchVisions();
      toast.success("Vision archived");
    } catch (err) {
      toast.error("Failed to archive vision");
    }
  };

  const handleDeleteVision = async (visionId: string) => {
    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", visionId);

      if (error) throw error;
      refetchVisions();
      toast.success("Vision deleted");
    } catch (err) {
      toast.error("Failed to delete vision");
    }
  };

  // Get status label for 90-day goals
  const getGoalStatusLabel = (status: string | null) => {
    if (status === "in_progress" || status === "active") return "Active";
    if (status === "not_started") return "Planned";
    return "Inactive";
  };

  // Get first active 90-day plan for navigation
  const getActive90DayPlan = (ninetyDayGoals: GlobalGoal[]) => {
    const active = ninetyDayGoals.find(g => g.status === "active" || g.status === "in_progress");
    return active || ninetyDayGoals[0];
  };

  // Toggle expanded state for mobile vision cards
  const toggleVisionExpanded = (visionId: string) => {
    setExpandedVisionIds(prev => {
      const next = new Set(prev);
      if (next.has(visionId)) {
        next.delete(visionId);
      } else {
        next.add(visionId);
      }
      return next;
    });
  };

  // Open mobile action sheet for a vision
  const openMobileVisionActions = (vision: VisionWithHierarchy, e: React.MouseEvent) => {
    e.stopPropagation();
    setMobileSheetVision(vision);
    setMobileSheetOpen(true);
  };

  // Filter helpers for desktop view
  const getActiveGoals = (goals: GlobalGoal[]) => 
    goals.filter(g => g.status === "active" || g.status === "in_progress");
  
  const getLimited3Year = (goals: GlobalGoal[]) => {
    const limited = goals.slice(0, 2);
    return { items: limited, hasMore: goals.length > 2, moreCount: goals.length - 2 };
  };

  // Desktop Vision Card
  const renderDesktopVisionCard = (vision: VisionWithHierarchy, isMuted: boolean = false) => {
    const activePlan = getActive90DayPlan(vision.ninetyDay);
    const active1Year = getActiveGoals(vision.oneYear);
    const active90Day = getActiveGoals(vision.ninetyDay);
    const { items: limited3Year, hasMore: hasMore3Year, moreCount: more3YearCount } = getLimited3Year(vision.threeYear);

    return (
      <Card 
        key={vision.id} 
        className={isMuted ? "border-muted/50 bg-muted/10" : "border-muted"}
      >
        <CardContent className="p-5">
          {/* Vision Header */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <h2 
              className={`text-lg font-semibold cursor-pointer hover:text-primary transition-colors ${isMuted ? "text-muted-foreground" : "text-foreground"}`}
              onClick={() => navigate(`/vision/${vision.id}`)}
            >
              {vision.title}
            </h2>
            <div className="flex items-center gap-1 shrink-0">
              {vision.pillar_name && (
                <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full whitespace-nowrap mr-1">
                  {vision.pillar_name}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFocus(vision.id, vision.is_focus);
                }}
                className={`p-1 transition-colors cursor-pointer ${
                  vision.is_focus 
                    ? "text-primary hover:text-primary/70" 
                    : "text-muted-foreground/50 hover:text-primary"
                }`}
                title={vision.is_focus ? "Remove from focus" : "Add to focus"}
              >
                <Star className={`h-4 w-4 ${vision.is_focus ? "fill-current" : ""}`} />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border border-border shadow-md">
                  <DropdownMenuItem onClick={() => navigate(`/vision/${vision.id}`)}>
                    Edit vision
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleArchiveVision(vision.id)}
                    className="text-muted-foreground"
                  >
                    Archive
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => handleDeleteVision(vision.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    Delete vision
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* 3-Year Direction - NO tint, neutral */}
          {limited3Year.length > 0 && (
            <div className="mb-4">
              <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">
                3-Year Direction
              </span>
              <div className="space-y-1.5">
                {limited3Year.map(goal => (
                  <p 
                    key={goal.id} 
                    className={`text-sm flex items-baseline gap-1.5 ${isMuted ? "text-muted-foreground/70" : "text-muted-foreground"}`}
                  >
                    <span className="text-muted-foreground/40 text-xs">→</span>
                    <span 
                      className="hover:text-foreground cursor-pointer transition-colors"
                      onClick={() => navigate(`/goal/${goal.id}`)}
                    >
                      {goal.title}
                    </span>
                  </p>
                ))}
                {hasMore3Year && (
                  <p className="text-xs text-muted-foreground/60 ml-4">
                    +{more3YearCount} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 1-Year Goals - Tinted with top divider */}
          {active1Year.length > 0 && (
            <div className="mb-4 bg-section-tint/[0.06] rounded-md pt-0 overflow-hidden">
              <div className="border-t border-muted-foreground/10" />
              <div className="p-3 pt-2.5">
                <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">
                  1-Year Goals
                </span>
                <ul className="space-y-1.5">
                  {active1Year.map(goal => (
                    <li 
                      key={goal.id} 
                      className={`text-sm flex items-baseline gap-2 ${isMuted ? "text-muted-foreground" : "text-foreground"}`}
                    >
                      <span className="text-muted-foreground/50 text-xs leading-none">•</span>
                      <span 
                        className="hover:text-primary cursor-pointer transition-colors"
                        onClick={() => navigate(`/goal/${goal.id}`)}
                      >
                        {goal.title}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* 90-Day Commitments - Stronger tint with top divider */}
          {active90Day.length > 0 && (
            <div className="mb-3 bg-section-tint/[0.10] rounded-md pt-0 overflow-hidden">
              <div className="border-t border-muted-foreground/10" />
              <div className="p-3 pt-2.5">
                <span className="text-xs text-foreground font-medium uppercase tracking-wide block mb-2">
                  90-Day Commitments
                </span>
                <ul className="space-y-1.5">
                  {active90Day.map(goal => (
                    <li 
                      key={goal.id} 
                      className="flex items-baseline gap-2 cursor-pointer hover:bg-muted/30 rounded-md p-1.5 -ml-1.5 transition-colors"
                      onClick={() => navigate(`/weekly?plan=${goal.id}`)}
                    >
                      <span className="text-muted-foreground/50 text-xs leading-none">•</span>
                      <span className="flex-1 flex items-center justify-between">
                        <span className={`text-sm font-medium ${isMuted ? "text-muted-foreground" : "text-foreground"}`}>
                          {goal.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {getGoalStatusLabel(goal.status)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Empty state */}
          {vision.threeYear.length === 0 && 
           vision.oneYear.length === 0 && 
           vision.ninetyDay.length === 0 && (
            <p className="text-sm text-muted-foreground mb-4">
              Add a goal when it feels right
            </p>
          )}

          {/* Vision Footer */}
          <div className="pt-3 border-t border-muted">
            <button
              onClick={() => {
                if (activePlan) {
                  navigate(`/weekly?plan=${activePlan.id}`);
                } else {
                  navigate("/weekly");
                }
              }}
              className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
            >
              Plan this week
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Mobile Vision Card - compact by default, expandable
  const renderMobileVisionCard = (vision: VisionWithHierarchy, isMuted: boolean = false) => {
    const activePlan = getActive90DayPlan(vision.ninetyDay);
    const isExpanded = expandedVisionIds.has(vision.id);
    const active90Day = getActiveGoals(vision.ninetyDay);

    return (
      <Card 
        key={vision.id} 
        className={isMuted ? "border-muted/50 bg-muted/10" : "border-muted"}
      >
        <CardContent className="p-4">
          {/* Mobile Vision Header - Tappable */}
          <div 
            className="flex items-start justify-between gap-2"
            onClick={(e) => openMobileVisionActions(vision, e)}
          >
            <div className="flex-1 min-w-0">
              <h2 
                className={`text-base font-semibold truncate ${isMuted ? "text-muted-foreground" : "text-foreground"}`}
              >
                {vision.title}
              </h2>
              {vision.pillar_name && (
                <span className="text-xs text-muted-foreground mt-0.5 block">
                  {vision.pillar_name}
                </span>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleFocus(vision.id, vision.is_focus);
              }}
              className={`p-1 transition-colors cursor-pointer shrink-0 ${
                vision.is_focus 
                  ? "text-primary" 
                  : "text-muted-foreground/50"
              }`}
            >
              <Star className={`h-4 w-4 ${vision.is_focus ? "fill-current" : ""}`} />
            </button>
          </div>

          {/* Mobile: Show only active 90-day by default */}
          {!isExpanded && active90Day.length > 0 && (
            <div className="mt-3 pl-0">
              {active90Day.slice(0, 1).map(goal => (
                <div 
                  key={goal.id}
                  className="flex items-center justify-between text-sm border-l-2 border-primary/30 pl-2 py-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/weekly?plan=${goal.id}`);
                  }}
                >
                  <span className={`font-medium ${isMuted ? "text-muted-foreground" : "text-foreground"}`}>
                    {goal.title}
                  </span>
                  <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted/50 rounded">
                    {getGoalStatusLabel(goal.status)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Mobile: Expanded hierarchy - refined tinting and spacing */}
          {isExpanded && (
            <div className="mt-3 space-y-3">
              {/* 3-Year Direction - NO tint, neutral on mobile */}
              {vision.threeYear.length > 0 && (
                <div className="px-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-1.5">
                    3-Year Direction
                  </span>
                  <div className="space-y-1.5">
                    {vision.threeYear.map(goal => (
                      <p 
                        key={goal.id} 
                        className="text-sm text-muted-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/goal/${goal.id}`);
                        }}
                      >
                        {goal.title}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* 1-Year Goals - Tinted with top divider, no bullets on mobile */}
              {vision.oneYear.length > 0 && (
                <div className="bg-section-tint/[0.08] rounded-md pt-0 overflow-hidden">
                  <div className="border-t border-muted-foreground/10" />
                  <div className="p-3 pt-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-1.5">
                      1-Year Goals
                    </span>
                    <div className="space-y-1.5">
                      {vision.oneYear.map(goal => (
                        <p 
                          key={goal.id} 
                          className="text-sm text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/goal/${goal.id}`);
                          }}
                        >
                          {goal.title}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 90-Day Commitments - Stronger tint with top divider, no bullets on mobile */}
              {vision.ninetyDay.length > 0 && (
                <div className="bg-section-tint/[0.12] rounded-md pt-0 overflow-hidden">
                  <div className="border-t border-muted-foreground/10" />
                  <div className="p-3 pt-2">
                    <span className="text-xs text-foreground font-medium uppercase tracking-wide block mb-1.5">
                      90-Day Commitments
                    </span>
                    <div className="space-y-1.5">
                      {vision.ninetyDay.map(goal => (
                        <div 
                          key={goal.id} 
                          className="flex items-center justify-between text-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/weekly?plan=${goal.id}`);
                          }}
                        >
                          <span className="font-medium">{goal.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {getGoalStatusLabel(goal.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mobile: View strategy toggle */}
          {(vision.threeYear.length > 0 || vision.oneYear.length > 0 || vision.ninetyDay.length > 1) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleVisionExpanded(vision.id);
              }}
              className="mt-3 text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
            >
              {isExpanded ? (
                <>
                  Hide strategy
                  <ChevronDown className="h-3 w-3 rotate-180" />
                </>
              ) : (
                <>
                  View strategy
                  <ChevronRight className="h-3 w-3" />
                </>
              )}
            </button>
          )}

          {/* Empty state */}
          {vision.threeYear.length === 0 && 
           vision.oneYear.length === 0 && 
           vision.ninetyDay.length === 0 && (
            <p className="text-sm text-muted-foreground mt-3">
              Add a goal when it feels right
            </p>
          )}

          {/* Mobile: Plan this week action */}
          <div className="pt-3 mt-3 border-t border-muted">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (activePlan) {
                  navigate(`/weekly?plan=${activePlan.id}`);
                } else {
                  navigate("/weekly");
                }
              }}
              className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
            >
              Plan this week
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Render appropriate card based on device
  const renderVisionCard = (vision: VisionWithHierarchy, isMuted: boolean = false) => {
    return isMobile 
      ? renderMobileVisionCard(vision, isMuted)
      : renderDesktopVisionCard(vision, isMuted);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <p className="text-muted-foreground text-center">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl animate-fade-in pb-24 md:pb-8">
      {/* ========== HEADER ========== */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-foreground">
          My North Star
        </h1>
        {/* Desktop: Add button in header */}
        {!isMobile && (
          <AddIconButton
            onClick={() => setAddDialogOpen(true)}
            tooltip="Add vision"
          />
        )}
      </div>

      {/* ========== FOCUSED VISIONS ========== */}
      {focusedVisions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Star className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No focused visions yet</p>
            <Button 
              variant="outline" 
              onClick={() => setAddDialogOpen(true)}
            >
              Add your first vision
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4 md:space-y-6">
          {focusedVisions.map((vision) => renderVisionCard(vision, false))}
        </div>
      )}

      {/* ========== NON-FOCUSED VISIONS (Collapsible) ========== */}
      {nonFocusedVisions.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setOtherVisionsExpanded(!otherVisionsExpanded)}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-3 flex items-center justify-center gap-1 transition-colors"
          >
            <ChevronDown 
              className={`h-4 w-4 transition-transform ${otherVisionsExpanded ? 'rotate-180' : ''}`} 
            />
            +{nonFocusedVisions.length} more vision{nonFocusedVisions.length !== 1 ? 's' : ''}
          </button>

          {otherVisionsExpanded && (
            <div className="mt-4 space-y-4">
              <h3 className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
                Other visions
              </h3>
              {nonFocusedVisions.map((vision) => renderVisionCard(vision, true))}
            </div>
          )}
        </div>
      )}

      {/* ========== MOBILE FAB ========== */}
      {isMobile && (
        <button
          onClick={() => setFabSheetOpen(true)}
          className="fixed bottom-20 right-4 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center z-40 hover:bg-primary/90 transition-colors"
          aria-label="Add new item"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* ========== MOBILE FAB ACTION SHEET ========== */}
      <Sheet open={fabSheetOpen} onOpenChange={setFabSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-xl">
          <SheetHeader>
            <SheetTitle>Add new</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-1">
            <button
              onClick={() => {
                setFabSheetOpen(false);
                setAddDialogOpen(true);
              }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-muted rounded-md transition-colors"
            >
              Add vision
            </button>
            <button
              onClick={() => {
                setFabSheetOpen(false);
                navigate("/goal/new?type=three_year");
              }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-muted rounded-md transition-colors"
            >
              Add 3-Year goal
            </button>
            <button
              onClick={() => {
                setFabSheetOpen(false);
                navigate("/goal/new?type=one_year");
              }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-muted rounded-md transition-colors"
            >
              Add 1-Year goal
            </button>
            <button
              onClick={() => {
                setFabSheetOpen(false);
                navigate("/goal/new?type=ninety_day");
              }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-muted rounded-md transition-colors"
            >
              Add 90-Day plan
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ========== MOBILE VISION ACTION SHEET ========== */}
      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-xl">
          <SheetHeader>
            <SheetTitle className="truncate">{mobileSheetVision?.title}</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-1">
            <button
              onClick={() => {
                setMobileSheetOpen(false);
                if (mobileSheetVision) navigate(`/vision/${mobileSheetVision.id}`);
              }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-muted rounded-md transition-colors"
            >
              Edit vision
            </button>
            <button
              onClick={() => {
                setMobileSheetOpen(false);
                navigate(`/goal/new?type=three_year&vision=${mobileSheetVision?.id}`);
              }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-muted rounded-md transition-colors"
            >
              Add 3-Year goal
            </button>
            <button
              onClick={() => {
                setMobileSheetOpen(false);
                navigate(`/goal/new?type=one_year&vision=${mobileSheetVision?.id}`);
              }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-muted rounded-md transition-colors"
            >
              Add 1-Year goal
            </button>
            <button
              onClick={() => {
                setMobileSheetOpen(false);
                navigate(`/goal/new?type=ninety_day&vision=${mobileSheetVision?.id}`);
              }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-muted rounded-md transition-colors"
            >
              Add 90-Day plan
            </button>
            <div className="border-t border-border my-2" />
            <button
              onClick={() => {
                setMobileSheetOpen(false);
                if (mobileSheetVision) handleArchiveVision(mobileSheetVision.id);
              }}
              className="w-full text-left px-4 py-3 text-sm text-muted-foreground hover:bg-muted rounded-md transition-colors"
            >
              Archive vision
            </button>
            <button
              onClick={() => {
                setMobileSheetOpen(false);
                if (mobileSheetVision) handleDeleteVision(mobileSheetVision.id);
              }}
              className="w-full text-left px-4 py-3 text-sm text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            >
              Delete vision
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ========== ADD VISION DIALOG ========== */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Vision</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="pillar">Pillar</Label>
              <Select value={selectedPillarId} onValueChange={setSelectedPillarId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a pillar" />
                </SelectTrigger>
                <SelectContent>
                  {pillars.map(pillar => (
                    <SelectItem key={pillar.id} value={pillar.id}>
                      {pillar.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Who do you want to become?"
              />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Describe your vision..."
                rows={3}
              />
            </div>
            <Button 
              onClick={handleAddVision} 
              disabled={saving || !newTitle.trim() || !selectedPillarId}
              className="w-full"
            >
              {saving ? "Saving..." : "Add Vision"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
