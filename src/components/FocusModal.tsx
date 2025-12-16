import { useState } from "react";
import { Star, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAppData, Vision } from "@/hooks/useAppData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FocusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const FocusModal = ({ open, onOpenChange }: FocusModalProps) => {
  const navigate = useNavigate();
  const { visions, pillarsMap, refetchVisions } = useAppData();
  const [updating, setUpdating] = useState<string | null>(null);

  // Filter to active visions only
  const activeVisions = visions.filter(v => v.status === "active");

  const handleToggleFocus = async (vision: Vision) => {
    setUpdating(vision.id);
    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ is_focus: !vision.is_focus })
        .eq("id", vision.id);

      if (error) throw error;
      await refetchVisions();
    } catch (err) {
      console.error("Error toggling focus:", err);
      toast.error("Failed to update focus");
    } finally {
      setUpdating(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" />
            Set your focus
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {activeVisions.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground mb-4">
                No visions yet. Create one to get started.
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  // The Dashboard will handle vision creation
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add a vision
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {activeVisions.map((vision) => (
                <div
                  key={vision.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-muted hover:border-muted-foreground/20 transition-colors"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">
                      {pillarsMap.get(vision.pillar_id)?.name || ""}
                    </span>
                    <p className="text-sm font-medium text-foreground truncate">
                      {vision.title}
                    </p>
                  </div>
                  <Switch
                    checked={vision.is_focus}
                    onCheckedChange={() => handleToggleFocus(vision)}
                    disabled={updating === vision.id}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-muted">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
