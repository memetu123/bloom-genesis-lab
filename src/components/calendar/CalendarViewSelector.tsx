import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useCalendarView, CalendarView } from "./CalendarViewContext";
import { cn } from "@/lib/utils";

/**
 * CalendarViewSelector - Dropdown button to switch between calendar views
 * Shows the current view name and allows switching to Daily/Weekly/Schedule
 */

const VIEW_LABELS: Record<CalendarView, string> = {
  daily: "Daily",
  weekly: "Weekly",
  schedule: "Schedule",
};

interface CalendarViewSelectorProps {
  className?: string;
}

const CalendarViewSelector = ({ className }: CalendarViewSelectorProps) => {
  const { currentView, navigateToView } = useCalendarView();
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "flex items-center gap-1.5 text-sm font-medium",
            className
          )}
        >
          {VIEW_LABELS[currentView]}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40 bg-popover border border-border shadow-md">
        <DropdownMenuItem
          onClick={() => navigateToView("daily")}
          className={cn(
            "cursor-pointer",
            currentView === "daily" && "bg-accent"
          )}
        >
          Daily
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => navigateToView("weekly")}
          className={cn(
            "cursor-pointer",
            currentView === "weekly" && "bg-accent"
          )}
        >
          Weekly
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => navigateToView("schedule")}
          className={cn(
            "cursor-pointer",
            currentView === "schedule" && "bg-accent"
          )}
        >
          Schedule
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default CalendarViewSelector;
