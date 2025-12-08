import { useState, useEffect } from "react";
import { Clock, X, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";

/**
 * TaskDetailModal - Modal for viewing/editing task time scheduling
 * Allows users to assign time slots and mark tasks as complete
 */

interface TaskDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: {
    id: string;
    commitmentId: string;
    title: string;
    isCompleted: boolean;
    timeStart: string | null;
    timeEnd: string | null;
  } | null;
  date: Date;
  onUpdate: () => void;
}

const TaskDetailModal = ({
  open,
  onOpenChange,
  task,
  date,
  onUpdate,
}: TaskDetailModalProps) => {
  const { user } = useAuth();
  const [timeStart, setTimeStart] = useState<string>("");
  const [timeEnd, setTimeEnd] = useState<string>("");
  const [isCompleted, setIsCompleted] = useState(false);
  const [saving, setSaving] = useState(false);

  const dateKey = format(date, "yyyy-MM-dd");

  useEffect(() => {
    if (task) {
      setTimeStart(task.timeStart || "");
      setTimeEnd(task.timeEnd || "");
      setIsCompleted(task.isCompleted);
    }
  }, [task]);

  const handleSave = async () => {
    if (!user || !task) return;
    setSaving(true);

    try {
      // Update default times on the weekly commitment
      await supabase
        .from("weekly_commitments")
        .update({
          default_time_start: timeStart || null,
          default_time_end: timeEnd || null,
          flexible_time: !timeStart,
        })
        .eq("id", task.commitmentId);

      // Handle completion status separately
      const { data: existingCompletion } = await supabase
        .from("commitment_completions")
        .select("*")
        .eq("commitment_id", task.commitmentId)
        .eq("completed_date", dateKey)
        .maybeSingle();

      if (isCompleted && !existingCompletion) {
        // Create completion record
        await supabase.from("commitment_completions").insert({
          user_id: user.id,
          commitment_id: task.commitmentId,
          completed_date: dateKey,
          time_start: timeStart || null,
          time_end: timeEnd || null,
          is_flexible_time: !timeStart,
        });

        // Update weekly checkin actual_count
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay() + 1);
        const weekStartStr = format(weekStart, "yyyy-MM-dd");
        
        const { data: checkin } = await supabase
          .from("weekly_checkins")
          .select("id, actual_count")
          .eq("weekly_commitment_id", task.commitmentId)
          .eq("period_start_date", weekStartStr)
          .maybeSingle();

        if (checkin) {
          await supabase
            .from("weekly_checkins")
            .update({ actual_count: checkin.actual_count + 1 })
            .eq("id", checkin.id);
        }
      } else if (!isCompleted && existingCompletion) {
        // Remove completion record
        await supabase
          .from("commitment_completions")
          .delete()
          .eq("id", existingCompletion.id);

        // Update weekly checkin actual_count
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay() + 1);
        const weekStartStr = format(weekStart, "yyyy-MM-dd");
        
        const { data: checkin } = await supabase
          .from("weekly_checkins")
          .select("id, actual_count")
          .eq("weekly_commitment_id", task.commitmentId)
          .eq("period_start_date", weekStartStr)
          .maybeSingle();

        if (checkin) {
          await supabase
            .from("weekly_checkins")
            .update({ actual_count: Math.max(0, checkin.actual_count - 1) })
            .eq("id", checkin.id);
        }
      } else if (existingCompletion) {
        // Just update time on existing completion
        await supabase
          .from("commitment_completions")
          .update({
            time_start: timeStart || null,
            time_end: timeEnd || null,
            is_flexible_time: !timeStart,
          })
          .eq("id", existingCompletion.id);
      }

      toast.success("Task updated");
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving task:", error);
      toast.error("Failed to update task");
    } finally {
      setSaving(false);
    }
  };

  const handleClearTime = () => {
    setTimeStart("");
    setTimeEnd("");
  };

  const handleToggleComplete = () => {
    setIsCompleted(!isCompleted);
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">{task.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Date display */}
          <div className="text-sm text-muted-foreground">
            {format(date, "EEEE, MMMM d, yyyy")}
          </div>

          {/* Completion toggle */}
          <button
            onClick={handleToggleComplete}
            className={`w-full flex items-center gap-3 p-3 border rounded transition-calm ${
              isCompleted
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-primary/50"
            }`}
          >
            <span className="text-lg">{isCompleted ? "●" : "○"}</span>
            <span className="text-sm">
              {isCompleted ? "Completed" : "Mark as complete"}
            </span>
            {isCompleted && <Check className="h-4 w-4 ml-auto" />}
          </button>

          {/* Time scheduling */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Schedule time</span>
            </div>

            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <Label htmlFor="time-start" className="text-xs text-muted-foreground">
                  Start
                </Label>
                <Input
                  id="time-start"
                  type="time"
                  value={timeStart}
                  onChange={(e) => setTimeStart(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="time-end" className="text-xs text-muted-foreground">
                  End
                </Label>
                <Input
                  id="time-end"
                  type="time"
                  value={timeEnd}
                  onChange={(e) => setTimeEnd(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            {(timeStart || timeEnd) && (
              <button
                onClick={handleClearTime}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="h-3 w-3" />
                Clear time
              </button>
            )}
          </div>

          {/* Save button */}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full"
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDetailModal;
