import { createContext, useContext, useState, ReactNode } from "react";

/**
 * TimeDisplayContext - Manages compact/full time display mode for calendar views
 * - Full mode: shows complete hourly grid with time-based positioning
 * - Compact mode: hides all empty time, shows only tasks stacked chronologically
 */

export type TimeDisplayMode = "full" | "compact";

interface TimeDisplayContextType {
  mode: TimeDisplayMode;
  setMode: (mode: TimeDisplayMode) => void;
}

const TimeDisplayContext = createContext<TimeDisplayContextType | undefined>(undefined);

export function TimeDisplayProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<TimeDisplayMode>("full");
  
  return (
    <TimeDisplayContext.Provider value={{ mode, setMode }}>
      {children}
    </TimeDisplayContext.Provider>
  );
}

export function useTimeDisplay() {
  const context = useContext(TimeDisplayContext);
  if (!context) {
    throw new Error("useTimeDisplay must be used within TimeDisplayProvider");
  }
  return context;
}
