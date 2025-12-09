import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { format, subDays } from "date-fns";

/**
 * Recently Deleted Page
 * Shows all soft-deleted items from the last 30 days
 */

interface DeletedItem {
  id: string;
  title: string;
  type: "vision" | "goal" | "task";
  deletedAt: string;
}

const RecentlyDeleted = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { restore, permanentDelete } = useSoftDelete();
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchDeletedItems = async () => {
      try {
        const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
        
        // Fetch deleted visions
        const { data: visions } = await supabase
          .from("life_visions")
          .select("id, title, deleted_at")
          .eq("user_id", user.id)
          .eq("is_deleted", true)
          .gte("deleted_at", thirtyDaysAgo)
          .order("deleted_at", { ascending: false });

        // Fetch deleted goals
        const { data: goals } = await supabase
          .from("goals")
          .select("id, title, deleted_at")
          .eq("user_id", user.id)
          .eq("is_deleted", true)
          .gte("deleted_at", thirtyDaysAgo)
          .order("deleted_at", { ascending: false });

        // Fetch deleted tasks
        const { data: commitments } = await supabase
          .from("weekly_commitments")
          .select("id, title, deleted_at")
          .eq("user_id", user.id)
          .eq("is_deleted", true)
          .gte("deleted_at", thirtyDaysAgo)
          .order("deleted_at", { ascending: false });

        const allItems: DeletedItem[] = [
          ...(visions || []).map((v) => ({
            id: v.id,
            title: v.title,
            type: "vision" as const,
            deletedAt: v.deleted_at || "",
          })),
          ...(goals || []).map((g) => ({
            id: g.id,
            title: g.title,
            type: "goal" as const,
            deletedAt: g.deleted_at || "",
          })),
          ...(commitments || []).map((c) => ({
            id: c.id,
            title: c.title,
            type: "task" as const,
            deletedAt: c.deleted_at || "",
          })),
        ].sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

        setItems(allItems);
      } catch (error: any) {
        console.error("Error fetching deleted items:", error);
        toast.error("Failed to load deleted items");
      } finally {
        setLoading(false);
      }
    };

    fetchDeletedItems();
  }, [user]);

  const handleRestore = async (item: DeletedItem) => {
    const tableMap = {
      vision: "life_visions",
      goal: "goals",
      task: "weekly_commitments",
    } as const;

    const success = await restore(tableMap[item.type], item.id);
    if (success) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    }
  };

  const handlePermanentDelete = async (item: DeletedItem) => {
    const tableMap = {
      vision: "life_visions",
      goal: "goals",
      task: "weekly_commitments",
    } as const;

    const success = await permanentDelete(tableMap[item.type], item.id);
    if (success) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    }
  };

  const getTypeLabel = (type: DeletedItem["type"]) => {
    switch (type) {
      case "vision":
        return "Vision";
      case "goal":
        return "Goal";
      case "task":
        return "Task";
    }
  };

  const formatDeletedDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "MMM d, yyyy 'at' h:mm a");
    } catch {
      return "Unknown date";
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <p className="text-muted-foreground text-center">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Recently Deleted</h1>
        <p className="text-muted-foreground mt-1">
          Items deleted in the last 30 days. Restore or permanently delete them.
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Trash2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No recently deleted items</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Warning banner */}
          <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">
              Items will be permanently deleted after 30 days
            </p>
          </div>

          {items.map((item) => (
            <Card key={`${item.type}-${item.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">
                        {getTypeLabel(item.type)}
                      </span>
                    </div>
                    <h3 className="font-medium text-foreground truncate">{item.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Deleted {formatDeletedDate(item.deletedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestore(item)}
                      className="gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePermanentDelete(item)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Back link */}
      <div className="mt-8 text-center">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-primary hover:underline"
        >
          ← Go back
        </button>
      </div>
    </div>
  );
};

export default RecentlyDeleted;
