import { useState, useCallback, useMemo, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, ChevronLeft, ChevronDown, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAppData, getWeekStartsOn } from "@/hooks/useAppData";
import { useWeeklyData, DayTask, CommitmentData } from "@/hooks/useWeeklyData";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays } from "date-fns";
import { formatWeekRange } from "@/lib/formatPreferences";
import FocusFilter from "@/components/FocusFilter";
import AddIconButton from "@/components/AddIconButton";
import NotionWeekCalendar from "@/components/weekly/NotionWeekCalendar";
import MobileWeekList from "@/components/weekly/MobileWeekList";
import WeeklyTotals from "@/components/weekly/WeeklyTotals";
import TaskDetailModal from "@/components/TaskDetailModal";
import TaskCreateModal from "@/components/TaskCreateModal";

/**
 * Weekly Page - Notion-style weekly view with calendar grid
 * OPTIMIZED: Uses useWeeklyData hook for single-batch fetching
 * Consumes preferences/goals from global AppDataProvider
 * 
 * Supports 90-Day Plan context via ?plan=<id> query parameter
 * When active, shows contextual header and filters tasks to that plan
 */

// Memoized WeeklyTotals to prevent unnecessary re-renders
const MemoizedWeeklyTotals = memo(WeeklyTotals);

// Memoized Calendar
const MemoizedCalendar = memo(NotionWeekCalendar);

