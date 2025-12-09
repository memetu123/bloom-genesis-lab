import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Star, ChevronRight, Check, Archive } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import FocusFilter from "@/components/FocusFilter";
import AddIconButton from "@/components/AddIconButton";
import StatusFilter, { StatusFilterValue } from "@/components/StatusFilter";
import ItemActions from "@/components/ItemActions";
import UndoToast from "@/components/UndoToast";
import { useSoftDelete } from "@/hooks/useSoftDelete";

/**
 * Visions List Page
 * Shows all life visions with focus toggle, search, status filter
 */

interface Vision {
  id: string;
  title: string;
  description: string | null;
  pillar_id: string;
  is_focus: boolean;
  status: "active" | "completed" | "archived";
  is_deleted: boolean;
}

interface Pillar {
  id: string;
  name: string;
}

const Visions = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { softDelete, undoDelete, pendingDelete } = useSoftDelete();
  const [visions, setVisions] = useState<Vision[]>([]);
  const [pillars, setPillars] = useState<Record<string, Pillar>>({});
  const [pillarsList, setPillarsList] = useState<Pillar[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnlyFocused, setShowOnlyFocused] = useState(false);
  const [updatingFocus, setUpdatingFocus] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("active");
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedPillarId, setSelectedPillarId] = useState("");
  const [saving, setSaving] = useState(false);

  // Handle focusId from search
  const focusId = searchParams.get("focusId");
  
  useEffect(() => {
    if (focusId && !loading) {
      // Reset filters to show the item
      setStatusFilter("all");
      setShowOnlyFocused(false);
      
      // Highlight and scroll to the item
      setHighlightedId(focusId);
      setTimeout(() => {
        const element = cardRefs.current[focusId];
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
      
      // Remove highlight after animation
      setTimeout(() => setHighlightedId(null), 2000);
    }
  }, [focusId, loading]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        // Fetch all visions (including status and is_deleted)
        const { data: visionsData, error: visionsError } = await supabase
          .from("life_visions")
          .select("*")
          .eq("user_id", user.id)
          .eq("is_deleted", false)
          .order("created_at", { ascending: true });

        if (visionsError) throw visionsError;
        
        // Map to ensure status has a default
        const mappedVisions: Vision[] = (visionsData || []).map(v => ({
          ...v,
          status: (v.status as "active" | "completed" | "archived") || "active",
          is_deleted: v.is_deleted || false,
        }));
        
        setVisions(mappedVisions);

        // Fetch pillars for labels
        const { data: pillarsData } = await supabase
          .from("pillars")
          .select("*")
          .eq("user_id", user.id)
          .order("sort_order", { ascending: true });

        const pillarsMap: Record<string, Pillar> = {};
        (pillarsData || []).forEach(p => {
          pillarsMap[p.id] = p;
        });
        setPillars(pillarsMap);
        setPillarsList(pillarsData || []);
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

  const updateStatus = async (visionId: string, newStatus: "active" | "completed" | "archived") => {
    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ status: newStatus })
        .eq("id", visionId);

      if (error) throw error;

      setVisions(prev =>
        prev.map(v => v.id === visionId ? { ...v, status: newStatus } : v)
      );
      toast.success(`Vision ${newStatus === "completed" ? "completed" : newStatus === "archived" ? "archived" : "reactivated"}`);
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (vision: Vision) => {
    const success = await softDelete({
      table: "life_visions",
      id: vision.id,
      title: vision.title,
    });
    
    if (success) {
      setVisions(prev => prev.filter(v => v.id !== vision.id));
    }
  };

  const handleAddVision = async () => {
    if (!user || !newTitle.trim() || !selectedPillarId) return;
    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("life_visions")
        .insert({
          user_id: user.id,
          pillar_id: selectedPillarId,
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          status: "active",
        })
        .select()
        .single();

      if (error) throw error;

      setVisions(prev => [...prev, { ...data, status: "active", is_deleted: false }]);
      setNewTitle("");
      setNewDescription("");
      setSelectedPillarId("");
      setDialogOpen(false);
      toast.success("Vision created");
    } catch (error: any) {
      console.error("Error adding vision:", error);
      toast.error("Failed to add vision");
    } finally {
      setSaving(false);
    }
  };
  // Filter visions based on status and focus
  const filteredVisions = visions
    .filter(v => {
      // Status filter
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      // Focus filter
      if (showOnlyFocused && !v.is_focus) return false;
      return true;
    });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Title and actions */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">My Visions</h1>
        <div className="flex items-center gap-2">
          <FocusFilter
            showFocusedOnly={showOnlyFocused}
            onToggle={() => setShowOnlyFocused(!showOnlyFocused)}
          />
          <AddIconButton
            onClick={() => setDialogOpen(true)}
            tooltip="Add vision"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <StatusFilter 
          value={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      <p className="text-muted-foreground mb-6 text-sm">
        Click the star to mark visions you want to focus on.
      </p>

      {filteredVisions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Star className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {showOnlyFocused ? "No focused visions" : 
               statusFilter !== "active" ? `No ${statusFilter} visions` : "No visions yet"}
            </p>
            {(showOnlyFocused || statusFilter !== "active") && (
              <Button 
                variant="link" 
                onClick={() => {
                  setShowOnlyFocused(false);
                  setStatusFilter("active");
                }}
                className="mt-2"
              >
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredVisions.map((vision) => (
            <Card 
              key={vision.id} 
              ref={(el) => { cardRefs.current[vision.id] = el; }}
              className={`transition-calm ${highlightedId === vision.id ? "ring-2 ring-primary bg-primary/5" : ""}`}
            >
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
                    className="flex-1 cursor-pointer min-w-0"
                    onClick={() => navigate(`/vision/${vision.id}`)}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      {pillars[vision.pillar_id] && (
                        <span className="text-xs text-primary font-medium">
                          {pillars[vision.pillar_id].name}
                        </span>
                      )}
                      {vision.status !== "active" && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          vision.status === "completed" 
                            ? "bg-primary/10 text-primary" 
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {vision.status === "completed" ? <Check className="h-3 w-3 inline mr-0.5" /> : <Archive className="h-3 w-3 inline mr-0.5" />}
                          {vision.status}
                        </span>
                      )}
                    </div>
                    <h3 className={`font-medium text-foreground truncate ${vision.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                      {vision.title}
                    </h3>
                    {vision.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {vision.description}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <ItemActions
                    status={vision.status}
                    onComplete={() => updateStatus(vision.id, "completed")}
                    onArchive={() => updateStatus(vision.id, "archived")}
                    onReactivate={() => updateStatus(vision.id, "active")}
                    onRestore={() => updateStatus(vision.id, "active")}
                    onDelete={() => handleDelete(vision)}
                  />

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

      {/* Add vision dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Vision</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="pillar">Pillar</Label>
              <Select value={selectedPillarId} onValueChange={setSelectedPillarId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a pillar" />
                </SelectTrigger>
                <SelectContent>
                  {pillarsList.map(pillar => (
                    <SelectItem key={pillar.id} value={pillar.id}>
                      {pillar.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Who do you want to become?"
              />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Describe your vision..."
                rows={3}
              />
            </div>
            <Button 
              onClick={handleAddVision} 
              disabled={saving || !newTitle.trim() || !selectedPillarId}
              className="w-full"
            >
              {saving ? "Saving..." : "Add Vision"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Undo toast */}
      {pendingDelete && (
        <UndoToast
          itemName={pendingDelete.title}
          onUndo={async () => {
            const success = await undoDelete();
            if (success) {
              // Refetch to restore the item
              const { data } = await supabase
                .from("life_visions")
                .select("*")
                .eq("id", pendingDelete.id)
                .single();
              if (data) {
                const restored: Vision = {
                  ...data,
                  status: (data.status as "active" | "completed" | "archived") || "active",
                  is_deleted: false,
                };
                setVisions(prev => [...prev, restored]);
              }
            }
          }}
          onClose={() => {}}
        />
      )}
    </div>
  );
};

export default Visions;
