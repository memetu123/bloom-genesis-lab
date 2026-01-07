import { memo } from "react";
import { useTimeDisplay, TimeDisplayMode } from "./TimeDisplayContext";
import { cn } from "@/lib/utils";

/**
 * TimeDisplayToggle - Toggle between Full and Compact time display modes
 * Renders as a subtle segmented control in the calendar header
 */

const TimeDisplayToggle = memo(() => {
  const { mode, setMode } = useTimeDisplay();
  
  const handleModeChange = (newMode: TimeDisplayMode) => {
    if (newMode !== mode) {
      setMode(newMode);
    }
  };
  
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground mr-1">Time:</span>
      <div className="flex bg-muted/50 rounded-md p-0.5">
        <button
          onClick={() => handleModeChange("full")}
          className={cn(
            "px-2 py-0.5 text-xs font-medium rounded transition-colors",
            mode === "full"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Full
        </button>
        <button
          onClick={() => handleModeChange("compact")}
          className={cn(
            "px-2 py-0.5 text-xs font-medium rounded transition-colors",
            mode === "compact"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Compact
        </button>
      </div>
    </div>
  );
});

TimeDisplayToggle.displayName = "TimeDisplayToggle";

export default TimeDisplayToggle;
