import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { useAppData, Goal } from "@/hooks/useAppData";
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
  /** Optional: auto-select this goal when creating tasks (e.g., from 90-day plan context) */
  defaultGoalId?: string;
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
  defaultGoalId,
}: TaskCreateModalProps) => {
  const { createRecurringTask, createIndependentTask } = useTaskScheduling();
  const { goals: allGoals, visionsMap } = useAppData();
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [repeats, setRepeats] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<"daily" | "weekly">("weekly");
  const [timesPerDay, setTimesPerDay] = useState("1");
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [goalId, setGoalId] = useState<string>("");
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [scheduledDate, setScheduledDate] = useState(
    format(defaultDate, "yyyy-MM-dd")
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [relatedExpanded, setRelatedExpanded] = useState(false);
  const [timeError, setTimeError] = useState("");

  // Get filtered and sorted 90-day plans for "Related to" section
  const relatedGoals = (() => {
    let filtered = allGoals.filter((g) => {
      if (g.is_deleted || g.status === "archived" || g.status === "completed") return false;
      if (g.goal_type !== "ninety_day") return false;
      if (g.life_vision_id && !visionsMap.has(g.life_vision_id)) return false;
      return true;
    });

    if (contextVisionId) {
      filtered = filtered.filter((g) => g.life_vision_id === contextVisionId);
    }

    return filtered.sort((a, b) => a.title.localeCompare(b.title));
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
      setRepeats(false);
      setRecurrenceType("weekly");
      setTitle("");
      setTimesPerDay("1");
      setSelectedDays([]);
      setGoalId(defaultGoalId || "");
      setTimeStart("");
      setTimeEnd("");
      setStartDate("");
      setEndDate("");
      setRelatedExpanded(!!defaultGoalId);
      setTimeError("");
      
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 50);
    }
  }, [open, defaultDate, defaultGoalId]);

  const handleDayToggle = (day: DayOfWeek) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const resetForm = () => {
    setTitle("");
    setRepeats(false);
    setRecurrenceType("weekly");
    setTimesPerDay("1");
    setSelectedDays([]);
    setGoalId("");
    setTimeStart("");
    setTimeEnd("");
    setStartDate("");
    setEndDate("");
    setScheduledDate(format(defaultDate, "yyyy-MM-dd"));
    setRelatedExpanded(false);
    setTimeError("");
  };

  const handleSubmit = async () => {
    setTimeError("");

    if (!title.trim()) {
      toast.error("Please enter a task title");
      return;
    }

    // Validate time slot - both start and end are required
    if (!timeStart || !timeEnd) {
      setTimeError("Please choose a start and end time.");
      return;
    }

    // Validation for weekly recurrence
    if (repeats && recurrenceType === "weekly" && selectedDays.length === 0) {
      toast.error("Please select at least one day for weekly recurrence");
      return;
    }

    setSaving(true);

    try {
      if (!repeats) {
        // Create independent (one-time) task
        await createIndependentTask({
          title: title.trim(),
          scheduledDate,
          timeStart: timeStart || undefined,
          timeEnd: timeEnd || undefined,
          goalId: goalId || undefined,
        });
        toast.success("Task created");
      } else {
        // Create recurring task
        const effectiveRecurrenceType: RecurrenceType = recurrenceType;
        await createRecurringTask({
          title: title.trim(),
          goalId: goalId || null,
          recurrence: {
            recurrenceType: effectiveRecurrenceType,
            timesPerDay: recurrenceType === "daily" ? parseInt(timesPerDay) || 1 : undefined,
            daysOfWeek: recurrenceType === "weekly" ? selectedDays : undefined,
          },
          timeStart: timeStart || undefined,
          timeEnd: timeEnd || undefined,
          weekStart,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
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
  
  // Validate: title, time, days (if weekly), and date is required for all tasks
  const hasRequiredDate = repeats ? !!startDate : !!scheduledDate;
  const isValid = title.trim() && timeStart && timeEnd && hasRequiredDate && (!repeats || recurrenceType !== "weekly" || selectedDays.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <VisuallyHidden.Root>
          <DialogTitle>Create Task</DialogTitle>
        </VisuallyHidden.Root>
        
        <div className="space-y-6 pt-2">
          {/* 1. Title - Primary input, larger and prominent */}
          <div className="pr-8">
            <Label htmlFor="task-title" className="sr-only">Task Title</Label>
            <Input
              ref={titleInputRef}
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you need to do?"
              className="text-lg font-medium border-2 focus:border-primary h-12"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && isValid) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>

          {/* 2. Time slot (required) - Clear visual emphasis */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Time slot <span className="text-destructive">*</span></Label>
            <div className="flex gap-3 items-center">
              <div className="flex-1">
                <Input
                  id="time-start"
                  type="time"
                  value={timeStart}
                  onChange={(e) => {
                    setTimeStart(e.target.value);
                    setTimeError("");
                  }}
                  className={`h-10 ${timeError && !timeStart ? "border-destructive" : ""}`}
                  aria-label="Start time"
                />
              </div>
              <span className="text-muted-foreground text-sm">to</span>
              <div className="flex-1">
                <Input
                  id="time-end"
                  type="time"
                  value={timeEnd}
                  onChange={(e) => {
                    setTimeEnd(e.target.value);
                    setTimeError("");
                  }}
                  className={`h-10 ${timeError && !timeEnd ? "border-destructive" : ""}`}
                  aria-label="End time"
                />
              </div>
            </div>
            {timeError && (
              <p className="text-sm text-destructive">{timeError}</p>
            )}
          </div>

          {/* 3. Date - Required for one-time tasks */}
          {!repeats && (
            <div className="space-y-2">
              <Label htmlFor="scheduled-date" className="text-sm font-medium">Date <span className="text-destructive">*</span></Label>
              <Input
                id="scheduled-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className={`h-10 ${!scheduledDate ? "border-muted-foreground/30" : ""}`}
              />
              {!scheduledDate && (
                <p className="text-xs text-muted-foreground">Please select a date</p>
              )}
            </div>
          )}

          {/* 4. Repeats toggle - Simple switch instead of radio buttons */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Label htmlFor="repeats-toggle" className="text-sm font-medium cursor-pointer">Repeats</Label>
              <p className="text-xs text-muted-foreground">Make this a recurring task</p>
            </div>
            <Switch
              id="repeats-toggle"
              checked={repeats}
              onCheckedChange={setRepeats}
            />
          </div>

          {/* 5. Recurrence options - Only shown when repeats is enabled */}
          {repeats && (
            <div className="space-y-4 p-4 rounded-lg bg-muted/30">
              {/* Recurrence type selector */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={recurrenceType === "daily" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRecurrenceType("daily")}
                  className="flex-1"
                >
                  Daily
                </Button>
                <Button
                  type="button"
                  variant={recurrenceType === "weekly" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRecurrenceType("weekly")}
                  className="flex-1"
                >
                  Weekly
                </Button>
              </div>

              {/* Daily options */}
              {recurrenceType === "daily" && (
                <div className="flex items-center gap-3">
                  <Label className="text-sm whitespace-nowrap">Times per day:</Label>
                  <Select value={timesPerDay} onValueChange={setTimesPerDay}>
                    <SelectTrigger className="w-20 h-9">
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

              {/* Weekly day selector */}
              {recurrenceType === "weekly" && (
                <div className="space-y-2">
                  <Label className="text-sm">Select days</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS_OF_WEEK.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => handleDayToggle(day.value)}
                        className={`
                          px-3 py-1.5 text-sm rounded-md transition-colors
                          ${selectedDays.includes(day.value)
                            ? "bg-primary text-primary-foreground"
                            : "bg-background border border-border hover:bg-muted"
                          }
                        `}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Start date - Required for recurring tasks */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Start date <span className="text-destructive">*</span></Label>
                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <Input
                      id="start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className={`h-9 ${!startDate ? "border-muted-foreground/30" : ""}`}
                    />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="end-date" className="text-xs text-muted-foreground mb-1 block">
                      End (optional)
                    </Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
                {!startDate && (
                  <p className="text-xs text-muted-foreground">Please select a start date</p>
                )}
              </div>

              {/* Recurring task hint */}
              <p className="text-xs text-muted-foreground">
                Changes to recurring tasks will ask which occurrences to update.
              </p>
            </div>
          )}

          {/* 6. Related to (optional) - Collapsible */}
          {relatedGoals.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setRelatedExpanded(!relatedExpanded)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {relatedExpanded || selectedGoal ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span>Link to 90-day plan</span>
                {selectedGoal && !relatedExpanded && (
                  <span className="ml-1 text-foreground font-medium truncate max-w-[150px]">
                    — {selectedGoal.title}
                  </span>
                )}
              </button>

              {(relatedExpanded || selectedGoal) && (
                <div className="mt-3 pl-6">
                  <Select
                    value={goalId || "none"}
                    onValueChange={(val) => setGoalId(val === "none" ? "" : val)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a 90-day plan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <span className="text-muted-foreground">None</span>
                      </SelectItem>
                      {relatedGoals.map((goal) => {
                        const visionName = getVisionContext(goal);
                        return (
                          <SelectItem key={goal.id} value={goal.id}>
                            <div className="flex flex-col">
                              <span>{goal.title}</span>
                              {visionName && (
                                <span className="text-xs text-muted-foreground">
                                  {visionName}
                                </span>
                              )}
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

          {/* Submit - Sticky at bottom */}
          <div className="pt-2">
            <Button
              onClick={handleSubmit}
              disabled={saving || !isValid}
              className="w-full h-11"
            >
              {saving ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskCreateModal;
