import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import TimeDisplayToggle from "./TimeDisplayToggle";

/**
 * CalendarDateNav - Compact date navigation for calendar views
 * Prev/Next buttons with current date range display + time display toggle
 */

interface CalendarDateNavProps {
  // Display text (e.g., "Jan 6 – 12" or "Mon, Jan 6")
  dateLabel: string;
  
  // Navigation
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  
  // Show "Today" button
  showTodayButton: boolean;
  
  // Show time display toggle (default: true)
  showTimeToggle?: boolean;
  
  className?: string;
}

const CalendarDateNav = ({
  dateLabel,
  onPrev,
  onNext,
  onToday,
  showTodayButton,
  showTimeToggle = true,
  className,
}: CalendarDateNavProps) => {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onPrev}
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onNext}
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        
        <span className="text-sm font-medium text-foreground">
          {dateLabel}
        </span>
        
        {showTodayButton && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onToday}
          >
            Today
          </Button>
        )}
      </div>
      
      {showTimeToggle && (
        <TimeDisplayToggle />
      )}
    </div>
  );
};

export default CalendarDateNav;
