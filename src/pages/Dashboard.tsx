import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star, ChevronRight, ChevronDown, MoreHorizontal } from "lucide-react";
import { useAppData, Vision as GlobalVision } from "@/hooks/useAppData";
import { useAuth } from "@/hooks/useAuth";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FocusModal } from "@/components/FocusModal";
import AddIconButton from "@/components/AddIconButton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Dashboard Page - North Star Orientation
 * Answers: "What am I building my life around right now?"
 * Read-first, navigate-second. No planning, no execution.
 */

const MAX_THREE_YEAR_PER_VISION = 2;
const MAX_ONE_YEAR_PER_VISION = 2;
const MAX_NINETY_DAY_PER_VISION = 3;

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { visions, goals, pillars, pillarsMap, loading, refetchVisions } = useAppData();
  const [focusModalOpen, setFocusModalOpen] = useState(false);
  const [otherVisionsExpanded, setOtherVisionsExpanded] = useState(false);
  
  // Add vision dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedPillarId, setSelectedPillarId] = useState("");
  const [saving, setSaving] = useState(false);

  // Build focused visions with related goals (no cap)
  const focusedVisions = useMemo(() => {
    const focused = visions.filter(v => v.is_focus && v.status === "active");

    return focused.map(vision => {
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

  // Non-focused active visions
  const nonFocusedVisions = useMemo(() => {
    return visions
      .filter(v => !v.is_focus && v.status === "active")
      .map(vision => ({
        id: vision.id,
        title: vision.title,
        pillar_name: pillarsMap.get(vision.pillar_id)?.name || "",
      }));
  }, [visions, pillarsMap]);

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
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFocusModalOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            Set your focus
          </Button>
          <AddIconButton
            onClick={() => setAddDialogOpen(true)}
            tooltip="Add vision"
          />
        </div>
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
                {/* Vision Header - Star toggle + menu + label top-right */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <h2 
                    className="text-lg font-semibold text-foreground cursor-pointer hover:text-primary transition-colors"
                    onClick={() => navigate(`/vision/${vision.id}`)}
                  >
                    {vision.title}
                  </h2>
                  <div className="flex items-center gap-1 shrink-0">
                    {vision.pillar_name && (
                      <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full whitespace-nowrap mr-1">
                        {vision.pillar_name}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFocus(vision.id, true);
                      }}
                      className="p-1 text-primary hover:text-primary/70 transition-colors cursor-pointer"
                      title="Remove from focus"
                    >
                      <Star className="h-4 w-4 fill-current" />
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
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/vision/${vision.id}`)}>
                          Edit vision
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleArchiveVision(vision.id)}
                          className="text-muted-foreground"
                        >
                          Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* 3-Year Direction - Lighter bullets for multiple items */}
                {vision.threeYear.length > 0 && (
                  <div className="mb-4">
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">
                      3-Year Direction
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {vision.threeYear.map(goal => (
                        <p key={goal.id} className="text-sm text-muted-foreground flex items-baseline gap-1.5">
                          {vision.threeYear.length > 1 && (
                            <span className="text-muted-foreground/40 text-[10px] leading-none">·</span>
                          )}
                          <span>{goal.title}</span>
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
            <div className="mt-4 space-y-3">
              <h3 className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
                Other visions
              </h3>
              {nonFocusedVisions.map((vision) => (
                <Card 
                  key={vision.id} 
                  className="border-muted/50 bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => navigate(`/vision/${vision.id}`)}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-sm text-muted-foreground truncate">
                        {vision.title}
                      </span>
                      {vision.pillar_name && (
                        <span className="text-xs text-muted-foreground/70 bg-muted/50 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                          {vision.pillar_name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFocus(vision.id, false);
                        }}
                        className="p-1 text-muted-foreground/50 hover:text-primary transition-colors"
                        title="Add to focus"
                      >
                        <Star className="h-4 w-4" />
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-muted-foreground/50 hover:text-foreground transition-colors"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/vision/${vision.id}`)}>
                            Edit vision
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleArchiveVision(vision.id)}
                            className="text-muted-foreground"
                          >
                            Archive
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Focus Modal */}
      <FocusModal open={focusModalOpen} onOpenChange={setFocusModalOpen} />

      {/* Add Vision Dialog */}
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
