import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Hook for soft delete with undo functionality
 * Handles is_deleted and deleted_at for any table
 */

interface DeletedItem {
  table: "life_visions" | "goals" | "weekly_commitments" | "commitment_completions";
  id: string;
  title: string;
  linkedItems?: { table: string; ids: string[] }[];
}

export const useSoftDelete = () => {
  const [pendingDelete, setPendingDelete] = useState<DeletedItem | null>(null);
  const [undoTimeout, setUndoTimeout] = useState<NodeJS.Timeout | null>(null);

  const softDelete = useCallback(async (item: DeletedItem) => {
    try {
      // Soft delete the main item
      const { error } = await supabase
        .from(item.table)
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", item.id);

      if (error) throw error;

      // Soft delete linked items if any
      if (item.linkedItems) {
        for (const linked of item.linkedItems) {
          if (linked.ids.length > 0) {
            await supabase
              .from(linked.table as any)
              .update({ is_deleted: true, deleted_at: new Date().toISOString() })
              .in("id", linked.ids);
          }
        }
      }

      // Set pending delete for undo
      setPendingDelete(item);

      // Clear any existing timeout
      if (undoTimeout) {
        clearTimeout(undoTimeout);
      }

      // Set new timeout to clear pending delete after 5 seconds
      const timeout = setTimeout(() => {
        setPendingDelete(null);
      }, 5000);
      setUndoTimeout(timeout);

      return true;
    } catch (error: any) {
      console.error("Error soft deleting:", error);
      toast.error("Failed to delete");
      return false;
    }
  }, [undoTimeout]);

  const undoDelete = useCallback(async () => {
    if (!pendingDelete) return false;

    try {
      // Restore the main item
      const { error } = await supabase
        .from(pendingDelete.table)
        .update({ is_deleted: false, deleted_at: null })
        .eq("id", pendingDelete.id);

      if (error) throw error;

      // Restore linked items
      if (pendingDelete.linkedItems) {
        for (const linked of pendingDelete.linkedItems) {
          if (linked.ids.length > 0) {
            await supabase
              .from(linked.table as any)
              .update({ is_deleted: false, deleted_at: null })
              .in("id", linked.ids);
          }
        }
      }

      // Clear pending delete
      if (undoTimeout) {
        clearTimeout(undoTimeout);
      }
      setPendingDelete(null);
      toast.success("Restored successfully");
      return true;
    } catch (error: any) {
      console.error("Error restoring:", error);
      toast.error("Failed to restore");
      return false;
    }
  }, [pendingDelete, undoTimeout]);

  const permanentDelete = useCallback(async (
    table: DeletedItem["table"],
    id: string
  ) => {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Permanently deleted");
      return true;
    } catch (error: any) {
      console.error("Error permanently deleting:", error);
      toast.error("Failed to delete permanently");
      return false;
    }
  }, []);

  const restore = useCallback(async (
    table: DeletedItem["table"],
    id: string
  ) => {
    try {
      const { error } = await supabase
        .from(table)
        .update({ is_deleted: false, deleted_at: null })
        .eq("id", id);

      if (error) throw error;
      toast.success("Restored successfully");
      return true;
    } catch (error: any) {
      console.error("Error restoring:", error);
      toast.error("Failed to restore");
      return false;
    }
  }, []);

  return {
    pendingDelete,
    softDelete,
    undoDelete,
    permanentDelete,
    restore,
  };
};
