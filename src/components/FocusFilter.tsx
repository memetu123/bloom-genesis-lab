import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Focus Filter Toggle Component
 * Star icon toggle for Focused only / All view
 */

interface FocusFilterProps {
  showFocusedOnly: boolean;
  onToggle: () => void;
}

const FocusFilter = ({ showFocusedOnly, onToggle }: FocusFilterProps) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-9 w-9 hover:bg-primary/10"
          >
            <Star
              className={`h-5 w-5 transition-calm ${
                showFocusedOnly
                  ? "fill-primary text-primary"
                  : "text-muted-foreground"
              }`}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{showFocusedOnly ? "Show all" : "Show focused only"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default FocusFilter;
