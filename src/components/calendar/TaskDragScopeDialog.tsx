import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface TaskDragScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (scope: "this" | "all") => void;
  saving?: boolean;
  targetDate: string;
  sourceDate: string;
}

/**
 * Dialog shown when dragging a recurring task to a different date/time
 * Asks user whether to move just this occurrence or all occurrences
 */
const TaskDragScopeDialog = ({
  open,
  onOpenChange,
  onConfirm,
  saving = false,
  targetDate,
  sourceDate,
}: TaskDragScopeDialogProps) => {
  const isDateChange = targetDate !== sourceDate;
  
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Move recurring task</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            {isDateChange 
              ? "This is a recurring task. How would you like to move it?"
              : "This is a recurring task. How would you like to change the time?"
            }
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
              <div className="font-medium">This event only</div>
              <div className="text-xs text-muted-foreground font-normal">
                {isDateChange 
                  ? "Move only this occurrence to the new date"
                  : "Change the time for only this occurrence"
                }
              </div>
            </div>
          </Button>
          <Button
            variant="outline"
            className="justify-start h-auto py-3 px-4 opacity-50 cursor-not-allowed"
            disabled={true}
          >
            <div className="text-left">
              <div className="font-medium">All events</div>
              <div className="text-xs text-muted-foreground font-normal">
                Coming soon
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

export default TaskDragScopeDialog;
