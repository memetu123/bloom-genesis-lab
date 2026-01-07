import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

type DeleteScope = "this" | "future" | "all";

interface RecurringDeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (scope: DeleteScope) => void;
  saving?: boolean;
}

/**
 * Confirmation dialog shown when deleting a recurring task.
 * Options: "This event", "This and following events", "All events"
 */
const RecurringDeleteConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  saving = false,
}: RecurringDeleteConfirmDialogProps) => {
  const [selectedScope, setSelectedScope] = useState<DeleteScope>("this");

  const handleConfirm = () => {
    onConfirm(selectedScope);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete recurring task</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            Choose which occurrences to delete.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <RadioGroup
          value={selectedScope}
          onValueChange={(value) => setSelectedScope(value as DeleteScope)}
          className="flex flex-col gap-3 py-2"
        >
          <div className="flex items-center space-x-3">
            <RadioGroupItem value="this" id="delete-this" />
            <Label htmlFor="delete-this" className="text-sm font-normal cursor-pointer">
              This event
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <RadioGroupItem value="future" id="delete-future" />
            <Label htmlFor="delete-future" className="text-sm font-normal cursor-pointer">
              This and following events
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <RadioGroupItem value="all" id="delete-all" />
            <Label htmlFor="delete-all" className="text-sm font-normal cursor-pointer">
              All events
            </Label>
          </div>
        </RadioGroup>

        <AlertDialogFooter className="flex-row gap-2 sm:justify-end">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={saving}
          >
            {saving ? "Deleting..." : "Delete"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default RecurringDeleteConfirmDialog;
