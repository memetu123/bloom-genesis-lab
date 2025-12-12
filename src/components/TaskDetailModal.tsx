import { useState, useEffect } from "react";
import { Clock, RefreshCw, Calendar, Trash2, Unlink, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
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
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { formatDateWithDay } from "@/lib/formatPreferences";
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
  const { preferences } = useUserPreferences();
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
  const [justCompleted, setJustCompleted] = useState(false);

  const dateKey = format(date, "yyyy-MM-dd");

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setTimeStart(task.timeStart || "");
      setTimeEnd(task.timeEnd || "");
      setIsCompleted(task.isCompleted);
      setShowRepetitionEditor(false);
      setJustCompleted(false);

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
    const newValue = !isCompleted;
    setIsCompleted(newValue);
    if (newValue) {
      setJustCompleted(true);
      setTimeout(() => setJustCompleted(false), 600);
    }
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
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden rounded-xl border-border/50">
        {/* Header - Simple "Edit task" with date, no borders */}
        <div className="px-5 pt-5 pb-2">
          <h2 className="text-base font-semibold text-foreground">Edit task</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDateWithDay(date, preferences.dateFormat)}
          </p>
        </div>

        <div className="px-5 pb-5 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* 1. Task Title - single input, thin border, no wrapper */}
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            className="h-10 text-sm border border-border/50 rounded-lg bg-transparent focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
          />

          {/* 2. Mark as Complete - inline row, no border/background/container */}
          <button
            onClick={handleToggleComplete}
            className="flex items-center gap-2.5 py-1 hover:opacity-80 transition-opacity"
          >
            <div className={`
              w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center transition-all duration-200
              ${isCompleted
                ? "bg-primary border-primary"
                : "border-muted-foreground/40"
              }
            `}>
              {isCompleted && (
                <Check className={`h-3 w-3 text-primary-foreground ${justCompleted ? "animate-scale-in" : ""}`} />
              )}
            </div>
            <span className={`text-sm ${isCompleted ? "text-primary font-medium" : "text-foreground/70"}`}>
              Mark as complete
            </span>
          </button>

          {/* 3. Recurrence - ONLY section with soft container */}
          <div className="p-3 bg-muted/30 rounded-lg space-y-2">
            {/* Top row: badge + edit link */}
            <div className="flex items-center justify-between">
              <span
                className={`
                  inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium
                  ${isRecurring
                    ? "bg-primary/15 text-primary"
                    : isDetached
                    ? "bg-amber-100 text-amber-700"
                    : "bg-muted text-muted-foreground"
                  }
                `}
              >
                {isRecurring && <RefreshCw className="h-2.5 w-2.5" />}
                {isDetached && <Unlink className="h-2.5 w-2.5" />}
                {isRecurring ? "Recurring" : isDetached ? "Detached" : "One-time"}
              </span>

              {isRecurring && !showRepetitionEditor && (
                <button
                  onClick={() => setShowRepetitionEditor(true)}
                  className="text-[11px] text-primary/70 hover:text-primary hover:underline transition-colors"
                >
                  Edit rules
                </button>
              )}
            </div>

            {/* Detach toggle row */}
            {isRecurring && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground/80">Detach this instance</span>
                <Switch
                  id="detach-toggle"
                  checked={false}
                  onCheckedChange={handleDetachInstance}
                  disabled={saving}
                  className="scale-90"
                />
              </div>
            )}

            {/* Convert to recurring for independent tasks */}
            {!isRecurring && !isDetached && (
              <button
                onClick={handleConvertTaskType}
                disabled={saving}
                className="text-xs text-primary/70 hover:text-primary hover:underline disabled:opacity-50 transition-colors"
              >
                {saving ? "Converting..." : "Convert to recurring"}
              </button>
            )}

            {/* Info for detached tasks */}
            {isDetached && (
              <p className="text-[11px] text-muted-foreground">
                Changes only affect this day.
              </p>
            )}

            {/* Recurrence rules editor */}
            {showRepetitionEditor && (
              <div className="space-y-3 pt-2 border-t border-border/30">
                <RadioGroup
                  value={recurrenceType}
                  onValueChange={(val) => setRecurrenceType(val as RecurrenceType)}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="daily" id="edit-recurrence-daily" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="edit-recurrence-daily" className="font-normal cursor-pointer text-sm">
                        Daily
                      </Label>
                      {recurrenceType === "daily" && (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">Times/day:</span>
                          <Select value={timesPerDay} onValueChange={setTimesPerDay}>
                            <SelectTrigger className="w-14 h-7 text-xs rounded-md">
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
                      <Label htmlFor="edit-recurrence-weekly" className="font-normal cursor-pointer text-sm">
                        Weekly
                      </Label>
                      {recurrenceType === "weekly" && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {DAYS_OF_WEEK.map((day) => (
                            <button
                              key={day.value}
                              type="button"
                              onClick={() => handleDayToggle(day.value)}
                              className={`
                                px-2 py-0.5 text-[11px] rounded-md border transition-colors
                                ${selectedDays.includes(day.value)
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-background border-border/50 hover:bg-muted"
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

                {!isRecurring && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleConvertTaskType}
                    disabled={saving}
                    className="w-full h-8 text-xs rounded-md"
                  >
                    Convert to Recurring
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* 4. Schedule Time - flat layout, no container */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium flex items-center gap-1">
                <Clock className="h-3 w-3 opacity-40" />
                Schedule time
              </span>
              {(timeStart || timeEnd) && (
                <button
                  onClick={handleClearTime}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Label htmlFor="time-start" className="text-xs font-medium text-foreground/70 mb-1 block">
                  Start
                </Label>
                <Input
                  id="time-start"
                  type="time"
                  value={timeStart}
                  onChange={(e) => setTimeStart(e.target.value)}
                  className="h-9 text-sm border-border/50 rounded-lg focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="time-end" className="text-xs font-medium text-foreground/70 mb-1 block">
                  End
                </Label>
                <Input
                  id="time-end"
                  type="time"
                  value={timeEnd}
                  onChange={(e) => setTimeEnd(e.target.value)}
                  className="h-9 text-sm border-border/50 rounded-lg focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Actions - Save primary, Delete as text link */}
        <div className="px-5 pb-5 pt-3 space-y-3">
          <Button onClick={handleSave} disabled={saving} className="w-full h-10 rounded-lg font-medium">
            {saving ? "Saving..." : "Save changes"}
          </Button>

          <button
            onClick={handleDelete}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 py-1 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            <span>Delete task</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDetailModal;
