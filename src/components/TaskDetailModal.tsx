import { useState, useEffect, useMemo } from "react";
import { Clock, RefreshCw, Calendar, Trash2, Unlink, Check, ChevronDown, ChevronRight, Archive } from "lucide-react";
import {
  Dialog,
  DialogContent,
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
import { useAppData, Goal } from "@/hooks/useAppData";
import { formatDateWithDay } from "@/lib/formatPreferences";
import { toast } from "sonner";
import { format } from "date-fns";
import type { TaskType, RecurrenceType, DayOfWeek } from "@/types/scheduling";
import RecurringEditConfirmDialog from "@/components/RecurringEditConfirmDialog";
import RecurringDeleteConfirmDialog from "@/components/RecurringDeleteConfirmDialog";
import RecurringArchiveConfirmDialog from "@/components/RecurringArchiveConfirmDialog";

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
  const { preferences, goals: allGoals, visionsMap } = useAppData();
  const { convertToRecurring, updateRecurrenceRules, createOccurrenceException, splitRecurringSeries, deleteOccurrence, deleteFutureOccurrences, deleteEntireSeries } =
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
  const [goalId, setGoalId] = useState<string>("");
  const [originalGoalId, setOriginalGoalId] = useState<string>("");
  const [relatedExpanded, setRelatedExpanded] = useState(false);
  const [notes, setNotes] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [scheduledDate, setScheduledDate] = useState<string>(""); // For independent/detached tasks
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [timeError, setTimeError] = useState("");

  // Store original values to detect changes
  const [originalValues, setOriginalValues] = useState<{
    title: string;
    timeStart: string;
    timeEnd: string;
    recurrenceType: RecurrenceType;
    timesPerDay: string;
    selectedDays: DayOfWeek[];
    goalId: string;
  } | null>(null);

  const dateKey = format(date, "yyyy-MM-dd");

  // Get filtered and sorted 90-day plans for "Related to" section
  const relatedGoals = (() => {
    // Filter to active 90-day plans only, excluding plans from deleted visions
    let filtered = allGoals.filter((g) => {
      // Skip deleted, archived, or completed plans
      if (g.is_deleted || g.status === "archived" || g.status === "completed") return false;
      // Only include 90-day plans
      if (g.goal_type !== "ninety_day") return false;
      // Skip plans belonging to deleted visions (vision not in map means it was deleted)
      if (g.life_vision_id && !visionsMap.has(g.life_vision_id)) return false;
      return true;
    });
    // Sort alphabetically
    return filtered.sort((a, b) => a.title.localeCompare(b.title));
  })();

  const getVisionContext = (goal: Goal): string | null => {
    if (!goal.life_vision_id) return null;
    const vision = visionsMap.get(goal.life_vision_id);
    return vision?.title || null;
  };

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setTimeStart(task.timeStart || "");
      setTimeEnd(task.timeEnd || "");
      setIsCompleted(task.isCompleted);
      setShowRepetitionEditor(false);
      setJustCompleted(false);
      setRelatedExpanded(false);
      setGoalId("");
      setOriginalGoalId("");
      setNotes("");
      setStartDate("");
      setEndDate("");
      setScheduledDate(format(date, "yyyy-MM-dd")); // Initialize with the task's date
      setShowConfirmDialog(false);
      setShowDeleteDialog(false);
      setShowArchiveDialog(false);
      setOriginalValues(null);
      setTimeError("");

      // Fetch notes and other data
      fetchTaskNotes(task);

      // Fetch recurrence rules and goal if recurring
      if (task.commitmentId) {
        fetchRecurrenceRulesAndGoal(task.commitmentId);
      } else {
        setRecurrenceType("none");
        // For independent tasks, check if there's a linked weekly_commitment
        fetchIndependentTaskGoal(task.id);
      }
    }
  }, [task]);

  const fetchTaskNotes = async (task: NonNullable<TaskDetailModalProps['task']>) => {
    // Fetch notes from the completion record for this date
    const isRecurring = task.commitmentId !== null;
    
    if (isRecurring && task.commitmentId) {
      // For recurring tasks, check if there's a completion for this date
      const { data: completion } = await supabase
        .from("commitment_completions")
        .select("notes")
        .eq("commitment_id", task.commitmentId)
        .eq("completed_date", dateKey)
        .maybeSingle();
      
      if (completion?.notes) {
        setNotes(completion.notes);
      }
    } else {
      // For independent tasks, fetch from the completion record directly
      const parts = task.id.split("-");
      const actualId = parts.length === 5 ? task.id : parts.slice(0, 5).join("-");
      
      const { data: completion } = await supabase
        .from("commitment_completions")
        .select("notes")
        .eq("id", actualId)
        .maybeSingle();
      
      if (completion?.notes) {
        setNotes(completion.notes);
      }
    }
  };

  const fetchRecurrenceRulesAndGoal = async (commitmentId: string) => {
    const { data } = await supabase
      .from("weekly_commitments")
      .select("recurrence_type, times_per_day, repeat_days_of_week, goal_id, start_date, end_date, title, default_time_start, default_time_end")
      .eq("id", commitmentId)
      .maybeSingle();

    if (data) {
      const recType = (data.recurrence_type as RecurrenceType) || "weekly";
      const tpd = (data.times_per_day || 1).toString();
      const days = (data.repeat_days_of_week as DayOfWeek[]) || [];
      const gId = data.goal_id || "";
      
      setRecurrenceType(recType);
      setTimesPerDay(tpd);
      setSelectedDays(days);
      setGoalId(gId);
      setOriginalGoalId(gId);
      setStartDate(data.start_date || "");
      setEndDate(data.end_date || "");
      
      // Store original values for change detection
      // Use commitment's default values as the baseline
      setOriginalValues({
        title: data.title || task?.title || "",
        timeStart: data.default_time_start || "",
        timeEnd: data.default_time_end || "",
        recurrenceType: recType,
        timesPerDay: tpd,
        selectedDays: days,
        goalId: gId,
      });
    }
  };

  const fetchIndependentTaskGoal = async (taskId: string) => {
    // For independent tasks, check if there's a linking weekly_commitment
    // UUIDs have 5 parts, recurring task IDs have 8 parts ({uuid}-{dateKey})
    const parts = taskId.split("-");
    const actualId = parts.length === 5 ? taskId : parts.slice(0, 5).join("-");
    
    const { data: completion } = await supabase
      .from("commitment_completions")
      .select("commitment_id")
      .eq("id", actualId)
      .maybeSingle();

    if (completion?.commitment_id) {
      const { data: commitment } = await supabase
        .from("weekly_commitments")
        .select("goal_id")
        .eq("id", completion.commitment_id)
        .maybeSingle();

      if (commitment?.goal_id) {
        setGoalId(commitment.goal_id);
        setOriginalGoalId(commitment.goal_id);
      }
    }
  };

  const handleDayToggle = (day: DayOfWeek) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  /**
   * Handle save with scope selection
   * @param scope - "all" for all occurrences, "this" for only this date, "future" for this and future
   */
  const handleSave = async (scope: "all" | "this" | "future") => {
    if (!user || !task) return;
    setSaving(true);

    try {
      const isRecurring = task.commitmentId !== null && !task.isDetached;
      const goalChanged = goalId !== originalGoalId;

      if (isRecurring && task.commitmentId) {
        if (scope === "this") {
          // Only this occurrence - create an exception
          await createOccurrenceException(task.commitmentId, dateKey, {
            title: title !== originalValues?.title ? title : undefined,
            timeStart: timeStart !== originalValues?.timeStart ? (timeStart || null) : undefined,
            timeEnd: timeEnd !== originalValues?.timeEnd ? (timeEnd || null) : undefined,
            goalId: goalChanged ? (goalId || null) : undefined,
            newDate: scheduledDate !== dateKey ? scheduledDate : undefined, // Support date change
          });
          toast.success("This occurrence updated");
        } else if (scope === "future") {
          // This and future occurrences - split the series
          await splitRecurringSeries(task.commitmentId, dateKey, {
            title,
            timeStart: timeStart || null,
            timeEnd: timeEnd || null,
            goalId: goalId || null,
            recurrenceType: showRepetitionEditor ? recurrenceType : undefined,
            timesPerDay: showRepetitionEditor && recurrenceType === "daily" ? parseInt(timesPerDay) || 1 : undefined,
            daysOfWeek: showRepetitionEditor && recurrenceType === "weekly" ? selectedDays : undefined,
          });
          toast.success("This and future occurrences updated");
        } else {
          // scope === "all" - update the entire series (existing behavior for non-shared changes)
          await supabase
            .from("weekly_commitments")
            .update({
              title,
              default_time_start: timeStart || null,
              default_time_end: timeEnd || null,
              flexible_time: !timeStart,
              start_date: startDate || null,
              end_date: endDate || null,
              ...(goalChanged ? { goal_id: goalId || null } : {}),
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

        // Handle completion status and notes regardless of scope
        // (completion changes don't need scope confirmation)
        const { data: existingCompletion } = await supabase
          .from("commitment_completions")
          .select("*")
          .eq("commitment_id", task.commitmentId)
          .eq("completed_date", dateKey)
          .maybeSingle();

        if (existingCompletion) {
          if (!isCompleted && !notes && scope === "all") {
            // No completion, no notes - delete the record (only if not creating exception)
            await supabase
              .from("commitment_completions")
              .delete()
              .eq("id", existingCompletion.id);

            if (task.isCompleted) {
              await updateCheckinCount(task.commitmentId, -1);
            }
          } else {
            // Update existing completion
            const wasCompleted = task.isCompleted;
            const nowCompleted = isCompleted;
            
            await supabase
              .from("commitment_completions")
              .update({
                time_start: timeStart || null,
                time_end: timeEnd || null,
                is_flexible_time: !timeStart,
                notes: notes || null,
                is_completed: isCompleted,
                title: scope === "this" ? title : undefined,
              })
              .eq("id", existingCompletion.id);

            if (!wasCompleted && nowCompleted) {
              await updateCheckinCount(task.commitmentId, 1);
            } else if (wasCompleted && !nowCompleted) {
              await updateCheckinCount(task.commitmentId, -1);
            }
          }
        } else if (isCompleted || notes) {
          // Create completion record
          await supabase.from("commitment_completions").insert({
            user_id: user.id,
            commitment_id: task.commitmentId,
            completed_date: dateKey,
            time_start: timeStart || null,
            time_end: timeEnd || null,
            is_flexible_time: !timeStart,
            task_type: "recurring",
            notes: notes || null,
            is_completed: isCompleted,
            title: scope === "this" ? title : undefined,
            is_detached: scope === "this",
          });

          if (isCompleted) {
            await updateCheckinCount(task.commitmentId, 1);
          }
        }
      } else {
        // Independent or detached task - handle goal linking
        if (goalChanged) {
          const parts = task.id.split("-");
          const actualId = parts.length === 5 ? task.id : parts.slice(0, 5).join("-");
          
          const { data: completion } = await supabase
            .from("commitment_completions")
            .select("commitment_id")
            .eq("id", actualId)
            .maybeSingle();

          if (completion?.commitment_id) {
            if (goalId) {
              await supabase
                .from("weekly_commitments")
                .update({ goal_id: goalId })
                .eq("id", completion.commitment_id);
            } else {
              await supabase
                .from("weekly_commitments")
                .update({ goal_id: null })
                .eq("id", completion.commitment_id);
            }
          } else if (goalId) {
            const { data: newCommitment } = await supabase
              .from("weekly_commitments")
              .insert({
                user_id: user.id,
                title: title,
                goal_id: goalId,
                is_active: false,
                recurrence_type: "none",
                task_type: "independent",
              })
              .select("id")
              .single();

            if (newCommitment) {
              await supabase
                .from("commitment_completions")
                .update({ commitment_id: newCommitment.id })
                .eq("id", actualId);
            }
          }
        }

        // Update the task directly
        const updateParts = task.id.split("-");
        const updateId = updateParts.length === 5 ? task.id : updateParts.slice(0, 5).join("-");
        
        // Build update object - include scheduled date for independent/detached tasks
        const updateData: Record<string, unknown> = {
          title,
          time_start: timeStart || null,
          time_end: timeEnd || null,
          is_flexible_time: !timeStart,
          notes: notes || null,
        };
        
        // Update the completed_date if the scheduled date changed
        if (scheduledDate && scheduledDate !== dateKey) {
          updateData.completed_date = scheduledDate;
        }
        
        await supabase
          .from("commitment_completions")
          .update(updateData)
          .eq("id", updateId);
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
   * Detect if any shared attributes have changed for recurring tasks
   */
  const hasSharedAttributeChanges = useMemo(() => {
    if (!originalValues || !task?.commitmentId || task.isDetached) return false;
    
    // Compare current values with original
    if (title !== originalValues.title) return true;
    if (timeStart !== originalValues.timeStart) return true;
    if (timeEnd !== originalValues.timeEnd) return true;
    if (goalId !== originalValues.goalId) return true;
    
    // Check if date was changed (moving this occurrence to a different day)
    if (scheduledDate && scheduledDate !== dateKey) return true;
    
    // Check recurrence rule changes only if editor is open
    if (showRepetitionEditor) {
      if (recurrenceType !== originalValues.recurrenceType) return true;
      if (timesPerDay !== originalValues.timesPerDay) return true;
      
      // Compare selectedDays arrays
      const sortedCurrent = [...selectedDays].sort();
      const sortedOriginal = [...originalValues.selectedDays].sort();
      if (sortedCurrent.length !== sortedOriginal.length) return true;
      if (sortedCurrent.some((day, i) => day !== sortedOriginal[i])) return true;
    }
    
    return false;
  }, [title, timeStart, timeEnd, goalId, recurrenceType, timesPerDay, selectedDays, showRepetitionEditor, originalValues, task, scheduledDate, dateKey]);

  /**
   * Handle save button click - validates time and shows confirmation for recurring tasks with changes
   */
  const handleSaveClick = () => {
    if (!task) return;
    
    // Clear previous errors
    setTimeError("");
    
    // Validate time slot - both start and end are required
    if (!timeStart || !timeEnd) {
      setTimeError("Please choose a start and end time.");
      return;
    }
    
    // Validate scheduled date is required
    if (!scheduledDate) {
      toast.error("Please select a scheduled date");
      return;
    }
    
    const isRecurring = task.commitmentId !== null && !task.isDetached;
    
    // If it's a recurring task with shared attribute changes, show confirmation
    if (isRecurring && hasSharedAttributeChanges) {
      setShowConfirmDialog(true);
      return;
    }
    
    // Otherwise, save directly (for independent tasks, or just completion/notes changes)
    handleSave("all");
  };

  /**
   * Handle confirmed save with scope selection
   */
  const handleConfirmedSave = async (scope: "this" | "future") => {
    setShowConfirmDialog(false);
    await handleSave(scope);
  };

  /**
   * Handle converting independent task to recurring
   */
  const handleConvertTaskType = async () => {
    if (!user || !task) return;
    setSaving(true);

    try {
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
      // UUIDs have 5 parts, recurring task IDs have 8 parts ({uuid}-{dateKey})
      const convertParts = task.id.split("-");
      const convertId = convertParts.length === 5 ? task.id : convertParts.slice(0, 5).join("-");
      
      await convertToRecurring(convertId, {
        recurrenceType,
        timesPerDay: recurrenceType === "daily" ? parseInt(timesPerDay) || 1 : undefined,
        daysOfWeek: recurrenceType === "weekly" ? selectedDays : undefined,
      });
      toast.success("Converted to recurring task");

      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error converting task:", error);
      toast.error("Failed to convert task type");
    } finally {
      setSaving(false);
    }
  };

  // handleClearTime removed - time is now required

  const handleToggleComplete = () => {
    const newValue = !isCompleted;
    setIsCompleted(newValue);
    if (newValue) {
      setJustCompleted(true);
      setTimeout(() => setJustCompleted(false), 600);
    }
  };

  /**
   * Handle delete button click
   * Shows confirmation dialog for recurring tasks, deletes immediately for one-time tasks
   */
  const handleDeleteClick = () => {
    if (!task) return;
    const isRecurringTask = task.commitmentId !== null && !task.isDetached;
    
    if (isRecurringTask) {
      setShowDeleteDialog(true);
    } else {
      handleDeleteNonRecurring();
    }
  };

  /**
   * Delete non-recurring (independent/detached) task immediately
   */
  const handleDeleteNonRecurring = async () => {
    if (!user || !task) return;
    setSaving(true);

    try {
      const parts = task.id.split("-");
      const actualId = parts.length === 5 ? task.id : parts.slice(0, 5).join("-");
      
      await supabase
        .from("commitment_completions")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", actualId);
      
      toast.success("Event deleted");
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error deleting task:", error);
      toast.error("Failed to delete task");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Handle confirmed delete for recurring tasks with scope selection
   */
  const handleConfirmedDelete = async (scope: "this" | "future" | "all") => {
    if (!user || !task || !task.commitmentId) return;
    setSaving(true);

    try {
      switch (scope) {
        case "this":
          // Delete only this occurrence
          await deleteOccurrence(task.commitmentId, dateKey);
          toast.success("Event deleted");
          break;
        case "future":
          // Delete this and all future occurrences
          await deleteFutureOccurrences(task.commitmentId, dateKey);
          toast.success("Future events deleted");
          break;
        case "all":
          // Delete the entire series
          await deleteEntireSeries(task.commitmentId);
          toast.success("Recurring series deleted");
          break;
      }

      setShowDeleteDialog(false);
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error deleting task:", error);
      toast.error("Failed to delete task");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Handle archive button click
   * Shows confirmation dialog for recurring tasks, archives immediately for one-time tasks
   */
  const handleArchiveClick = () => {
    if (!task) return;
    const isRecurringTask = task.commitmentId !== null && !task.isDetached;
    
    if (isRecurringTask) {
      setShowArchiveDialog(true);
    } else {
      handleArchiveNonRecurring();
    }
  };

  /**
   * Archive non-recurring (independent/detached) task immediately
   */
  const handleArchiveNonRecurring = async () => {
    if (!user || !task) return;
    setSaving(true);

    try {
      const parts = task.id.split("-");
      const actualId = parts.length === 5 ? task.id : parts.slice(0, 5).join("-");
      
      await supabase
        .from("commitment_completions")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", actualId);
      
      // Show undo toast
      toast("Task archived", {
        action: {
          label: "Undo",
          onClick: async () => {
            await supabase
              .from("commitment_completions")
              .update({ is_deleted: false, deleted_at: null })
              .eq("id", actualId);
            onUpdate();
          }
        },
        duration: 5000
      });
      
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error archiving task:", error);
      toast.error("Failed to archive task");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Handle confirmed archive for recurring tasks with scope selection
   */
  const handleConfirmedArchive = async (scope: "this" | "future" | "all") => {
    if (!user || !task || !task.commitmentId) return;
    setSaving(true);

    try {
      switch (scope) {
        case "this":
          // Archive only this occurrence
          await deleteOccurrence(task.commitmentId, dateKey);
          toast("Task archived", {
            action: {
              label: "Undo",
              onClick: async () => {
                // Restore by removing the skip - this is complex, just refetch
                onUpdate();
              }
            },
            duration: 5000
          });
          break;
        case "future":
          // Archive this and all future occurrences (end the series)
          await deleteFutureOccurrences(task.commitmentId, dateKey);
          toast("Future tasks archived");
          break;
        case "all":
          // Archive the entire series
          await supabase
            .from("weekly_commitments")
            .update({ archived_at: new Date().toISOString(), is_active: false })
            .eq("id", task.commitmentId);
          
          toast("Recurring series archived", {
            action: {
              label: "Undo",
              onClick: async () => {
                await supabase
                  .from("weekly_commitments")
                  .update({ archived_at: null, is_active: true })
                  .eq("id", task.commitmentId);
                onUpdate();
              }
            },
            duration: 5000
          });
          break;
      }

      setShowArchiveDialog(false);
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error archiving task:", error);
      toast.error("Failed to archive task");
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
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden rounded-xl border-border/50 max-h-[85vh] flex flex-col">
        {/* Header - date only, stable position */}
        <div className="px-5 pt-5 pb-3 shrink-0">
          <p className="text-xs text-muted-foreground">
            {formatDateWithDay(date, preferences.dateFormat)}
          </p>
        </div>

        <div className="px-5 pb-5 space-y-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0">
          {/* 1. Task Title - textarea for wrapping, max 2 lines visible */}
          <textarea
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            rows={2}
            className="w-full min-h-[2.5rem] max-h-[4rem] text-sm border border-border/50 rounded-lg bg-transparent px-3 py-2 resize-none focus:border-primary focus:outline-none focus:ring-0 focus:ring-offset-0 focus:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 overflow-hidden"
            style={{ lineHeight: '1.4' }}
          />

          {/* 2. Mark as Complete - flat inline row */}
          <button
            onClick={handleToggleComplete}
            className="flex items-center gap-2 py-0.5 hover:opacity-80 transition-opacity"
          >
            <div className={`
              w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center transition-all duration-200
              ${isCompleted
                ? "bg-primary border-primary"
                : "border-muted-foreground/40"
              }
            `}>
              {isCompleted && (
                <Check className={`h-2.5 w-2.5 text-primary-foreground ${justCompleted ? "animate-scale-in" : ""}`} />
              )}
            </div>
            <span className={`text-xs ${isCompleted ? "text-primary font-medium" : "text-foreground/60"}`}>
              Mark as complete
            </span>
          </button>

          {/* 3. Recurrence - ONLY section with soft container */}
          <div className="px-3 py-2 bg-muted/30 rounded-lg space-y-1.5">
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

            {/* Info for recurring tasks - shows they can edit rules */}
            {isRecurring && !showRepetitionEditor && (
              <p className="text-[10px] text-muted-foreground/70 leading-tight">
                Changes to this task will prompt you to choose which occurrences to update.
              </p>
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
              <p className="text-[10px] text-muted-foreground/70 leading-tight">
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
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/40 font-normal flex items-center gap-1">
              <Clock className="h-3 w-3 opacity-30" />
              Schedule time
            </span>

            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Label htmlFor="time-start" className="text-xs font-medium text-foreground/70 mb-1 block">
                  Start
                </Label>
                <Input
                  id="time-start"
                  type="time"
                  value={timeStart}
                  onChange={(e) => {
                    setTimeStart(e.target.value);
                    setTimeError("");
                  }}
                  className={`h-9 text-sm border-border/50 rounded-lg focus:border-primary/60 focus:ring-1 focus:ring-primary/20 ${timeError && !timeStart ? "border-destructive" : ""}`}
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
                  onChange={(e) => {
                    setTimeEnd(e.target.value);
                    setTimeError("");
                  }}
                  className={`h-9 text-sm border-border/50 rounded-lg focus:border-primary/60 focus:ring-1 focus:ring-primary/20 ${timeError && !timeEnd ? "border-destructive" : ""}`}
                />
              </div>
            </div>
            {timeError && (
              <p className="text-sm text-destructive">{timeError}</p>
            )}
          </div>

          {/* Scheduled Date - Required for all tasks */}
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/40 font-normal flex items-center gap-1">
              <Calendar className="h-3 w-3 opacity-30" />
              Scheduled date <span className="text-destructive">*</span>
            </span>

            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Input
                  id="scheduled-date"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className={`h-9 text-sm border-border/50 rounded-lg focus:border-primary/60 focus:ring-1 focus:ring-primary/20 ${!scheduledDate ? "border-muted-foreground/30" : ""}`}
                />
              </div>
            </div>
            {!scheduledDate && (
              <p className="text-[10px] text-muted-foreground">Please select a date</p>
            )}
            {isDetached && scheduledDate && (
              <p className="text-[10px] text-muted-foreground/60">
                This occurrence is detached from the recurring series
              </p>
            )}
            {isRecurring && !isDetached && scheduledDate && scheduledDate !== dateKey && (
              <p className="text-[10px] text-muted-foreground/60">
                Changing the date will only affect this occurrence
              </p>
            )}
          </div>

          {/* Duration (Start/End dates) - Only for recurring tasks */}
          {isRecurring && !isDetached && (
            <div className="space-y-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/40 font-normal flex items-center gap-1">
                <Calendar className="h-3 w-3 opacity-30" />
                Duration (optional)
              </span>

              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <Label htmlFor="start-date" className="text-xs font-medium text-foreground/70 mb-1 block">
                    Start date
                  </Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-9 text-sm border-border/50 rounded-lg focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="end-date" className="text-xs font-medium text-foreground/70 mb-1 block">
                    End date
                  </Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-9 text-sm border-border/50 rounded-lg focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/60">
                Leave empty to repeat indefinitely
              </p>
            </div>
          )}

          {/* 5. Related to (optional) - Collapsible */}
          {relatedGoals.length > 0 && (
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setRelatedExpanded(!relatedExpanded)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full min-w-0"
              >
                <span className="shrink-0">
                  {relatedExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="shrink-0">Related to 90-day plan</span>
                {goalId && !relatedExpanded && (
                  <span className="ml-1 text-foreground text-xs truncate min-w-0 flex-1">
                    — {relatedGoals.find(g => g.id === goalId)?.title || "..."}
                  </span>
                )}
              </button>

              {relatedExpanded && (
                <div className="mt-2 space-y-1.5">
                  <Select
                    value={goalId || "none"}
                    onValueChange={(val) => setGoalId(val === "none" ? "" : val)}
                  >
                    <SelectTrigger className="w-full h-9 text-sm [&>span]:truncate [&>span]:min-w-0 [&>span]:flex-1 [&>span]:text-left">
                      <SelectValue placeholder="Select a 90-day plan" />
                    </SelectTrigger>
                    <SelectContent className="max-w-[calc(100vw-3rem)]">
                      <SelectItem value="none">
                        <span className="text-muted-foreground">None</span>
                      </SelectItem>
                      {relatedGoals.map((goal) => {
                        const visionName = getVisionContext(goal);
                        return (
                          <SelectItem key={goal.id} value={goal.id}>
                            <div className="flex flex-col min-w-0">
                              <span className="truncate">{goal.title}</span>
                              {visionName && (
                                <span className="text-xs text-muted-foreground truncate">
                                  {visionName}
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground/70 leading-tight">
                    Used to organize your weekly plan.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 6. Notes (optional) - free-form text */}
          <div className="space-y-1.5">
            <label htmlFor="task-notes" className="text-xs text-muted-foreground">
              Notes (optional)
            </label>
            <textarea
              id="task-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any context, thoughts, or details…"
              rows={3}
              className="w-full min-h-[4.5rem] text-sm border border-border/40 rounded-lg bg-transparent px-3 py-2 resize-none focus:border-primary/60 focus:outline-none focus:ring-0 placeholder:text-muted-foreground/50 overflow-y-auto"
              style={{ maxHeight: '8rem' }}
            />
          </div>
        </div>

        {/* Actions - Save primary, Archive and Delete as text links - stable footer */}
        <div className="px-5 pb-5 pt-3 space-y-3 shrink-0 border-t border-border/30">
          <Button onClick={handleSaveClick} disabled={saving} className="w-full h-10 rounded-lg font-medium">
            {saving ? "Saving..." : "Save changes"}
          </Button>

          <div className="flex justify-center gap-4">
            <button
              onClick={handleArchiveClick}
              disabled={saving}
              className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <Archive className="h-3 w-3" />
              <span>Archive</span>
            </button>
            <button
              onClick={handleDeleteClick}
              disabled={saving}
              className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      </DialogContent>

      {/* Confirmation dialog for recurring task edits */}
      <RecurringEditConfirmDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onConfirm={handleConfirmedSave}
        saving={saving}
      />

      {/* Confirmation dialog for recurring task deletes */}
      <RecurringDeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleConfirmedDelete}
        saving={saving}
      />

      {/* Confirmation dialog for recurring task archives */}
      <RecurringArchiveConfirmDialog
        open={showArchiveDialog}
        onOpenChange={setShowArchiveDialog}
        onConfirm={handleConfirmedArchive}
        saving={saving}
      />
    </Dialog>
  );
};

export default TaskDetailModal;
