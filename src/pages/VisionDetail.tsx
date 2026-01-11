import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Target, Star, ChevronRight } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import EditableTitle from "@/components/EditableTitle";
import ItemActions from "@/components/ItemActions";
import UndoToast from "@/components/UndoToast";
import HierarchyBreadcrumb from "@/components/HierarchyBreadcrumb";
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

/**
 * Vision Detail Page
 * Shows a vision and its 3-year goals with full editing capability
 */

type VisionStatus = "active" | "completed" | "archived";

interface Vision {
  id: string;
  title: string;
  description: string | null;
  pillar_id: string;
  is_focus: boolean;
  status: VisionStatus;
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: string;
  is_focus: boolean;
}

interface Pillar {
  id: string;
  name: string;
}

const VisionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refetchGoals } = useAppData();
  const [vision, setVision] = useState<Vision | null>(null);
  const [pillar, setPillar] = useState<Pillar | null>(null);
  const [threeYearGoals, setThreeYearGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalDescription, setNewGoalDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingFocus, setUpdatingFocus] = useState<string | null>(null);
  
  // Undo state
  const [undoItem, setUndoItem] = useState<{ id: string; type: "vision" | "goal" } | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  
  // Edit form state
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<VisionStatus>("active");
  
  // Advanced completion dialog state
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [hasActiveChildren, setHasActiveChildren] = useState(false);

  useEffect(() => {
    if (!user || !id) return;

    const fetchData = async () => {
      try {
        // Fetch vision
        const { data: visionData, error: visionError } = await supabase
          .from("life_visions")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (visionError) throw visionError;
        if (!visionData) {
          toast.error("Vision not found");
          navigate("/dashboard");
          return;
        }

        setVision({
          ...visionData,
          status: (visionData.status as VisionStatus) || "active"
        });

        // Fetch pillar
        const { data: pillarData } = await supabase
          .from("pillars")
          .select("*")
          .eq("id", visionData.pillar_id)
          .maybeSingle();

        setPillar(pillarData);

        // Fetch 3-year goals for this vision
        const { data: goalsData, error: goalsError } = await supabase
          .from("goals")
          .select("*")
          .eq("life_vision_id", id)
          .eq("goal_type", "three_year")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });

        if (goalsError) throw goalsError;
        setThreeYearGoals(goalsData || []);
        
        // Check for any active child goals under this vision
        const { count } = await supabase
          .from("goals")
          .select("id", { count: "exact", head: true })
          .eq("life_vision_id", id)
          .eq("user_id", user.id)
          .eq("is_deleted", false)
          .in("status", ["active", "not_started", "in_progress"]);
        
        setHasActiveChildren((count || 0) > 0);
      } catch (error: any) {
        console.error("Error fetching vision:", error);
        toast.error("Failed to load vision");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, id, navigate]);

  const toggleVisionFocus = async () => {
    if (!vision || updatingFocus) return;
    setUpdatingFocus(vision.id);

    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ is_focus: !vision.is_focus })
        .eq("id", vision.id);

      if (error) throw error;

      setVision(prev => prev ? { ...prev, is_focus: !prev.is_focus } : prev);
      toast.success(vision.is_focus ? "Removed from focus" : "Added to focus");
    } catch (error: any) {
      console.error("Error toggling focus:", error);
      toast.error("Failed to update focus");
    } finally {
      setUpdatingFocus(null);
    }
  };

  const handleAddGoal = async () => {
    if (!user || !vision || !newGoalTitle.trim()) return;
    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("goals")
        .insert({
          user_id: user.id,
          pillar_id: vision.pillar_id,
          life_vision_id: vision.id,
          goal_type: "three_year",
          title: newGoalTitle.trim(),
          description: newGoalDescription.trim() || null,
          status: "active"
        })
        .select()
        .single();

      if (error) throw error;

      // Refresh global cache so new goal appears everywhere
      await refetchGoals();

      setThreeYearGoals(prev => [...prev, data]);
      setNewGoalTitle("");
      setNewGoalDescription("");
      setDialogOpen(false);
      toast.success("3-Year Goal added");
    } catch (error: any) {
      console.error("Error adding goal:", error);
      toast.error("Failed to add goal");
    } finally {
      setSaving(false);
    }
  };

  // Status actions
  const handleCompleteClick = () => {
    if (!vision) return;
    // If there are active children, show the advanced completion dialog
    if (hasActiveChildren) {
      setCompletionDialogOpen(true);
    } else {
      // No children, complete directly
      handleDirectComplete();
    }
  };

  const handleDirectComplete = async () => {
    if (!vision) return;
    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", vision.id);
      if (error) throw error;
      setVision(prev => prev ? { ...prev, status: "completed", completed_at: new Date().toISOString() } : prev);
      toast.success("Vision marked as complete");
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
    if (!vision) return;

    try {
      const completedAt = new Date().toISOString();
      // Complete the vision itself
      if (completeParent) {
        const { error } = await supabase
          .from("life_visions")
          .update({ status: "completed", completed_at: completedAt })
          .eq("id", vision.id);
        if (error) throw error;
        setVision(prev => prev ? { ...prev, status: "completed", completed_at: completedAt } : prev);
      }

      // Complete selected goals
      if (goalIds.length > 0) {
        const { error: goalsError } = await supabase
          .from("goals")
          .update({ status: "completed", completed_at: completedAt })
          .in("id", goalIds);
        if (goalsError) throw goalsError;
      }

      // Deactivate selected tasks (tasks don't have "completed" status, they have is_active)
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
    if (!vision) return;
    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ status: "archived" })
        .eq("id", vision.id);
      if (error) throw error;
      setVision(prev => prev ? { ...prev, status: "archived" } : prev);
      toast.success("Vision archived");
    } catch (error) {
      toast.error("Failed to archive");
    }
  };

  const handleRestore = async () => {
    if (!vision) return;
    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ status: "active", completed_at: null })
        .eq("id", vision.id);
      if (error) throw error;
      setVision(prev => prev ? { ...prev, status: "active", completed_at: null } : prev);
      toast.success("Vision restored to active");
    } catch (error) {
      toast.error("Failed to restore");
    }
  };

  const handleReactivate = async () => {
    if (!vision) return;
    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ status: "active", completed_at: null })
        .eq("id", vision.id);
      if (error) throw error;
      setVision(prev => prev ? { ...prev, status: "active", completed_at: null } : prev);
      toast.success("Vision reactivated");
    } catch (error) {
      toast.error("Failed to reactivate");
    }
  };

  const handleDelete = async () => {
    if (!vision) return;
    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", vision.id);
      if (error) throw error;
      setUndoItem({ id: vision.id, type: "vision" });
      setShowUndo(true);
      navigate("/dashboard");
    } catch (error) {
      toast.error("Failed to delete");
    }
  };

  const handleUndo = async () => {
    if (!undoItem) return;
    try {
      if (undoItem.type === "vision") {
        await supabase
          .from("life_visions")
          .update({ is_deleted: false, deleted_at: null })
          .eq("id", undoItem.id);
      }
      setShowUndo(false);
      setUndoItem(null);
    } catch (error) {
      toast.error("Failed to undo");
    }
  };

  const openEditDialog = () => {
    if (!vision) return;
    setEditDescription(vision.description || "");
    setEditStatus(vision.status);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!vision) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ 
          description: editDescription.trim() || null,
          status: editStatus 
        })
        .eq("id", vision.id);
      if (error) throw error;
      setVision(prev => prev ? { 
        ...prev, 
        description: editDescription.trim() || null,
        status: editStatus 
      } : prev);
      setEditDialogOpen(false);
      toast.success("Vision updated");
    } catch (error) {
      toast.error("Failed to update vision");
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

  if (!vision) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Undo toast */}
      {showUndo && undoItem && (
        <UndoToast
          itemName="Vision"
          onUndo={handleUndo}
          onClose={() => setShowUndo(false)}
        />
      )}

      {/* Breadcrumb */}
      {pillar && (
        <HierarchyBreadcrumb 
          segments={[
            { label: pillar.name, href: "/dashboard" },
            { label: "Vision" }
          ]}
        />
      )}

      {/* Vision type badge */}
      <div className="mb-2">
        <Badge variant="outline" className="text-xs font-normal px-2 py-0.5 bg-accent/50 text-accent-foreground border-accent">
          Vision
        </Badge>
        {vision.status !== "active" && (
          <Badge 
            variant="outline" 
            className={`text-xs font-normal px-2 py-0.5 ml-2 ${
              vision.status === "completed" 
                ? "bg-primary/10 text-primary border-primary/20" 
                : "bg-muted text-muted-foreground border-muted-foreground/20"
            }`}
          >
            {vision.status.charAt(0).toUpperCase() + vision.status.slice(1)}
          </Badge>
        )}
      </div>

      {/* Vision info */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <EditableTitle
            value={vision.title}
            onSave={async (newTitle) => {
              const { error } = await supabase
                .from("life_visions")
                .update({ title: newTitle })
                .eq("id", vision.id);
              if (error) throw error;
              setVision(prev => prev ? { ...prev, title: newTitle } : prev);
            }}
          />
          <button
            onClick={toggleVisionFocus}
            disabled={updatingFocus === vision.id}
            className="p-1 rounded-full hover:bg-muted transition-calm disabled:opacity-50"
            title={vision.is_focus ? "Remove from focus" : "Add to focus"}
          >
            <Star
              className={`h-5 w-5 transition-calm ${
                vision.is_focus 
                  ? "fill-primary text-primary" 
                  : "text-muted-foreground"
              }`}
            />
          </button>
          <ItemActions
            status={vision.status}
            onComplete={vision.status === "active" ? handleCompleteClick : undefined}
            onArchive={vision.status !== "archived" ? handleArchive : undefined}
            onRestore={vision.status === "archived" ? handleRestore : undefined}
            onReactivate={vision.status === "completed" ? handleReactivate : undefined}
            onDelete={handleDelete}
            onEdit={openEditDialog}
          />
        </div>
        {vision.description && (
          <p className="text-muted-foreground">{vision.description}</p>
        )}
      </div>

      {/* Edit Vision Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Vision</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Describe your vision..."
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="edit-status">Status</Label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as VisionStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
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

        {/* 3-Year Goals section */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">3-Year Goals for this Vision</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add 3-Year Goal
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="sr-only">Add 3-Year Goal</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 pt-2">
                {/* 1. Title - Primary input, larger and prominent */}
                <div className="pr-8">
                  <Label htmlFor="goal-title" className="sr-only">Goal Title</Label>
                  <Input
                    id="goal-title"
                    value={newGoalTitle}
                    onChange={(e) => setNewGoalTitle(e.target.value)}
                    placeholder="What do you want to achieve in 3 years?"
                    className="text-lg font-medium border-2 focus:border-primary h-12"
                    autoFocus
                  />
                </div>

                {/* 2. Description - Optional, only show after title has content */}
                {newGoalTitle.trim() && (
                  <div className="space-y-2">
                    <Label htmlFor="goal-description" className="text-sm text-muted-foreground">
                      Description <span className="text-xs">(optional)</span>
                    </Label>
                    <Textarea
                      id="goal-description"
                      value={newGoalDescription}
                      onChange={(e) => setNewGoalDescription(e.target.value)}
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
                    disabled={saving || !newGoalTitle.trim()}
                    className="w-full h-11"
                  >
                    {saving ? "Saving..." : "Create 3-Year Goal"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {threeYearGoals.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Target className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No 3-year goals yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add your first 3-year goal to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {threeYearGoals.map((goal) => (
              <Card key={goal.id} className="transition-calm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    {/* Goal content - clickable */}
                    <div 
                      className="flex-1 cursor-pointer"
                      onClick={() => navigate(`/goal/${goal.id}`)}
                    >
                      <h3 className="font-medium text-foreground">{goal.title}</h3>
                      {goal.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{goal.description}</p>
                      )}
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
        )}
        
      {/* Advanced Completion Dialog */}
      <AdvancedCompletionDialog
        open={completionDialogOpen}
        onOpenChange={setCompletionDialogOpen}
        itemType="vision"
        itemId={vision.id}
        itemTitle={vision.title}
        onConfirm={handleAdvancedComplete}
      />
    </div>
  );
};

export default VisionDetail;
