import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OnboardingLayout } from "./OnboardingLayout";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw } from "lucide-react";

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
  onExit?: () => void;
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
  onBack,
  onExit
}: Props) {
  const [title, setTitle] = useState(goal?.title || "");
  const [description, setDescription] = useState(goal?.description || "");
  const [aiExample, setAiExample] = useState<string | null>(null);
  const [isLoadingExample, setIsLoadingExample] = useState(false);
  const config = GOAL_CONFIG[goalType];
  
  // Progressive disclosure for optional description (only for 1-year goals)
  const [showDescription, setShowDescription] = useState(!!goal?.description);

  // Reset form when goalType changes
  useEffect(() => {
    setTitle(goal?.title || "");
    setDescription(goal?.description || "");
    setShowDescription(!!goal?.description);
  }, [goalType, goal]);

  // Track if AI examples failed (for graceful fallback)
  const [exampleFailed, setExampleFailed] = useState(false);

  // Function to fetch AI-generated example (non-blocking - failures are silent)
  const fetchExample = useCallback(async () => {
    setIsLoadingExample(true);
    setAiExample(null);
    setExampleFailed(false);
    
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
        setExampleFailed(true);
        return;
      }

      if (data?.example) {
        setAiExample(data.example);
      }
    } catch (err) {
      console.error("Failed to fetch AI example:", err);
      setExampleFailed(true);
    } finally {
      setIsLoadingExample(false);
    }
  }, [goalType, pillarName, visionTitle, parentGoalTitle]);

  // Fetch example on mount or when context changes
  useEffect(() => {
    fetchExample();
  }, [fetchExample]);

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
      onExit={onExit}
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
            <div className="flex items-center justify-between">
              <label htmlFor="goalTitle" className="text-sm font-medium text-foreground">
                Your {goalType === "three_year" ? "3-year" : goalType === "one_year" ? "1-year" : "90-day"} goal
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={fetchExample}
                disabled={isLoadingExample}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                {isLoadingExample ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1" />
                )}
                New example
              </Button>
            </div>
            <Input
              id="goalTitle"
              placeholder={isLoadingExample ? "Generating example..." : placeholder}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{config.helpText}</p>
          </div>

          {/* Progressive disclosure for optional description - all goal types */}
          {!showDescription ? (
            <button
              type="button"
              onClick={() => setShowDescription(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Add success criteria (optional)
            </button>
          ) : (
            <div className="space-y-2 animate-fade-in">
              <label htmlFor="goalDescription" className="text-sm font-medium text-foreground">
                How will you know you've achieved it?
              </label>
              <Textarea
                id="goalDescription"
                placeholder="Describe what success looks like..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          )}
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
