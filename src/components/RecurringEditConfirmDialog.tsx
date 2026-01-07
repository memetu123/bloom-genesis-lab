import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface RecurringEditConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (scope: "this" | "future") => void;
  saving?: boolean;
}

/**
 * Confirmation dialog shown when editing a recurring task
 * Options: "Only this occurrence" or "This and future occurrences"
 */
const RecurringEditConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  saving = false,
}: RecurringEditConfirmDialogProps) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Apply changes to</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            This is a recurring task. Choose how to apply your changes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2 py-2">
          <Button
            variant="outline"
            className="justify-start h-auto py-3 px-4"
            onClick={() => onConfirm("this")}
            disabled={saving}
          >
            <div className="text-left">
              <div className="font-medium">Only this occurrence</div>
              <div className="text-xs text-muted-foreground font-normal">
                Changes apply only to the selected date
              </div>
            </div>
          </Button>
          <Button
            variant="outline"
            className="justify-start h-auto py-3 px-4"
            onClick={() => onConfirm("future")}
            disabled={saving}
          >
            <div className="text-left">
              <div className="font-medium">This and future occurrences</div>
              <div className="text-xs text-muted-foreground font-normal">
                Changes apply from this date forward
              </div>
            </div>
          </Button>
        </div>
        <AlertDialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default RecurringEditConfirmDialog;
