import { useState, useEffect } from "react";
import { Clock, X, Check, RefreshCw, Calendar, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTaskScheduling } from "@/hooks/useTaskScheduling";
import { toast } from "sonner";
import { format } from "date-fns";
import type { TaskType, RecurrenceType, DayOfWeek } from "@/types/scheduling";

/**
 * TaskDetailModal - Modal for viewing/editing task details
 * Uses the simplified recurrence model: none, daily, weekly
 */

interface TaskDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: {
    id: string;
    commitmentId: string | null;
    title: string;
    isCompleted: boolean;
    timeStart: string | null;
    timeEnd: string | null;
    taskType?: TaskType;
    instanceNumber?: number;
    totalInstances?: number;
    isDetached?: boolean;
  } | null;
  date: Date;
  onUpdate: () => void;
}

const DAYS_OF_WEEK: { value: DayOfWeek; label: string }[] = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const TaskDetailModal = ({
  open,
  onOpenChange,
  task,
  date,
  onUpdate,
}: TaskDetailModalProps) => {
  const { user } = useAuth();
  const { convertToRecurring, detachInstance, updateRecurrenceRules } =
    useTaskScheduling();

  const [title, setTitle] = useState("");
  const [timeStart, setTimeStart] = useState<string>("");
  const [timeEnd, setTimeEnd] = useState<string>("");
  const [isCompleted, setIsCompleted] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("none");
  const [timesPerDay, setTimesPerDay] = useState("1");
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [showRepetitionEditor, setShowRepetitionEditor] = useState(false);
  const [saving, setSaving] = useState(false);

  const dateKey = format(date, "yyyy-MM-dd");

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setTimeStart(task.timeStart || "");
      setTimeEnd(task.timeEnd || "");
      setIsCompleted(task.isCompleted);
      setShowRepetitionEditor(false);

      // Fetch recurrence rules if recurring
      if (task.commitmentId) {
        fetchRecurrenceRules(task.commitmentId);
      } else {
        setRecurrenceType("none");
      }
    }
  }, [task]);

  const fetchRecurrenceRules = async (commitmentId: string) => {
    const { data } = await supabase
      .from("weekly_commitments")
      .select("recurrence_type, times_per_day, repeat_days_of_week")
      .eq("id", commitmentId)
      .maybeSingle();

    if (data) {
      setRecurrenceType((data.recurrence_type as RecurrenceType) || "weekly");
      setTimesPerDay((data.times_per_day || 1).toString());
      setSelectedDays((data.repeat_days_of_week as DayOfWeek[]) || []);
    }
  };

  const handleDayToggle = (day: DayOfWeek) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSave = async () => {
    if (!user || !task) return;
    setSaving(true);

    try {
      const isRecurring = task.commitmentId !== null;

      if (isRecurring && task.commitmentId) {
        // Update default times on the weekly commitment
        await supabase
          .from("weekly_commitments")
          .update({
            title,
            default_time_start: timeStart || null,
            default_time_end: timeEnd || null,
            flexible_time: !timeStart,
          })
          .eq("id", task.commitmentId);

        // Update recurrence rules if changed
        if (showRepetitionEditor) {
          await updateRecurrenceRules(task.commitmentId, {
            recurrenceType,
            timesPerDay: recurrenceType === "daily" ? parseInt(timesPerDay) || 1 : undefined,
            daysOfWeek: recurrenceType === "weekly" ? selectedDays : undefined,
          });
        }
      }

      // Handle completion status
      const { data: existingCompletion } = await supabase
        .from("commitment_completions")
        .select("*")
        .eq(isRecurring ? "commitment_id" : "id", isRecurring ? task.commitmentId : task.id.split("-")[0])
        .eq("completed_date", dateKey)
        .maybeSingle();

      if (isCompleted && !existingCompletion && isRecurring) {
        // Create completion record for recurring task
        await supabase.from("commitment_completions").insert({
          user_id: user.id,
          commitment_id: task.commitmentId,
          completed_date: dateKey,
          time_start: timeStart || null,
          time_end: timeEnd || null,
          is_flexible_time: !timeStart,
          task_type: "recurring",
        });

        // Update weekly checkin actual_count
        await updateCheckinCount(task.commitmentId!, 1);
      } else if (!isCompleted && existingCompletion && isRecurring) {
        // Remove completion record
        await supabase
          .from("commitment_completions")
          .delete()
          .eq("id", existingCompletion.id);

        // Update weekly checkin actual_count
        await updateCheckinCount(task.commitmentId!, -1);
      } else if (existingCompletion) {
        // Update existing completion (time, title for independent)
        await supabase
          .from("commitment_completions")
          .update({
            title: !isRecurring ? title : undefined,
            time_start: timeStart || null,
            time_end: timeEnd || null,
            is_flexible_time: !timeStart,
          })
          .eq("id", existingCompletion.id);
      } else if (!isRecurring && !existingCompletion) {
        // Independent task - just update it
        const taskIdParts = task.id.split("-");
        const actualId = taskIdParts[0];
        
        await supabase
          .from("commitment_completions")
          .update({
            title,
            time_start: timeStart || null,
            time_end: timeEnd || null,
            is_flexible_time: !timeStart,
          })
          .eq("id", actualId);
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

  const updateCheckinCount = async (commitmentId: string, delta: number) => {
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay() + 1);
    const weekStartStr = format(weekStart, "yyyy-MM-dd");

    const { data: checkin } = await supabase
      .from("weekly_checkins")
      .select("id, actual_count")
      .eq("weekly_commitment_id", commitmentId)
      .eq("period_start_date", weekStartStr)
      .maybeSingle();

    if (checkin) {
      await supabase
        .from("weekly_checkins")
        .update({ actual_count: Math.max(0, checkin.actual_count + delta) })
        .eq("id", checkin.id);
    }
  };

  /**
   * Handle detaching this instance from recurring series (only affects this day)
   */
  const handleDetachInstance = async () => {
    if (!user || !task || !task.commitmentId) return;
    setSaving(true);

    try {
      await detachInstance(task.commitmentId, dateKey);
      toast.success("This day is now independent from the recurring series");
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error detaching instance:", error);
      toast.error("Failed to detach instance");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Handle converting task type (full conversion - deactivates series)
   */
  const handleConvertTaskType = async () => {
    if (!user || !task) return;
    setSaving(true);

    try {
      const isCurrentlyRecurring = task.commitmentId !== null && !task.isDetached;
      
      if (isCurrentlyRecurring && task.commitmentId) {
        // For recurring tasks, use detachInstance
        await detachInstance(task.commitmentId, dateKey);
        toast.success("This day is now independent");
      } else {
        // Convert independent to recurring - need recurrence rules first
        if (!showRepetitionEditor) {
          // Show the recurrence editor first so user can configure rules
          setShowRepetitionEditor(true);
          setRecurrenceType("weekly");
          setSaving(false);
          return;
        }
        
        // Validate weekly recurrence has days selected
        if (recurrenceType === "weekly" && selectedDays.length === 0) {
          toast.error("Please select at least one day for weekly recurrence");
          setSaving(false);
          return;
        }
        
        // Now actually convert with the configured rules
        const taskIdParts = task.id.split("-");
        const actualId = taskIdParts[0];
        
        await convertToRecurring(actualId, {
          recurrenceType,
          timesPerDay: recurrenceType === "daily" ? parseInt(timesPerDay) || 1 : undefined,
          daysOfWeek: recurrenceType === "weekly" ? selectedDays : undefined,
        });
        toast.success("Converted to recurring task");
      }

      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error converting task:", error);
      toast.error("Failed to convert task type");
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

  /**
   * Handle deleting the task (soft delete)
   */
  const handleDelete = async () => {
    if (!user || !task) return;
    setSaving(true);

    try {
      const isRecurringTask = task.commitmentId !== null && !task.isDetached;

      if (isRecurringTask && task.commitmentId) {
        // For recurring tasks, soft delete the weekly commitment
        await supabase
          .from("weekly_commitments")
          .update({ is_deleted: true, deleted_at: new Date().toISOString() })
          .eq("id", task.commitmentId);
        
        toast.success("Recurring task deleted");
      } else {
        // For independent/detached tasks, soft delete the completion record
        const taskIdParts = task.id.split("-");
        const actualId = taskIdParts[0];
        
        await supabase
          .from("commitment_completions")
          .update({ is_deleted: true, deleted_at: new Date().toISOString() })
          .eq("id", actualId);
        
        toast.success("Task deleted");
      }

      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error deleting task:", error);
      toast.error("Failed to delete task");
    } finally {
      setSaving(false);
    }
  };

  if (!task) return null;

  const isRecurring = task.commitmentId !== null && !task.isDetached;
  const isDetached = task.isDetached || false;
  const instanceLabel =
    task.instanceNumber && task.totalInstances && task.totalInstances > 1
      ? ` (${task.instanceNumber}/${task.totalInstances})`
      : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-medium flex items-center gap-2">
            {isRecurring ? (
              <RefreshCw className="h-4 w-4 text-primary" />
            ) : (
              <Calendar className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="truncate">
              {task.title}
              {instanceLabel}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Date display */}
          <div className="text-sm text-muted-foreground">
            {format(date, "EEEE, MMMM d, yyyy")}
          </div>

          {/* Title edit */}
          <div>
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1"
            />
          </div>

          {/* Task type indicator and actions */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`px-2 py-0.5 rounded ${
                  isRecurring
                    ? "bg-primary/10 text-primary"
                    : isDetached
                    ? "bg-amber-100 text-amber-700"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isRecurring ? "Recurring" : isDetached ? "Detached" : "One-time"}
              </span>
            </div>
            
            {/* Detach button for recurring tasks (only affects this day) */}
            {isRecurring && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDetachInstance}
                disabled={saving}
                className="w-full text-xs"
              >
                {saving ? "Detaching..." : "Detach this day from series"}
              </Button>
            )}

            {/* Convert to recurring for independent tasks */}
            {!isRecurring && !isDetached && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleConvertTaskType}
                disabled={saving}
                className="w-full text-xs"
              >
                {saving ? "Converting..." : "Convert to recurring"}
              </Button>
            )}

            {/* Info for detached tasks */}
            {isDetached && (
              <p className="text-xs text-muted-foreground">
                This day was detached from a recurring series. Changes only affect this day.
              </p>
            )}
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

          {/* Recurrence rules (for recurring or when converting) */}
          {showRepetitionEditor && (
            <div className="space-y-3 border-t border-border pt-4">
              <Label className="text-sm font-medium">Recurrence Rules</Label>

              {/* Recurrence Type */}
              <RadioGroup
                value={recurrenceType}
                onValueChange={(val) => setRecurrenceType(val as RecurrenceType)}
                className="flex flex-col gap-3"
              >
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="daily" id="edit-recurrence-daily" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="edit-recurrence-daily" className="font-normal cursor-pointer">
                      Daily
                    </Label>
                    {recurrenceType === "daily" && (
                      <div className="mt-2 flex items-center gap-2">
                        <Label className="text-xs whitespace-nowrap">Times per day:</Label>
                        <Select value={timesPerDay} onValueChange={setTimesPerDay}>
                          <SelectTrigger className="w-16 h-7">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <SelectItem key={n} value={n.toString()}>
                                {n}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="weekly" id="edit-recurrence-weekly" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="edit-recurrence-weekly" className="font-normal cursor-pointer">
                      Weekly on specific days
                    </Label>
                    {recurrenceType === "weekly" && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {DAYS_OF_WEEK.map((day) => (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => handleDayToggle(day.value)}
                            className={`
                              px-2 py-1 text-xs rounded border transition-colors
                              ${selectedDays.includes(day.value)
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border hover:bg-muted"
                              }
                            `}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </RadioGroup>

              {/* Apply conversion button */}
              {!isRecurring && (
                <Button
                  variant="outline"
                  onClick={handleConvertTaskType}
                  disabled={saving}
                  className="w-full"
                >
                  Convert to Recurring
                </Button>
              )}
            </div>
          )}

          {/* Edit repetition toggle for existing recurring tasks */}
          {isRecurring && !showRepetitionEditor && (
            <button
              onClick={() => setShowRepetitionEditor(true)}
              className="text-xs text-primary hover:underline"
            >
              Edit recurrence rules
            </button>
          )}

          {/* Save button */}
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save"}
          </Button>

          {/* Delete button */}
          <Button
            variant="ghost"
            onClick={handleDelete}
            disabled={saving}
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete task
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDetailModal;
