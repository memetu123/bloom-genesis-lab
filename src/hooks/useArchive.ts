import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Hook for archive with undo functionality
 * Handles status and archived_at for any table
 */

type ArchivableTable = "life_visions" | "goals" | "weekly_commitments";

interface ArchivedItem {
  table: ArchivableTable;
  id: string;
  title: string;
  previousStatus?: string;
}

export const useArchive = () => {
  const [pendingArchive, setPendingArchive] = useState<ArchivedItem | null>(null);
  const [undoTimeout, setUndoTimeout] = useState<NodeJS.Timeout | null>(null);

  const archive = useCallback(async (item: ArchivedItem) => {
    try {
      const { error } = await supabase
        .from(item.table)
        .update({ 
          status: "archived", 
          archived_at: new Date().toISOString() 
        })
        .eq("id", item.id);

      if (error) throw error;

      // Set pending archive for undo
      setPendingArchive(item);

      // Clear any existing timeout
      if (undoTimeout) {
        clearTimeout(undoTimeout);
      }

      // Set new timeout to clear pending archive after 5 seconds
      const timeout = setTimeout(() => {
        setPendingArchive(null);
      }, 5000);
      setUndoTimeout(timeout);

      return true;
    } catch (error: any) {
      console.error("Error archiving:", error);
      toast.error("Failed to archive");
      return false;
    }
  }, [undoTimeout]);

  const undoArchive = useCallback(async () => {
    if (!pendingArchive) return false;

    try {
      const { error } = await supabase
        .from(pendingArchive.table)
        .update({ 
          status: pendingArchive.previousStatus || "active", 
          archived_at: null 
        })
        .eq("id", pendingArchive.id);

      if (error) throw error;

      // Clear pending archive
      if (undoTimeout) {
        clearTimeout(undoTimeout);
      }
      setPendingArchive(null);
      toast.success("Restored successfully");
      return true;
    } catch (error: any) {
      console.error("Error restoring:", error);
      toast.error("Failed to restore");
      return false;
    }
  }, [pendingArchive, undoTimeout]);

  const unarchive = useCallback(async (
    table: ArchivableTable,
    id: string
  ) => {
    try {
      const { error } = await supabase
        .from(table)
        .update({ status: "active", archived_at: null, completed_at: null })
        .eq("id", id);

      if (error) throw error;
      toast.success("Restored successfully");
      return true;
    } catch (error: any) {
      console.error("Error unarchiving:", error);
      toast.error("Failed to restore");
      return false;
    }
  }, []);

  return {
    pendingArchive,
    archive,
    undoArchive,
    unarchive,
  };
};
