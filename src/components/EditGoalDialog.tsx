import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { GoalType } from "@/types/todayoum";

/**
 * EditGoalDialog - Reusable dialog for editing goal title, description, and status
 */

type GoalStatus = "active" | "completed" | "archived" | "not_started" | "in_progress" | "paused";

interface EditGoalDialogProps {
  goal: {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    goal_type: GoalType;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (updatedGoal: { id: string; title: string; description: string | null; status: GoalStatus }) => void;
}

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  three_year: "3-Year Goal",
  one_year: "1-Year Goal",
  ninety_day: "90-Day Plan",
};

const EditGoalDialog = ({ goal, open, onOpenChange, onSaved }: EditGoalDialogProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<GoalStatus>("active");
  const [saving, setSaving] = useState(false);

  // Initialize form when goal changes or dialog opens
  useEffect(() => {
    if (goal && open) {
      setTitle(goal.title);
      setDescription(goal.description || "");
      setStatus((goal.status as GoalStatus) || "active");
    }
  }, [goal, open]);

  const handleSave = async () => {
    if (!goal || !title.trim()) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from("goals")
        .update({
          title: title.trim(),
          description: description.trim() || null,
          status: status,
        })
        .eq("id", goal.id);

      if (error) throw error;

      onSaved({
        id: goal.id,
        title: title.trim(),
        description: description.trim() || null,
        status: status,
      });

      onOpenChange(false);
      toast.success("Goal updated");
    } catch (error) {
      console.error("Error updating goal:", error);
      toast.error("Failed to update goal");
    } finally {
      setSaving(false);
    }
  };

  if (!goal) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {GOAL_TYPE_LABELS[goal.goal_type]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {/* Title - prominent at top */}
          <div>
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter title..."
              className="text-lg font-medium mt-1"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details..."
              rows={3}
              className="mt-1"
            />
          </div>

          {/* Status */}
          <div>
            <Label htmlFor="edit-status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as GoalStatus)}>
              <SelectTrigger className="mt-1">
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

          {/* Save button */}
          <Button 
            onClick={handleSave} 
            disabled={saving || !title.trim()} 
            className="w-full"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditGoalDialog;
