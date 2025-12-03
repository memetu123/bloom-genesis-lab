import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { OnboardingLayout } from "./OnboardingLayout";

/**
 * OnboardingCommitmentsStep - Step 6: Define weekly commitments
 * User creates 1-3 habits that support their 90-day plan
 */
interface Props {
  pillarName: string;
  ninetyDayGoal: string;
  commitments: { title: string; timesPerWeek: number }[];
  onSetCommitments: (commitments: { title: string; timesPerWeek: number }[]) => void;
  onComplete: () => void;
  onBack: () => void;
  loading?: boolean;
}

export function OnboardingCommitmentsStep({
  pillarName,
  ninetyDayGoal,
  commitments,
  onSetCommitments,
  onComplete,
  onBack,
  loading
}: Props) {
  const [newTitle, setNewTitle] = useState("");
  const [newFrequency, setNewFrequency] = useState(3);

  const addCommitment = () => {
    if (newTitle.trim() && commitments.length < 5) {
      onSetCommitments([
        ...commitments,
        { title: newTitle.trim(), timesPerWeek: newFrequency }
      ]);
      setNewTitle("");
      setNewFrequency(3);
    }
  };

  const removeCommitment = (index: number) => {
    onSetCommitments(commitments.filter((_, i) => i !== index));
  };

  return (
    <OnboardingLayout
      step={6}
      totalSteps={6}
      title="Set weekly commitments"
      subtitle="What small, repeatable actions will move you toward your goal? Add 1-3 habits."
      onBack={onBack}
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
                      {commitment.timesPerWeek}× per week
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
          <div className="space-y-3">
            <div className="space-y-2">
              <label htmlFor="commitmentTitle" className="text-sm font-medium text-foreground">
                New commitment
              </label>
              <Input
                id="commitmentTitle"
                placeholder="e.g., Study Spanish vocabulary"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCommitment()}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-muted-foreground whitespace-nowrap">
                Times per week:
              </label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setNewFrequency(num)}
                    className={`w-8 h-8 rounded-md text-sm font-medium transition-calm ${
                      newFrequency === num
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
            <Button
              variant="outline"
              onClick={addCommitment}
              disabled={!newTitle.trim()}
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