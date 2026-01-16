import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { OnboardingLayout } from "./OnboardingLayout";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, ChevronRight } from "lucide-react";

/**
 * OnboardingVisionStep - Step 2: Select a pillar and create a vision
 * User picks one pillar to focus on first and describes their vision
 */
interface Props {
  pillars: { name: string; description: string }[];
  selectedPillar: string | null;
  vision: { title: string; description: string } | null;
  onSelectPillar: (pillar: string) => void;
  onSetVision: (vision: { title: string; description: string }) => void;
  onNext: () => void;
  onBack: () => void;
  onExit?: () => void;
}

// Reflective prompts for the coaching flow - rotated one at a time
const coachPrompts = [
  "Who do you want to become in this area over the long term?",
  "What would 'doing well' here look like in everyday life?",
  "What feels missing today that you'd like to change?",
  "What would future-you thank you for building here?",
  "What small shifts would make a real difference over time?",
  "If this area were thriving, how would you know?",
];

export function OnboardingVisionStep({
  pillars,
  selectedPillar,
  vision,
  onSelectPillar,
  onSetVision,
  onNext,
  onBack,
  onExit
}: Props) {
  const [title, setTitle] = useState(vision?.title || "");
  const [description, setDescription] = useState(vision?.description || "");
  const [aiExample, setAiExample] = useState<string | null>(null);
  const [isLoadingExample, setIsLoadingExample] = useState(false);

  // Coach state - simple prompt cycling
  const [showCoach, setShowCoach] = useState(false);
  const [promptIndex, setPromptIndex] = useState(0);
  
  // Progressive disclosure for optional description
  const [showDescription, setShowDescription] = useState(!!vision?.description);

  // Track if AI examples failed (for graceful fallback)
  const [exampleFailed, setExampleFailed] = useState(false);

  // Function to fetch AI-generated example (non-blocking - failures are silent)
  const fetchExample = useCallback(async () => {
    if (!selectedPillar) return;
    
    setIsLoadingExample(true);
    setAiExample(null);
    setExampleFailed(false);
    
    try {
      const { data, error } = await supabase.functions.invoke("generate-vision-example", {
        body: { pillarName: selectedPillar }
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
  }, [selectedPillar]);

  // Fetch example when pillar changes
  useEffect(() => {
    if (selectedPillar) {
      fetchExample();
    }
  }, [selectedPillar, fetchExample]);

  // Reset coach when pillar changes
  useEffect(() => {
    setShowCoach(false);
    setPromptIndex(0);
  }, [selectedPillar]);

  const handleNext = () => {
    if (selectedPillar && title.trim()) {
      onSetVision({ title: title.trim(), description: description.trim() });
      onNext();
    }
  };

  const handleNextPrompt = () => {
    setPromptIndex((prev) => (prev + 1) % coachPrompts.length);
  };

  const placeholder = aiExample 
    ? `e.g., ${aiExample}` 
    : "e.g., Become fluent in a new language";

  return (
    <OnboardingLayout
      step={2}
      totalSteps={6}
      title="Define your vision"
      subtitle="Choose one pillar to focus on first, then describe who you want to become in that area."
      onBack={onBack}
      onExit={onExit}
    >
      <div className="space-y-4">
        {/* Pillar selection */}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Which pillar would you like to start with?
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {pillars.map((pillar) => (
              <Card
                key={pillar.name}
                className={`cursor-pointer transition-calm ${
                  selectedPillar === pillar.name
                    ? "border-primary bg-accent"
                    : "hover:border-primary/30"
                }`}
                onClick={() => onSelectPillar(pillar.name)}
              >
                <CardContent className="p-3">
                  <span className="text-sm font-medium">{pillar.name}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Vision form - only shown when pillar selected */}
        {selectedPillar && (
          <div className="space-y-3 animate-fade-in">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="visionTitle" className="text-sm font-medium text-foreground">
                  Your vision for {selectedPillar}
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
                id="visionTitle"
                placeholder={isLoadingExample ? "Generating example..." : placeholder}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Describe who you want to become in this area of life
              </p>
            </div>

            {/* Lightweight Coach - optional guidance */}
            {!showCoach ? (
              <button
                type="button"
                onClick={() => setShowCoach(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Need help phrasing this?
              </button>
            ) : (
              <div className="rounded-md bg-muted/50 px-3 py-2.5 space-y-2">
                <p className="text-sm text-muted-foreground">
                  {coachPrompts[promptIndex]}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleNextPrompt}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                  >
                    Next question
                    <ChevronRight className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCoach(false)}
                    className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                  >
                    Hide
                  </button>
                </div>
              </div>
            )}

            {/* Progressive disclosure for optional description */}
            {!showDescription ? (
              <button
                type="button"
                onClick={() => setShowDescription(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Add personal meaning (optional)
              </button>
            ) : (
              <div className="space-y-1.5 animate-fade-in">
                <label htmlFor="visionDescription" className="text-sm font-medium text-foreground">
                  Why is this important to you?
                </label>
                <Textarea
                  id="visionDescription"
                  placeholder="What will achieving this vision mean for your life?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
            )}
          </div>
        )}

        {/* Continue button */}
        <div className="flex justify-end pt-2">
          <Button onClick={handleNext} disabled={!selectedPillar || !title.trim()}>
            Continue
          </Button>
        </div>
      </div>
    </OnboardingLayout>
  );
}
