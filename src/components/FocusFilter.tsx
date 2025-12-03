import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Focus Filter Toggle Component
 * Consistent toggle for Focused only / All view across pages
 */

interface FocusFilterProps {
  showFocusedOnly: boolean;
  onToggle: () => void;
  focusedLabel?: string;
  allLabel?: string;
}

const FocusFilter = ({ 
  showFocusedOnly, 
  onToggle, 
  focusedLabel = "Focused only",
  allLabel = "Show all"
}: FocusFilterProps) => {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onToggle}
      className={showFocusedOnly ? "border-primary text-primary" : ""}
    >
      {showFocusedOnly ? (
        <>
          <EyeOff className="h-4 w-4 mr-2" />
          {allLabel}
        </>
      ) : (
        <>
          <Eye className="h-4 w-4 mr-2" />
          {focusedLabel}
        </>
      )}
    </Button>
  );
};

export default FocusFilter;
