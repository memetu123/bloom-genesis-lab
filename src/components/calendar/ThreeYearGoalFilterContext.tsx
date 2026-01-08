import { createContext, useContext, useState, ReactNode } from "react";

/**
 * Context for managing 3-Year Goal filter state
 * Persists across Weekly ↔ Daily view navigation
 */

interface ThreeYearGoalFilterContextType {
  selectedGoalId: string | null; // null = "All 3-Year Goals"
  setSelectedGoalId: (goalId: string | null) => void;
}

const ThreeYearGoalFilterContext = createContext<ThreeYearGoalFilterContextType | undefined>(undefined);

export const ThreeYearGoalFilterProvider = ({ children }: { children: ReactNode }) => {
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  
  return (
    <ThreeYearGoalFilterContext.Provider value={{ selectedGoalId, setSelectedGoalId }}>
      {children}
    </ThreeYearGoalFilterContext.Provider>
  );
};

export const useThreeYearGoalFilter = () => {
  const context = useContext(ThreeYearGoalFilterContext);
  if (!context) {
    throw new Error("useThreeYearGoalFilter must be used within ThreeYearGoalFilterProvider");
  }
  return context;
};