const Weekly = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { preferences, goals, visionsMap } = useAppData();
  const isMobile = useIsMobile();
  const weekStartsOn = getWeekStartsOn(preferences.startOfWeek);
  
  // Get active 90-day plan from URL
  const activePlanId = searchParams.get("plan");
  const activePlan = useMemo(() => 
    activePlanId ? goals.find(g => g.id === activePlanId && g.goal_type === "ninety_day") : null,
    [activePlanId, goals]
  );
  const activePlanVision = useMemo(() => 
    activePlan?.life_vision_id ? visionsMap.get(activePlan.life_vision_id) : null,
    [activePlan, visionsMap]
  );

  // State for "other tasks" section when plan is active
  const [otherTasksExpanded, setOtherTasksExpanded] = useState(false);
  
  // Mobile plan selector sheet
  const [mobilePlanSheetOpen, setMobilePlanSheetOpen] = useState(false);
  
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => 
    startOfWeek(new Date(), { weekStartsOn })
  );
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showFocusedOnly, setShowFocusedOnly] = useState(false);

  // Task create modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Task detail modal state
  const [selectedTask, setSelectedTask] = useState<DayTask | null>(null);
  const [selectedTaskDate, setSelectedTaskDate] = useState<Date>(new Date());
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  // Calculate week end
  const currentWeekEnd = useMemo(() => 
    endOfWeek(currentWeekStart, { weekStartsOn }), 
    [currentWeekStart, weekStartsOn]
  );

  // Use centralized data hook
  const { commitments, tasksByDate, loading, refetch } = useWeeklyData(
    currentWeekStart,
    currentWeekEnd
  );

  const weekRangeObj = formatWeekRange(currentWeekStart, currentWeekEnd, preferences.dateFormat);
  const weekRange = `${weekRangeObj.start} – ${weekRangeObj.end}`;
  const isCurrentWeek = format(currentWeekStart, "yyyy-MM-dd") ===
    format(startOfWeek(new Date(), { weekStartsOn }), "yyyy-MM-dd");

  // Clear active plan context
  const clearPlanContext = useCallback(() => {
    setSearchParams({});
    setOtherTasksExpanded(false);
  }, [setSearchParams]);

  // Stable handlers with useCallback
  const handleTaskClick = useCallback((task: DayTask, date: Date) => {
    setSelectedTask(task);
    setSelectedTaskDate(date);
    setTaskModalOpen(true);
  }, []);

  const handleToggleComplete = useCallback(async (task: DayTask, date: Date) => {
    if (!user) return;
    const dateKey = format(date, "yyyy-MM-dd");
    const newCompleted = !task.isCompleted;
    
    try {
      if (task.taskType === "independent") {
        const { data: existingInstance } = await supabase
          .from("daily_task_instances")
          .select("id, is_completed")
          .eq("completion_id", task.id)
          .maybeSingle();

        if (existingInstance) {
          await supabase
            .from("daily_task_instances")
            .update({ is_completed: newCompleted })
            .eq("id", existingInstance.id);
        } else {
          await supabase
            .from("daily_task_instances")
            .insert({
              user_id: user.id,
              completion_id: task.id,
              is_completed: true,
            });
        }
      } else {
        // Handle recurring task completion
        if (task.isCompleted) {
          // Uncompleting: delete the completion record
          await supabase
            .from("commitment_completions")
            .delete()
            .eq("commitment_id", task.commitmentId)
            .eq("completed_date", dateKey);
        } else {
          // Completing: insert new completion record
          await supabase
            .from("commitment_completions")
            .insert({
              user_id: user.id,
              commitment_id: task.commitmentId,
              completed_date: dateKey,
              instance_number: task.instanceNumber || 1,
            });
        }

        // Update the weekly_checkin actual_count
        if (task.commitmentId) {
          const { data: checkin } = await supabase
            .from("weekly_checkins")
            .select("id, actual_count")
            .eq("weekly_commitment_id", task.commitmentId)
            .eq("period_start_date", format(currentWeekStart, "yyyy-MM-dd"))
            .maybeSingle();

          if (checkin) {
            const newActualCount = newCompleted 
              ? checkin.actual_count + 1 
              : Math.max(0, checkin.actual_count - 1);
            
            await supabase
              .from("weekly_checkins")
              .update({ actual_count: newActualCount })
              .eq("id", checkin.id);
          }
        }
      }
      // Refetch to update state
      refetch();
    } catch (error) {
      console.error("Error toggling completion:", error);
      toast.error("Failed to update task");
    }
  }, [user, refetch, currentWeekStart]);

  const goToPreviousWeek = useCallback(() => 
    setCurrentWeekStart(prev => subWeeks(prev, 1)), []);
  const goToNextWeek = useCallback(() => 
    setCurrentWeekStart(prev => addWeeks(prev, 1)), []);
  const goToCurrentWeek = useCallback(() => 
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn })), [weekStartsOn]);

  // Filter commitments based on focus toggle AND active plan - memoized
  const filteredCommitments = useMemo(() => {
    let filtered = commitments;
    
    // Filter by active plan if set
    if (activePlanId) {
      filtered = filtered.filter(c => c.goal_id === activePlanId);
    }
    
    // Then filter by focus if enabled (based on vision's is_focus, not goal)
    if (showFocusedOnly) {
      filtered = filtered.filter(c => c.vision_is_focus === true);
    }
    
    return filtered;
  }, [showFocusedOnly, commitments, activePlanId]);

  // Get commitment IDs for the active plan
  const planCommitmentIds = useMemo(() => {
    if (!activePlanId) return null;
    return new Set(commitments.filter(c => c.goal_id === activePlanId).map(c => c.id));
  }, [activePlanId, commitments]);

  // Filter tasks by date based on filtered commitments - memoized
  const filteredTasksByDate = useMemo(() => {
    const focusedCommitmentIds = new Set(filteredCommitments.map(c => c.id));
    const result: Record<string, DayTask[]> = {};
    
    Object.entries(tasksByDate).forEach(([dateKey, tasks]) => {
      result[dateKey] = tasks.filter(t => {
        // Independent tasks: show if linked to active plan's goal or if no plan is active
        if (t.taskType === "independent") {
          if (activePlanId) {
            // When plan is active, only show independent tasks linked to this plan
            return t.goalId === activePlanId;
          }
          return true;
        }
        // Recurring tasks: check if commitment is in filtered set
        return focusedCommitmentIds.has(t.commitmentId || "");
      });
    });
    
    return result;
  }, [tasksByDate, filteredCommitments, activePlanId]);

  // Other tasks (not linked to active plan) - for collapsed section
  const otherTasksByDate = useMemo(() => {
    if (!activePlanId) return {};
    
    const result: Record<string, DayTask[]> = {};
    
    Object.entries(tasksByDate).forEach(([dateKey, tasks]) => {
      result[dateKey] = tasks.filter(t => {
        if (t.taskType === "independent") {
          return t.goalId !== activePlanId;
        }
        return !planCommitmentIds?.has(t.commitmentId || "");
      });
    });
    
    return result;
  }, [tasksByDate, activePlanId, planCommitmentIds]);

  // Count other tasks
  const otherTasksCount = useMemo(() => 
    Object.values(otherTasksByDate).reduce((acc, tasks) => acc + tasks.length, 0),
    [otherTasksByDate]
  );

  // Weekly progress - memoized
  const weeklyProgress = useMemo(() => 
    Object.values(filteredTasksByDate).reduce(
      (acc, tasks) => {
        const completed = tasks.filter(t => t.isCompleted).length;
        const total = tasks.length;
        return { completed: acc.completed + completed, total: acc.total + total };
      },
      { completed: 0, total: 0 }
    ),
    [filteredTasksByDate]
  );

  // Commitment totals for WeeklyTotals - calculate planned/actual from actual tasks shown
  const commitmentTotals = useMemo(() => {
    // Count tasks per commitment from the actual calendar data
    const commitmentCounts = new Map<string, { planned: number; actual: number }>();
    
    Object.values(filteredTasksByDate).forEach(tasks => {
      tasks.forEach(task => {
        if (task.commitmentId) {
          const existing = commitmentCounts.get(task.commitmentId) || { planned: 0, actual: 0 };
          existing.planned += 1;
          if (task.isCompleted) existing.actual += 1;
          commitmentCounts.set(task.commitmentId, existing);
        }
      });
    });
    
    return filteredCommitments.map(c => {
      const goal = c.goal_id ? goals.find(g => g.id === c.goal_id) : null;
      const counts = commitmentCounts.get(c.id) || { planned: 0, actual: 0 };
      return {
        id: c.id,
        title: c.title,
        planned: counts.planned,
        actual: counts.actual,
        goalId: c.goal_id,
        goalTitle: goal?.title || null,
      };
    });
  },
    [filteredCommitments, goals, filteredTasksByDate]
  );

  // Get set of plan IDs that have active commitments
  const plansWithTasks = useMemo(() => {
    const planIds = new Set<string>();
    commitments.forEach(c => {
      if (c.goal_id) planIds.add(c.goal_id);
    });
    return planIds;
  }, [commitments]);

  // Goals for dropdown - only active, non-deleted plans with tasks
  const goalOptions = useMemo(() => 
    goals
      .filter(g => 
        g.goal_type === "ninety_day" && 
        !g.is_deleted && 
        g.status !== "archived" &&
        plansWithTasks.has(g.id)
      )
      .map(g => {
        const vision = g.life_vision_id ? visionsMap.get(g.life_vision_id) : null;
        return { id: g.id, title: g.title, visionId: g.life_vision_id, visionLabel: vision?.title || null };
      }),
    [goals, visionsMap, plansWithTasks]
  );

  // Group plans by vision for dropdown
  const groupedPlanOptions = useMemo(() => {
    const groups: Record<string, { visionLabel: string; plans: typeof goalOptions }> = {};
    const noVisionPlans: typeof goalOptions = [];
    
    goalOptions.forEach(plan => {
      if (plan.visionId && plan.visionLabel) {
        if (!groups[plan.visionId]) {
          groups[plan.visionId] = { visionLabel: plan.visionLabel, plans: [] };
        }
        groups[plan.visionId].plans.push(plan);
      } else {
        noVisionPlans.push(plan);
      }
    });
    
    return { groups, noVisionPlans };
  }, [goalOptions]);

  // Map of 90-day plan IDs to their titles (for tooltips)
  const planTitles = useMemo(() => {
    const map = new Map<string, string>();
    goalOptions.forEach(plan => map.set(plan.id, plan.title));
    return map;
  }, [goalOptions]);

  // Map of commitment IDs to their linked goal IDs (for plan tinting)
  const commitmentGoalMap = useMemo(() => {
    const map = new Map<string, string>();
    commitments.forEach(c => {
      if (c.goal_id) map.set(c.id, c.goal_id);
    });
    return map;
  }, [commitments]);

  // Get plan commitment IDs for visual indicators
  const getPlanIndicator = useCallback((task: DayTask) => {
    if (!activePlanId) return false;
    if (task.taskType === "independent") {
      return task.goalId === activePlanId;
    }
    return planCommitmentIds?.has(task.commitmentId || "") || false;
  }, [activePlanId, planCommitmentIds]);

  // Helper to select a plan (works for both mobile sheet and desktop dropdown)
  // MUST be defined before early return to maintain hooks order
  const selectPlan = useCallback((planId: string | null) => {
    if (planId) {
      setSearchParams({ plan: planId });
    } else {
      setSearchParams({});
    }
    setMobilePlanSheetOpen(false);
    setOtherTasksExpanded(false);
  }, [setSearchParams]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <p className="text-muted-foreground text-center">Loading...</p>
      </div>
    );
  }

  // Shared dropdown content for plan selection - flat list (no grouping)
  const PlanDropdownContent = ({ align = "start" }: { align?: "start" | "end" }) => (
    <DropdownMenuContent align={align} className="w-64 bg-popover border border-border/60 shadow-sm max-h-80 overflow-y-auto">
      <DropdownMenuItem 
        onClick={clearPlanContext}
        className="cursor-pointer flex items-center gap-2"
      >
        <Check className={`h-3 w-3 ${!activePlanId ? 'opacity-100' : 'opacity-0'}`} />
        <span>All Plans</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator className="bg-border/50" />
      
      {/* Flat list of all plans */}
      {goalOptions.map((plan) => (
        <DropdownMenuItem 
          key={plan.id}
          onClick={() => setSearchParams({ plan: plan.id })}
          className="cursor-pointer flex items-center gap-2"
        >
          <Check className={`h-3 w-3 shrink-0 ${plan.id === activePlanId ? 'opacity-100' : 'opacity-0'}`} />
          <span className="truncate">{plan.title}</span>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );


  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-4xl overflow-x-hidden">
      {/* Mobile Plan Selector Sheet */}
      <Sheet open={mobilePlanSheetOpen} onOpenChange={setMobilePlanSheetOpen}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle>Select 90-Day Plan</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-1">
            <button
              onClick={() => selectPlan(null)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left ${!activePlanId ? 'bg-primary/10' : 'hover:bg-muted'}`}
            >
              <Check className={`h-4 w-4 ${!activePlanId ? 'opacity-100 text-primary' : 'opacity-0'}`} />
              <span className="text-sm font-medium">All Plans</span>
            </button>
            
            {/* Flat list of all plans */}
            {goalOptions.map((plan) => (
              <button
                key={plan.id}
                onClick={() => selectPlan(plan.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left ${plan.id === activePlanId ? 'bg-primary/10' : 'hover:bg-muted'}`}
              >
                <Check className={`h-4 w-4 ${plan.id === activePlanId ? 'opacity-100 text-primary' : 'opacity-0'}`} />
                <span className="text-sm truncate">{plan.title}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Header */}
      <div className="mb-4 md:mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2 md:gap-4">
          <h1 className={`font-medium text-foreground ${isMobile ? 'text-base' : 'text-lg'}`}>Weekly</h1>
          {weeklyProgress.total > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
              {weeklyProgress.completed}/{weeklyProgress.total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!activePlanId && !isMobile && (
            <FocusFilter
              showFocusedOnly={showFocusedOnly}
              onToggle={() => setShowFocusedOnly(!showFocusedOnly)}
            />
          )}
          <AddIconButton
            onClick={() => setCreateModalOpen(true)}
            tooltip="Add task"
          />
        </div>
      </div>

      {/* Viewing dropdown - Desktop (left-aligned, lightweight) */}
      {!isMobile && goalOptions.length > 0 && (
        <div className="mb-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border/40 rounded-md hover:border-border/60 transition-calm"
              >
                <span className="text-xs text-muted-foreground/70">Viewing:</span>
                <span className="font-medium text-foreground truncate max-w-[180px]">
                  {activePlan?.title || "All Plans"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />
              </button>
            </DropdownMenuTrigger>
            <PlanDropdownContent align="start" />
          </DropdownMenu>
        </div>
      )}

      {/* Mobile Plan Selector Bar */}
      {isMobile && goalOptions.length > 0 && (
        <button
          onClick={() => setMobilePlanSheetOpen(true)}
          className="mb-4 flex items-center gap-1.5 px-3 py-2 text-sm border border-border/40 rounded-md min-h-[44px]"
        >
          <span className="text-xs text-muted-foreground/70">Viewing:</span>
          <span className="font-medium text-foreground truncate max-w-[200px]">
            {activePlan?.title || "All Plans"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
        </button>
      )}

      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4 md:mb-6 border-b border-border pb-3 md:pb-4">
        <button
          onClick={goToPreviousWeek}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-calm min-h-[44px] px-2 -ml-2"
        >
          <ChevronLeft className="h-4 w-4" />
          {!isMobile && "Prev"}
        </button>
        <div className="text-center">
          <h2 className={`font-medium text-foreground ${isMobile ? 'text-sm' : 'text-base'}`}>
            {weekRange}
          </h2>
          {!isCurrentWeek && (
            <button
              onClick={goToCurrentWeek}
              className="text-xs text-primary hover:underline mt-1"
            >
              {isMobile ? "Today" : "Go to current week"}
            </button>
          )}
        </div>
        <button
          onClick={goToNextWeek}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-calm min-h-[44px] px-2 -mr-2"
        >
          {!isMobile && "Next"}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>


       {/* Calendar grid - Desktop */}
      {!isMobile && (
        <MemoizedCalendar
          weekStart={currentWeekStart}
          tasksByDate={filteredTasksByDate}
          selectedDate={selectedDate}
          onDateSelect={setSelectedDate}
          onTaskClick={handleTaskClick}
          onToggleComplete={handleToggleComplete}
          weekStartsOn={weekStartsOn}
          timeFormat={preferences.timeFormat}
          dateFormat={preferences.dateFormat}
          activePlanId={activePlanId}
          planTitles={planTitles}
          commitmentGoalMap={commitmentGoalMap}
        />
      )}

      {/* Mobile Week List */}
      {isMobile && (
        <MobileWeekList
          weekStart={currentWeekStart}
          tasksByDate={filteredTasksByDate}
          selectedDate={selectedDate}
          onDateSelect={setSelectedDate}
          onTaskClick={handleTaskClick}
          onToggleComplete={handleToggleComplete}
          timeFormat={preferences.timeFormat}
          activePlanId={activePlanId}
          planTitles={planTitles}
          commitmentGoalMap={commitmentGoalMap}
        />
      )}

      {/* Other tasks section (when plan is active) - grouped by plan */}
      {activePlanId && otherTasksCount > 0 && (
        <div className="mt-6 border-t border-border/50 pt-4">
          <button
            onClick={() => setOtherTasksExpanded(!otherTasksExpanded)}
            className="w-full text-left text-sm text-muted-foreground hover:text-foreground py-2 flex items-center gap-1 transition-colors min-h-[44px]"
          >
            <ChevronDown 
              className={`h-4 w-4 transition-transform ${otherTasksExpanded ? 'rotate-180' : ''}`} 
            />
            Other tasks this week ({otherTasksCount})
          </button>
          
          {otherTasksExpanded && (() => {
            // Group other tasks by plan for list-based display
            const groupedByPlan: Record<string, { title: string; tasks: { task: DayTask; dateKey: string }[] }> = {};
            const independentTasks: { task: DayTask; dateKey: string }[] = [];

            Object.entries(otherTasksByDate).forEach(([dateKey, tasks]) => {
              tasks.forEach(task => {
                const taskGoalId = task.goalId || (task.commitmentId ? commitmentGoalMap.get(task.commitmentId) : null);
                const planTitle = taskGoalId ? planTitles.get(taskGoalId) : null;
                
                if (taskGoalId && planTitle) {
                  if (!groupedByPlan[taskGoalId]) {
                    groupedByPlan[taskGoalId] = { title: planTitle, tasks: [] };
                  }
                  groupedByPlan[taskGoalId].tasks.push({ task, dateKey });
                } else {
                  independentTasks.push({ task, dateKey });
                }
              });
            });

            const planGroups = Object.entries(groupedByPlan);

            const renderTask = (task: DayTask, dateKey: string) => (
              <div 
                key={task.id}
                className={`
                  flex items-center justify-between py-2 cursor-pointer hover:bg-muted/30 rounded px-2 -mx-2
                  ${isMobile ? 'min-h-[44px] text-sm' : 'text-sm py-1'}
                `}
                onClick={() => handleTaskClick(task, new Date(dateKey))}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button 
                    className={`
                      shrink-0 rounded-full border-2 flex items-center justify-center
                      ${isMobile ? 'w-5 h-5' : 'w-3 h-3'}
                      ${task.isCompleted ? 'bg-primary border-primary' : 'border-border'}
                    `}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleComplete(task, new Date(dateKey));
                    }}
                  >
                    {task.isCompleted && isMobile && (
                      <svg className="w-2.5 h-2.5 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <span className={`truncate ${task.isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                    {task.title}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">
                  {format(new Date(dateKey), "EEE")}
                </span>
              </div>
            );

            return (
              <div className="mt-2 space-y-4 pl-5">
                {/* Plan groups */}
                {planGroups.map(([planId, group]) => (
                  <div key={planId}>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 truncate">
                      {group.title}
                    </h4>
                    <div className="space-y-1">
                      {group.tasks.map(({ task, dateKey }) => renderTask(task, dateKey))}
                    </div>
                  </div>
                ))}

                {/* Independent tasks */}
                {independentTasks.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      One-time tasks
                    </h4>
                    <div className="space-y-1">
                      {independentTasks.map(({ task, dateKey }) => renderTask(task, dateKey))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Weekly totals - Always below calendar */}
      {commitmentTotals.length > 0 && (
        <MemoizedWeeklyTotals commitments={commitmentTotals} />
      )}

      {/* Task create modal - auto-links to active plan if set */}
      <TaskCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        defaultDate={selectedDate}
        goals={goalOptions}
        onSuccess={refetch}
        weekStart={currentWeekStart}
        defaultGoalId={activePlanId || undefined}
      />

      {/* Task detail modal */}
      <TaskDetailModal
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        task={selectedTask}
        date={selectedTaskDate}
        onUpdate={refetch}
      />
    </div>
  );
};

export default Weekly;
