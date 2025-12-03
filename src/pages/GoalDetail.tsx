import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Target, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { GoalType } from "@/types/todayoum";

/**
 * Goal Detail Page
 * Shows a goal and its children (sub-goals or commitments)
 */

interface Goal {
  id: string;
  title: string;
  description: string | null;
  goal_type: GoalType;
  pillar_id: string;
  life_vision_id: string | null;
  parent_goal_id: string | null;
  status: string;
}

interface Commitment {
  id: string;
  title: string;
  frequency_json: { times_per_week: number };
  is_active: boolean;
}

interface Breadcrumb {
  pillar?: string;
  vision?: string;
  threeYear?: string;
  oneYear?: string;
}

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  three_year: "3-Year Goal",
  one_year: "1-Year Goal",
  ninety_day: "90-Day Plan"
};

const CHILD_TYPE_LABELS: Record<GoalType, { childType: GoalType | "commitment"; label: string; addLabel: string }> = {
  three_year: { childType: "one_year", label: "1-Year Goals for this 3-Year Direction", addLabel: "Add 1-Year Goal" },
  one_year: { childType: "ninety_day", label: "90-Day Plans for this 1-Year Goal", addLabel: "Add 90-Day Plan" },
  ninety_day: { childType: "commitment", label: "Weekly Commitments for this 90-Day Plan", addLabel: "Add Weekly Commitment" }
};

const GoalDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [childGoals, setChildGoals] = useState<Goal[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<Breadcrumb>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Form state
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newFrequency, setNewFrequency] = useState("3");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || !id) return;

    const fetchData = async () => {
      try {
        // Fetch goal
        const { data: goalData, error: goalError } = await supabase
          .from("goals")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (goalError) throw goalError;
        if (!goalData) {
          toast.error("Goal not found");
          navigate("/dashboard");
          return;
        }

        setGoal(goalData as Goal);

        // Build breadcrumb
        const bc: Breadcrumb = {};

        // Get pillar
        const { data: pillar } = await supabase
          .from("pillars")
          .select("name")
          .eq("id", goalData.pillar_id)
          .maybeSingle();
        if (pillar) bc.pillar = pillar.name;

        // Get vision if exists
        if (goalData.life_vision_id) {
          const { data: vision } = await supabase
            .from("life_visions")
            .select("title")
            .eq("id", goalData.life_vision_id)
            .maybeSingle();
          if (vision) bc.vision = vision.title;
        }

        // Get parent goals for breadcrumb
        if (goalData.goal_type === "one_year" && goalData.parent_goal_id) {
          const { data: threeYear } = await supabase
            .from("goals")
            .select("title")
            .eq("id", goalData.parent_goal_id)
            .maybeSingle();
          if (threeYear) bc.threeYear = threeYear.title;
        }

        if (goalData.goal_type === "ninety_day" && goalData.parent_goal_id) {
          const { data: oneYear } = await supabase
            .from("goals")
            .select("title, parent_goal_id")
            .eq("id", goalData.parent_goal_id)
            .maybeSingle();
          if (oneYear) {
            bc.oneYear = oneYear.title;
            if (oneYear.parent_goal_id) {
              const { data: threeYear } = await supabase
                .from("goals")
                .select("title")
                .eq("id", oneYear.parent_goal_id)
                .maybeSingle();
              if (threeYear) bc.threeYear = threeYear.title;
            }
          }
        }

        setBreadcrumb(bc);

        // Fetch children based on goal type
        if (goalData.goal_type === "ninety_day") {
          // Fetch commitments
          const { data: commitmentsData } = await supabase
            .from("weekly_commitments")
            .select("*")
            .eq("goal_id", id)
            .eq("user_id", user.id)
            .order("created_at", { ascending: true });

          setCommitments((commitmentsData || []).map(c => ({
            ...c,
            frequency_json: c.frequency_json as { times_per_week: number }
          })));
        } else {
          // Fetch child goals
          const childType = goalData.goal_type === "three_year" ? "one_year" : "ninety_day";
          const { data: childGoalsData } = await supabase
            .from("goals")
            .select("*")
            .eq("parent_goal_id", id)
            .eq("goal_type", childType)
            .eq("user_id", user.id)
            .order("created_at", { ascending: true });

          setChildGoals((childGoalsData || []) as Goal[]);
        }
      } catch (error: any) {
        console.error("Error fetching goal:", error);
        toast.error("Failed to load goal");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, id, navigate]);

  const handleAddChild = async () => {
    if (!user || !goal || !newTitle.trim()) return;
    setSaving(true);

    try {
      if (goal.goal_type === "ninety_day") {
        // Add commitment
        const { data, error } = await supabase
          .from("weekly_commitments")
          .insert({
            user_id: user.id,
            goal_id: goal.id,
            title: newTitle.trim(),
            commitment_type: "habit",
            frequency_json: { times_per_week: parseInt(newFrequency) },
            is_active: true
          })
          .select()
          .single();

        if (error) throw error;

        setCommitments(prev => [...prev, {
          ...data,
          frequency_json: data.frequency_json as { times_per_week: number }
        }]);
        toast.success("Weekly Commitment added");
      } else {
        // Add child goal
        const childType = goal.goal_type === "three_year" ? "one_year" : "ninety_day";
        const { data, error } = await supabase
          .from("goals")
          .insert({
            user_id: user.id,
            pillar_id: goal.pillar_id,
            life_vision_id: goal.life_vision_id,
            parent_goal_id: goal.id,
            goal_type: childType,
            title: newTitle.trim(),
            description: newDescription.trim() || null,
            status: "not_started"
          })
          .select()
          .single();

        if (error) throw error;

        setChildGoals(prev => [...prev, data as Goal]);
        toast.success(`${childType === "one_year" ? "1-Year Goal" : "90-Day Plan"} added`);
      }

      setNewTitle("");
      setNewDescription("");
      setNewFrequency("3");
      setDialogOpen(false);
    } catch (error: any) {
      console.error("Error adding:", error);
      toast.error("Failed to add");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!goal) return null;

  const childConfig = CHILD_TYPE_LABELS[goal.goal_type];
  const isNinetyDay = goal.goal_type === "ninety_day";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Breadcrumb */}
        <div className="text-sm text-muted-foreground mb-4 flex items-center flex-wrap gap-1">
          {breadcrumb.pillar && (
            <>
              <span className="text-primary font-medium">{breadcrumb.pillar}</span>
              <ChevronRight className="h-3 w-3" />
            </>
          )}
          {breadcrumb.vision && (
            <>
              <span>{breadcrumb.vision}</span>
              <ChevronRight className="h-3 w-3" />
            </>
          )}
          {breadcrumb.threeYear && (
            <>
              <span>{breadcrumb.threeYear}</span>
              <ChevronRight className="h-3 w-3" />
            </>
          )}
          {breadcrumb.oneYear && (
            <>
              <span>{breadcrumb.oneYear}</span>
              <ChevronRight className="h-3 w-3" />
            </>
          )}
          <span>{GOAL_TYPE_LABELS[goal.goal_type]}</span>
        </div>

        {/* Goal info */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground mb-2">{goal.title}</h1>
          {goal.description && (
            <p className="text-muted-foreground">{goal.description}</p>
          )}
        </div>

        {/* Children section */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">{childConfig.label}</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                {childConfig.addLabel}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{childConfig.addLabel}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="child-title">Title</Label>
                  <Input
                    id="child-title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder={isNinetyDay ? "e.g., Study Spanish" : "What do you want to achieve?"}
                  />
                </div>
                {isNinetyDay ? (
                  <div>
                    <Label htmlFor="frequency">Times per week</Label>
                    <Select value={newFrequency} onValueChange={setNewFrequency}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7].map(n => (
                          <SelectItem key={n} value={n.toString()}>{n}× per week</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="child-description">Description (optional)</Label>
                    <Textarea
                      id="child-description"
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="Add more details..."
                      rows={3}
                    />
                  </div>
                )}
                <Button 
                  onClick={handleAddChild} 
                  disabled={saving || !newTitle.trim()}
                  className="w-full"
                >
                  {saving ? "Saving..." : "Add"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Children list */}
        {isNinetyDay ? (
          // Show commitments
          commitments.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Target className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No weekly commitments yet</p>
                <p className="text-sm text-muted-foreground mt-1">Add habits to track your progress</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {commitments.map((commitment) => (
                <Card key={commitment.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-foreground">{commitment.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {commitment.frequency_json.times_per_week}× per week
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        commitment.is_active 
                          ? "bg-primary/10 text-primary" 
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {commitment.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        ) : (
          // Show child goals
          childGoals.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Target className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No {goal.goal_type === "three_year" ? "1-year goals" : "90-day plans"} yet</p>
                <p className="text-sm text-muted-foreground mt-1">Break down your goal into smaller steps</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {childGoals.map((child) => (
                <Card 
                  key={child.id} 
                  className="cursor-pointer hover:border-primary/50 transition-calm"
                  onClick={() => navigate(`/goal/${child.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-foreground">{child.title}</h3>
                        {child.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{child.description}</p>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}
      </main>
    </div>
  );
};

export default GoalDetail;
