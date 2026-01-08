import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RotateCcw, Archive, ChevronRight, Calendar } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import RestoreConfirmDialog, { ItemKind, TaskKind } from "@/components/RestoreConfirmDialog";
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

interface ArchivedItem {
  id: string;
  title: string;
  type: "vision" | "goal" | "task";
  archivedAt: string | null;
  parentId: string | null;
  parentTitle: string | null;
  parentType: "vision" | "goal" | null;
  grandparentTitle: string | null;
  // Extended metadata
  goalHorizon?: "three_year" | "one_year" | "ninety_day";
  taskKind?: "recurring" | "one-time" | "detached";
  scheduledDate?: string;
  timeStart?: string;
  timeEnd?: string;
}

interface ParentInfo {
  id: string;
  title: string;
  type: "vision" | "goal";
  status: string;
  isDeleted: boolean;
}

const GOAL_HORIZON_LABELS: Record<string, string> = {
  three_year: "3-Year",
  one_year: "1-Year",
  ninety_day: "90-Day",
};

const Archived = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<ArchivedItem[]>([]);
  const [loading, setLoading] = useState(true);

  // For restore confirmation
  const [restoreConfirm, setRestoreConfirm] = useState<ArchivedItem | null>(null);

  // For restore with parent dialog
  const [parentRestoreDialog, setParentRestoreDialog] = useState<{
    item: ArchivedItem;
    inactiveParents: ParentInfo[];
  } | null>(null);

  const fetchItems = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Fetch all visions
      const { data: allVisions } = await supabase
        .from("life_visions")
        .select("id, title, status, is_deleted, archived_at, pillar_id")
        .eq("user_id", user.id);

      // Fetch all goals
      const { data: allGoals } = await supabase
        .from("goals")
        .select("id, title, status, is_deleted, life_vision_id, archived_at, goal_type")
        .eq("user_id", user.id);

      // Fetch archived tasks
      const { data: archivedCommitments } = await supabase
        .from("weekly_commitments")
        .select("id, title, archived_at, goal_id, task_type, start_date, default_time_start, default_time_end")
        .eq("user_id", user.id)
        .eq("is_deleted", false)
        .not("archived_at", "is", null);

      // Fetch detached completions that are archived
      const { data: archivedCompletions } = await supabase
        .from("commitment_completions")
        .select("id, title, completed_date, time_start, time_end, is_detached, commitment_id")
        .eq("user_id", user.id)
        .eq("is_deleted", false)
        .eq("is_detached", true);

      // Build lookup maps
      const visionMap = new Map((allVisions || []).map((v) => [v.id, v]));
      const goalMap = new Map((allGoals || []).map((g) => [g.id, g]));

      const archivedItems: ArchivedItem[] = [];

      // Process archived visions
      for (const v of allVisions || []) {
        if (!v.is_deleted && v.status === "archived") {
          archivedItems.push({
            id: v.id,
            title: v.title,
            type: "vision",
            archivedAt: v.archived_at,
            parentId: null,
            parentTitle: null,
            parentType: null,
            grandparentTitle: null,
          });
        }
      }

      // Process archived goals
      for (const g of allGoals || []) {
        if (!g.is_deleted && g.status === "archived") {
          const vision = g.life_vision_id ? visionMap.get(g.life_vision_id) : null;
          archivedItems.push({
            id: g.id,
            title: g.title,
            type: "goal",
            archivedAt: g.archived_at,
            parentId: g.life_vision_id,
            parentTitle: vision?.title || null,
            parentType: "vision",
            grandparentTitle: null,
            goalHorizon: g.goal_type as ArchivedItem["goalHorizon"],
          });
        }
      }

      // Process archived tasks
      for (const c of archivedCommitments || []) {
        const goal = c.goal_id ? goalMap.get(c.goal_id) : null;
        const vision = goal?.life_vision_id ? visionMap.get(goal.life_vision_id) : null;

        archivedItems.push({
          id: c.id,
          title: c.title,
          type: "task",
          archivedAt: c.archived_at,
          parentId: c.goal_id,
          parentTitle: goal?.title || null,
          parentType: "goal",
          grandparentTitle: vision?.title || null,
          taskKind: c.task_type === "one_time" ? "one-time" : "recurring",
          scheduledDate: c.start_date || undefined,
          timeStart: c.default_time_start || undefined,
          timeEnd: c.default_time_end || undefined,
        });
      }

      // Sort by date (most recent first)
      archivedItems.sort((a, b) => {
        const dateA = a.archivedAt || "";
        const dateB = b.archivedAt || "";
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      setItems(archivedItems);
    } catch (error: any) {
      console.error("Error fetching archived items:", error);
      toast.error("Failed to load items");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const checkInactiveParents = async (item: ArchivedItem): Promise<ParentInfo[]> => {
    const inactiveParents: ParentInfo[] = [];

    if (item.type === "goal" && item.parentId) {
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

  const handleRestoreClick = (item: ArchivedItem) => {
    setRestoreConfirm(item);
  };

  const handleRestoreConfirm = async () => {
    if (!restoreConfirm) return;

    const item = restoreConfirm;
    setRestoreConfirm(null);

    // Check if parents need restoring
    const inactiveParents = await checkInactiveParents(item);

    if (inactiveParents.length > 0) {
      setParentRestoreDialog({ item, inactiveParents });
      return;
    }

    await performRestore(item, false);
  };

  const performRestore = async (item: ArchivedItem, restoreParents: boolean) => {
    const tableMap = {
      vision: "life_visions",
      goal: "goals",
      task: "weekly_commitments",
    } as const;

    try {
      // Restore parent chain if requested
      if (restoreParents && parentRestoreDialog?.inactiveParents) {
        for (const parent of parentRestoreDialog.inactiveParents) {
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

      // Restore the item
      const { error } = await supabase
        .from(tableMap[item.type])
        .update({ status: "active", archived_at: null })
        .eq("id", item.id);

      if (error) throw error;

      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setParentRestoreDialog(null);
      toast.success("Restored");
    } catch (error) {
      console.error("Error restoring:", error);
      toast.error("Failed to restore");
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

  const getTypeBadgeColor = (type: ArchivedItem["type"]) => {
    switch (type) {
      case "vision":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
      case "goal":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      case "task":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
    }
  };

  const getTypeLabel = (item: ArchivedItem) => {
    if (item.type === "goal" && item.goalHorizon) {
      return `${GOAL_HORIZON_LABELS[item.goalHorizon] || ""} Goal`;
    }
    if (item.type === "task" && item.taskKind) {
      if (item.taskKind === "recurring") return "Recurring Task";
      if (item.taskKind === "detached") return "Single Occurrence";
      return "One-time Task";
    }
    return item.type.charAt(0).toUpperCase() + item.type.slice(1);
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
        <h1 className="text-2xl font-semibold text-foreground">Archived</h1>
        <p className="text-muted-foreground mt-1">
          Items you've archived for later reference
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Archive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No archived items</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={`${item.type}-${item.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Type badge */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${getTypeBadgeColor(item.type)}`}>
                        {getTypeLabel(item)}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="font-medium text-foreground truncate">{item.title}</h3>

                    {/* Hierarchy breadcrumb */}
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

                    {/* Schedule info for tasks */}
                    {item.type === "task" && item.scheduledDate && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {formatDate(item.scheduledDate)}
                          {item.timeStart && ` at ${item.timeStart}`}
                          {item.timeEnd && ` - ${item.timeEnd}`}
                        </span>
                      </div>
                    )}

                    {/* Archived date */}
                    <p className="text-xs text-muted-foreground mt-1">
                      Archived {formatDate(item.archivedAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestoreClick(item)}
                      className="gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restore
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
        <button onClick={() => navigate(-1)} className="text-sm text-primary hover:underline">
          ← Go back
        </button>
      </div>

      {/* Restore confirmation dialog */}
      <RestoreConfirmDialog
        open={!!restoreConfirm}
        onOpenChange={(open) => !open && setRestoreConfirm(null)}
        onConfirm={handleRestoreConfirm}
        itemType={restoreConfirm?.type as ItemKind}
        taskKind={restoreConfirm?.taskKind as TaskKind}
      />

      {/* Restore with parents dialog */}
      <AlertDialog open={!!parentRestoreDialog} onOpenChange={() => setParentRestoreDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore parent items too?</AlertDialogTitle>
            <AlertDialogDescription>
              The following parent items are also archived or deleted. Restore them to make this
              item visible?
              <ul className="mt-3 space-y-1">
                {parentRestoreDialog?.inactiveParents.map((p) => (
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
              onClick={() => parentRestoreDialog && performRestore(parentRestoreDialog.item, false)}
            >
              Restore only this item
            </Button>
            <AlertDialogAction
              onClick={() => parentRestoreDialog && performRestore(parentRestoreDialog.item, true)}
            >
              Restore all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Archived;
