import { MoreHorizontal, Check, Archive, Trash2, RotateCcw, Pencil } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

/**
 * Item Actions Component
 * Dropdown menu for item actions (complete, archive, delete, restore)
 */

interface ItemActionsProps {
  status: "active" | "completed" | "archived";
  isDeleted?: boolean;
  onComplete?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
  onEdit?: () => void;
  onReactivate?: () => void;
}

const ItemActions = ({
  status,
  isDeleted,
  onComplete,
  onArchive,
  onDelete,
  onRestore,
  onEdit,
  onReactivate,
}: ItemActionsProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {onEdit && (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
        )}
        
        {!isDeleted && (
          <>
            {status === "active" && onComplete && (
              <DropdownMenuItem onClick={onComplete}>
                <Check className="h-4 w-4 mr-2" />
                Mark Complete
              </DropdownMenuItem>
            )}
            
            {status === "completed" && onReactivate && (
              <DropdownMenuItem onClick={onReactivate}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reactivate
              </DropdownMenuItem>
            )}
            
            {status !== "archived" && onArchive && (
              <DropdownMenuItem onClick={onArchive}>
                <Archive className="h-4 w-4 mr-2" />
                Archive
              </DropdownMenuItem>
            )}
            
            {status === "archived" && onRestore && (
              <DropdownMenuItem onClick={onRestore}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Restore
              </DropdownMenuItem>
            )}
            
            <DropdownMenuSeparator />
          </>
        )}
        
        {isDeleted ? (
          <>
            <DropdownMenuItem onClick={onRestore}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Restore
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Forever
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ItemActions;
