import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import CalendarLeftRail, { TaskListItem } from "./CalendarLeftRail";
import ThreeYearGoalFilter from "./ThreeYearGoalFilter";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * CalendarLayout - Shared layout for Weekly and Daily calendar views
 * 
 * Structure:
 * - Left Rail: 3-Year filter + Progress section + action buttons (desktop only for now)
 * - Main Canvas: Calendar grid starting at top, no extra padding
 */

interface ProgressItem {
  id: string;
  title: string;
  planned: number;
  actual: number;
  goalTitle?: string | null;
}

interface ThreeYearGoal {
  id: string;
  title: string;
}

interface CalendarLayoutProps {
  // Left rail props
  totalPlanned: number;
  totalActual: number;
  progressItems?: ProgressItem[];
  
  // Task list for daily view
  taskList?: TaskListItem[];
  onTaskClick?: (taskId: string) => void;
  onTaskToggle?: (taskId: string) => void;
  
  onAddTask: () => void;
  showFocusedOnly: boolean;
  onToggleFocus: () => void;
  
  // 3-Year Goal filter
  threeYearGoals?: ThreeYearGoal[];
  selectedThreeYearGoalId?: string | null;
  onSelectThreeYearGoal?: (goalId: string | null) => void;
  
  // Main content
  children: ReactNode;
  
  // Optional header content (date navigation, etc.)
  headerContent?: ReactNode;
  
  className?: string;
}

const CalendarLayout = ({
  totalPlanned,
  totalActual,
  progressItems = [],
  taskList = [],
  onTaskClick,
  onTaskToggle,
  onAddTask,
  showFocusedOnly,
  onToggleFocus,
  threeYearGoals = [],
  selectedThreeYearGoalId,
  onSelectThreeYearGoal,
  children,
  headerContent,
  className,
}: CalendarLayoutProps) => {
  const isMobile = useIsMobile();
  
  // Mobile: No left rail, just the calendar
  if (isMobile) {
    return (
      <div className={cn("flex flex-col flex-1 min-h-0", className)}>
        {headerContent && (
          <div className="shrink-0 border-b border-border px-4 py-2">
            {headerContent}
          </div>
        )}
        <div className="flex-1 overflow-hidden min-h-0">
          {children}
        </div>
      </div>
    );
  }
  
  // Desktop/Tablet: Left rail + main canvas
  return (
    <div className={cn("flex flex-1 min-h-0 overflow-hidden", className)}>
      {/* Left Rail - sticky, does not scroll horizontally */}
      <div className="shrink-0 sticky left-0 z-30 h-full">
        <CalendarLeftRail
          totalPlanned={totalPlanned}
          totalActual={totalActual}
          progressItems={progressItems}
          taskList={taskList}
          onTaskClick={onTaskClick}
          onTaskToggle={onTaskToggle}
          onAddTask={onAddTask}
          showFocusedOnly={showFocusedOnly}
          onToggleFocus={onToggleFocus}
        >
          {/* 3-Year Goal Filter */}
          {threeYearGoals.length > 0 && onSelectThreeYearGoal && (
            <ThreeYearGoalFilter
              goals={threeYearGoals}
              selectedGoalId={selectedThreeYearGoalId || null}
              onSelectGoal={onSelectThreeYearGoal}
              className="mb-4"
            />
          )}
        </CalendarLeftRail>
      </div>
      
      {/* Main Canvas - scrollable content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Optional header - sticky at top */}
        {headerContent && (
          <div className="shrink-0 border-b border-border px-4 py-2 sticky top-0 z-20 bg-background">
            {headerContent}
          </div>
        )}
        
        {/* Calendar content - scrollable */}
        <div className="flex-1 overflow-auto min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
};

export default CalendarLayout;
