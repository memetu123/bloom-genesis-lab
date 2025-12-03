import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import FocusFilter from "@/components/FocusFilter";

/**
 * Visions List Page
 * Shows all life visions with focus toggle
 */

interface Vision {
  id: string;
  title: string;
  description: string | null;
  pillar_id: string;
  is_focus: boolean;
}

interface Pillar {
  id: string;
  name: string;
}

const Visions = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [visions, setVisions] = useState<Vision[]>([]);
  const [pillars, setPillars] = useState<Record<string, Pillar>>({});
  const [loading, setLoading] = useState(true);
  const [showOnlyFocused, setShowOnlyFocused] = useState(false);
  const [updatingFocus, setUpdatingFocus] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        // Fetch all visions
        const { data: visionsData, error: visionsError } = await supabase
          .from("life_visions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });

        if (visionsError) throw visionsError;
        setVisions(visionsData || []);

        // Fetch pillars for labels
        const { data: pillarsData } = await supabase
          .from("pillars")
          .select("*")
          .eq("user_id", user.id);

        const pillarsMap: Record<string, Pillar> = {};
        (pillarsData || []).forEach(p => {
          pillarsMap[p.id] = p;
        });
        setPillars(pillarsMap);
      } catch (error: any) {
        console.error("Error fetching visions:", error);
        toast.error("Failed to load visions");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const toggleFocus = async (visionId: string, currentFocus: boolean) => {
    if (updatingFocus) return;
    setUpdatingFocus(visionId);

    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ is_focus: !currentFocus })
        .eq("id", visionId);

      if (error) throw error;

      setVisions(prev =>
        prev.map(v => v.id === visionId ? { ...v, is_focus: !currentFocus } : v)
      );
      toast.success(currentFocus ? "Removed from focus" : "Added to focus");
    } catch (error: any) {
      console.error("Error toggling focus:", error);
      toast.error("Failed to update focus");
    } finally {
      setUpdatingFocus(null);
    }
  };

  const filteredVisions = showOnlyFocused 
    ? visions.filter(v => v.is_focus) 
    : visions;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Title and filter */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">My Visions</h1>
        <FocusFilter
          showFocusedOnly={showOnlyFocused}
          onToggle={() => setShowOnlyFocused(!showOnlyFocused)}
        />
      </div>

      <p className="text-muted-foreground mb-6">
        Click the star to mark visions you want to focus on. Focused visions appear on your dashboard.
      </p>

        {filteredVisions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Star className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                {showOnlyFocused ? "No focused visions" : "No visions yet"}
              </p>
              {showOnlyFocused && (
                <Button 
                  variant="link" 
                  onClick={() => setShowOnlyFocused(false)}
                  className="mt-2"
                >
                  Show all visions
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredVisions.map((vision) => (
              <Card key={vision.id} className="transition-calm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    {/* Focus toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFocus(vision.id, vision.is_focus);
                      }}
                      disabled={updatingFocus === vision.id}
                      className="flex-shrink-0 p-1 rounded-full hover:bg-muted transition-calm disabled:opacity-50"
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

                    {/* Vision content - clickable */}
                    <div 
                      className="flex-1 cursor-pointer"
                      onClick={() => navigate(`/vision/${vision.id}`)}
                    >
                      <div className="flex items-center gap-2">
                        {pillars[vision.pillar_id] && (
                          <span className="text-xs text-primary font-medium">
                            {pillars[vision.pillar_id].name}
                          </span>
                        )}
                      </div>
                      <h3 className="font-medium text-foreground">{vision.title}</h3>
                      {vision.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {vision.description}
                        </p>
                      )}
                    </div>

                    <ChevronRight 
                      className="h-5 w-5 text-muted-foreground flex-shrink-0 cursor-pointer"
                      onClick={() => navigate(`/vision/${vision.id}`)}
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

export default Visions;