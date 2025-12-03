import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OnboardingLayout } from "./OnboardingLayout";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

/**
 * OnboardingGoalStep - Steps 3, 4, 5: Set goals at different time horizons
 * Reusable component for 3-year, 1-year, and 90-day goals
 */
interface Props {
  step: number;
  goalType: "three_year" | "one_year" | "ninety_day";
  pillarName: string;
  visionTitle?: string;
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

// Default placeholders as fallback
const DEFAULT_PLACEHOLDERS: Record<string, string> = {
  three_year: "e.g., Be conversationally fluent in Spanish",
  one_year: "e.g., Complete intermediate Spanish course",
  ninety_day: "e.g., Complete Spanish basics module"
};

export function OnboardingGoalStep({
  step,
  goalType,
  pillarName,
  visionTitle,
  parentGoalTitle,
  goal,
  onSetGoal,
  onNext,
  onBack
}: Props) {
  const [title, setTitle] = useState(goal?.title || "");
  const [description, setDescription] = useState(goal?.description || "");
  const [aiExample, setAiExample] = useState<string | null>(null);
  const [isLoadingExample, setIsLoadingExample] = useState(false);
  const config = GOAL_CONFIG[goalType];

  // Reset form when goalType changes
  useEffect(() => {
    setTitle(goal?.title || "");
    setDescription(goal?.description || "");
  }, [goalType, goal]);

  // Fetch AI-generated example when component mounts or context changes
  useEffect(() => {
    const fetchExample = async () => {
      setIsLoadingExample(true);
      setAiExample(null);
      
      try {
        const { data, error } = await supabase.functions.invoke("generate-goal-example", {
          body: {
            goalType,
            pillarName,
            visionTitle,
            parentGoalTitle
          }
        });

        if (error) {
          console.error("Error fetching AI example:", error);
          return;
        }

        if (data?.example) {
          setAiExample(data.example);
        }
      } catch (err) {
        console.error("Failed to fetch AI example:", err);
      } finally {
        setIsLoadingExample(false);
      }
    };

    fetchExample();
  }, [goalType, pillarName, visionTitle, parentGoalTitle]);

  const handleNext = () => {
    if (title.trim()) {
      onSetGoal({ title: title.trim(), description: description.trim() });
      onNext();
    }
  };

  const placeholder = aiExample 
    ? `e.g., ${aiExample}` 
    : DEFAULT_PLACEHOLDERS[goalType] || "";

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
            <div className="relative">
              <Input
                id="goalTitle"
                placeholder={isLoadingExample ? "Generating example..." : placeholder}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              {isLoadingExample && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
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
