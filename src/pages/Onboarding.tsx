import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { OnboardingPillarStep } from "@/components/onboarding/OnboardingPillarStep";
import { OnboardingVisionStep } from "@/components/onboarding/OnboardingVisionStep";
import { OnboardingGoalStep } from "@/components/onboarding/OnboardingGoalStep";
import { OnboardingCommitmentsStep } from "@/components/onboarding/OnboardingCommitmentsStep";
import { OnboardingData } from "@/types/todayoum";

/**
 * Onboarding Page - Multi-step onboarding flow
 * Guides new users through setting up pillars, vision, goals, and commitments
 */
const Onboarding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refetchAll } = useAppData();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    selectedPillars: [],
    selectedPillarForVision: null,
    vision: null,
    threeYearGoal: null,
    oneYearGoal: null,
    ninetyDayGoal: null,
    commitments: []
  });

  // Save all onboarding data to database
  const saveOnboardingData = async () => {
    if (!user) return;
    setSaving(true);

    try {
      // 1. Create all pillars
      const pillarInserts = data.selectedPillars.map((p, index) => ({
        user_id: user.id,
        name: p.name,
        description: p.description || null,
        sort_order: index
      }));

      const { data: insertedPillars, error: pillarError } = await supabase
        .from("pillars")
        .insert(pillarInserts)
        .select();

      if (pillarError) throw pillarError;

      // Find the pillar we created vision for
      const focusPillar = insertedPillars?.find(p => p.name === data.selectedPillarForVision);
      if (!focusPillar || !data.vision) throw new Error("Missing pillar or vision data");

      // 2. Create vision
      const { data: insertedVision, error: visionError } = await supabase
        .from("life_visions")
        .insert({
          user_id: user.id,
          pillar_id: focusPillar.id,
          title: data.vision.title,
          description: data.vision.description || null
        })
        .select()
        .single();

      if (visionError) throw visionError;

      // 3. Create 3-year goal
      const { data: threeYearGoal, error: threeYearError } = await supabase
        .from("goals")
        .insert({
          user_id: user.id,
          pillar_id: focusPillar.id,
          life_vision_id: insertedVision.id,
          goal_type: "three_year" as const,
          title: data.threeYearGoal!.title,
          description: data.threeYearGoal!.description || null
        })
        .select()
        .single();

      if (threeYearError) throw threeYearError;

      // 4. Create 1-year goal
      const { data: oneYearGoal, error: oneYearError } = await supabase
        .from("goals")
        .insert({
          user_id: user.id,
          pillar_id: focusPillar.id,
          life_vision_id: insertedVision.id,
          parent_goal_id: threeYearGoal.id,
          goal_type: "one_year" as const,
          title: data.oneYearGoal!.title,
          description: data.oneYearGoal!.description || null
        })
        .select()
        .single();

      if (oneYearError) throw oneYearError;

      // 5. Create 90-day goal
      const { data: ninetyDayGoal, error: ninetyDayError } = await supabase
        .from("goals")
        .insert({
          user_id: user.id,
          pillar_id: focusPillar.id,
          life_vision_id: insertedVision.id,
          parent_goal_id: oneYearGoal.id,
          goal_type: "ninety_day" as const,
          title: data.ninetyDayGoal!.title,
          description: data.ninetyDayGoal!.description || null
        })
        .select()
        .single();

      if (ninetyDayError) throw ninetyDayError;

      // 6. Create weekly commitments
      const commitmentInserts = data.commitments.map(c => ({
        user_id: user.id,
        goal_id: ninetyDayGoal.id,
        title: c.title,
        commitment_type: "habit" as const,
        frequency_json: { times_per_week: c.timesPerWeek },
        // Set proper recurrence: 7x = daily, otherwise weekly with all days
        recurrence_type: c.timesPerWeek >= 7 ? 'daily' : 'weekly',
        times_per_day: 1,
        repeat_days_of_week: c.timesPerWeek >= 7 
          ? null 
          : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].slice(0, c.timesPerWeek),
      }));

      const { error: commitmentError } = await supabase
        .from("weekly_commitments")
        .insert(commitmentInserts);

      if (commitmentError) throw commitmentError;

      // 7. Mark onboarding complete
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // Refresh global cache so new data appears immediately
      await refetchAll();
      
      toast.success("Your life plan is ready!");
      navigate("/dashboard");
    } catch (error: any) {
      console.error("Onboarding save error:", error);
      toast.error(error.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Render current step
  switch (step) {
    case 1:
      return (
        <OnboardingPillarStep
          selectedPillars={data.selectedPillars}
          onSelect={(pillars) => setData({ ...data, selectedPillars: pillars })}
          onNext={() => setStep(2)}
        />
      );
    case 2:
      return (
        <OnboardingVisionStep
          pillars={data.selectedPillars}
          selectedPillar={data.selectedPillarForVision}
          vision={data.vision}
          onSelectPillar={(pillar) => setData({ ...data, selectedPillarForVision: pillar })}
          onSetVision={(vision) => setData({ ...data, vision })}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      );
    case 3:
      return (
        <OnboardingGoalStep
          step={3}
          goalType="three_year"
          pillarName={data.selectedPillarForVision || ""}
          visionTitle={data.vision?.title}
          goal={data.threeYearGoal}
          onSetGoal={(goal) => setData({ ...data, threeYearGoal: goal })}
          onNext={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      );
    case 4:
      return (
        <OnboardingGoalStep
          step={4}
          goalType="one_year"
          pillarName={data.selectedPillarForVision || ""}
          visionTitle={data.vision?.title}
          parentGoalTitle={data.threeYearGoal?.title}
          goal={data.oneYearGoal}
          onSetGoal={(goal) => setData({ ...data, oneYearGoal: goal })}
          onNext={() => setStep(5)}
          onBack={() => setStep(3)}
        />
      );
    case 5:
      return (
        <OnboardingGoalStep
          step={5}
          goalType="ninety_day"
          pillarName={data.selectedPillarForVision || ""}
          visionTitle={data.vision?.title}
          parentGoalTitle={data.oneYearGoal?.title}
          goal={data.ninetyDayGoal}
          onSetGoal={(goal) => setData({ ...data, ninetyDayGoal: goal })}
          onNext={() => setStep(6)}
          onBack={() => setStep(4)}
        />
      );
    case 6:
      return (
        <OnboardingCommitmentsStep
          pillarName={data.selectedPillarForVision || ""}
          ninetyDayGoal={data.ninetyDayGoal?.title || ""}
          commitments={data.commitments}
          onSetCommitments={(commitments) => setData({ ...data, commitments })}
          onComplete={saveOnboardingData}
          onBack={() => setStep(5)}
          loading={saving}
        />
      );
    default:
      return null;
  }
};

export default Onboarding;