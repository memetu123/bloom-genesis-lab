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

export type ItemKind = "vision" | "goal" | "task";
export type TaskKind = "recurring" | "one-time" | "detached";

interface RestoreConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  itemType: ItemKind;
  taskKind?: TaskKind;
}

/**
 * RestoreConfirmDialog - Confirmation dialog for restoring items
 * Shows appropriate copy based on item type and task kind
 */
const RestoreConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  itemType,
  taskKind,
}: RestoreConfirmDialogProps) => {
  const getDescription = () => {
    if (itemType === "task") {
      if (taskKind === "recurring") {
        return "This will restore the recurring task and its future schedule.";
      }
      if (taskKind === "detached") {
        return "This will restore only this occurrence.";
      }
    }
    return "This will return the item to its original place.";
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore item?</AlertDialogTitle>
          <AlertDialogDescription>{getDescription()}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Restore</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default RestoreConfirmDialog;
