import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { OnboardingLayout } from "./OnboardingLayout";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, Sparkles, AlertCircle, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

interface VisionOption {
  text: string;
  style: "aspirational" | "balanced" | "concrete";
  why_it_works: string;
}

interface CoachSuggestions {
  clarifying_question: string | null;
  recommended: { text: string; rationale: string };
  options: VisionOption[];
  do_not_do?: string[];
}

const styleLabels: Record<string, { label: string; className: string }> = {
  aspirational: { label: "Aspirational", className: "bg-primary/10 text-primary border-primary/20" },
  balanced: { label: "Balanced", className: "bg-accent text-accent-foreground border-accent" },
  concrete: { label: "Concrete", className: "bg-muted text-muted-foreground border-muted" },
};

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

  // Coach state
  const [isLoadingCoach, setIsLoadingCoach] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coachSuggestions, setCoachSuggestions] = useState<CoachSuggestions | null>(null);

  // Function to fetch AI-generated example
  const fetchExample = useCallback(async () => {
    if (!selectedPillar) return;
    
    setIsLoadingExample(true);
    setAiExample(null);
    
    try {
      const { data, error } = await supabase.functions.invoke("generate-vision-example", {
        body: { pillarName: selectedPillar }
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
  }, [selectedPillar]);

  // Fetch example when pillar changes
  useEffect(() => {
    if (selectedPillar) {
      fetchExample();
    }
  }, [selectedPillar, fetchExample]);

  // Clear coach suggestions when pillar changes
  useEffect(() => {
    setCoachSuggestions(null);
    setCoachError(null);
  }, [selectedPillar]);

  const handleNext = () => {
    if (selectedPillar && title.trim()) {
      onSetVision({ title: title.trim(), description: description.trim() });
      onNext();
    }
  };

  const fetchCoachSuggestions = async () => {
    if (!title.trim()) return;

    setIsLoadingCoach(true);
    setCoachError(null);
    setCoachSuggestions(null);

    try {
      const { data, error } = await supabase.functions.invoke("coach-vision-phrasing", {
        body: {
          draft: title.trim(),
          pillar: selectedPillar,
        }
      });

      if (error) {
        console.error("Coach error:", error);
        setCoachError(error.message || "Failed to get suggestions");
        return;
      }

      if (data?.error) {
        setCoachError(data.error);
        return;
      }

      setCoachSuggestions(data);
    } catch (err) {
      console.error("Failed to fetch coach suggestions:", err);
      setCoachError("Something went wrong. Please try again.");
    } finally {
      setIsLoadingCoach(false);
    }
  };

  const handleSelectSuggestion = (text: string) => {
    setTitle(text);
    setCoachSuggestions(null);
  };

  const placeholder = aiExample 
    ? `e.g., ${aiExample}` 
    : "e.g., Become fluent in a new language";

  const canUseCoach = title.trim().length > 0;

  return (
    <OnboardingLayout
      step={2}
      totalSteps={6}
      title="Define your vision"
      subtitle="Choose one pillar to focus on first, then describe who you want to become in that area."
      onBack={onBack}
      onExit={onExit}
    >
      <div className="space-y-6">
        {/* Pillar selection */}
        <div>
          <label className="text-sm font-medium text-foreground mb-3 block">
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
          <div className="space-y-4 animate-fade-in">
            <div className="space-y-2">
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
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Describe who you want to become in this area of life
                </p>
                {/* Planning Coach Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={fetchCoachSuggestions}
                  disabled={!canUseCoach || isLoadingCoach}
                  className="h-7 text-xs text-primary hover:text-primary/80 hover:bg-primary/5"
                >
                  {isLoadingCoach ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Sparkles className="h-3 w-3 mr-1" />
                  )}
                  Rewrite with Planning Coach
                </Button>
              </div>
              {!canUseCoach && !coachSuggestions && (
                <p className="text-xs text-muted-foreground/60 text-right">
                  Write a rough draft first
                </p>
              )}
            </div>

            {/* Coach Error State */}
            {coachError && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-destructive">{coachError}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={fetchCoachSuggestions}
                        className="mt-2 h-7 text-xs"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Retry
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Coach Suggestions Panel */}
            {coachSuggestions && (
              <div className="space-y-4 animate-fade-in">
                {/* Clarifying Question */}
                {coachSuggestions.clarifying_question && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-4">
                      <p className="text-sm text-foreground">
                        💭 {coachSuggestions.clarifying_question}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Recommended Option */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                    Recommended
                  </p>
                  <Card
                    className="cursor-pointer border-primary/30 bg-primary/5 hover:border-primary/50 transition-calm"
                    onClick={() => handleSelectSuggestion(coachSuggestions.recommended.text)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">
                            {coachSuggestions.recommended.text}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {coachSuggestions.recommended.rationale}
                          </p>
                        </div>
                        <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Other Options */}
                {coachSuggestions.options.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                      Other options
                    </p>
                    <div className="space-y-2">
                      {coachSuggestions.options.map((option, index) => (
                        <Card
                          key={index}
                          className="cursor-pointer hover:border-primary/30 transition-calm"
                          onClick={() => handleSelectSuggestion(option.text)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="text-sm text-foreground">{option.text}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge 
                                    variant="outline" 
                                    className={`text-[10px] px-1.5 py-0 ${styleLabels[option.style]?.className || ""}`}
                                  >
                                    {styleLabels[option.style]?.label || option.style}
                                  </Badge>
                                  <p className="text-xs text-muted-foreground">
                                    {option.why_it_works}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dismiss */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCoachSuggestions(null)}
                  className="text-xs text-muted-foreground"
                >
                  Dismiss suggestions
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="visionDescription" className="text-sm font-medium text-foreground">
                Why is this important to you? (optional)
              </label>
              <Textarea
                id="visionDescription"
                placeholder="What will achieving this vision mean for your life?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}

        {/* Continue button */}
        <div className="flex justify-end pt-4">
          <Button onClick={handleNext} disabled={!selectedPillar || !title.trim()}>
            Continue
          </Button>
        </div>
      </div>
    </OnboardingLayout>
  );
}
