import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Plus, Target, ChevronRight } from "lucide-react";
import EditableTitle from "@/components/EditableTitle";
import ItemActions from "@/components/ItemActions";
import UndoToast from "@/components/UndoToast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface Breadcrumb {
  pillar?: string;
  vision?: string;
  threeYear?: string;
  oneYear?: string;
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
  const [breadcrumb, setBreadcrumb] = useState<Breadcrumb>({});
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

  // Fetch vision data for new goal creation
  useEffect(() => {
    if (!isNewGoal || !newGoalVisionId || !user) {
      if (isNewGoal && !newGoalVisionId) {
        toast.error("Vision ID is required to create a goal");
        navigate("/dashboard");
      }
      return;
    }

    const fetchVisionData = async () => {
      try {
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
        setLoading(false);
      } catch (error) {
        console.error("Error fetching vision:", error);
        toast.error("Failed to load vision data");
        navigate("/dashboard");
      }
    };

    fetchVisionData();
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

        // Build breadcrumb
        const bc: Breadcrumb = {};

        // Get pillar
        const { data: pillar } = await supabase
          .from("pillars")
          .select("name")
          .eq("id", goalData.pillar_id)
          .maybeSingle();
        if (pillar) bc.pillar = pillar.name;

        // Get vision if exists
        if (goalData.life_vision_id) {
          const { data: vision } = await supabase
            .from("life_visions")
            .select("title")
            .eq("id", goalData.life_vision_id)
            .maybeSingle();
          if (vision) bc.vision = vision.title;
        }

        // Get parent goals for breadcrumb
        if (goalData.goal_type === "one_year" && goalData.parent_goal_id) {
          const { data: threeYear } = await supabase
            .from("goals")
            .select("title")
            .eq("id", goalData.parent_goal_id)
            .maybeSingle();
          if (threeYear) bc.threeYear = threeYear.title;
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
  const handleComplete = async () => {
    if (!goal) return;
    try {
      const { error } = await supabase
        .from("goals")
        .update({ status: "completed" })
        .eq("id", goal.id);
      if (error) throw error;
      setGoal(prev => prev ? { ...prev, status: "completed" } : prev);
      toast.success("Goal marked as complete");
    } catch (error) {
      toast.error("Failed to update status");
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
        .update({ status: "active" })
        .eq("id", goal.id);
      if (error) throw error;
      setGoal(prev => prev ? { ...prev, status: "active" } : prev);
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
        .update({ status: "active" })
        .eq("id", goal.id);
      if (error) throw error;
      setGoal(prev => prev ? { ...prev, status: "active" } : prev);
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
        {/* Breadcrumb for new goal */}
        <div className="text-sm text-muted-foreground mb-4 flex items-center flex-wrap gap-1">
          <span 
            className="hover:text-foreground cursor-pointer transition-colors"
            onClick={() => navigate("/dashboard")}
          >
            Dashboard
          </span>
          <ChevronRight className="h-3 w-3" />
          <span 
            className="hover:text-foreground cursor-pointer transition-colors"
            onClick={() => navigate(`/vision/${visionData.id}`)}
          >
            {visionData.title}
          </span>
          <ChevronRight className="h-3 w-3" />
          <span>New {GOAL_TYPE_LABELS[newGoalType]}</span>
        </div>

        {/* Create goal form */}
        <Card>
          <CardContent className="p-6">
            <h1 className="text-xl font-semibold mb-6">
              Create {GOAL_TYPE_LABELS[newGoalType]}
            </h1>

            <div className="space-y-4">
              <div>
                <Label htmlFor="create-title">Title</Label>
                <Input
                  id="create-title"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder={`Enter ${GOAL_TYPE_LABELS[newGoalType].toLowerCase()} title...`}
                  className="mt-1"
                  autoFocus
                />
              </div>

              <div>
                <Label htmlFor="create-description">Description (optional)</Label>
                <Textarea
                  id="create-description"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="Add more details about this goal..."
                  className="mt-1 min-h-[100px]"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => navigate(-1)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateGoal}
                  disabled={!createTitle.trim() || creatingGoal}
                  className="flex-1"
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

      {/* Breadcrumb */}
      <div className="text-sm text-muted-foreground mb-4 flex items-center flex-wrap gap-1">
        {breadcrumb.pillar && (
          <>
            <span className="text-primary font-medium">{breadcrumb.pillar}</span>
            <ChevronRight className="h-3 w-3" />
          </>
        )}
        {breadcrumb.vision && (
          <>
            <span>{breadcrumb.vision}</span>
            <ChevronRight className="h-3 w-3" />
          </>
        )}
        {breadcrumb.threeYear && (
          <>
            <span>{breadcrumb.threeYear}</span>
            <ChevronRight className="h-3 w-3" />
          </>
        )}
        {breadcrumb.oneYear && (
          <>
            <span>{breadcrumb.oneYear}</span>
            <ChevronRight className="h-3 w-3" />
          </>
        )}
        <span>{GOAL_TYPE_LABELS[goal.goal_type]}</span>
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
            onComplete={displayStatus === "active" ? handleComplete : undefined}
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
    </div>
  );
};

export default GoalDetail;
