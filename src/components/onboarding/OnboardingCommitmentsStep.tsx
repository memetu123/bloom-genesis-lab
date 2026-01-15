import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { OnboardingLayout } from "./OnboardingLayout";
import { DayOfWeek, OnboardingCommitment } from "@/types/todayoum";

/**
 * OnboardingCommitmentsStep - Step 6: Define weekly commitments
 * User creates 1-3 habits with specific days and optional times
 */

const DAYS: { key: DayOfWeek; label: string; short: string }[] = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
  { key: 'sat', label: 'Saturday', short: 'Sat' },
  { key: 'sun', label: 'Sunday', short: 'Sun' },
];

interface Props {
  pillarName: string;
  ninetyDayGoal: string;
  commitments: OnboardingCommitment[];
  onSetCommitments: (commitments: OnboardingCommitment[]) => void;
  onComplete: () => void;
  onBack: () => void;
  loading?: boolean;
  onExit?: () => void;
}

export function OnboardingCommitmentsStep({
  pillarName,
  ninetyDayGoal,
  commitments,
  onSetCommitments,
  onComplete,
  onBack,
  loading,
  onExit
}: Props) {
  const [newTitle, setNewTitle] = useState("");
  const [newDays, setNewDays] = useState<DayOfWeek[]>(['mon', 'wed', 'fri']);
  const [newTimeStart, setNewTimeStart] = useState("");
  const [newTimeEnd, setNewTimeEnd] = useState("");

  const toggleDay = (day: DayOfWeek) => {
    setNewDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const addCommitment = () => {
    if (newTitle.trim() && newDays.length > 0 && newTimeStart && newTimeEnd && commitments.length < 5) {
      onSetCommitments([
        ...commitments,
        { 
          title: newTitle.trim(), 
          daysOfWeek: newDays,
          timeStart: newTimeStart,
          timeEnd: newTimeEnd,
        }
      ]);
      // Reset form
      setNewTitle("");
      setNewDays(['mon', 'wed', 'fri']);
      setNewTimeStart("");
      setNewTimeEnd("");
    }
  };

  const removeCommitment = (index: number) => {
    onSetCommitments(commitments.filter((_, i) => i !== index));
  };

  const formatDays = (days: DayOfWeek[]) => {
    if (days.length === 7) return "Every day";
    if (days.length === 0) return "No days";
    return days.map(d => DAYS.find(day => day.key === d)?.short).join(", ");
  };

  const formatTime = (start?: string, end?: string) => {
    if (!start) return null;
    if (end) return `${start}–${end}`;
    return start;
  };

  return (
    <OnboardingLayout
      step={6}
      totalSteps={6}
      title="Set weekly commitments"
      subtitle="What small, repeatable actions will move you toward your goal? Add 1-3 habits."
      onBack={onBack}
      onExit={onExit}
    >
      <div className="space-y-6">
        {/* Context */}
        <div className="p-4 bg-muted/50 rounded-lg space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {pillarName} • 90-Day Plan
          </p>
          <p className="text-sm text-foreground font-medium">{ninetyDayGoal}</p>
        </div>

        {/* Existing commitments */}
        {commitments.length > 0 && (
          <div className="space-y-2">
            {commitments.map((commitment, index) => (
              <Card key={index}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{commitment.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDays(commitment.daysOfWeek)}
                      {formatTime(commitment.timeStart, commitment.timeEnd) && (
                        <span> • {formatTime(commitment.timeStart, commitment.timeEnd)}</span>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCommitment(index)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add new commitment */}
        {commitments.length < 5 && (
          <div className="space-y-4">
            {/* Title */}
            <div className="space-y-2">
              <label htmlFor="commitmentTitle" className="text-sm font-medium text-foreground">
                New commitment
              </label>
              <Input
                id="commitmentTitle"
                placeholder="e.g., Study Spanish vocabulary"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>

            {/* Days of week */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Which days?
              </label>
              <div className="flex gap-1">
                {DAYS.map((day) => (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => toggleDay(day.key)}
                    className={`flex-1 py-2 px-1 rounded-md text-xs font-medium transition-calm ${
                      newDays.includes(day.key)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {day.short}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {newDays.length === 7 
                  ? "Every day" 
                  : newDays.length === 0 
                    ? "Select at least one day"
                    : `${newDays.length} day${newDays.length !== 1 ? 's' : ''} selected`
                }
              </p>
            </div>

            {/* Time */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Time
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={newTimeStart}
                  onChange={(e) => setNewTimeStart(e.target.value)}
                  className="flex-1"
                  placeholder="Start"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="time"
                  value={newTimeEnd}
                  onChange={(e) => setNewTimeEnd(e.target.value)}
                  className="flex-1"
                  placeholder="End"
                />
              </div>
            </div>

            {/* Add button */}
            <Button
              variant="outline"
              onClick={addCommitment}
              disabled={!newTitle.trim() || newDays.length === 0 || !newTimeStart || !newTimeEnd}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add commitment
            </Button>
          </div>
        )}

        {/* Complete button */}
        <div className="flex items-center justify-between pt-4">
          <span className="text-sm text-muted-foreground">
            {commitments.length} commitment{commitments.length !== 1 ? "s" : ""} added
          </span>
          <Button onClick={onComplete} disabled={commitments.length === 0 || loading}>
            {loading ? "Saving..." : "Complete setup"}
          </Button>
        </div>
      </div>
    </OnboardingLayout>
  );
}
