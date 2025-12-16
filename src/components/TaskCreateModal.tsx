import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
import { toast } from "sonner";
import { format } from "date-fns";
import { useTaskScheduling } from "@/hooks/useTaskScheduling";
import { useAppData, Goal, Vision } from "@/hooks/useAppData";
import type { RecurrenceType, DayOfWeek } from "@/types/scheduling";

/**
 * TaskCreateModal - Modal for creating new tasks
 * 
 * Recurrence options:
 * - Does not repeat (one-time)
 * - Daily (with times per day)
 * - Weekly on specific days
 */

interface TaskCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  goals?: { id: string; title: string }[];
  onSuccess: () => void;
  weekStart?: Date;
  /** Optional: filter goals to a specific vision context */
  contextVisionId?: string;
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

const TaskCreateModal = ({
  open,
  onOpenChange,
  defaultDate = new Date(),
  goals: legacyGoals = [],
  onSuccess,
  weekStart,
  contextVisionId,
}: TaskCreateModalProps) => {
  const { createRecurringTask, createIndependentTask } = useTaskScheduling();
  const { goals: allGoals, visions, visionsMap } = useAppData();
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("none");
  const [timesPerDay, setTimesPerDay] = useState("1");
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [goalId, setGoalId] = useState<string>("");
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [scheduledDate, setScheduledDate] = useState(
    format(defaultDate, "yyyy-MM-dd")
  );
  const [saving, setSaving] = useState(false);
  const [relatedExpanded, setRelatedExpanded] = useState(false);

  // Get filtered and sorted goals for "Related to" section
  const relatedGoals = (() => {
    // Filter to active 90-day and 1-year goals only
    let filtered = allGoals.filter(
      (g) =>
        !g.is_deleted &&
        g.status !== "archived" &&
        g.status !== "completed" &&
        (g.goal_type === "ninety_day" || g.goal_type === "one_year")
    );

    // If we have a vision context, filter to that vision's goals
    if (contextVisionId) {
      filtered = filtered.filter((g) => g.life_vision_id === contextVisionId);
    }

    // Sort: 90-day first, then 1-year
    return filtered.sort((a, b) => {
      if (a.goal_type === "ninety_day" && b.goal_type !== "ninety_day") return -1;
      if (a.goal_type !== "ninety_day" && b.goal_type === "ninety_day") return 1;
      return a.title.localeCompare(b.title);
    });
  })();

  // Get vision name for a goal
  const getVisionContext = (goal: Goal): string | null => {
    if (!goal.life_vision_id) return null;
    const vision = visionsMap.get(goal.life_vision_id);
    return vision?.title || null;
  };

  // Reset form when modal opens or defaultDate changes
  useEffect(() => {
    if (open) {
      setScheduledDate(format(defaultDate, "yyyy-MM-dd"));
      // Reset to independent task by default
      setRecurrenceType("none");
      setTitle("");
      setTimesPerDay("1");
      setSelectedDays([]);
      setGoalId("");
      setTimeStart("");
      setTimeEnd("");
      setRelatedExpanded(false);
      
      // Auto-focus the title input
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 50);
    }
  }, [open, defaultDate]);

  const handleDayToggle = (day: DayOfWeek) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const resetForm = () => {
    setTitle("");
    setRecurrenceType("none");
    setTimesPerDay("1");
    setSelectedDays([]);
    setGoalId("");
    setTimeStart("");
    setTimeEnd("");
    setScheduledDate(format(defaultDate, "yyyy-MM-dd"));
    setRelatedExpanded(false);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Please enter a task title");
      return;
    }

    // Validation for weekly recurrence
    if (recurrenceType === "weekly" && selectedDays.length === 0) {
      toast.error("Please select at least one day for weekly recurrence");
      return;
    }

    setSaving(true);

    try {
      if (recurrenceType === "none") {
        // Create independent (one-time) task
        // Note: Independent tasks don't support goal linking (schema limitation)
        await createIndependentTask({
          title: title.trim(),
          scheduledDate,
          timeStart: timeStart || undefined,
          timeEnd: timeEnd || undefined,
        });
        toast.success("Task created");
      } else {
        // Create recurring task - supports goal linking
        await createRecurringTask({
          title: title.trim(),
          goalId: goalId || null,
          recurrence: {
            recurrenceType,
            timesPerDay: recurrenceType === "daily" ? parseInt(timesPerDay) || 1 : undefined,
            daysOfWeek: recurrenceType === "weekly" ? selectedDays : undefined,
          },
          timeStart: timeStart || undefined,
          timeEnd: timeEnd || undefined,
          weekStart,
        });
        toast.success("Recurring task created");
      }

      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error creating task:", error);
      toast.error("Failed to create task");
    } finally {
      setSaving(false);
    }
  };

  const selectedGoal = goalId ? relatedGoals.find((g) => g.id === goalId) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="space-y-5">
          {/* Title - Entry point, no header above */}
          <div>
            <Label htmlFor="task-title" className="sr-only">Task Title</Label>
            <Input
              ref={titleInputRef}
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="text-base"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && title.trim()) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>

           {/* Recurrence Type */}
          <div>
            <Label className="mb-2 block text-sm text-muted-foreground">Task Type</Label>
            <RadioGroup
              value={recurrenceType}
              onValueChange={(val) => setRecurrenceType(val as RecurrenceType)}
              className="flex flex-col gap-3"
            >
              {/* Independent (default) */}
              <div className="flex items-start space-x-2">
                <RadioGroupItem value="none" id="recurrence-none" className="mt-0.5" />
                <div>
                  <Label htmlFor="recurrence-none" className="font-normal cursor-pointer">
                    Independent
                  </Label>
                  <p className="text-xs text-muted-foreground">One-time task for this date only</p>
                </div>
              </div>

              {/* Daily recurring */}
              <div className="flex items-start space-x-2">
                <RadioGroupItem value="daily" id="recurrence-daily" className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="recurrence-daily" className="font-normal cursor-pointer">
                    Recurring daily
                  </Label>
                  <p className="text-xs text-muted-foreground">Repeats every day</p>
                  
                  {recurrenceType === "daily" && (
                    <div className="mt-2 flex items-center gap-2">
                      <Label className="text-sm whitespace-nowrap">Times per day:</Label>
                      <Select value={timesPerDay} onValueChange={setTimesPerDay}>
                        <SelectTrigger className="w-20 h-8">
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

              {/* Weekly recurring */}
              <div className="flex items-start space-x-2">
                <RadioGroupItem value="weekly" id="recurrence-weekly" className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="recurrence-weekly" className="font-normal cursor-pointer">
                    Recurring weekly
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {selectedDays.length > 0 
                      ? `${selectedDays.length} day${selectedDays.length > 1 ? "s" : ""} per week`
                      : "Select days below"}
                  </p>
                  
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
          </div>

          {/* Date for one-time tasks */}
          {recurrenceType === "none" && (
            <div>
              <Label htmlFor="scheduled-date" className="text-sm text-muted-foreground">Date</Label>
              <Input
                id="scheduled-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="mt-1"
              />
            </div>
          )}

          {/* Time slot (optional) */}
          <div>
            <Label className="mb-2 block text-sm text-muted-foreground">Time slot (optional)</Label>
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
          </div>

          {/* Related to (optional) - Collapsible */}
          {relatedGoals.length > 0 && recurrenceType !== "none" && (
            <div>
              <button
                type="button"
                onClick={() => setRelatedExpanded(!relatedExpanded)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {relatedExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span>Related to (optional)</span>
                {selectedGoal && (
                  <span className="ml-1 text-foreground">
                    — {selectedGoal.title}
                  </span>
                )}
              </button>

              {relatedExpanded && (
                <div className="mt-2">
                  <Select
                    value={goalId || "none"}
                    onValueChange={(val) => setGoalId(val === "none" ? "" : val)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a plan or goal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <span className="text-muted-foreground">None</span>
                      </SelectItem>
                      {relatedGoals.map((goal) => {
                        const visionName = getVisionContext(goal);
                        const typeLabel = goal.goal_type === "ninety_day" ? "90-day" : "1-year";
                        return (
                          <SelectItem key={goal.id} value={goal.id}>
                            <div className="flex flex-col">
                              <span>{goal.title}</span>
                              <span className="text-xs text-muted-foreground">
                                {typeLabel}
                                {visionName && ` · ${visionName}`}
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={saving || !title.trim()}
            className="w-full"
          >
            {saving ? "Creating..." : "Create Task"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskCreateModal;
