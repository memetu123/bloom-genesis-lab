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

type ArchiveScope = "this" | "future" | "all";

interface RecurringArchiveConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (scope: ArchiveScope) => void;
  saving?: boolean;
}

/**
 * Confirmation dialog shown when archiving a recurring task.
 * Options: "This event", "This and following events", "All events"
 */
const RecurringArchiveConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  saving = false,
}: RecurringArchiveConfirmDialogProps) => {
  const [selectedScope, setSelectedScope] = useState<ArchiveScope>("this");

  const handleConfirm = () => {
    onConfirm(selectedScope);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Archive recurring task</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            Choose which occurrences to archive.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <RadioGroup
          value={selectedScope}
          onValueChange={(value) => setSelectedScope(value as ArchiveScope)}
          className="flex flex-col gap-3 py-2"
        >
          <div className="flex items-center space-x-3">
            <RadioGroupItem value="this" id="archive-this" />
            <Label htmlFor="archive-this" className="text-sm font-normal cursor-pointer">
              This event
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <RadioGroupItem value="future" id="archive-future" />
            <Label htmlFor="archive-future" className="text-sm font-normal cursor-pointer">
              This and following events
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <RadioGroupItem value="all" id="archive-all" />
            <Label htmlFor="archive-all" className="text-sm font-normal cursor-pointer">
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
            onClick={handleConfirm}
            disabled={saving}
          >
            {saving ? "Archiving..." : "Archive"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default RecurringArchiveConfirmDialog;
