import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OnboardingLayout } from "./OnboardingLayout";

/**
 * OnboardingGoalStep - Steps 3, 4, 5: Set goals at different time horizons
 * Reusable component for 3-year, 1-year, and 90-day goals
 */
interface Props {
  step: number;
  goalType: "three_year" | "one_year" | "ninety_day";
  pillarName: string;
  parentGoalTitle?: string;
  goal: { title: string; description: string } | null;
  onSetGoal: (goal: { title: string; description: string }) => void;
  onNext: () => void;
  onBack: () => void;
}

const GOAL_CONFIG = {
  three_year: {
    title: "Set your 3-year direction",
    subtitle: "Where do you want to be in 3 years? Think big.",
    helpText: "A major milestone that moves you toward your vision"
  },
  one_year: {
    title: "Set your 1-year milestone",
    subtitle: "What concrete progress can you make in one year?",
    helpText: "A measurable checkpoint toward your 3-year direction"
  },
  ninety_day: {
    title: "Set your 90-day plan",
    subtitle: "What can you achieve in the next 90 days?",
    helpText: "A focused, achievable goal for the next quarter"
  }
};

// Generate contextual placeholder based on parent goal
function getContextualPlaceholder(goalType: string, parentGoalTitle?: string): string {
  if (!parentGoalTitle) {
    // Default placeholders when no parent context
    const defaults: Record<string, string> = {
      three_year: "e.g., Be conversationally fluent in Spanish",
      one_year: "e.g., Complete intermediate Spanish course",
      ninety_day: "e.g., Complete Spanish basics module"
    };
    return defaults[goalType] || "";
  }

  // Create contextual placeholder based on parent goal
  const parentLower = parentGoalTitle.toLowerCase();
  
  if (goalType === "one_year") {
    return `e.g., Make significant progress toward: "${parentGoalTitle}"`;
  }
  
  if (goalType === "ninety_day") {
    return `e.g., First steps toward: "${parentGoalTitle}"`;
  }
  
  return "";
}

export function OnboardingGoalStep({
  step,
  goalType,
  pillarName,
  parentGoalTitle,
  goal,
  onSetGoal,
  onNext,
  onBack
}: Props) {
  const [title, setTitle] = useState(goal?.title || "");
  const [description, setDescription] = useState(goal?.description || "");
  const config = GOAL_CONFIG[goalType];

  // Reset form when goalType changes
  useEffect(() => {
    setTitle(goal?.title || "");
    setDescription(goal?.description || "");
  }, [goalType, goal]);

  const handleNext = () => {
    if (title.trim()) {
      onSetGoal({ title: title.trim(), description: description.trim() });
      onNext();
    }
  };

  return (
    <OnboardingLayout
      step={step}
      totalSteps={6}
      title={config.title}
      subtitle={config.subtitle}
      onBack={onBack}
    >
      <div className="space-y-6">
        {/* Context from previous steps */}
        <div className="p-4 bg-muted/50 rounded-lg space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {pillarName}
          </p>
          {parentGoalTitle && (
            <p className="text-sm text-foreground font-medium">
              {goalType === "one_year" ? "3-Year:" : "1-Year:"} {parentGoalTitle}
            </p>
          )}
        </div>

        {/* Goal form */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="goalTitle" className="text-sm font-medium text-foreground">
              Your {goalType === "three_year" ? "3-year" : goalType === "one_year" ? "1-year" : "90-day"} goal
            </label>
            <Input
              id="goalTitle"
              placeholder={getContextualPlaceholder(goalType, parentGoalTitle)}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{config.helpText}</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="goalDescription" className="text-sm font-medium text-foreground">
              How will you know you've achieved it? (optional)
            </label>
            <Textarea
              id="goalDescription"
              placeholder="Describe what success looks like..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        {/* Continue button */}
        <div className="flex justify-end pt-4">
          <Button onClick={handleNext} disabled={!title.trim()}>
            Continue
          </Button>
        </div>
      </div>
    </OnboardingLayout>
  );
}