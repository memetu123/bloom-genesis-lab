import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * CalendarViewContext - Manages the current calendar view state
 * Persists the last used view for the view selector dropdown
 */

export type CalendarView = "daily" | "weekly" | "schedule";

interface CalendarViewContextType {
  currentView: CalendarView;
  setView: (view: CalendarView) => void;
  navigateToView: (view: CalendarView) => void;
}

const CalendarViewContext = createContext<CalendarViewContextType | undefined>(undefined);

export function CalendarViewProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Determine current view from URL
  const getViewFromPath = (): CalendarView => {
    if (location.pathname.startsWith("/daily")) return "daily";
    if (location.pathname.startsWith("/weekly")) return "weekly";
    return "daily"; // default
  };
  
  const [currentView, setCurrentView] = useState<CalendarView>(getViewFromPath);
  
  const setView = useCallback((view: CalendarView) => {
    setCurrentView(view);
  }, []);
  
  const navigateToView = useCallback((view: CalendarView) => {
    setCurrentView(view);
    
    // Preserve date param when switching views
    const searchParams = new URLSearchParams(location.search);
    const dateParam = searchParams.get("date");
    const queryString = dateParam ? `?date=${dateParam}` : "";
    
    switch (view) {
      case "daily":
        navigate(`/daily${queryString}`);
        break;
      case "weekly":
        navigate(`/weekly${queryString}`);
        break;
      case "schedule":
        // Placeholder - stays on current page for now
        break;
    }
  }, [navigate, location.search]);
  
  return (
    <CalendarViewContext.Provider value={{ currentView, setView, navigateToView }}>
      {children}
    </CalendarViewContext.Provider>
  );
}

export function useCalendarView() {
  const context = useContext(CalendarViewContext);
  if (!context) {
    throw new Error("useCalendarView must be used within CalendarViewProvider");
  }
  return context;
}
