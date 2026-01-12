import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, Target, Check, Archive } from "lucide-react";
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

import AddIconButton from "@/components/AddIconButton";
import StatusFilter, { StatusFilterValue } from "@/components/StatusFilter";
import ItemActions from "@/components/ItemActions";
import UndoToast from "@/components/UndoToast";
import ProgressIndicator from "@/components/ProgressIndicator";
import EditGoalDialog from "@/components/EditGoalDialog";
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

  // Edit goal dialog state
  const [editGoalDialogOpen, setEditGoalDialogOpen] = useState(false);
  const [goalForEdit, setGoalForEdit] = useState<GoalWithRelations | null>(null);

  // Handle focusId from search
  const focusId = searchParams.get("focusId");
  
  useEffect(() => {
    if (focusId && !appDataLoading && !progressLoading) {
      setStatusFilter("all");
      setVisionFilter("all");
      setHighlightedId(focusId);
      setTimeout(() => {
        const element = cardRefs.current[focusId];
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
      setTimeout(() => setHighlightedId(null), 2000);
    }
  }, [focusId, appDataLoading, progressLoading]);

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

  const updateStatus = async (goalId: string, newStatus: "active" | "completed" | "archived", goalTitle?: string) => {
    // Get previous status for undo
    const previousGoal = localGoals.find(g => g.id === goalId);
    const previousStatus = previousGoal?.status || "active";
    
    // Optimistic update
    setLocalGoals(prev =>
      prev.map(g => g.id === goalId ? { 
        ...g, 
        status: newStatus,
      } : g)
    );

    try {
      const updateData: { 
        status: "active" | "completed" | "archived"; 
        archived_at: string | null;
        completed_at: string | null;
      } = { 
        status: newStatus,
        archived_at: newStatus === "archived" ? new Date().toISOString() : null,
        completed_at: newStatus === "completed" ? new Date().toISOString() : (newStatus === "active" ? null : undefined as any)
      };
      
      // Clean up undefined to avoid sending to DB
      if (updateData.completed_at === undefined) delete (updateData as any).completed_at;
      
      const { error } = await supabase
        .from("goals")
        .update(updateData)
        .eq("id", goalId);

      if (error) throw error;
      
      if (newStatus === "archived") {
        toast("Goal archived", {
          action: {
            label: "Undo",
            onClick: async () => {
              await supabase
                .from("goals")
                .update({ status: previousStatus as "active" | "completed" | "archived", archived_at: null, completed_at: null })
                .eq("id", goalId);
              setLocalGoals(prev =>
                prev.map(g => g.id === goalId ? { ...g, status: previousStatus as "active" | "completed" | "archived" } : g)
              );
            }
          },
          duration: 5000
        });
      } else {
        toast.success(`Goal ${newStatus === "completed" ? "completed" : "reactivated"}`);
      }
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

      // Refresh global cache so new goal appears everywhere
      await refetchGoals();

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
            View and manage goals at every level.
          </p>
        </div>
        <AddIconButton
          onClick={() => setDialogOpen(true)}
          tooltip="Add goal"
        />
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
              {statusFilter !== "active" || visionFilter !== "all"
                ? "No goals match your filters" 
                : "No goals yet"}
            </p>
            {(statusFilter !== "active" || visionFilter !== "all") && (
              <Button 
                variant="link"
                onClick={() => {
                  setStatusFilter("active");
                  setVisionFilter("all");
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
                          onEdit={() => {
                            setGoalForEdit(goal);
                            setEditGoalDialogOpen(true);
                          }}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="sr-only">Add Goal</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-2">
            {/* 1. Title - Primary input, larger and prominent */}
            <div className="pr-8">
              <Label htmlFor="goal-title" className="sr-only">Goal Title</Label>
              <Input
                id="goal-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="What do you want to achieve?"
                className="text-lg font-medium border-2 focus:border-primary h-12"
                autoFocus
              />
            </div>

            {/* 2. Goal Type */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Type</Label>
              <div className="flex gap-2">
                {(["three_year", "one_year", "ninety_day"] as GoalType[]).map((type) => (
                  <Button
                    key={type}
                    type="button"
                    variant={selectedGoalType === type ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedGoalType(type)}
                    className="flex-1"
                  >
                    {type === "three_year" ? "3-Year" : type === "one_year" ? "1-Year" : "90-Day"}
                  </Button>
                ))}
              </div>
            </div>

            {/* 3. Vision - Required context */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Vision</Label>
              <Select value={selectedVisionId} onValueChange={setSelectedVisionId}>
                <SelectTrigger className="h-10">
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

            {/* 4. Description - Optional, only show after title has content */}
            {newTitle.trim() && (
              <div className="space-y-2">
                <Label htmlFor="goal-description" className="text-sm text-muted-foreground">
                  Description <span className="text-xs">(optional)</span>
                </Label>
                <Textarea
                  id="goal-description"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Add more details..."
                  rows={2}
                  className="resize-none"
                />
              </div>
            )}

            {/* Submit */}
            <div className="pt-2">
              <Button 
                onClick={handleAddGoal} 
                disabled={saving || !newTitle.trim() || !selectedVisionId}
                className="w-full h-11"
              >
                {saving ? "Saving..." : `Create ${selectedGoalType === "ninety_day" ? "90-Day Plan" : selectedGoalType === "one_year" ? "1-Year Goal" : "3-Year Goal"}`}
              </Button>
            </div>
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

      {/* Edit goal dialog */}
      <EditGoalDialog
        goal={goalForEdit}
        open={editGoalDialogOpen}
        onOpenChange={setEditGoalDialogOpen}
        onSaved={(updatedGoal) => {
          setLocalGoals(prev => prev.map(g => 
            g.id === updatedGoal.id 
              ? { ...g, title: updatedGoal.title, description: updatedGoal.description, status: updatedGoal.status } 
              : g
          ));
        }}
      />
    </div>
  );
};

export default Goals;
