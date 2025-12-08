import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from "date-fns";
import { useTaskScheduling } from "@/hooks/useTaskScheduling";
import type { TaskType, RepeatFrequency, DayOfWeek } from "@/types/scheduling";

/**
 * TaskCreateModal - Modal for creating new tasks
 * Supports both recurring and independent task types
 */

interface TaskCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  defaultTaskType?: TaskType;
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
  defaultTaskType = "recurring",
  goals = [],
  onSuccess,
  weekStart,
}: TaskCreateModalProps) => {
  const { createRecurringTask, createIndependentTask } = useTaskScheduling();

  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<TaskType>(defaultTaskType);
  const [frequency, setFrequency] = useState<RepeatFrequency>("weekly");
  const [timesPerPeriod, setTimesPerPeriod] = useState("3");
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [goalId, setGoalId] = useState<string>("");
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [scheduledDate, setScheduledDate] = useState(
    format(defaultDate, "yyyy-MM-dd")
  );
  const [saving, setSaving] = useState(false);

  const handleDayToggle = (day: DayOfWeek) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const resetForm = () => {
    setTitle("");
    setTaskType(defaultTaskType);
    setFrequency("weekly");
    setTimesPerPeriod("3");
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

    setSaving(true);

    try {
      if (taskType === "recurring") {
        await createRecurringTask({
          title: title.trim(),
          goalId: goalId || null,
          repetition: {
            frequency,
            timesPerPeriod: parseInt(timesPerPeriod) || 1,
            daysOfWeek: frequency === "custom" ? selectedDays : [],
          },
          timeStart: timeStart || undefined,
          timeEnd: timeEnd || undefined,
          weekStart,
        });
        toast.success("Recurring task created");
      } else {
        await createIndependentTask({
          title: title.trim(),
          scheduledDate,
          timeStart: timeStart || undefined,
          timeEnd: timeEnd || undefined,
        });
        toast.success("Task created");
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

          {/* Task Type */}
          <div>
            <Label className="mb-2 block">Task Type</Label>
            <RadioGroup
              value={taskType}
              onValueChange={(val) => setTaskType(val as TaskType)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="recurring" id="recurring" />
                <Label htmlFor="recurring" className="font-normal cursor-pointer">
                  Recurring weekly
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="independent" id="independent" />
                <Label htmlFor="independent" className="font-normal cursor-pointer">
                  One-time
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Recurring options */}
          {taskType === "recurring" && (
            <div className="space-y-4 border-l-2 border-primary/20 pl-4">
              {/* Frequency */}
              <div>
                <Label>Repeat Frequency</Label>
                <RadioGroup
                  value={frequency}
                  onValueChange={(val) => setFrequency(val as RepeatFrequency)}
                  className="flex flex-col gap-2 mt-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="daily" id="freq-daily" />
                    <Label htmlFor="freq-daily" className="font-normal cursor-pointer">
                      Daily
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="weekly" id="freq-weekly" />
                    <Label htmlFor="freq-weekly" className="font-normal cursor-pointer">
                      Weekly
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="custom" id="freq-custom" />
                    <Label htmlFor="freq-custom" className="font-normal cursor-pointer">
                      Custom days
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Times per period */}
              <div>
                <Label>
                  {frequency === "daily" ? "Times per day" : "Times per week"}
                </Label>
                <Select value={timesPerPeriod} onValueChange={setTimesPerPeriod}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <SelectItem key={n} value={n.toString()}>
                        {n}× {frequency === "daily" ? "per day" : "per week"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Custom days */}
              {frequency === "custom" && (
                <div>
                  <Label className="mb-2 block">Days of week</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <div
                        key={day.value}
                        className="flex items-center space-x-1"
                      >
                        <Checkbox
                          id={`day-${day.value}`}
                          checked={selectedDays.includes(day.value)}
                          onCheckedChange={() => handleDayToggle(day.value)}
                        />
                        <Label
                          htmlFor={`day-${day.value}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {day.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Link to goal */}
              {goals.length > 0 && (
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
            </div>
          )}

          {/* Independent task options */}
          {taskType === "independent" && (
            <div className="space-y-4 border-l-2 border-muted pl-4">
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
            </div>
          )}

          {/* Time slot (optional for both types) */}
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
