import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * MobileFAB - Floating Action Button for mobile task creation
 * Positioned in bottom-right corner with proper spacing from bottom nav
 */

interface MobileFABProps {
  onClick: () => void;
  className?: string;
}

const MobileFAB = ({ onClick, className }: MobileFABProps) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-6 right-4 z-40",
        "w-14 h-14 rounded-full",
        "bg-primary text-primary-foreground",
        "shadow-lg shadow-primary/25",
        "flex items-center justify-center",
        "hover:bg-primary/90 active:scale-95",
        "transition-all duration-200",
        className
      )}
      aria-label="Add task"
    >
      <Plus className="h-6 w-6" />
    </button>
  );
};

export default MobileFAB;
