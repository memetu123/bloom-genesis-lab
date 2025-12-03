import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Target, ChevronRight, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

/**
 * Vision Detail Page
 * Shows a vision and its 3-year goals
 */

interface Vision {
  id: string;
  title: string;
  description: string | null;
  pillar_id: string;
  is_focus: boolean;
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: string;
  is_focus: boolean;
}

interface Pillar {
  id: string;
  name: string;
}

const VisionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [vision, setVision] = useState<Vision | null>(null);
  const [pillar, setPillar] = useState<Pillar | null>(null);
  const [threeYearGoals, setThreeYearGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalDescription, setNewGoalDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingFocus, setUpdatingFocus] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !id) return;

    const fetchData = async () => {
      try {
        // Fetch vision
        const { data: visionData, error: visionError } = await supabase
          .from("life_visions")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (visionError) throw visionError;
        if (!visionData) {
          toast.error("Vision not found");
          navigate("/dashboard");
          return;
        }

        setVision(visionData);

        // Fetch pillar
        const { data: pillarData } = await supabase
          .from("pillars")
          .select("*")
          .eq("id", visionData.pillar_id)
          .maybeSingle();

        setPillar(pillarData);

        // Fetch 3-year goals for this vision
        const { data: goalsData, error: goalsError } = await supabase
          .from("goals")
          .select("*")
          .eq("life_vision_id", id)
          .eq("goal_type", "three_year")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });

        if (goalsError) throw goalsError;
        setThreeYearGoals(goalsData || []);
      } catch (error: any) {
        console.error("Error fetching vision:", error);
        toast.error("Failed to load vision");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, id, navigate]);

  const toggleVisionFocus = async () => {
    if (!vision || updatingFocus) return;
    setUpdatingFocus(vision.id);

    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ is_focus: !vision.is_focus })
        .eq("id", vision.id);

      if (error) throw error;

      setVision(prev => prev ? { ...prev, is_focus: !prev.is_focus } : prev);
      toast.success(vision.is_focus ? "Removed from focus" : "Added to focus");
    } catch (error: any) {
      console.error("Error toggling focus:", error);
      toast.error("Failed to update focus");
    } finally {
      setUpdatingFocus(null);
    }
  };

  const toggleGoalFocus = async (goalId: string, currentFocus: boolean) => {
    if (updatingFocus) return;
    setUpdatingFocus(goalId);

    try {
      const { error } = await supabase
        .from("goals")
        .update({ is_focus: !currentFocus })
        .eq("id", goalId);

      if (error) throw error;

      setThreeYearGoals(prev =>
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
    if (!user || !vision || !newGoalTitle.trim()) return;
    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("goals")
        .insert({
          user_id: user.id,
          pillar_id: vision.pillar_id,
          life_vision_id: vision.id,
          goal_type: "three_year",
          title: newGoalTitle.trim(),
          description: newGoalDescription.trim() || null,
          status: "not_started"
        })
        .select()
        .single();

      if (error) throw error;

      setThreeYearGoals(prev => [...prev, data]);
      setNewGoalTitle("");
      setNewGoalDescription("");
      setDialogOpen(false);
      toast.success("3-Year Goal added");
    } catch (error: any) {
      console.error("Error adding goal:", error);
      toast.error("Failed to add goal");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <p className="text-muted-foreground text-center">Loading...</p>
      </div>
    );
  }

  if (!vision) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Breadcrumb */}
      {pillar && (
        <div className="text-sm text-muted-foreground mb-4 flex items-center gap-1">
          <span className="text-primary font-medium">{pillar.name}</span>
          <ChevronRight className="h-3 w-3" />
          <span>Vision</span>
        </div>
      )}

      {/* Vision info */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-semibold text-foreground">{vision.title}</h1>
          <button
            onClick={toggleVisionFocus}
            disabled={updatingFocus === vision.id}
            className="p-1 rounded-full hover:bg-muted transition-calm disabled:opacity-50"
            title={vision.is_focus ? "Remove from focus" : "Add to focus"}
          >
            <Star
              className={`h-5 w-5 transition-calm ${
                vision.is_focus 
                  ? "fill-primary text-primary" 
                  : "text-muted-foreground"
              }`}
            />
          </button>
        </div>
        {vision.description && (
          <p className="text-muted-foreground">{vision.description}</p>
        )}
      </div>

        {/* 3-Year Goals section */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">3-Year Goals for this Vision</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add 3-Year Goal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add 3-Year Goal</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="goal-title">Title</Label>
                  <Input
                    id="goal-title"
                    value={newGoalTitle}
                    onChange={(e) => setNewGoalTitle(e.target.value)}
                    placeholder="What do you want to achieve in 3 years?"
                  />
                </div>
                <div>
                  <Label htmlFor="goal-description">Description (optional)</Label>
                  <Textarea
                    id="goal-description"
                    value={newGoalDescription}
                    onChange={(e) => setNewGoalDescription(e.target.value)}
                    placeholder="Add more details..."
                    rows={3}
                  />
                </div>
                <Button 
                  onClick={handleAddGoal} 
                  disabled={saving || !newGoalTitle.trim()}
                  className="w-full"
                >
                  {saving ? "Saving..." : "Add Goal"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {threeYearGoals.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Target className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No 3-year goals yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add your first 3-year goal to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {threeYearGoals.map((goal) => (
              <Card key={goal.id} className="transition-calm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    {/* Focus toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGoalFocus(goal.id, goal.is_focus);
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
                    
                    {/* Goal content - clickable */}
                    <div 
                      className="flex-1 cursor-pointer"
                      onClick={() => navigate(`/goal/${goal.id}`)}
                    >
                      <h3 className="font-medium text-foreground">{goal.title}</h3>
                      {goal.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{goal.description}</p>
                      )}
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
        )}
    </div>
  );
};

export default VisionDetail;
