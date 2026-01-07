import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useCalendarView, CalendarView } from "./CalendarViewContext";
import { cn } from "@/lib/utils";

/**
 * CalendarViewSelector - Dropdown button to switch between calendar views
 * Shows the current view name and allows switching to Daily/Weekly
 * Schedule is visible but disabled (coming soon)
 */

const VIEW_LABELS: Record<CalendarView, string> = {
  daily: "Daily",
  weekly: "Weekly",
  schedule: "Schedule",
};

// Views that are currently enabled for MVP
const ENABLED_VIEWS: CalendarView[] = ["daily", "weekly"];

interface CalendarViewSelectorProps {
  className?: string;
}

const CalendarViewSelector = ({ className }: CalendarViewSelectorProps) => {
  const { currentView, navigateToView } = useCalendarView();
  
  return (
    <TooltipProvider delayDuration={200}>
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
        <DropdownMenuContent align="start" className="w-44 bg-popover border border-border shadow-md">
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
          
          {/* Schedule - disabled for MVP */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <DropdownMenuItem
                  disabled
                  className="cursor-not-allowed text-muted-foreground/60"
                >
                  <span className="flex items-center justify-between w-full">
                    Schedule
                    <span className="text-[10px] font-medium text-muted-foreground/50 ml-2">
                      Soon
                    </span>
                  </span>
                </DropdownMenuItem>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Coming soon
            </TooltipContent>
          </Tooltip>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
};

export default CalendarViewSelector;
