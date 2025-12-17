import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { OnboardingLayout } from "./OnboardingLayout";
import { SUGGESTED_PILLARS } from "@/types/todayoum";

/**
 * OnboardingPillarStep - Step 1: Choose life pillars
 * User selects from suggestions or adds custom pillars
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

  const togglePillar = (pillar: { name: string; description: string }) => {
    const isSelected = selectedPillars.some(p => p.name === pillar.name);
    if (isSelected) {
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

  return (
    <OnboardingLayout
      step={1}
      totalSteps={6}
      title={isPlanningGuide ? "Add new pillars" : "Choose your life pillars"}
      subtitle={isPlanningGuide 
        ? "Select additional areas of life to plan for." 
        : "Select the areas of life that matter most to you. You can always change these later."
      }
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