import { ChevronDown, Calendar } from "lucide-react";
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
import { useCalendarView, CalendarView } from "./CalendarViewContext";
import { cn } from "@/lib/utils";

/**
 * CalendarViewSelector - Split button to switch between calendar views
 * Primary area navigates directly, chevron opens dropdown menu
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
  
  // Get the alternate view for quick navigation
  const alternateView: CalendarView = currentView === "daily" ? "weekly" : "daily";
  
  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "inline-flex items-stretch rounded-md border border-border/50 bg-background",
          className
        )}
        role="group"
        aria-label="View selector"
      >
        {/* Primary button - navigates to current view (or stays on it) */}
        <button
          onClick={() => navigateToView(currentView)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium",
            "rounded-l-md transition-colors",
            "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
            "text-foreground"
          )}
          aria-label={`Current view: ${VIEW_LABELS[currentView]}`}
        >
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{VIEW_LABELS[currentView]}</span>
        </button>
        
        {/* Divider */}
        <div className="w-px bg-border/50 self-stretch" aria-hidden="true" />
        
        {/* Chevron dropdown trigger */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center justify-center px-1.5 py-1.5",
                "rounded-r-md transition-colors",
                "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                "text-muted-foreground hover:text-foreground"
              )}
              aria-label="Open view menu"
              aria-haspopup="menu"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44 bg-popover border border-border shadow-md z-50">
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
      </div>
    </TooltipProvider>
  );
};

export default CalendarViewSelector;
