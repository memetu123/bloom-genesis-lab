import { useState, useEffect } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { OnboardingLayout } from "./OnboardingLayout";
import { SUGGESTED_PILLARS } from "@/types/todayoum";
import { usePillarsData } from "@/hooks/useAppData";

/**
 * OnboardingPillarStep - Step 1: Choose life pillars
 * For new users: select from suggestions or add custom pillars
 * For Planning Guide: shows existing pillars and allows adding more
 */
interface Props {
  selectedPillars: { name: string; description: string }[];
  onSelect: (pillars: { name: string; description: string }[]) => void;
  onNext: () => void;
  onExit?: () => void;
  isPlanningGuide?: boolean;
}

export function OnboardingPillarStep({ selectedPillars, onSelect, onNext, onExit, isPlanningGuide }: Props) {
  const [customPillar, setCustomPillar] = useState("");
  const { pillars: existingPillars, loading: loadingPillars } = usePillarsData();
  const [initialized, setInitialized] = useState(false);

  // For Planning Guide: pre-populate with existing pillars from database
  useEffect(() => {
    if (isPlanningGuide && !initialized && !loadingPillars && existingPillars.length > 0) {
      const existingPillarData = existingPillars.map(p => ({
        name: p.name,
        description: p.description || ""
      }));
      onSelect(existingPillarData);
      setInitialized(true);
    }
  }, [isPlanningGuide, existingPillars, loadingPillars, initialized, onSelect]);

  // Get names of existing pillars (from database)
  const existingPillarNames = new Set(existingPillars.map(p => p.name));
  
  // Split pillars into active (existing) and available (not yet selected)
  const activePillars = selectedPillars.filter(p => existingPillarNames.has(p.name));
  const newlySelectedPillars = selectedPillars.filter(p => !existingPillarNames.has(p.name));
  
  // Available pillars = suggested pillars not yet selected
  const availablePillars = SUGGESTED_PILLARS.filter(
    p => !selectedPillars.some(sp => sp.name === p.name)
  );

  const togglePillar = (pillar: { name: string; description: string }) => {
    const isSelected = selectedPillars.some(p => p.name === pillar.name);
    if (isSelected) {
      // Don't allow deselecting existing pillars in Planning Guide mode
      if (isPlanningGuide && existingPillarNames.has(pillar.name)) {
        return;
      }
      onSelect(selectedPillars.filter(p => p.name !== pillar.name));
    } else {
      onSelect([...selectedPillars, pillar]);
    }
  };

  const addCustomPillar = () => {
    if (customPillar.trim() && !selectedPillars.some(p => p.name === customPillar.trim())) {
      onSelect([...selectedPillars, { name: customPillar.trim(), description: "" }]);
      setCustomPillar("");
    }
  };

  const isSelected = (name: string) => selectedPillars.some(p => p.name === name);
  const isExisting = (name: string) => existingPillarNames.has(name);

  // For Planning Guide mode
  if (isPlanningGuide) {
    return (
      <OnboardingLayout
        step={1}
        totalSteps={6}
        title="Your pillars"
        subtitle="These are the life areas you're currently planning for. You can add more at any time."
        showBack={false}
        onExit={onExit}
      >
        <div className="space-y-6">
          {/* Acknowledgment of existing pillars */}
          {activePillars.length > 0 && (
            <p className="text-sm text-muted-foreground">
              You selected {activePillars.length} pillar{activePillars.length !== 1 ? "s" : ""} during onboarding.
            </p>
          )}

          {/* Currently active pillars */}
          {activePillars.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">Currently active pillars</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {activePillars.map((pillar) => (
                  <Card
                    key={pillar.name}
                    className="border-primary bg-accent cursor-default"
                  >
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className="mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 border-primary bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground text-sm">{pillar.name}</h3>
                        {pillar.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{pillar.description}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {/* Show newly selected pillars alongside active ones */}
                {newlySelectedPillars.map((pillar) => (
                  <Card
                    key={pillar.name}
                    className="cursor-pointer transition-calm hover:shadow-soft-md border-primary bg-accent/50"
                    onClick={() => togglePillar(pillar)}
                  >
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className="mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 border-primary bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground text-sm">{pillar.name}</h3>
                        {pillar.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{pillar.description}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Add more areas section */}
          {availablePillars.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Add more areas (optional)</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {availablePillars.map((pillar) => (
                  <Card
                    key={pillar.name}
                    className="cursor-pointer transition-calm hover:shadow-soft-md hover:border-primary/30 opacity-75 hover:opacity-100"
                    onClick={() => togglePillar(pillar)}
                  >
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className="mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 border-muted-foreground/30" />
                      <div>
                        <h3 className="font-medium text-foreground text-sm">{pillar.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{pillar.description}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Custom pillar section */}
          <div className="space-y-3 pt-2 border-t">
            <p className="text-sm text-muted-foreground">Looking for something else?</p>
            <div className="flex gap-2">
              <Input
                placeholder="Add a custom pillar..."
                value={customPillar}
                onChange={(e) => setCustomPillar(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomPillar()}
              />
              <Button variant="outline" onClick={addCustomPillar} disabled={!customPillar.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Continue button */}
          <div className="flex items-center justify-between pt-4">
            <span className="text-sm text-muted-foreground">
              {selectedPillars.length} pillar{selectedPillars.length !== 1 ? "s" : ""} total
            </span>
            <Button onClick={onNext} disabled={selectedPillars.length === 0}>
              Continue
            </Button>
          </div>
        </div>
      </OnboardingLayout>
    );
  }

  // Original onboarding flow for new users
  return (
    <OnboardingLayout
      step={1}
      totalSteps={6}
      title="Choose your life pillars"
      subtitle="Select the areas of life that matter most to you. You can always change these later."
      showBack={false}
      onExit={onExit}
    >
      <div className="space-y-6">
        {/* Suggested pillars grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          {SUGGESTED_PILLARS.map((pillar) => (
            <Card
              key={pillar.name}
              className={`cursor-pointer transition-calm hover:shadow-soft-md ${
                isSelected(pillar.name)
                  ? "border-primary bg-accent"
                  : "hover:border-primary/30"
              }`}
              onClick={() => togglePillar(pillar)}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <div
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-calm ${
                    isSelected(pillar.name)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                  }`}
                >
                  {isSelected(pillar.name) && <Check className="h-3 w-3" />}
                </div>
                <div>
                  <h3 className="font-medium text-foreground text-sm">{pillar.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{pillar.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Custom pillar input */}
        <div className="flex gap-2">
          <Input
            placeholder="Add a custom pillar..."
            value={customPillar}
            onChange={(e) => setCustomPillar(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustomPillar()}
          />
          <Button variant="outline" onClick={addCustomPillar} disabled={!customPillar.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Selected count and continue */}
        <div className="flex items-center justify-between pt-4">
          <span className="text-sm text-muted-foreground">
            {selectedPillars.length} pillar{selectedPillars.length !== 1 ? "s" : ""} selected
          </span>
          <Button onClick={onNext} disabled={selectedPillars.length === 0}>
            Continue
          </Button>
        </div>
      </div>
    </OnboardingLayout>
  );
}
