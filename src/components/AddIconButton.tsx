import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Add Icon Button Component
 * Circular olive green button with plus icon
 */

interface AddIconButtonProps {
  onClick: () => void;
  tooltip: string;
  disabled?: boolean;
}

const AddIconButton = ({ onClick, tooltip, disabled }: AddIconButtonProps) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            onClick={onClick}
            disabled={disabled}
            className="h-9 w-9 rounded-full"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default AddIconButton;
