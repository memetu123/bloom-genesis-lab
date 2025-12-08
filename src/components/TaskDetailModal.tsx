import { useState, useEffect } from "react";
import { Clock, X, Check, RefreshCw, Calendar } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTaskScheduling } from "@/hooks/useTaskScheduling";
import { toast } from "sonner";
import { format } from "date-fns";
import type { TaskType, RepeatFrequency, DayOfWeek } from "@/types/scheduling";

/**
 * TaskDetailModal - Modal for viewing/editing task details
 * Supports editing time, completion status, task type, and repetition rules
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
  const { convertToRecurring, convertToIndependent, updateRepetitionRules } =
    useTaskScheduling();

  const [title, setTitle] = useState("");
  const [timeStart, setTimeStart] = useState<string>("");
  const [timeEnd, setTimeEnd] = useState<string>("");
  const [isCompleted, setIsCompleted] = useState(false);
  const [taskType, setTaskType] = useState<TaskType>("recurring");
  const [frequency, setFrequency] = useState<RepeatFrequency>("weekly");
  const [timesPerPeriod, setTimesPerPeriod] = useState("3");
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
      setTaskType(task.taskType || (task.commitmentId ? "recurring" : "independent"));
      setShowRepetitionEditor(false);

      // Fetch repetition rules if recurring
      if (task.commitmentId) {
        fetchRepetitionRules(task.commitmentId);
      }
    }
  }, [task]);

  const fetchRepetitionRules = async (commitmentId: string) => {
    const { data } = await supabase
      .from("weekly_commitments")
      .select("repeat_frequency, repeat_times_per_period, repeat_days_of_week")
      .eq("id", commitmentId)
      .maybeSingle();

    if (data) {
      setFrequency((data.repeat_frequency as RepeatFrequency) || "weekly");
      setTimesPerPeriod((data.repeat_times_per_period || 3).toString());
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

        // Update repetition rules if changed
        if (showRepetitionEditor) {
          await updateRepetitionRules(task.commitmentId, {
            frequency,
            timesPerPeriod: parseInt(timesPerPeriod) || 1,
            daysOfWeek: frequency === "custom" ? selectedDays : [],
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

  const handleConvertTaskType = async () => {
    if (!user || !task) return;
    setSaving(true);

    try {
      const isCurrentlyRecurring = task.commitmentId !== null;
      
      if (isCurrentlyRecurring && task.commitmentId) {
        // Convert recurring to independent
        await convertToIndependent(task.commitmentId, dateKey);
        toast.success("Converted to one-time task");
      } else {
        // Convert independent to recurring - need repetition rules first
        if (!showRepetitionEditor) {
          // Show the repetition editor first so user can configure rules
          setShowRepetitionEditor(true);
          setSaving(false);
          return;
        }
        
        // Now actually convert with the configured rules
        const taskIdParts = task.id.split("-");
        const actualId = taskIdParts[0];
        
        await convertToRecurring(actualId, {
          frequency,
          timesPerPeriod: parseInt(timesPerPeriod) || 1,
          daysOfWeek: frequency === "custom" ? selectedDays : [],
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

  if (!task) return null;

  const isRecurring = task.commitmentId !== null;
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

          {/* Title edit (for independent tasks) */}
          {!isRecurring && (
            <div>
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1"
              />
            </div>
          )}

          {/* Task type indicator and conversion */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`px-2 py-0.5 rounded ${
                  isRecurring
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isRecurring ? "Recurring" : "One-time"}
              </span>
            </div>
            
            {/* Convert button - direct action */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleConvertTaskType}
              disabled={saving}
              className="w-full text-xs"
            >
              {saving ? "Converting..." : `Convert to ${isRecurring ? "one-time" : "recurring"}`}
            </Button>
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

          {/* Repetition rules (for recurring or when converting) */}
          {(isRecurring || showRepetitionEditor) && showRepetitionEditor && (
            <div className="space-y-3 border-t border-border pt-4">
              <Label className="text-sm font-medium">Repetition Rules</Label>

              {/* Frequency */}
              <RadioGroup
                value={frequency}
                onValueChange={(val) => setFrequency(val as RepeatFrequency)}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="daily" id="edit-freq-daily" />
                  <Label htmlFor="edit-freq-daily" className="font-normal cursor-pointer">
                    Daily
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="weekly" id="edit-freq-weekly" />
                  <Label htmlFor="edit-freq-weekly" className="font-normal cursor-pointer">
                    Weekly
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="edit-freq-custom" />
                  <Label htmlFor="edit-freq-custom" className="font-normal cursor-pointer">
                    Custom days
                  </Label>
                </div>
              </RadioGroup>

              {/* Times per period */}
              <div>
                <Label className="text-xs text-muted-foreground">
                  {frequency === "daily" ? "Times per day" : "Times per week"}
                </Label>
                <Select value={timesPerPeriod} onValueChange={setTimesPerPeriod}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <SelectItem key={n} value={n.toString()}>
                        {n}×
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Custom days */}
              {frequency === "custom" && (
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <div key={day.value} className="flex items-center space-x-1">
                      <Checkbox
                        id={`edit-day-${day.value}`}
                        checked={selectedDays.includes(day.value)}
                        onCheckedChange={() => handleDayToggle(day.value)}
                      />
                      <Label
                        htmlFor={`edit-day-${day.value}`}
                        className="text-xs font-normal cursor-pointer"
                      >
                        {day.label}
                      </Label>
                    </div>
                  ))}
                </div>
              )}

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
              Edit repetition rules
            </button>
          )}

          {/* Save button */}
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDetailModal;
