import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Plus, Target, ChevronRight } from "lucide-react";
import EditableTitle from "@/components/EditableTitle";
import ItemActions from "@/components/ItemActions";
import UndoToast from "@/components/UndoToast";
import HierarchyBreadcrumb, { BreadcrumbSegment } from "@/components/HierarchyBreadcrumb";
import GoalTypeBadge from "@/components/GoalTypeBadge";
import AdvancedCompletionDialog from "@/components/AdvancedCompletionDialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { GoalType } from "@/types/todayoum";
import { useAppData } from "@/hooks/useAppData";

/**
 * Goal Detail Page
 * Shows a goal and its children (sub-goals or commitments) with full editing capability
 */

type GoalStatus = "active" | "completed" | "archived" | "not_started" | "in_progress" | "paused";

interface Goal {
  id: string;
  title: string;
  description: string | null;
  goal_type: GoalType;
  pillar_id: string;
  life_vision_id: string | null;
  parent_goal_id: string | null;
  status: GoalStatus;
  is_focus: boolean;
}

interface Commitment {
  id: string;
  title: string;
  frequency_json: { times_per_week: number };
  is_active: boolean;
}

interface BreadcrumbData {
  pillarName?: string;
  visionId?: string;
  visionTitle?: string;
  threeYearId?: string;
  threeYearTitle?: string;
  oneYearId?: string;
  oneYearTitle?: string;
}

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  three_year: "3-Year Goal",
  one_year: "1-Year Goal",
  ninety_day: "90-Day Plan"
};

const CHILD_TYPE_LABELS: Record<GoalType, { childType: GoalType | "commitment"; label: string; addLabel: string }> = {
  three_year: { childType: "one_year", label: "1-Year Goals for this 3-Year Direction", addLabel: "Add 1-Year Goal" },
  one_year: { childType: "ninety_day", label: "90-Day Plans for this 1-Year Goal", addLabel: "Add 90-Day Plan" },
  ninety_day: { childType: "commitment", label: "Weekly Commitments for this 90-Day Plan", addLabel: "Add Weekly Commitment" }
};

const GoalDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refetchGoals } = useAppData();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [childGoals, setChildGoals] = useState<Goal[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbData>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  // Form state
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newFrequency, setNewFrequency] = useState("3");
  const [saving, setSaving] = useState(false);
  
  
  // Undo state
  const [undoItem, setUndoItem] = useState<{ id: string } | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  
  // Edit form state
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<GoalStatus>("active");
  
  // Advanced completion dialog state
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [hasActiveChildren, setHasActiveChildren] = useState(false);

  // Check if this is a "new goal" creation flow
  const isNewGoal = id === "new";
  const newGoalType = searchParams.get("type") as GoalType | null;
  const newGoalVisionId = searchParams.get("vision");
  const newGoalParentId = searchParams.get("parent");

  // State for creating a new goal
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [creatingGoal, setCreatingGoal] = useState(false);
  const [visionData, setVisionData] = useState<{ id: string; title: string; pillar_id: string } | null>(null);
  const [newGoalPillarName, setNewGoalPillarName] = useState<string | null>(null);
  const [parentGoalData, setParentGoalData] = useState<{ id: string; title: string; goal_type: GoalType } | null>(null);

  // Fetch vision, pillar, and parent goal data for new goal creation
  useEffect(() => {
    if (!isNewGoal || !newGoalVisionId || !user) {
      if (isNewGoal && !newGoalVisionId) {
        toast.error("Vision ID is required to create a goal");
        navigate("/dashboard");
      }
      return;
    }

    const fetchNewGoalData = async () => {
      try {
        // Fetch vision
        const { data: vision, error } = await supabase
          .from("life_visions")
          .select("id, title, pillar_id")
          .eq("id", newGoalVisionId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) throw error;
        if (!vision) {
          toast.error("Vision not found");
          navigate("/dashboard");
          return;
        }

        setVisionData(vision);

        // Fetch pillar name
        const { data: pillar } = await supabase
          .from("pillars")
          .select("name")
          .eq("id", vision.pillar_id)
          .maybeSingle();
        
        if (pillar) setNewGoalPillarName(pillar.name);

        // Fetch parent goal if exists
        if (newGoalParentId) {
          const { data: parentGoal } = await supabase
            .from("goals")
            .select("id, title, goal_type")
            .eq("id", newGoalParentId)
            .maybeSingle();
          
          if (parentGoal) {
            setParentGoalData(parentGoal as { id: string; title: string; goal_type: GoalType });
          }
        }

        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Failed to load data");
        navigate("/dashboard");
      }
    };

    fetchNewGoalData();
  }, [isNewGoal, newGoalVisionId, user, navigate]);

  // Handle creating a new goal
  const handleCreateGoal = async () => {
    if (!user || !createTitle.trim() || !visionData || !newGoalType) return;
    setCreatingGoal(true);

    try {
      const { data: newGoal, error } = await supabase
        .from("goals")
        .insert({
          user_id: user.id,
          pillar_id: visionData.pillar_id,
          life_vision_id: visionData.id,
          parent_goal_id: newGoalParentId || null,
          goal_type: newGoalType,
          title: createTitle.trim(),
          description: createDescription.trim() || null,
          status: "not_started",
          is_focus: false,
        })
        .select()
        .single();

      if (error) throw error;

      // Refresh global cache so new goal appears everywhere
      await refetchGoals();

      toast.success(`${GOAL_TYPE_LABELS[newGoalType]} created`);
      
      // Navigate to the new goal or back to dashboard
      if (newGoalType === "ninety_day") {
        navigate(`/weekly?plan=${newGoal.id}`, { replace: true });
      } else {
        navigate(`/goal/${newGoal.id}`, { replace: true });
      }
    } catch (error: any) {
      console.error("Error creating goal:", error);
      toast.error("Failed to create goal");
    } finally {
      setCreatingGoal(false);
    }
  };

  useEffect(() => {
    if (!user || !id || isNewGoal) return;

    const fetchData = async () => {
      try {
        // Fetch goal
        const { data: goalData, error: goalError } = await supabase
          .from("goals")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (goalError) throw goalError;
        if (!goalData) {
          toast.error("Goal not found");
          navigate("/dashboard");
          return;
        }

        // Redirect 90-day plans to Weekly page with context
        if (goalData.goal_type === "ninety_day") {
          navigate(`/weekly?plan=${id}`, { replace: true });
          return;
        }

        setGoal({
          ...goalData,
          status: (goalData.status as GoalStatus) || "active"
        } as Goal);

        // Build breadcrumb with IDs for navigation
        const bc: BreadcrumbData = {};

        // Get pillar
        const { data: pillar } = await supabase
          .from("pillars")
          .select("name")
          .eq("id", goalData.pillar_id)
          .maybeSingle();
        if (pillar) bc.pillarName = pillar.name;

        // Get vision if exists
        if (goalData.life_vision_id) {
          const { data: vision } = await supabase
            .from("life_visions")
            .select("id, title")
            .eq("id", goalData.life_vision_id)
            .maybeSingle();
          if (vision) {
            bc.visionId = vision.id;
            bc.visionTitle = vision.title;
          }
        }

        // Get parent goals for breadcrumb
        if (goalData.goal_type === "one_year" && goalData.parent_goal_id) {
          const { data: threeYear } = await supabase
            .from("goals")
            .select("id, title")
            .eq("id", goalData.parent_goal_id)
            .maybeSingle();
          if (threeYear) {
            bc.threeYearId = threeYear.id;
            bc.threeYearTitle = threeYear.title;
          }
        }

        setBreadcrumb(bc);

        // Fetch children - only for 3-year and 1-year goals now
        const childType = goalData.goal_type === "three_year" ? "one_year" : "ninety_day";
        const { data: childGoalsData } = await supabase
          .from("goals")
          .select("*")
          .eq("parent_goal_id", id)
          .eq("goal_type", childType)
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });

        setChildGoals((childGoalsData || []) as Goal[]);
        
        // Check for any active child goals or tasks under this goal
        let hasChildren = false;
        
        // For 3-year and 1-year goals, check child goals and their descendants
        const { count: directActiveCount } = await supabase
          .from("goals")
          .select("id", { count: "exact", head: true })
          .eq("parent_goal_id", id)
          .eq("user_id", user.id)
          .eq("is_deleted", false)
          .in("status", ["active", "not_started", "in_progress"]);
        
        if ((directActiveCount || 0) > 0) {
          hasChildren = true;
        } else {
          // Check for active descendants (grandchildren goals or tasks)
          const { data: allChildGoals } = await supabase
            .from("goals")
            .select("id, goal_type")
            .eq("parent_goal_id", id)
            .eq("user_id", user.id)
            .eq("is_deleted", false);
          
          if (allChildGoals && allChildGoals.length > 0) {
            for (const child of allChildGoals) {
              if (child.goal_type === "ninety_day") {
                // Check for active tasks under this 90-day plan
                const { count: taskCount } = await supabase
                  .from("weekly_commitments")
                  .select("id", { count: "exact", head: true })
                  .eq("goal_id", child.id)
                  .eq("is_active", true);
                
                if ((taskCount || 0) > 0) {
                  hasChildren = true;
                  break;
                }
              } else {
                // Check for active grandchild goals
                const { count: grandchildCount } = await supabase
                  .from("goals")
                  .select("id", { count: "exact", head: true })
                  .eq("parent_goal_id", child.id)
                  .eq("user_id", user.id)
                  .eq("is_deleted", false)
                  .in("status", ["active", "not_started", "in_progress"]);
                
                if ((grandchildCount || 0) > 0) {
                  hasChildren = true;
                  break;
                }
              }
            }
          }
        }
        
        setHasActiveChildren(hasChildren);
      } catch (error: any) {
        console.error("Error fetching goal:", error);
        toast.error("Failed to load goal");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, id, navigate, isNewGoal]);

  const handleAddChild = async () => {
    if (!user || !goal || !newTitle.trim()) return;
    setSaving(true);

    try {
      if (goal.goal_type === "ninety_day") {
        // Add commitment
        const { data, error } = await supabase
          .from("weekly_commitments")
          .insert({
            user_id: user.id,
            goal_id: goal.id,
            title: newTitle.trim(),
            commitment_type: "habit",
            frequency_json: { times_per_week: parseInt(newFrequency) },
            is_active: true
          })
          .select()
          .single();

        if (error) throw error;

        setCommitments(prev => [...prev, {
          ...data,
          frequency_json: data.frequency_json as { times_per_week: number }
        }]);
        toast.success("Weekly Commitment added");
      } else {
        // Add child goal
        const childType = goal.goal_type === "three_year" ? "one_year" : "ninety_day";
        const { data, error } = await supabase
          .from("goals")
          .insert({
            user_id: user.id,
            pillar_id: goal.pillar_id,
            life_vision_id: goal.life_vision_id,
            parent_goal_id: goal.id,
            goal_type: childType,
            title: newTitle.trim(),
            description: newDescription.trim() || null,
            status: "not_started"
          })
          .select()
          .single();

        if (error) throw error;

        // Refresh global cache so new goal appears everywhere
        await refetchGoals();

        setChildGoals(prev => [...prev, data as Goal]);
        toast.success(`${childType === "one_year" ? "1-Year Goal" : "90-Day Plan"} added`);
      }

      setNewTitle("");
      setNewDescription("");
      setNewFrequency("3");
      setDialogOpen(false);
    } catch (error: any) {
      console.error("Error adding:", error);
      toast.error("Failed to add");
    } finally {
      setSaving(false);
    }
  };

  // Status actions
  const handleCompleteClick = () => {
    if (!goal) return;
    if (hasActiveChildren) {
      setCompletionDialogOpen(true);
    } else {
      handleDirectComplete();
    }
  };

  const handleDirectComplete = async () => {
    if (!goal) return;
    try {
      const { error } = await supabase
        .from("goals")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", goal.id);
      if (error) throw error;
      setGoal(prev => prev ? { ...prev, status: "completed", completed_at: new Date().toISOString() } : prev);
      toast.success("Goal marked as complete");
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleAdvancedComplete = async ({
    goalIds,
    taskIds,
    completeParent,
  }: {
    goalIds: string[];
    taskIds: string[];
    completeParent: boolean;
  }) => {
    if (!goal) return;

    try {
      const completedAt = new Date().toISOString();
      if (completeParent) {
        const { error } = await supabase
          .from("goals")
          .update({ status: "completed", completed_at: completedAt })
          .eq("id", goal.id);
        if (error) throw error;
        setGoal(prev => prev ? { ...prev, status: "completed", completed_at: completedAt } : prev);
      }

      if (goalIds.length > 0) {
        const { error: goalsError } = await supabase
          .from("goals")
          .update({ status: "completed", completed_at: completedAt })
          .in("id", goalIds);
        if (goalsError) throw goalsError;
      }

      if (taskIds.length > 0) {
        const { error: tasksError } = await supabase
          .from("weekly_commitments")
          .update({ is_active: false })
          .in("id", taskIds);
        if (tasksError) throw tasksError;
      }

      const totalCompleted = 1 + goalIds.length + taskIds.length;
      toast.success(`Completed ${totalCompleted} item${totalCompleted > 1 ? "s" : ""}`);
    } catch (error) {
      console.error("Error completing:", error);
      toast.error("Failed to complete items");
      throw error;
    }
  };

  const handleArchive = async () => {
    if (!goal) return;
    const previousStatus = goal.status;
    
    try {
      const { error } = await supabase
        .from("goals")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", goal.id);
      if (error) throw error;
      setGoal(prev => prev ? { ...prev, status: "archived" } : prev);
      
      toast("Goal archived", {
        action: {
          label: "Undo",
          onClick: async () => {
            await supabase
              .from("goals")
              .update({ status: previousStatus, archived_at: null })
              .eq("id", goal.id);
            setGoal(prev => prev ? { ...prev, status: previousStatus } : prev);
          }
        },
        duration: 5000
      });
    } catch (error) {
      toast.error("Failed to archive");
    }
  };

  const handleRestore = async () => {
    if (!goal) return;
    try {
      const { error } = await supabase
        .from("goals")
        .update({ status: "active", completed_at: null })
        .eq("id", goal.id);
      if (error) throw error;
      setGoal(prev => prev ? { ...prev, status: "active", completed_at: null } : prev);
      toast.success("Goal restored to active");
    } catch (error) {
      toast.error("Failed to restore");
    }
  };

  const handleReactivate = async () => {
    if (!goal) return;
    try {
      const { error } = await supabase
        .from("goals")
        .update({ status: "active", completed_at: null })
        .eq("id", goal.id);
      if (error) throw error;
      setGoal(prev => prev ? { ...prev, status: "active", completed_at: null } : prev);
      toast.success("Goal reactivated");
    } catch (error) {
      toast.error("Failed to reactivate");
    }
  };

  const handleDelete = async () => {
    if (!goal) return;
    try {
      const { error } = await supabase
        .from("goals")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", goal.id);
      if (error) throw error;
      setUndoItem({ id: goal.id });
      setShowUndo(true);
      navigate("/goals");
    } catch (error) {
      toast.error("Failed to delete");
    }
  };

  const handleUndo = async () => {
    if (!undoItem) return;
    try {
      await supabase
        .from("goals")
        .update({ is_deleted: false, deleted_at: null })
        .eq("id", undoItem.id);
      setShowUndo(false);
      setUndoItem(null);
    } catch (error) {
      toast.error("Failed to undo");
    }
  };

  const openEditDialog = () => {
    if (!goal) return;
    setEditDescription(goal.description || "");
    setEditStatus(goal.status);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!goal) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("goals")
        .update({ 
          description: editDescription.trim() || null,
          status: editStatus 
        })
        .eq("id", goal.id);
      if (error) throw error;
      setGoal(prev => prev ? { 
        ...prev, 
        description: editDescription.trim() || null,
        status: editStatus 
      } : prev);
      setEditDialogOpen(false);
      toast.success("Goal updated");
    } catch (error) {
      toast.error("Failed to update goal");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <p className="text-muted-foreground text-center">Loading...</p>
      </div>
    );
  }

  // New goal creation UI
  if (isNewGoal && visionData && newGoalType) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Breadcrumb for new goal - full hierarchy without Dashboard */}
        <HierarchyBreadcrumb 
          segments={(() => {
            const segments: BreadcrumbSegment[] = [];
            
            // Pillar (always first, if available)
            if (newGoalPillarName) {
              segments.push({ label: newGoalPillarName, href: "/dashboard" });
            }
            
            // Vision (always present for goal creation)
            segments.push({ label: visionData.title, href: `/vision/${visionData.id}` });
            
            // Parent goal (for 1-Year under 3-Year, or 90-Day under 1-Year)
            if (parentGoalData) {
              segments.push({ label: parentGoalData.title, href: `/goal/${parentGoalData.id}` });
            }
            
            // Current creation context (non-clickable, most prominent)
            segments.push({ label: `New ${GOAL_TYPE_LABELS[newGoalType]}` });
            
            return segments;
          })()}
        />

        {/* Goal type badge for creation */}
        <div className="mb-4">
          <GoalTypeBadge goalType={newGoalType} />
        </div>

        {/* Create goal form */}
        <Card>
          <CardContent className="p-6">
            <div className="space-y-6">
              {/* 1. Title - Primary input, larger and prominent */}
              <div>
                <Label htmlFor="create-title" className="sr-only">Title</Label>
                <Input
                  id="create-title"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder={`Enter ${GOAL_TYPE_LABELS[newGoalType].toLowerCase()} title...`}
                  className="text-lg font-medium border-2 focus:border-primary h-12"
                  autoFocus
                />
              </div>

              {/* 2. Description - Optional, only show after title has content */}
              {createTitle.trim() && (
                <div className="space-y-2">
                  <Label htmlFor="create-description" className="text-sm text-muted-foreground">
                    Description <span className="text-xs">(optional)</span>
                  </Label>
                  <Textarea
                    id="create-description"
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                    placeholder="Add more details about this goal..."
                    className="min-h-[80px] resize-none"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => navigate(-1)}
                  className="text-muted-foreground"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateGoal}
                  disabled={!createTitle.trim() || creatingGoal}
                  className="flex-1 h-11"
                >
                  {creatingGoal ? "Creating..." : `Create ${GOAL_TYPE_LABELS[newGoalType]}`}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!goal) return null;

  const childConfig = CHILD_TYPE_LABELS[goal.goal_type];
  const isNinetyDay = goal.goal_type === "ninety_day";
  const displayStatus = goal.status === "not_started" || goal.status === "in_progress" || goal.status === "paused" ? "active" : goal.status;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Undo toast */}
      {showUndo && undoItem && (
        <UndoToast
          itemName="Goal"
          onUndo={handleUndo}
          onClose={() => setShowUndo(false)}
        />
      )}

      {/* Breadcrumb - shows ancestor hierarchy only (no current item) */}
      <HierarchyBreadcrumb 
        segments={(() => {
          const segments: BreadcrumbSegment[] = [];
          if (breadcrumb.pillarName) {
            segments.push({ label: breadcrumb.pillarName, href: "/dashboard" });
          }
          if (breadcrumb.visionId && breadcrumb.visionTitle) {
            segments.push({ label: breadcrumb.visionTitle, href: `/vision/${breadcrumb.visionId}` });
          }
          if (breadcrumb.threeYearId && breadcrumb.threeYearTitle) {
            segments.push({ label: breadcrumb.threeYearTitle, href: `/goal/${breadcrumb.threeYearId}` });
          }
          return segments;
        })()}
      />

      {/* Goal type badge */}
      <div className="mb-2 flex items-center gap-2">
        <GoalTypeBadge goalType={goal.goal_type} />
        {goal.status !== "active" && goal.status !== "not_started" && goal.status !== "in_progress" && (
          <Badge 
            variant="outline" 
            className={`text-xs font-normal px-2 py-0.5 ${
              goal.status === "completed" 
                ? "bg-primary/10 text-primary border-primary/20" 
                : goal.status === "archived"
                  ? "bg-muted text-muted-foreground border-muted-foreground/20"
                  : ""
            }`}
          >
            {goal.status.charAt(0).toUpperCase() + goal.status.slice(1)}
          </Badge>
        )}
      </div>


      {/* Goal info */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <EditableTitle
            value={goal.title}
            onSave={async (newTitle) => {
              const { error } = await supabase
                .from("goals")
                .update({ title: newTitle })
                .eq("id", goal.id);
              if (error) throw error;
              setGoal(prev => prev ? { ...prev, title: newTitle } : prev);
            }}
          />
          <ItemActions
            status={displayStatus as "active" | "completed" | "archived"}
            onComplete={displayStatus === "active" ? handleCompleteClick : undefined}
            onArchive={displayStatus !== "archived" ? handleArchive : undefined}
            onRestore={displayStatus === "archived" ? handleRestore : undefined}
            onReactivate={displayStatus === "completed" ? handleReactivate : undefined}
            onDelete={handleDelete}
            onEdit={openEditDialog}
          />
        </div>
        {goal.description && (
          <p className="text-muted-foreground">{goal.description}</p>
        )}
      </div>

      {/* Edit Goal Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Goal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Describe your goal..."
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="edit-status">Status</Label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as GoalStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSaveEdit} disabled={saving} className="w-full">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

        {/* Children section */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">{childConfig.label}</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                {childConfig.addLabel}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{childConfig.addLabel}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="child-title">Title</Label>
                  <Input
                    id="child-title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder={isNinetyDay ? "e.g., Study Spanish" : "What do you want to achieve?"}
                  />
                </div>
                {isNinetyDay ? (
                  <div>
                    <Label htmlFor="frequency">Times per week</Label>
                    <Select value={newFrequency} onValueChange={setNewFrequency}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7].map(n => (
                          <SelectItem key={n} value={n.toString()}>{n}× per week</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="child-description">Description (optional)</Label>
                    <Textarea
                      id="child-description"
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="Add more details..."
                      rows={3}
                    />
                  </div>
                )}
                <Button 
                  onClick={handleAddChild} 
                  disabled={saving || !newTitle.trim()}
                  className="w-full"
                >
                  {saving ? "Saving..." : "Add"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Children list */}
        {isNinetyDay ? (
          // Show commitments
          commitments.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Target className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No weekly commitments yet</p>
                <p className="text-sm text-muted-foreground mt-1">Add habits to track your progress</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {commitments.map((commitment) => (
                <Card key={commitment.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-foreground">{commitment.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {commitment.frequency_json.times_per_week}× per week
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        commitment.is_active 
                          ? "bg-primary/10 text-primary" 
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {commitment.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        ) : (
          // Show child goals
          childGoals.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Target className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No {goal.goal_type === "three_year" ? "1-year goals" : "90-day plans"} yet</p>
                <p className="text-sm text-muted-foreground mt-1">Break down your goal into smaller steps</p>
              </CardContent>
            </Card>
          ) : (
          <div className="space-y-3">
              {childGoals.map((child) => (
                <Card key={child.id} className="transition-calm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      {/* Goal content - clickable */}
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => navigate(`/goal/${child.id}`)}
                      >
                        <h3 className="font-medium text-foreground">{child.title}</h3>
                        {child.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{child.description}</p>
                        )}
                      </div>
                      <ChevronRight 
                        className="h-5 w-5 text-muted-foreground flex-shrink-0 cursor-pointer"
                        onClick={() => navigate(`/goal/${child.id}`)}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}

        {/* Go back link */}
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors mt-8"
        >
          ← Go back
        </button>
        
      {/* Advanced Completion Dialog */}
      <AdvancedCompletionDialog
        open={completionDialogOpen}
        onOpenChange={setCompletionDialogOpen}
        itemType="goal"
        itemId={goal.id}
        itemTitle={goal.title}
        goalType={goal.goal_type}
        onConfirm={handleAdvancedComplete}
      />
    </div>
  );
};

export default GoalDetail;
