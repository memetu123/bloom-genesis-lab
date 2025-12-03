import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star, ChevronRight, Target, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { GoalType } from "@/types/todayoum";
import FocusFilter from "@/components/FocusFilter";

/**
 * Goals Page
 * Lists all goals grouped by type with focus toggle
 */

interface Goal {
  id: string;
  title: string;
  description: string | null;
  goal_type: GoalType;
  is_focus: boolean;
  life_vision_id: string | null;
  parent_goal_id: string | null;
  pillar_id: string;
}

interface Vision {
  id: string;
  title: string;
  pillar_id: string;
}

interface GoalWithRelations extends Goal {
  vision_title?: string;
  parent_title?: string;
}

const GOAL_TYPE_CONFIG: Record<GoalType, { label: string; order: number }> = {
  three_year: { label: "3-Year Goals", order: 1 },
  one_year: { label: "1-Year Goals", order: 2 },
  ninety_day: { label: "90-Day Plans", order: 3 },
};

const Goals = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [goals, setGoals] = useState<GoalWithRelations[]>([]);
  const [visions, setVisions] = useState<Vision[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingFocus, setUpdatingFocus] = useState<string | null>(null);
  const [showFocusedOnly, setShowFocusedOnly] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedVisionId, setSelectedVisionId] = useState("");
  const [selectedGoalType, setSelectedGoalType] = useState<GoalType>("three_year");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        // Fetch all goals
        const { data: goalsData, error: goalsError } = await supabase
          .from("goals")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });

        if (goalsError) throw goalsError;

        // Fetch visions for labels and dropdown
        const { data: visionsData } = await supabase
          .from("life_visions")
          .select("id, title, pillar_id")
          .eq("user_id", user.id);

        setVisions(visionsData || []);

        const visionsMap: Record<string, string> = {};
        (visionsData || []).forEach(v => {
          visionsMap[v.id] = v.title;
        });

        // Build goals map for parent titles
        const goalsMap: Record<string, string> = {};
        (goalsData || []).forEach(g => {
          goalsMap[g.id] = g.title;
        });

        // Enrich goals with relation titles
        const enrichedGoals: GoalWithRelations[] = (goalsData || []).map(g => ({
          ...g,
          vision_title: g.life_vision_id ? visionsMap[g.life_vision_id] : undefined,
          parent_title: g.parent_goal_id ? goalsMap[g.parent_goal_id] : undefined,
        }));

        setGoals(enrichedGoals);
      } catch (error: any) {
        console.error("Error fetching goals:", error);
        toast.error("Failed to load goals");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const toggleFocus = async (goalId: string, currentFocus: boolean) => {
    if (updatingFocus) return;
    setUpdatingFocus(goalId);

    try {
      const { error } = await supabase
        .from("goals")
        .update({ is_focus: !currentFocus })
        .eq("id", goalId);

      if (error) throw error;

      setGoals(prev =>
        prev.map(g => g.id === goalId ? { ...g, is_focus: !currentFocus } : g)
      );
      toast.success(currentFocus ? "Removed from focus" : "Added to focus");
    } catch (error: any) {
      console.error("Error toggling focus:", error);
      toast.error("Failed to update focus");
    } finally {
      setUpdatingFocus(null);
    }
  };

  const handleAddGoal = async () => {
    if (!user || !newTitle.trim() || !selectedVisionId) return;
    setSaving(true);

    try {
      const vision = visions.find(v => v.id === selectedVisionId);
      if (!vision) throw new Error("Vision not found");

      const { data, error } = await supabase
        .from("goals")
        .insert({
          user_id: user.id,
          pillar_id: vision.pillar_id,
          life_vision_id: selectedVisionId,
          goal_type: selectedGoalType,
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          status: "not_started"
        })
        .select()
        .single();

      if (error) throw error;

      setGoals(prev => [...prev, { ...data, vision_title: vision.title }]);
      setNewTitle("");
      setNewDescription("");
      setSelectedVisionId("");
      setSelectedGoalType("three_year");
      setDialogOpen(false);
      toast.success("Goal created");
    } catch (error: any) {
      console.error("Error adding goal:", error);
      toast.error("Failed to add goal");
    } finally {
      setSaving(false);
    }
  };

  // Filter goals based on focus toggle
  const filteredGoals = showFocusedOnly 
    ? goals.filter(g => g.is_focus) 
    : goals;

  // Group goals by type
  const groupedGoals = filteredGoals.reduce<Record<GoalType, GoalWithRelations[]>>((acc, goal) => {
    if (!acc[goal.goal_type]) {
      acc[goal.goal_type] = [];
    }
    acc[goal.goal_type].push(goal);
    return acc;
  }, {} as Record<GoalType, GoalWithRelations[]>);

  // Sort goal types by order
  const sortedTypes = (Object.keys(groupedGoals) as GoalType[]).sort(
    (a, b) => GOAL_TYPE_CONFIG[a].order - GOAL_TYPE_CONFIG[b].order
  );

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <p className="text-muted-foreground text-center">Loading goals...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">My Goals</h1>
          <p className="text-muted-foreground mt-1">
            View and focus on goals at every level of your plan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FocusFilter
            showFocusedOnly={showFocusedOnly}
            onToggle={() => setShowFocusedOnly(!showFocusedOnly)}
          />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Goal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Goal</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Vision</Label>
                  <Select value={selectedVisionId} onValueChange={setSelectedVisionId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a vision" />
                    </SelectTrigger>
                    <SelectContent>
                      {visions.map(vision => (
                        <SelectItem key={vision.id} value={vision.id}>
                          {vision.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Goal Type</Label>
                  <Select value={selectedGoalType} onValueChange={(v) => setSelectedGoalType(v as GoalType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="three_year">3-Year Goal</SelectItem>
                      <SelectItem value="one_year">1-Year Goal</SelectItem>
                      <SelectItem value="ninety_day">90-Day Plan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="What do you want to achieve?"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Add more details..."
                    rows={3}
                  />
                </div>
                <Button 
                  onClick={handleAddGoal} 
                  disabled={saving || !newTitle.trim() || !selectedVisionId}
                  className="w-full"
                >
                  {saving ? "Saving..." : "Add Goal"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {filteredGoals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">
              {showFocusedOnly ? "No focused goals" : "No goals yet"}
            </p>
            <p className="text-sm text-muted-foreground">
              {showFocusedOnly 
                ? "Star goals to add them to your focus." 
                : "Create goals using the Add Goal button above."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {sortedTypes.map((goalType) => (
            <div key={goalType}>
              <h2 className="text-lg font-medium text-foreground mb-3">
                {GOAL_TYPE_CONFIG[goalType].label}
              </h2>
              <div className="space-y-2">
                {groupedGoals[goalType].map((goal) => (
                  <Card key={goal.id} className="transition-calm">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        {/* Focus toggle */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFocus(goal.id, goal.is_focus);
                          }}
                          disabled={updatingFocus === goal.id}
                          className="flex-shrink-0 p-1 rounded-full hover:bg-muted transition-calm disabled:opacity-50"
                          title={goal.is_focus ? "Remove from focus" : "Add to focus"}
                        >
                          <Star
                            className={`h-5 w-5 transition-calm ${
                              goal.is_focus 
                                ? "fill-primary text-primary" 
                                : "text-muted-foreground"
                            }`}
                          />
                        </button>

                        {/* Goal content */}
                        <div 
                          className="flex-1 cursor-pointer"
                          onClick={() => navigate(`/goal/${goal.id}`)}
                        >
                          <h3 className="font-medium text-foreground">{goal.title}</h3>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            {goal.vision_title && (
                              <span>Vision: {goal.vision_title}</span>
                            )}
                            {goal.parent_title && (
                              <>
                                {goal.vision_title && <span>•</span>}
                                <span>Parent: {goal.parent_title}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <ChevronRight 
                          className="h-5 w-5 text-muted-foreground flex-shrink-0 cursor-pointer"
                          onClick={() => navigate(`/goal/${goal.id}`)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Goals;