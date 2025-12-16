import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Star, ChevronRight, Target, Check, Archive } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAppData, Goal as GlobalGoal, Vision as GlobalVision } from "@/hooks/useAppData";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { GoalType } from "@/types/todayoum";
import FocusFilter from "@/components/FocusFilter";
import AddIconButton from "@/components/AddIconButton";
import StatusFilter, { StatusFilterValue } from "@/components/StatusFilter";
import ItemActions from "@/components/ItemActions";
import UndoToast from "@/components/UndoToast";
import ProgressIndicator from "@/components/ProgressIndicator";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { format, startOfWeek, endOfWeek } from "date-fns";

/**
 * Goals Page
 * Consumes goals/visions from global AppDataProvider
 * Only fetches page-specific data (weekly progress)
 */

interface GoalWithRelations extends GlobalGoal {
  vision_title?: string;
  parent_title?: string;
  weeklyProgress?: { completed: number; total: number };
}

const GOAL_TYPE_CONFIG: Record<GoalType, { label: string; order: number }> = {
  three_year: { label: "3-Year Goals", order: 1 },
  one_year: { label: "1-Year Goals", order: 2 },
  ninety_day: { label: "90-Day Plans", order: 3 },
};

const Goals = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { 
    goals: globalGoals, 
    visions: globalVisions, 
    goalsMap: globalGoalsMap,
    visionsMap: globalVisionsMap,
    loading: appDataLoading,
    refetchGoals 
  } = useAppData();
  const { softDelete, undoDelete, pendingDelete } = useSoftDelete();
  
  // Local state for enriched goals with weekly progress
  const [localGoals, setLocalGoals] = useState<GoalWithRelations[]>([]);
  const [progressLoading, setProgressLoading] = useState(true);
  const [updatingFocus, setUpdatingFocus] = useState<string | null>(null);
  const [showFocusedOnly, setShowFocusedOnly] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("active");
  const [visionFilter, setVisionFilter] = useState<string>("all");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedVisionId, setSelectedVisionId] = useState("");
  const [selectedGoalType, setSelectedGoalType] = useState<GoalType>("three_year");
  const [saving, setSaving] = useState(false);

  // Handle focusId from search
  const focusId = searchParams.get("focusId");
  
  useEffect(() => {
    if (focusId && !appDataLoading) {
      setStatusFilter("all");
      setVisionFilter("all");
      setShowFocusedOnly(false);
      setHighlightedId(focusId);
      setTimeout(() => {
        const element = cardRefs.current[focusId];
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
      setTimeout(() => setHighlightedId(null), 2000);
    }
  }, [focusId, appDataLoading]);

  // Fetch only page-specific data (weekly progress) and enrich goals
  useEffect(() => {
    if (!user || appDataLoading) return;

    const fetchProgress = async () => {
      setProgressLoading(true);
      try {
        const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
        const weekStartStr = format(weekStart, "yyyy-MM-dd");

        // Fetch only page-specific data
        const [commitmentsResult, checkinsResult] = await Promise.all([
          supabase
            .from("weekly_commitments")
            .select("id, goal_id")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .or("is_deleted.is.null,is_deleted.eq.false"),
          supabase
            .from("weekly_checkins")
            .select("weekly_commitment_id, planned_count, actual_count")
            .eq("user_id", user.id)
            .eq("period_start_date", weekStartStr),
        ]);

        const commitments = commitmentsResult.data || [];
        const checkins = checkinsResult.data || [];

        // Group progress by goal
        const progressByGoal: Record<string, { completed: number; total: number }> = {};
        commitments.forEach(c => {
          if (c.goal_id) {
            if (!progressByGoal[c.goal_id]) {
              progressByGoal[c.goal_id] = { completed: 0, total: 0 };
            }
            const checkin = checkins.find(ch => ch.weekly_commitment_id === c.id);
            if (checkin) {
              progressByGoal[c.goal_id].completed += checkin.actual_count;
              progressByGoal[c.goal_id].total += checkin.planned_count;
            }
          }
        });

        // Enrich goals from global context with vision titles and progress
        const enrichedGoals: GoalWithRelations[] = globalGoals.map(g => ({
          ...g,
          status: (g.status as "active" | "completed" | "archived") || "active",
          vision_title: g.life_vision_id ? globalVisionsMap.get(g.life_vision_id)?.title : undefined,
          parent_title: g.parent_goal_id ? globalGoalsMap.get(g.parent_goal_id)?.title : undefined,
          weeklyProgress: progressByGoal[g.id],
        }));

        setLocalGoals(enrichedGoals);
      } catch (error) {
        console.error("Error fetching progress:", error);
      } finally {
        setProgressLoading(false);
      }
    };

    fetchProgress();
  }, [user, appDataLoading, globalGoals, globalVisionsMap, globalGoalsMap]);

  // Convert visions for dropdown
  const visions = useMemo(() => 
    globalVisions.map(v => ({ id: v.id, title: v.title, pillar_id: v.pillar_id })),
    [globalVisions]
  );

  const loading = appDataLoading || progressLoading;

  const toggleFocus = async (goalId: string, currentFocus: boolean) => {
    if (updatingFocus) return;
    setUpdatingFocus(goalId);

    // Optimistic update
    setLocalGoals(prev =>
      prev.map(g => g.id === goalId ? { ...g, is_focus: !currentFocus } : g)
    );

    try {
      const { error } = await supabase
        .from("goals")
        .update({ is_focus: !currentFocus })
        .eq("id", goalId);

      if (error) throw error;
      toast.success(currentFocus ? "Removed from focus" : "Added to focus");
    } catch (error: any) {
      console.error("Error toggling focus:", error);
      // Rollback
      setLocalGoals(prev =>
        prev.map(g => g.id === goalId ? { ...g, is_focus: currentFocus } : g)
      );
      toast.error("Failed to update focus");
    } finally {
      setUpdatingFocus(null);
    }
  };

  const updateStatus = async (goalId: string, newStatus: "active" | "completed" | "archived") => {
    // Optimistic update
    setLocalGoals(prev =>
      prev.map(g => g.id === goalId ? { ...g, status: newStatus } : g)
    );

    try {
      const { error } = await supabase
        .from("goals")
        .update({ status: newStatus })
        .eq("id", goalId);

      if (error) throw error;
      toast.success(`Goal ${newStatus === "completed" ? "completed" : newStatus === "archived" ? "archived" : "reactivated"}`);
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
      refetchGoals();
    }
  };

  const handleDelete = async (goal: GoalWithRelations) => {
    const success = await softDelete({
      table: "goals",
      id: goal.id,
      title: goal.title,
    });
    
    if (success) {
      setLocalGoals(prev => prev.filter(g => g.id !== goal.id));
    }
  };

  const handleAddGoal = async () => {
    if (!user || !newTitle.trim() || !selectedVisionId) return;
    setSaving(true);

    try {
      const vision = visions.find(v => v.id === selectedVisionId);
      if (!vision) throw new Error("Vision not found");

      const { data, error } = await supabase
        .from("goals")
        .insert({
          user_id: user.id,
          pillar_id: vision.pillar_id,
          life_vision_id: selectedVisionId,
          goal_type: selectedGoalType,
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          status: "active"
        })
        .select()
        .single();

      if (error) throw error;

      setLocalGoals(prev => [...prev, { ...data, vision_title: vision.title, status: "active" as const, is_deleted: false }]);
      setNewTitle("");
      setNewDescription("");
      setSelectedVisionId("");
      setSelectedGoalType("three_year");
      setDialogOpen(false);
      toast.success("Goal created");
    } catch (error: any) {
      console.error("Error adding goal:", error);
      toast.error("Failed to add goal");
    } finally {
      setSaving(false);
    }
  };

  // Filter goals
  const filteredGoals = localGoals.filter(g => {
    // Status filter - treat "not_started" as "active"
    const effectiveStatus = g.status === "not_started" ? "active" : g.status;
    if (statusFilter !== "all" && effectiveStatus !== statusFilter) return false;
    // Focus filter
    if (showFocusedOnly && !g.is_focus) return false;
    // Vision filter
    if (visionFilter !== "all" && g.life_vision_id !== visionFilter) return false;
    return true;
  });

  // Group goals by type
  const groupedGoals = filteredGoals.reduce<Record<GoalType, GoalWithRelations[]>>((acc, goal) => {
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">My Goals</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            View and focus on goals at every level.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FocusFilter
            showFocusedOnly={showFocusedOnly}
            onToggle={() => setShowFocusedOnly(!showFocusedOnly)}
          />
          <AddIconButton
            onClick={() => setDialogOpen(true)}
            tooltip="Add goal"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <StatusFilter 
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <Select value={visionFilter} onValueChange={setVisionFilter}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="All visions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All visions</SelectItem>
            {visions.map(v => (
              <SelectItem key={v.id} value={v.id}>{v.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredGoals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">
              {statusFilter !== "active" || visionFilter !== "all" || showFocusedOnly 
                ? "No goals match your filters" 
                : "No goals yet"}
            </p>
            {(statusFilter !== "active" || visionFilter !== "all" || showFocusedOnly) && (
              <Button 
                variant="link"
                onClick={() => {
                  setStatusFilter("active");
                  setVisionFilter("all");
                  setShowFocusedOnly(false);
                }}
              >
                Clear filters
              </Button>
            )}
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
                  <Card 
                    key={goal.id} 
                    ref={(el) => { cardRefs.current[goal.id] = el; }}
                    className={`transition-calm ${highlightedId === goal.id ? "ring-2 ring-primary bg-primary/5" : ""}`}
                  >
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
                          className="flex-1 cursor-pointer min-w-0"
                          onClick={() => goal.goal_type === "ninety_day" 
                            ? navigate(`/weekly?plan=${goal.id}`) 
                            : navigate(`/goal/${goal.id}`)}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            {goal.status !== "active" && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                goal.status === "completed" 
                                  ? "bg-primary/10 text-primary" 
                                  : "bg-muted text-muted-foreground"
                              }`}>
                                {goal.status === "completed" ? <Check className="h-3 w-3 inline mr-0.5" /> : <Archive className="h-3 w-3 inline mr-0.5" />}
                                {goal.status}
                              </span>
                            )}
                          </div>
                          <h3 className={`font-medium text-foreground truncate ${goal.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                            {goal.title}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
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
                          {/* Progress indicator for 90-day goals */}
                          {goal.goal_type === "ninety_day" && goal.weeklyProgress && goal.weeklyProgress.total > 0 && (
                            <div className="mt-2 max-w-[200px]">
                              <ProgressIndicator 
                                completed={goal.weeklyProgress.completed}
                                total={goal.weeklyProgress.total}
                                label="This week"
                              />
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <ItemActions
                          status={goal.status === "not_started" ? "active" : (goal.status as "active" | "completed" | "archived")}
                          onComplete={() => updateStatus(goal.id, "completed")}
                          onArchive={() => updateStatus(goal.id, "archived")}
                          onReactivate={() => updateStatus(goal.id, "active")}
                          onRestore={() => updateStatus(goal.id, "active")}
                          onDelete={() => handleDelete(goal)}
                        />

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

      {/* Add goal dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Goal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Vision</Label>
              <Select value={selectedVisionId} onValueChange={setSelectedVisionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a vision" />
                </SelectTrigger>
                <SelectContent>
                  {visions.map(vision => (
                    <SelectItem key={vision.id} value={vision.id}>
                      {vision.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Goal Type</Label>
              <Select value={selectedGoalType} onValueChange={(v) => setSelectedGoalType(v as GoalType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="three_year">3-Year Goal</SelectItem>
                  <SelectItem value="one_year">1-Year Goal</SelectItem>
                  <SelectItem value="ninety_day">90-Day Plan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="What do you want to achieve?"
              />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Add more details..."
                rows={3}
              />
            </div>
            <Button 
              onClick={handleAddGoal} 
              disabled={saving || !newTitle.trim() || !selectedVisionId}
              className="w-full"
            >
              {saving ? "Saving..." : "Add Goal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Undo toast */}
      {pendingDelete && (
        <UndoToast
          itemName={pendingDelete.title}
          onUndo={async () => {
            const success = await undoDelete();
            if (success) {
              // Refetch to restore
              const { data } = await supabase
                .from("goals")
                .select("*")
                .eq("id", pendingDelete.id)
                .single();
              if (data) {
                const restored: GoalWithRelations = {
                  ...data,
                  status: (data.status as "active" | "completed" | "archived") || "active",
                  is_deleted: false,
                };
                setLocalGoals(prev => [...prev, restored]);
              }
            }
          }}
          onClose={() => {}}
        />
      )}
    </div>
  );
};

export default Goals;
