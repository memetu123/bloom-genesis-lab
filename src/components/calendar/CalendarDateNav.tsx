import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * CalendarDateNav - Compact date navigation for calendar views
 * Prev/Next buttons with current date range display
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
  
  className?: string;
}

const CalendarDateNav = ({
  dateLabel,
  onPrev,
  onNext,
  onToday,
  showTodayButton,
  className,
}: CalendarDateNavProps) => {
  return (
    <div className={cn("flex items-center gap-2", className)}>
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
  );
};

export default CalendarDateNav;
