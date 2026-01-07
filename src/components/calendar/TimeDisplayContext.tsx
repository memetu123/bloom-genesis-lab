import { createContext, useContext, useState, useCallback, ReactNode } from "react";

/**
 * TimeDisplayContext - Manages compact/full time display mode for calendar views
 * Persists the user's preference for collapsing empty time gaps
 */

export type TimeDisplayMode = "full" | "compact";

interface TimeDisplayContextType {
  mode: TimeDisplayMode;
  setMode: (mode: TimeDisplayMode) => void;
  expandedGaps: Set<string>;
  toggleGap: (gapId: string) => void;
  isGapExpanded: (gapId: string) => boolean;
  collapseAllGaps: () => void;
}

const TimeDisplayContext = createContext<TimeDisplayContextType | undefined>(undefined);

export function TimeDisplayProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<TimeDisplayMode>("full");
  const [expandedGaps, setExpandedGaps] = useState<Set<string>>(new Set());
  
  const toggleGap = useCallback((gapId: string) => {
    setExpandedGaps(prev => {
      const next = new Set(prev);
      if (next.has(gapId)) {
        next.delete(gapId);
      } else {
        next.add(gapId);
      }
      return next;
    });
  }, []);
  
  const isGapExpanded = useCallback((gapId: string) => {
    return expandedGaps.has(gapId);
  }, [expandedGaps]);
  
  const collapseAllGaps = useCallback(() => {
    setExpandedGaps(new Set());
  }, []);
  
  return (
    <TimeDisplayContext.Provider value={{ 
      mode, 
      setMode, 
      expandedGaps, 
      toggleGap, 
      isGapExpanded,
      collapseAllGaps 
    }}>
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
