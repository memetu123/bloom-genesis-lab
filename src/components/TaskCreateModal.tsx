import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
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
import { toast } from "sonner";
import { format } from "date-fns";
import { useTaskScheduling } from "@/hooks/useTaskScheduling";
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
  goals = [],
  onSuccess,
  weekStart,
}: TaskCreateModalProps) => {
  const { createRecurringTask, createIndependentTask } = useTaskScheduling();

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
        await createIndependentTask({
          title: title.trim(),
          scheduledDate,
          timeStart: timeStart || undefined,
          timeEnd: timeEnd || undefined,
        });
        toast.success("Task created");
      } else {
        // Create recurring task
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">
            <Plus className="h-4 w-4 inline mr-2" />
            Add Task
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Title */}
          <div>
            <Label htmlFor="task-title">Task Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Meditate, Study Spanish"
              className="mt-1"
            />
          </div>

           {/* Recurrence Type */}
          <div>
            <Label className="mb-2 block">Task Type</Label>
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
              <Label htmlFor="scheduled-date">Date</Label>
              <Input
                id="scheduled-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="mt-1"
              />
            </div>
          )}

          {/* Link to goal (only for recurring tasks) */}
          {recurrenceType !== "none" && goals.length > 0 && (
            <div>
              <Label>Link to goal (optional)</Label>
              <Select
                value={goalId || "none"}
                onValueChange={(val) => setGoalId(val === "none" ? "" : val)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="No goal linked" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No goal linked</SelectItem>
                  {goals.map((goal) => (
                    <SelectItem key={goal.id} value={goal.id}>
                      {goal.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Time slot (optional) */}
          <div>
            <Label className="mb-2 block">Time slot (optional)</Label>
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
