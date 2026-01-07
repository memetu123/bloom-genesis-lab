import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, RotateCcw, AlertTriangle, Archive, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { format, subDays } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Archived & Recently Deleted Page
 * Shows all archived items and soft-deleted items from the last 30 days
 */

interface RecoveryItem {
  id: string;
  title: string;
  type: "vision" | "goal" | "task";
  deletedAt: string | null;
  archivedAt: string | null;
  status: "archived" | "deleted";
  parentId: string | null;
  parentTitle: string | null;
  parentType: "vision" | "goal" | null;
  grandparentTitle: string | null;
}

interface ParentInfo {
  id: string;
  title: string;
  type: "vision" | "goal";
  status: string;
  isDeleted: boolean;
}

const RecentlyDeleted = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { restore, permanentDelete } = useSoftDelete();
  const [items, setItems] = useState<RecoveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"archived" | "deleted">("deleted");
  
  // For restore with parent dialog
  const [restoreDialog, setRestoreDialog] = useState<{
    item: RecoveryItem;
    inactiveParents: ParentInfo[];
  } | null>(null);

  const fetchItems = useCallback(async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
      
      // Fetch all visions (for parent lookups and archived/deleted)
      const { data: allVisions } = await supabase
        .from("life_visions")
        .select("id, title, deleted_at, status, is_deleted, archived_at")
        .eq("user_id", user.id);

      // Fetch all goals (for parent lookups and archived/deleted)
      const { data: allGoals } = await supabase
        .from("goals")
        .select("id, title, deleted_at, status, is_deleted, life_vision_id, archived_at")
        .eq("user_id", user.id);

      // Fetch deleted tasks
      const { data: deletedCommitments } = await supabase
        .from("weekly_commitments")
        .select("id, title, deleted_at, goal_id, archived_at")
        .eq("user_id", user.id)
        .eq("is_deleted", true)
        .gte("deleted_at", thirtyDaysAgo);

      // Fetch archived tasks (tasks with archived status or archived_at set)
      const { data: archivedCommitments } = await supabase
        .from("weekly_commitments")
        .select("id, title, archived_at, goal_id")
        .eq("user_id", user.id)
        .eq("is_deleted", false)
        .not("archived_at", "is", null);

      // Build lookup maps
      const visionMap = new Map(
        (allVisions || []).map(v => [v.id, v])
      );
      const goalMap = new Map(
        (allGoals || []).map(g => [g.id, g])
      );

      const recoveryItems: RecoveryItem[] = [];

      // Process deleted visions
      for (const v of allVisions || []) {
        if (v.is_deleted && v.deleted_at && v.deleted_at >= thirtyDaysAgo) {
          recoveryItems.push({
            id: v.id,
            title: v.title,
            type: "vision",
            deletedAt: v.deleted_at,
            archivedAt: null,
            status: "deleted",
            parentId: null,
            parentTitle: null,
            parentType: null,
            grandparentTitle: null,
          });
        }
      }

      // Process archived visions
      for (const v of allVisions || []) {
        if (!v.is_deleted && v.status === "archived") {
          recoveryItems.push({
            id: v.id,
            title: v.title,
            type: "vision",
            deletedAt: null,
            archivedAt: v.archived_at,
            status: "archived",
            parentId: null,
            parentTitle: null,
            parentType: null,
            grandparentTitle: null,
          });
        }
      }

      // Process deleted goals
      for (const g of allGoals || []) {
        if (g.is_deleted && g.deleted_at && g.deleted_at >= thirtyDaysAgo) {
          const vision = g.life_vision_id ? visionMap.get(g.life_vision_id) : null;
          recoveryItems.push({
            id: g.id,
            title: g.title,
            type: "goal",
            deletedAt: g.deleted_at,
            archivedAt: null,
            status: "deleted",
            parentId: g.life_vision_id,
            parentTitle: vision?.title || null,
            parentType: "vision",
            grandparentTitle: null,
          });
        }
      }

      // Process archived goals
      for (const g of allGoals || []) {
        if (!g.is_deleted && g.status === "archived") {
          const vision = g.life_vision_id ? visionMap.get(g.life_vision_id) : null;
          recoveryItems.push({
            id: g.id,
            title: g.title,
            type: "goal",
            deletedAt: null,
            archivedAt: g.archived_at,
            status: "archived",
            parentId: g.life_vision_id,
            parentTitle: vision?.title || null,
            parentType: "vision",
            grandparentTitle: null,
          });
        }
      }

      // Process deleted tasks
      for (const c of deletedCommitments || []) {
        const goal = c.goal_id ? goalMap.get(c.goal_id) : null;
        const vision = goal?.life_vision_id ? visionMap.get(goal.life_vision_id) : null;
        recoveryItems.push({
          id: c.id,
          title: c.title,
          type: "task",
          deletedAt: c.deleted_at,
          archivedAt: null,
          status: "deleted",
          parentId: c.goal_id,
          parentTitle: goal?.title || null,
          parentType: "goal",
          grandparentTitle: vision?.title || null,
        });
      }

      // Process archived tasks
      for (const c of archivedCommitments || []) {
        const goal = c.goal_id ? goalMap.get(c.goal_id) : null;
        const vision = goal?.life_vision_id ? visionMap.get(goal.life_vision_id) : null;
        recoveryItems.push({
          id: c.id,
          title: c.title,
          type: "task",
          deletedAt: null,
          archivedAt: c.archived_at,
          status: "archived",
          parentId: c.goal_id,
          parentTitle: goal?.title || null,
          parentType: "goal",
          grandparentTitle: vision?.title || null,
        });
      }

      // Sort by date (most recent first)
      recoveryItems.sort((a, b) => {
        const dateA = a.deletedAt || a.archivedAt || "";
        const dateB = b.deletedAt || b.archivedAt || "";
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      setItems(recoveryItems);
    } catch (error: any) {
      console.error("Error fetching recovery items:", error);
      toast.error("Failed to load items");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const checkInactiveParents = async (item: RecoveryItem): Promise<ParentInfo[]> => {
    const inactiveParents: ParentInfo[] = [];
    
    if (item.type === "goal" && item.parentId) {
      // Check if vision is inactive
      const { data: vision } = await supabase
        .from("life_visions")
        .select("id, title, status, is_deleted")
        .eq("id", item.parentId)
        .single();
      
      if (vision && (vision.is_deleted || vision.status !== "active")) {
        inactiveParents.push({
          id: vision.id,
          title: vision.title,
          type: "vision",
          status: vision.status || "active",
          isDeleted: vision.is_deleted || false,
        });
      }
    } else if (item.type === "task" && item.parentId) {
      // Check if goal is inactive
      const { data: goal } = await supabase
        .from("goals")
        .select("id, title, status, is_deleted, life_vision_id")
        .eq("id", item.parentId)
        .single();
      
      if (goal) {
        if (goal.is_deleted || goal.status !== "active") {
          inactiveParents.push({
            id: goal.id,
            title: goal.title,
            type: "goal",
            status: goal.status || "active",
            isDeleted: goal.is_deleted || false,
          });
        }
        
        // Also check vision
        if (goal.life_vision_id) {
          const { data: vision } = await supabase
            .from("life_visions")
            .select("id, title, status, is_deleted")
            .eq("id", goal.life_vision_id)
            .single();
          
          if (vision && (vision.is_deleted || vision.status !== "active")) {
            inactiveParents.push({
              id: vision.id,
              title: vision.title,
              type: "vision",
              status: vision.status || "active",
              isDeleted: vision.is_deleted || false,
            });
          }
        }
      }
    }
    
    return inactiveParents;
  };

  const handleRestore = async (item: RecoveryItem) => {
    // Check if parents need restoring
    const inactiveParents = await checkInactiveParents(item);
    
    if (inactiveParents.length > 0) {
      setRestoreDialog({ item, inactiveParents });
      return;
    }
    
    await performRestore(item, false);
  };

  const performRestore = async (item: RecoveryItem, restoreParents: boolean) => {
    const tableMap = {
      vision: "life_visions",
      goal: "goals",
      task: "weekly_commitments",
    } as const;

    try {
      // Restore parent chain if requested
      if (restoreParents && restoreDialog?.inactiveParents) {
        for (const parent of restoreDialog.inactiveParents) {
          const parentTable = parent.type === "vision" ? "life_visions" : "goals";
          await supabase
            .from(parentTable)
            .update({ 
              is_deleted: false, 
              deleted_at: null,
              status: "active",
              archived_at: null,
            })
            .eq("id", parent.id);
        }
      }

      // Restore the item itself
      if (item.status === "deleted") {
        await restore(tableMap[item.type], item.id);
      } else {
        // Archived item - set status to active and clear archived_at
        const { error } = await supabase
          .from(tableMap[item.type])
          .update({ status: "active", archived_at: null })
          .eq("id", item.id);
        
        if (error) throw error;
        toast.success("Restored successfully");
      }

      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setRestoreDialog(null);
    } catch (error) {
      console.error("Error restoring:", error);
      toast.error("Failed to restore");
    }
  };

  const handlePermanentDelete = async (item: RecoveryItem) => {
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

  const getTypeLabel = (type: RecoveryItem["type"]) => {
    switch (type) {
      case "vision":
        return "Vision";
      case "goal":
        return "Goal";
      case "task":
        return "Task";
    }
  };

  const getTypeBadgeColor = (type: RecoveryItem["type"]) => {
    switch (type) {
      case "vision":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
      case "goal":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      case "task":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Unknown date";
    try {
      return format(new Date(dateStr), "MMM d, yyyy");
    } catch {
      return "Unknown date";
    }
  };

  const filteredItems = items.filter(item => item.status === activeTab);
  const archivedCount = items.filter(i => i.status === "archived").length;
  const deletedCount = items.filter(i => i.status === "deleted").length;

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
        <h1 className="text-2xl font-semibold text-foreground">Archived & Deleted</h1>
        <p className="text-muted-foreground mt-1">
          Restore or permanently delete your items
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "archived" | "deleted")}>
        <TabsList className="mb-4 w-full">
          <TabsTrigger value="deleted" className="flex-1 gap-2">
            <Trash2 className="h-4 w-4" />
            Recently Deleted
            {deletedCount > 0 && (
              <span className="ml-1 text-xs bg-destructive/20 text-destructive px-1.5 py-0.5 rounded-full">
                {deletedCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="archived" className="flex-1 gap-2">
            <Archive className="h-4 w-4" />
            Archived
            {archivedCount > 0 && (
              <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">
                {archivedCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deleted" className="space-y-3">
          {deletedCount > 0 && (
            <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-4">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive">
                Items will be permanently deleted after 30 days
              </p>
            </div>
          )}
          {renderItemList(filteredItems, "deleted")}
        </TabsContent>

        <TabsContent value="archived" className="space-y-3">
          {archivedCount === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Archive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No archived items</p>
              </CardContent>
            </Card>
          ) : (
            renderItemList(filteredItems, "archived")
          )}
        </TabsContent>
      </Tabs>

      {/* Back link */}
      <div className="mt-8 text-center">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-primary hover:underline"
        >
          ← Go back
        </button>
      </div>

      {/* Restore with parents dialog */}
      <AlertDialog open={!!restoreDialog} onOpenChange={() => setRestoreDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore parent items too?</AlertDialogTitle>
            <AlertDialogDescription>
              The following parent items are also archived or deleted. Restore them to make this item visible?
              <ul className="mt-3 space-y-1">
                {restoreDialog?.inactiveParents.map(p => (
                  <li key={p.id} className="text-foreground">
                    • {p.title} ({p.type})
                  </li>
                ))}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => restoreDialog && performRestore(restoreDialog.item, false)}
            >
              Restore only this item
            </Button>
            <AlertDialogAction
              onClick={() => restoreDialog && performRestore(restoreDialog.item, true)}
            >
              Restore all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  function renderItemList(itemList: RecoveryItem[], tab: "archived" | "deleted") {
    if (itemList.length === 0) {
      return (
        <Card>
          <CardContent className="py-12 text-center">
            <Trash2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {tab === "deleted" ? "No recently deleted items" : "No archived items"}
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {itemList.map((item) => (
          <Card key={`${item.type}-${item.id}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Type badge */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded ${getTypeBadgeColor(item.type)}`}>
                      {getTypeLabel(item.type)}
                    </span>
                  </div>
                  
                  {/* Title */}
                  <h3 className="font-medium text-foreground truncate">{item.title}</h3>
                  
                  {/* Parent breadcrumb */}
                  {(item.grandparentTitle || item.parentTitle) && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      {item.grandparentTitle && (
                        <>
                          <span className="truncate max-w-[100px]">{item.grandparentTitle}</span>
                          <ChevronRight className="h-3 w-3 flex-shrink-0" />
                        </>
                      )}
                      {item.parentTitle && (
                        <span className="truncate max-w-[100px]">{item.parentTitle}</span>
                      )}
                    </div>
                  )}
                  
                  {/* Date */}
                  <p className="text-xs text-muted-foreground mt-1">
                    {tab === "deleted" ? "Deleted" : "Archived"} {formatDate(item.deletedAt || item.archivedAt)}
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
                  {tab === "deleted" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePermanentDelete(item)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
};

export default RecentlyDeleted;