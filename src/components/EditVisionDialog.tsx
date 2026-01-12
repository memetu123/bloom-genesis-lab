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

/**
 * EditVisionDialog - Reusable dialog for editing vision title, description, and status
 */

type VisionStatus = "active" | "completed" | "archived";

interface EditVisionDialogProps {
  vision: {
    id: string;
    title: string;
    description?: string | null;
    status: string;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (updatedVision: { id: string; title: string; description: string | null; status: VisionStatus }) => void;
}

const EditVisionDialog = ({ vision, open, onOpenChange, onSaved }: EditVisionDialogProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<VisionStatus>("active");
  const [saving, setSaving] = useState(false);

  // Initialize form when vision changes or dialog opens
  useEffect(() => {
    if (vision && open) {
      setTitle(vision.title);
      setDescription(vision.description || "");
      setStatus((vision.status as VisionStatus) || "active");
    }
  }, [vision, open]);

  const handleSave = async () => {
    if (!vision || !title.trim()) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from("life_visions")
        .update({
          title: title.trim(),
          description: description.trim() || null,
          status: status,
        })
        .eq("id", vision.id);

      if (error) throw error;

      onSaved({
        id: vision.id,
        title: title.trim(),
        description: description.trim() || null,
        status: status,
      });

      onOpenChange(false);
      toast.success("Vision updated");
    } catch (error) {
      console.error("Error updating vision:", error);
      toast.error("Failed to update vision");
    } finally {
      setSaving(false);
    }
  };

  if (!vision) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Vision</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {/* Title - prominent at top */}
          <div>
            <Label htmlFor="edit-vision-title">Title</Label>
            <Input
              id="edit-vision-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter vision title..."
              className="text-lg font-medium mt-1"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="edit-vision-description">Description</Label>
            <Textarea
              id="edit-vision-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your vision..."
              rows={3}
              className="mt-1"
            />
          </div>

          {/* Status */}
          <div>
            <Label htmlFor="edit-vision-status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as VisionStatus)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
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

export default EditVisionDialog;
