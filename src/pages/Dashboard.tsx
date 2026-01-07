import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Star, ChevronDown, MoreHorizontal, ArrowRight, Plus, Pencil } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAppData, Goal as GlobalGoal } from "@/hooks/useAppData";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useExecutionStatus, ExecutionState, VisionExecutionData } from "@/hooks/useExecutionStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import AddIconButton from "@/components/AddIconButton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Dashboard Page - My North Star
 * The single strategy surface where users define direction, see hierarchy, and navigate into execution.
 * Direction. Clarity. Intent.
 */

// Goal with children for hierarchical display
interface GoalWithChildren extends GlobalGoal {
  children: GoalWithChildren[];
  isActive: boolean; // Derived: has active tasks or active descendants
}

interface VisionWithHierarchy {
  id: string;
  title: string;
  pillar_name: string;
  is_focus: boolean;
  threeYearWithChildren: GoalWithChildren[];
}

type HierarchyFilter = "all" | "1yr" | "90d";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { visions, goals, pillars, pillarsMap, goalsWithActiveTasks, loading, refetchVisions, refetchGoals, refetchCommitments, preferences, refetchPreferences } = useAppData();
  const [otherVisionsExpanded, setOtherVisionsExpanded] = useState(false);

  // Orientation line state
  const DEFAULT_ORIENTATION = "This is a place to orient yourself, not to rush.";
  const [isEditingOrientation, setIsEditingOrientation] = useState(false);
  const [orientationValue, setOrientationValue] = useState("");
  const orientationInputRef = useRef<HTMLTextAreaElement>(null);
  const [isOrientationHovered, setIsOrientationHovered] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  // Ensure commitments (which drive active status) are fresh on mount
  useEffect(() => {
    refetchCommitments();
  }, [refetchCommitments]);
  const [expandedVisionIds, setExpandedVisionIds] = useState<Set<string>>(new Set());
  
  // Hierarchy filter - desktop only, mobile always shows "all"
  const [hierarchyFilter, setHierarchyFilter] = useState<HierarchyFilter>("all");
  const effectiveFilter: HierarchyFilter = isMobile ? "all" : hierarchyFilter;
  
  // Add vision dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedPillarId, setSelectedPillarId] = useState("");
  const [saving, setSaving] = useState(false);

  // Mobile action sheet state
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileSheetVision, setMobileSheetVision] = useState<VisionWithHierarchy | null>(null);
  

  // Build hierarchical goal tree: 3yr → 1yr → 90d with activity derivation
  const buildGoalTree = (visionGoals: GlobalGoal[]): GoalWithChildren[] => {
    const threeYear = visionGoals.filter(g => g.goal_type === "three_year");
    const oneYear = visionGoals.filter(g => g.goal_type === "one_year");
    const ninetyDay = visionGoals.filter(g => g.goal_type === "ninety_day");

    // Build 90d goals with activity status (has active tasks)
    const ninetyDayWithActivity: GoalWithChildren[] = ninetyDay.map(nd => ({
      ...nd,
      children: [],
      isActive: goalsWithActiveTasks.has(nd.id),
    }));

    // Build 1yr goals with their 90d children - active if any child is active
    const oneYearWithChildren: GoalWithChildren[] = oneYear.map(goal => {
      const children = ninetyDayWithActivity.filter(nd => nd.parent_goal_id === goal.id);
      const isActive = children.some(c => c.isActive);
      return { ...goal, children, isActive };
    });

    // Build 3yr goals with their 1yr children - active if any child is active
    const threeYearWithChildren: GoalWithChildren[] = threeYear.map(goal => {
      const children = oneYearWithChildren.filter(oy => oy.parent_goal_id === goal.id);
      const isActive = children.some(c => c.isActive);
      return { ...goal, children, isActive };
    });

    // Find orphan 1yr goals (no parent 3yr) and add them as top-level
    const orphanOneYear = oneYearWithChildren.filter(oy => !oy.parent_goal_id);
    
    // Find orphan 90d goals (no parent 1yr) and add them as top-level
    const orphanNinetyDay = ninetyDayWithActivity.filter(nd => !nd.parent_goal_id);

    // Combine all top-level goals and sort: active first, preserve relative order within groups
    const allTopLevel = [...threeYearWithChildren, ...orphanOneYear, ...orphanNinetyDay];
    return sortByActivity(allTopLevel);
  };

  // Sort goals by activity: active first, then inactive, preserving relative order within each group
  const sortByActivity = (items: GoalWithChildren[]): GoalWithChildren[] => {
    const active = items.filter(g => g.isActive);
    const inactive = items.filter(g => !g.isActive);
    
    // Also sort children recursively
    const sortChildren = (goals: GoalWithChildren[]): GoalWithChildren[] => {
      return goals.map(g => ({
        ...g,
        children: sortByActivity(g.children),
      }));
    };

    return [...sortChildren(active), ...sortChildren(inactive)];
  };

  // Build focused visions with hierarchical goals
  const focusedVisions = useMemo((): VisionWithHierarchy[] => {
    const focused = visions.filter(v => v.is_focus && v.status === "active");

    return focused.map(vision => {
      const visionGoals = goals.filter(g => g.life_vision_id === vision.id && g.status !== "archived" && !g.is_deleted);

      return {
        id: vision.id,
        title: vision.title,
        pillar_name: pillarsMap.get(vision.pillar_id)?.name || "",
        is_focus: true,
        threeYearWithChildren: buildGoalTree(visionGoals),
      };
    });
  }, [visions, goals, pillarsMap, goalsWithActiveTasks]);

  // Non-focused active visions with hierarchy
  const nonFocusedVisions = useMemo((): VisionWithHierarchy[] => {
    return visions
      .filter(v => !v.is_focus && v.status === "active")
      .map(vision => {
        const visionGoals = goals.filter(g => g.life_vision_id === vision.id && g.status !== "archived" && !g.is_deleted);
        return {
          id: vision.id,
          title: vision.title,
          pillar_name: pillarsMap.get(vision.pillar_id)?.name || "",
          is_focus: false,
          threeYearWithChildren: buildGoalTree(visionGoals),
        };
      });
  }, [visions, goals, pillarsMap, goalsWithActiveTasks]);

  // Build ID collections for execution status hook
  const { ninetyDayPlanIds, oneYearGoalIds, goalToChildPlansMap, visionToPlanIdsMap, visionEditDates } = useMemo(() => {
    const allVisions = [...focusedVisions, ...nonFocusedVisions];
    const ninetyDayIds: string[] = [];
    const oneYearIds: string[] = [];
    const childMap = new Map<string, string[]>();
    const visionPlanMap = new Map<string, string[]>();
    const editDatesMap = new Map<string, string>();

    const traverse = (items: GoalWithChildren[], parentOneYearId?: string) => {
      for (const item of items) {
        if (item.goal_type === "ninety_day") {
          ninetyDayIds.push(item.id);
          if (parentOneYearId) {
            const existing = childMap.get(parentOneYearId) || [];
            existing.push(item.id);
            childMap.set(parentOneYearId, existing);
          }
        } else if (item.goal_type === "one_year") {
          oneYearIds.push(item.id);
          traverse(item.children, item.id);
        } else {
          traverse(item.children, parentOneYearId);
        }
      }
    };

    // Also collect 90d plan IDs per vision for vision ordering
    const collectPlanIds = (items: GoalWithChildren[]): string[] => {
      const planIds: string[] = [];
      const traverseForPlans = (goals: GoalWithChildren[]) => {
        for (const goal of goals) {
          if (goal.goal_type === "ninety_day") {
            planIds.push(goal.id);
          }
          traverseForPlans(goal.children);
        }
      };
      traverseForPlans(items);
      return planIds;
    };

    for (const vision of allVisions) {
      traverse(vision.threeYearWithChildren);
      
      // Build vision to plan IDs map
      const planIds = collectPlanIds(vision.threeYearWithChildren);
      visionPlanMap.set(vision.id, planIds);
      
      // Use most recent goal's created_at as proxy for vision edit date (for Tier 3 tie-breaking)
      let mostRecentGoalDate: string | null = null;
      const allGoals = vision.threeYearWithChildren;
      const collectDates = (items: GoalWithChildren[]) => {
        for (const item of items) {
          if (item.created_at && (!mostRecentGoalDate || item.created_at > mostRecentGoalDate)) {
            mostRecentGoalDate = item.created_at;
          }
          collectDates(item.children);
        }
      };
      collectDates(allGoals);
      if (mostRecentGoalDate) {
        editDatesMap.set(vision.id, mostRecentGoalDate);
      }
    }

    return { 
      ninetyDayPlanIds: ninetyDayIds, 
      oneYearGoalIds: oneYearIds, 
      goalToChildPlansMap: childMap,
      visionToPlanIdsMap: visionPlanMap,
      visionEditDates: editDatesMap,
    };
  }, [focusedVisions, nonFocusedVisions, visions]);

  // Get execution status for goals/plans
  const { planExecutionMap, goalExecutionMap, visionExecutionMap } = useExecutionStatus(
    ninetyDayPlanIds,
    oneYearGoalIds,
    goalToChildPlansMap,
    visionToPlanIdsMap,
    visionEditDates
  );

  // Sort focused visions by execution activity tiers
  const sortedFocusedVisions = useMemo((): VisionWithHierarchy[] => {
    return [...focusedVisions].sort((a, b) => {
      const execA = visionExecutionMap.get(a.id);
      const execB = visionExecutionMap.get(b.id);

      // Default to tier 3 if no execution data
      const tierA = execA?.tier ?? 3;
      const tierB = execB?.tier ?? 3;

      // Primary sort: by tier (ascending - tier 1 first)
      if (tierA !== tierB) {
        return tierA - tierB;
      }

      // Within same tier, apply tie-breakers
      if (tierA === 1) {
        // Tier 1: Sort by active plans count (descending)
        const activePlansA = execA?.activePlansCount ?? 0;
        const activePlansB = execB?.activePlansCount ?? 0;
        if (activePlansA !== activePlansB) {
          return activePlansB - activePlansA;
        }
        // Then by most recent completion date (descending)
        const completionA = execA?.mostRecentCompletionDate ?? "";
        const completionB = execB?.mostRecentCompletionDate ?? "";
        if (completionA !== completionB) {
          return completionB.localeCompare(completionA);
        }
        // Then by total plans with tasks (descending)
        const plansWithTasksA = execA?.totalPlansWithTasks ?? 0;
        const plansWithTasksB = execB?.totalPlansWithTasks ?? 0;
        return plansWithTasksB - plansWithTasksA;
      } else if (tierA === 2) {
        // Tier 2: Sort by most recent completion date (descending)
        const completionA = execA?.mostRecentCompletionDate ?? "";
        const completionB = execB?.mostRecentCompletionDate ?? "";
        return completionB.localeCompare(completionA);
      } else {
        // Tier 3: Sort by most recently edited/created (descending)
        const editA = execA?.mostRecentEditDate ?? "";
        const editB = execB?.mostRecentEditDate ?? "";
        return editB.localeCompare(editA);
      }
    });
  }, [focusedVisions, visionExecutionMap]);

  const handleToggleFocus = async (visionId: string, currentFocus: boolean) => {
    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ is_focus: !currentFocus })
        .eq("id", visionId);

      if (error) throw error;
      refetchVisions();
    } catch (err) {
      toast.error("Failed to update focus");
    }
  };

  const handleAddVision = async () => {
    if (!user || !newTitle.trim() || !selectedPillarId) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from("life_visions")
        .insert({
          user_id: user.id,
          pillar_id: selectedPillarId,
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          status: "active",
          is_focus: true, // New visions are focused by default
        });

      if (error) throw error;

      setNewTitle("");
      setNewDescription("");
      setSelectedPillarId("");
      setAddDialogOpen(false);
      refetchVisions();
      toast.success("Vision created");
    } catch (error) {
      console.error("Error adding vision:", error);
      toast.error("Failed to add vision");
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveVision = async (visionId: string, visionTitle: string) => {
    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", visionId);

      if (error) throw error;
      refetchVisions();
      
      toast("Vision archived", {
        action: {
          label: "Undo",
          onClick: async () => {
            await supabase
              .from("life_visions")
              .update({ status: "active", archived_at: null })
              .eq("id", visionId);
            refetchVisions();
          }
        },
        duration: 5000
      });
    } catch (err) {
      toast.error("Failed to archive vision");
    }
  };

  const handleDeleteVision = async (visionId: string) => {
    try {
      const { error } = await supabase
        .from("life_visions")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", visionId);

      if (error) throw error;
      refetchVisions();
      toast.success("Vision deleted");
    } catch (err) {
      toast.error("Failed to delete vision");
    }
  };

  // ============ ORIENTATION LINE HANDLERS ============
  
  const displayedOrientation = preferences.northStarOrientation || DEFAULT_ORIENTATION;
  
  const startEditingOrientation = () => {
    setOrientationValue(preferences.northStarOrientation || "");
    setIsEditingOrientation(true);
    setTimeout(() => orientationInputRef.current?.focus(), 50);
  };
  
  const saveOrientation = async () => {
    if (!user) return;
    
    const trimmedValue = orientationValue.trim();
    // If cleared, save null (will show default)
    const valueToSave = trimmedValue === "" ? null : trimmedValue.slice(0, 120);
    
    try {
      await supabase
        .from("user_preferences")
        .upsert(
          { user_id: user.id, north_star_orientation: valueToSave },
          { onConflict: "user_id" }
        );
      await refetchPreferences();
    } catch (err) {
      console.error("Error saving orientation:", err);
    }
    
    setIsEditingOrientation(false);
  };
  
  const cancelEditingOrientation = () => {
    setIsEditingOrientation(false);
    setOrientationValue("");
  };
  
  const handleOrientationKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveOrientation();
    } else if (e.key === "Escape") {
      cancelEditingOrientation();
    }
  };
  
  // Long press handlers for mobile
  const handleOrientationTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      startEditingOrientation();
    }, 500);
  };
  
  const handleOrientationTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const getLabelChip = (goalType: string) => {
    const labels: Record<string, string> = {
      three_year: "3yr",
      one_year: "1yr",
      ninety_day: "90d",
    };
    return labels[goalType] || "";
  };

  // Collect all 90-day goals from the tree for navigation
  const getAllNinetyDayGoals = (goals: GoalWithChildren[]): GoalWithChildren[] => {
    const result: GoalWithChildren[] = [];
    const traverse = (items: GoalWithChildren[]) => {
      for (const item of items) {
        if (item.goal_type === "ninety_day") {
          result.push(item);
        }
        traverse(item.children);
      }
    };
    traverse(goals);
    return result;
  };

  // Get first active 90-day plan for navigation
  const getActive90DayPlan = (goals: GoalWithChildren[]) => {
    const ninetyDayGoals = getAllNinetyDayGoals(goals);
    const active = ninetyDayGoals.find(g => g.status === "active" || g.status === "in_progress");
    return active || ninetyDayGoals[0];
  };

  // Check if there are any child goals to show when expanded
  const hasExpandableContent = (goals: GoalWithChildren[]): boolean => {
    for (const goal of goals) {
      if (goal.children.length > 0) return true;
    }
    return false;
  };

  // Toggle expanded state for vision cards
  const toggleVisionExpanded = (visionId: string) => {
    setExpandedVisionIds(prev => {
      const next = new Set(prev);
      if (next.has(visionId)) {
        next.delete(visionId);
      } else {
        next.add(visionId);
      }
      return next;
    });
  };

  // Collect all goals of a specific type from the hierarchy
  const collectGoalsByType = (goals: GoalWithChildren[], goalType: string): GoalWithChildren[] => {
    const result: GoalWithChildren[] = [];
    const traverse = (items: GoalWithChildren[]) => {
      for (const item of items) {
        if (item.goal_type === goalType) {
          result.push(item);
        }
        traverse(item.children);
      }
    };
    traverse(goals);
    return result;
  };

  // Open mobile action sheet for a vision
  const openMobileVisionActions = (vision: VisionWithHierarchy, e: React.MouseEvent) => {
    e.stopPropagation();
    setMobileSheetVision(vision);
    setMobileSheetOpen(true);
  };

  // Handle archiving a goal
  const handleArchiveGoal = async (goalId: string, goalTitle: string) => {
    try {
      const { error } = await supabase
        .from("goals")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", goalId);

      if (error) throw error;
      refetchGoals();
      
      toast(`"${goalTitle}" archived`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await supabase
              .from("goals")
              .update({ status: "active", archived_at: null })
              .eq("id", goalId);
            refetchGoals();
          }
        },
        duration: 5000
      });
    } catch (err) {
      toast.error("Failed to archive goal");
    }
  };

  // Handle completing a goal
  const handleCompleteGoal = async (goalId: string, goalTitle: string) => {
    try {
      const { error } = await supabase
        .from("goals")
        .update({ status: "completed" })
        .eq("id", goalId);

      if (error) throw error;
      refetchGoals();
      
      toast(`"${goalTitle}" marked complete`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await supabase
              .from("goals")
              .update({ status: "active" })
              .eq("id", goalId);
            refetchGoals();
          }
        },
        duration: 5000
      });
    } catch (err) {
      toast.error("Failed to complete goal");
    }
  };

  // Handle deleting a goal (soft delete)
  const handleDeleteGoal = async (goalId: string, goalTitle: string) => {
    try {
      const { error } = await supabase
        .from("goals")
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", goalId);

      if (error) throw error;
      refetchGoals();
      
      toast(`"${goalTitle}" deleted`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await supabase
              .from("goals")
              .update({ is_deleted: false, deleted_at: null })
              .eq("id", goalId);
            refetchGoals();
          }
        },
        duration: 5000
      });
    } catch (err) {
      toast.error("Failed to delete goal");
    }
  };

  // Render a single goal item with label chip - uses goal's isActive for muting
  const renderGoalItem = (
    goal: GoalWithChildren, 
    indentLevel: number, 
    showConnector: boolean,
    isMobile: boolean
  ) => {
    const labelChip = getLabelChip(goal.goal_type);
    const isNinetyDay = goal.goal_type === "ninety_day";
    const isMuted = !goal.isActive;
    
    return (
      <div
        key={goal.id}
        className={`flex items-start gap-2 group/goal ${isMobile ? "py-1" : "py-1.5"}`}
        style={{ paddingLeft: indentLevel * (isMobile ? 16 : 20) }}
      >
        {/* Connector marker */}
        {showConnector && (
          <span className="text-muted-foreground/40 font-mono text-xs shrink-0 mt-0.5">└─</span>
        )}
        
        {/* Label chip */}
        <span className={`
          shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded 
          ${isMuted ? "bg-muted/40 text-muted-foreground/60" : "bg-muted/60 text-muted-foreground"}
        `}>
          {labelChip}
        </span>
        
        {/* Goal title + action menu inline */}
        <div className="flex items-center gap-1 min-w-0">
          <span
            className={`
              text-sm cursor-pointer transition-colors break-words
              ${isMuted ? "text-muted-foreground/60" : "text-foreground/90"}
              hover:text-primary
            `}
            onClick={(e) => {
              e.stopPropagation();
              if (isNinetyDay) {
                navigate(`/weekly?plan=${goal.id}`);
              } else {
                navigate(`/goal/${goal.id}`);
              }
            }}
          >
            {goal.title}
          </span>

          {/* Action menu - next to title */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className={`h-5 w-5 shrink-0 ${isMobile ? "opacity-100" : "opacity-0 group-hover/goal:opacity-100"} transition-opacity`}
              >
                <MoreHorizontal className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/goal/${goal.id}`);
                }}
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleCompleteGoal(goal.id, goal.title);
                }}
              >
                Mark complete
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleArchiveGoal(goal.id, goal.title);
                }}
              >
                Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteGoal(goal.id, goal.title);
                }}
                className="text-destructive focus:text-destructive"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  // Recursively render goal tree with full hierarchy (for expanded "all" filter)
  const renderGoalTree = (
    goals: GoalWithChildren[],
    indentLevel: number,
    isMobile: boolean
  ): React.ReactNode => {
    return goals.map((goal) => {
      const showConnector = indentLevel > 0;
      
      return (
        <div key={goal.id}>
          {/* Render the goal item */}
          {renderGoalItem(goal, indentLevel, showConnector, isMobile)}
          
          {/* Render children recursively */}
          {goal.children.length > 0 && (
            <div>
              {renderGoalTree(goal.children, indentLevel + 1, isMobile)}
            </div>
          )}
        </div>
      );
    });
  };

  // Render flat list of goals (for filtered views - no hierarchy connectors)
  const renderFlatGoalList = (
    goals: GoalWithChildren[],
    isMobile: boolean,
    maxItems?: number
  ): React.ReactNode => {
    const displayGoals = maxItems !== undefined ? goals.slice(0, maxItems) : goals;
    return displayGoals.map((goal) => (
      <div key={goal.id}>
        {renderGoalItem(goal, 0, false, isMobile)}
      </div>
    ));
  };

  // Render collapsed view for "all" filter - only 3yr goals, no children
  const renderCollapsedView = (
    threeYearWithChildren: GoalWithChildren[],
    isMobile: boolean
  ): React.ReactNode => {
    // Only show 3yr goals at top level (no children visible)
    const threeYrGoals = threeYearWithChildren.filter(g => g.goal_type === "three_year");
    return threeYrGoals.map((goal) => (
      <div key={goal.id}>
        {renderGoalItem(goal, 0, false, isMobile)}
      </div>
    ));
  };

  // Get goals to display based on filter and expansion state
  const getFilteredGoals = (
    threeYearWithChildren: GoalWithChildren[],
    goalType: "one_year" | "ninety_day"
  ): GoalWithChildren[] => {
    return collectGoalsByType(threeYearWithChildren, goalType);
  };

  // Check if there are 3yr goals to show in collapsed "all" mode
  const hasThreeYearGoals = (threeYearWithChildren: GoalWithChildren[]): boolean => {
    return threeYearWithChildren.some(g => g.goal_type === "three_year");
  };

  // Desktop Vision Card
  const renderDesktopVisionCard = (vision: VisionWithHierarchy, isMuted: boolean = false) => {
    const activePlan = getActive90DayPlan(vision.threeYearWithChildren);
    const isExpanded = expandedVisionIds.has(vision.id);
    const canExpand = hasExpandableContent(vision.threeYearWithChildren);
    
    // Determine what to show based on filter
    let goalsToShow: GoalWithChildren[] = [];
    let hasContent = false;
    let showExpandToggle = false;
    let emptyMessage = "Add a goal when it feels right";

    if (effectiveFilter === "all") {
      // "All" mode: collapsed shows 3yr only, expanded shows full hierarchy
      const has3yr = hasThreeYearGoals(vision.threeYearWithChildren);
      hasContent = vision.threeYearWithChildren.length > 0;
      showExpandToggle = canExpand; // Can expand if there are children to show
      emptyMessage = "Add a goal when it feels right";
    } else if (effectiveFilter === "1yr") {
      goalsToShow = getFilteredGoals(vision.threeYearWithChildren, "one_year");
      hasContent = goalsToShow.length > 0;
      showExpandToggle = false; // No expand in filtered mode
      emptyMessage = "No 1-year goals";
    } else if (effectiveFilter === "90d") {
      goalsToShow = getFilteredGoals(vision.threeYearWithChildren, "ninety_day");
      hasContent = goalsToShow.length > 0;
      showExpandToggle = false; // No expand in filtered mode
      emptyMessage = "No 90-day plans";
    }

    return (
      <Card 
        key={vision.id} 
        className={isMuted ? "border-muted/50 bg-muted/10" : "border-muted"}
      >
        <CardContent className="p-5">
          {/* Vision Header */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <h2 
              className={`text-lg font-semibold cursor-pointer hover:text-primary transition-colors ${isMuted ? "text-muted-foreground" : "text-foreground"}`}
              onClick={() => navigate(`/vision/${vision.id}`)}
            >
              {vision.title}
            </h2>
            <div className="flex items-center gap-1 shrink-0">
              {vision.pillar_name && (
                <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full whitespace-nowrap mr-1">
                  {vision.pillar_name}
                </span>
              )}
              {/* Focus toggle (star icon) - standalone */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFocus(vision.id, vision.is_focus);
                }}
                className={`p-1 transition-colors cursor-pointer ${
                  vision.is_focus 
                    ? "text-primary hover:text-primary/70" 
                    : "text-muted-foreground/50 hover:text-primary"
                }`}
                title={vision.is_focus ? "Remove from focus" : "Add to focus"}
                aria-label={vision.is_focus ? "Remove from focus" : "Add to focus"}
              >
                <Star className={`h-4 w-4 ${vision.is_focus ? "fill-current" : ""}`} />
              </button>
              {/* Overflow menu (•••) - single entry point for all actions */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    aria-label={`Actions for ${vision.title}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border border-border shadow-md w-48">
                  {/* Section 1: Add */}
                  <DropdownMenuItem onClick={() => navigate(`/goal/new?type=three_year&vision=${vision.id}`)}>
                    Add 3-Year Goal
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/goal/new?type=one_year&vision=${vision.id}`)}>
                    Add 1-Year Goal
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/goal/new?type=ninety_day&vision=${vision.id}`)}>
                    Add 90-Day Plan
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {/* Section 2: Edit */}
                  <DropdownMenuItem onClick={() => navigate(`/vision/${vision.id}`)}>
                    Edit vision
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {/* Section 3: Destructive */}
                  <DropdownMenuItem 
                    onClick={() => handleArchiveVision(vision.id, vision.title)}
                    className="text-muted-foreground"
                  >
                    Archive vision
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => {
                      if (confirm("Are you sure you want to delete this vision? This action cannot be undone.")) {
                        handleDeleteVision(vision.id);
                      }
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    Delete vision
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Goal Content */}
          {effectiveFilter === "all" ? (
            // "All" mode: collapsed shows 3yr only, expanded shows full hierarchy
            hasThreeYearGoals(vision.threeYearWithChildren) || vision.threeYearWithChildren.length > 0 ? (
              <div className="mb-3">
                {isExpanded 
                  ? renderGoalTree(vision.threeYearWithChildren, 0, false)
                  : renderCollapsedView(vision.threeYearWithChildren, false)
                }
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mb-4">{emptyMessage}</p>
            )
          ) : (
            // Filtered mode: flat list
            hasContent ? (
              <div className="mb-3">
                {renderFlatGoalList(goalsToShow, false)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mb-4">{emptyMessage}</p>
            )
          )}

          {/* Vision Footer */}
          <div className="pt-3 border-t border-muted flex items-center justify-between">
            {/* Show more/less toggle - only for "all" filter with expandable content */}
            {showExpandToggle ? (
              <button
                onClick={() => toggleVisionExpanded(vision.id)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {isExpanded ? "Show less" : "Show more"}
              </button>
            ) : (
              <span />
            )}
            
            {/* Plan this week - dropdown if multiple 90d plans */}
            {(() => {
              const allPlans = getAllNinetyDayGoals(vision.threeYearWithChildren);
              if (allPlans.length > 1) {
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 cursor-pointer">
                        Plan this week
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        Choose a 90-day plan
                      </div>
                      <DropdownMenuSeparator />
                      {allPlans.map(plan => (
                        <DropdownMenuItem
                          key={plan.id}
                          onClick={() => navigate(`/weekly?plan=${plan.id}`)}
                          className="cursor-pointer"
                        >
                          <span className="truncate">{plan.title}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              }
              return (
                <button
                  onClick={() => {
                    if (allPlans.length === 1) {
                      navigate(`/weekly?plan=${allPlans[0].id}`);
                    } else {
                      navigate("/weekly");
                    }
                  }}
                  className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                >
                  Plan this week
                  <ArrowRight className="h-4 w-4" />
                </button>
              );
            })()}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Mobile Vision Card - compact, focused, scannable
  const renderMobileVisionCard = (vision: VisionWithHierarchy, isMuted: boolean = false) => {
    const activePlan = getActive90DayPlan(vision.threeYearWithChildren);
    const isExpanded = expandedVisionIds.has(vision.id);
    const canExpand = hasExpandableContent(vision.threeYearWithChildren);
    
    // Determine what to show based on filter
    let goalsToShow: GoalWithChildren[] = [];
    let hasContent = false;
    let showExpandToggle = false;
    let emptyMessage = "Add your first goal";

    if (effectiveFilter === "all") {
      hasContent = vision.threeYearWithChildren.length > 0;
      showExpandToggle = canExpand;
      emptyMessage = "Add your first goal";
    } else if (effectiveFilter === "1yr") {
      goalsToShow = getFilteredGoals(vision.threeYearWithChildren, "one_year");
      hasContent = goalsToShow.length > 0;
      showExpandToggle = false;
      emptyMessage = "No 1-year goals";
    } else if (effectiveFilter === "90d") {
      goalsToShow = getFilteredGoals(vision.threeYearWithChildren, "ninety_day");
      hasContent = goalsToShow.length > 0;
      showExpandToggle = false;
      emptyMessage = "No 90-day plans";
    }

    return (
      <Card 
        key={vision.id} 
        className={isMuted ? "border-muted/50 bg-muted/10" : "border-muted"}
      >
        <CardContent className="p-3">
          {/* Mobile Vision Header */}
          <div className="flex items-start justify-between gap-2">
            <div 
              className="flex-1 min-w-0"
              onClick={(e) => openMobileVisionActions(vision, e)}
            >
              <h2 
                className={`text-base font-semibold truncate ${isMuted ? "text-muted-foreground" : "text-foreground"}`}
              >
                {vision.title}
              </h2>
              {vision.pillar_name && (
                <span className="text-[11px] text-muted-foreground/70 mt-0.5 block">
                  {vision.pillar_name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {/* Focus toggle (star icon) - standalone */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFocus(vision.id, vision.is_focus);
                }}
                className={`p-1.5 transition-colors cursor-pointer ${
                  vision.is_focus 
                    ? "text-primary" 
                    : "text-muted-foreground/40"
                }`}
                aria-label={vision.is_focus ? "Remove from focus" : "Add to focus"}
              >
                <Star className={`h-4 w-4 ${vision.is_focus ? "fill-current" : ""}`} />
              </button>
              {/* Overflow menu (•••) - single entry point for all actions */}
              <button
                onClick={(e) => openMobileVisionActions(vision, e)}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                aria-label={`Actions for ${vision.title}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Goal Content */}
          {effectiveFilter === "all" ? (
            // "All" mode
            hasContent ? (
              <div className="mt-2.5">
                {isExpanded 
                  ? renderGoalTree(vision.threeYearWithChildren, 0, true)
                  : renderCollapsedView(vision.threeYearWithChildren, true)
                }
              </div>
            ) : (
              <button
                onClick={(e) => openMobileVisionActions(vision, e)}
                className="mt-2.5 text-sm text-muted-foreground/70 hover:text-primary inline-flex items-center gap-1 transition-colors"
              >
                {emptyMessage}
                <ArrowRight className="h-3 w-3" />
              </button>
            )
          ) : (
            // Filtered mode
            hasContent ? (
              <div className="mt-2.5">
                {renderFlatGoalList(goalsToShow, true)}
              </div>
            ) : (
              <p className="mt-2.5 text-sm text-muted-foreground/70">{emptyMessage}</p>
            )
          )}

          {/* Mobile: Actions row - tighter spacing */}
          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-muted/50">
            {/* Show more/less toggle - only for "all" filter */}
            {showExpandToggle ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleVisionExpanded(vision.id);
                }}
                className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                {isExpanded ? "Show less" : "Show more"}
              </button>
            ) : (
              <span />
            )}

            {/* Primary: Plan this week - dropdown if multiple 90d plans */}
            {(() => {
              const allPlans = getAllNinetyDayGoals(vision.threeYearWithChildren);
              if (allPlans.length > 1) {
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button 
                        onClick={(e) => e.stopPropagation()}
                        className="text-sm font-medium text-primary hover:text-primary/80 inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        Plan this week
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        Choose a 90-day plan
                      </div>
                      <DropdownMenuSeparator />
                      {allPlans.map(plan => (
                        <DropdownMenuItem
                          key={plan.id}
                          onClick={() => navigate(`/weekly?plan=${plan.id}`)}
                          className="cursor-pointer"
                        >
                          <span className="truncate">{plan.title}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              }
              return (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (allPlans.length === 1) {
                      navigate(`/weekly?plan=${allPlans[0].id}`);
                    } else {
                      navigate("/weekly");
                    }
                  }}
                  className="text-sm font-medium text-primary hover:text-primary/80 inline-flex items-center gap-1 transition-colors"
                >
                  Plan this week
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              );
            })()}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Render appropriate card based on device
  const renderVisionCard = (vision: VisionWithHierarchy, isMuted: boolean = false) => {
    return isMobile 
      ? renderMobileVisionCard(vision, isMuted)
      : renderDesktopVisionCard(vision, isMuted);
  };

  // Note: filterOptions removed - North Star always shows all time horizons

  // Note: allGoalsOfType removed - North Star page always shows hierarchical view

  // Helper to get execution state label styling
  const getExecutionStateStyle = (state: ExecutionState) => {
    switch (state) {
      case "active":
        return "text-primary";
      case "dormant":
        return "text-amber-600 dark:text-amber-400";
      case "planned":
        return "text-muted-foreground";
      default:
        return "text-muted-foreground/50";
    }
  };

  const getExecutionStateLabel = (state: ExecutionState) => {
    switch (state) {
      case "active": return "Active";
      case "dormant": return "Dormant";
      case "planned": return "Planned";
      default: return "";
    }
  };

  // Get consistency message for 90d plans
  const getConsistencyMessage = (consistentWeeks: number): string | null => {
    if (consistentWeeks === 0) return null;
    if (consistentWeeks === 1) return "Building momentum";
    return `Consistent for ${consistentWeeks} weeks`;
  };

  // Render a single flat execution row (for 1yr/90d views)
  const renderExecutionRow = (
    goal: GoalWithChildren, 
    visionTitle: string, 
    label: string
  ) => {
    const isNinetyDay = goal.goal_type === "ninety_day";
    
    // Get execution data
    const planData = isNinetyDay ? planExecutionMap.get(goal.id) : null;
    const goalData = !isNinetyDay ? goalExecutionMap.get(goal.id) : null;
    
    const executionState = planData?.state || goalData?.state || "none";
    const isMuted = executionState === "dormant" || executionState === "none";
    
    return (
      <div
        key={goal.id}
        className={`
          flex items-start gap-3 py-3 px-3 rounded-lg cursor-pointer transition-colors
          ${isMuted ? "hover:bg-muted/30" : "hover:bg-muted/50"}
        `}
        onClick={() => {
          if (isNinetyDay) {
            navigate(`/weekly?plan=${goal.id}`);
          } else {
            navigate(`/goal/${goal.id}`);
          }
        }}
      >
        {/* Label chip */}
        <span className={`
          shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5
          ${isMuted ? "bg-muted/40 text-muted-foreground/60" : "bg-muted/60 text-muted-foreground"}
        `}>
          {label}
        </span>
        
        {/* Goal title + execution info stacked */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`
              text-sm
              ${isMuted ? "text-muted-foreground/60" : "text-foreground/90"}
            `}>
              {goal.title}
            </span>
            {/* Execution state pill */}
            {executionState !== "none" && (
              <span className={`text-[10px] font-medium ${getExecutionStateStyle(executionState)}`}>
                {getExecutionStateLabel(executionState)}
              </span>
            )}
          </div>
          
          {/* Vision name */}
          <span className="text-xs text-muted-foreground/50">
            {visionTitle}
          </span>
          
          {/* 90d specific: Consistency signal + last week stats */}
          {isNinetyDay && planData && planData.hasTasks && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              {/* Consistency signal (only for active plans) */}
              {planData.state === "active" && getConsistencyMessage(planData.consistentWeeks) && (
                <span className="text-[11px] text-primary/80">
                  {getConsistencyMessage(planData.consistentWeeks)}
                </span>
              )}
              {/* This week result */}
              {planData.thisWeekExpected > 0 && (
                <span className="text-[11px] text-muted-foreground/60">
                  This week: {planData.thisWeekCompleted} of {planData.thisWeekExpected} sessions
                </span>
              )}
            </div>
          )}
          
          {/* 1yr specific: Aggregated signal */}
          {!isNinetyDay && goalData && goalData.totalPlansCount > 0 && (
            <span className="text-[11px] text-muted-foreground/60 mt-1">
              {goalData.activePlansCount > 0 
                ? `${goalData.activePlansCount} active plan${goalData.activePlansCount !== 1 ? 's' : ''}`
                : "No active plans"
              }
            </span>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <p className="text-muted-foreground text-center">Loading...</p>
      </div>
    );
  }

  return (
    <div className={cn(
      "container mx-auto px-4 max-w-2xl animate-fade-in pb-24 md:pb-8",
      isMobile ? "pt-3" : "py-8"
    )}>
      {/* ========== HEADER - Desktop only ========== */}
      {!isMobile && (
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-foreground">
              My North Star
            </h1>
            <Tabs value={hierarchyFilter} onValueChange={(v) => setHierarchyFilter(v as HierarchyFilter)}>
              <TabsList className="h-7">
                <TabsTrigger value="all" className="text-xs px-2.5 h-5">All</TabsTrigger>
                <TabsTrigger value="1yr" className="text-xs px-2.5 h-5">1yr</TabsTrigger>
                <TabsTrigger value="90d" className="text-xs px-2.5 h-5">90d</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <AddIconButton
            onClick={() => setAddDialogOpen(true)}
            tooltip="Add vision"
          />
        </div>
      )}

      {/* ========== ORIENTATION LINE ========== */}
      <div 
        className={cn("group", isMobile ? "mb-4" : "mb-6")}
        onMouseEnter={() => setIsOrientationHovered(true)}
        onMouseLeave={() => setIsOrientationHovered(false)}
        onTouchStart={handleOrientationTouchStart}
        onTouchEnd={handleOrientationTouchEnd}
        onTouchCancel={handleOrientationTouchEnd}
      >
        {isEditingOrientation ? (
          <div className="relative">
            <textarea
              ref={orientationInputRef}
              value={orientationValue}
              onChange={(e) => setOrientationValue(e.target.value.slice(0, 120))}
              onKeyDown={handleOrientationKeyDown}
              onBlur={saveOrientation}
              placeholder="Write a sentence that helps you stay oriented."
              maxLength={120}
              rows={2}
              className="w-full text-sm font-light text-muted-foreground/80 bg-transparent border-b border-muted focus:border-primary focus:outline-none resize-none py-1 placeholder:text-muted-foreground/50"
            />
          </div>
        ) : (
          <p className="text-sm font-light text-muted-foreground/70">
            {displayedOrientation}
            {/* Edit button - visible on hover (desktop), inline with text */}
            {!isMobile && isOrientationHovered && (
              <button
                onClick={startEditingOrientation}
                className="inline-flex ml-1.5 p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors align-middle"
                aria-label="Edit orientation"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </p>
        )}
      </div>

      {/* ========== HIERARCHICAL VIEW ========== */}
      {sortedFocusedVisions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Star className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No focused visions yet</p>
            <Button 
              variant="outline" 
              onClick={() => setAddDialogOpen(true)}
            >
              Add your first vision
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4 md:space-y-6">
          {sortedFocusedVisions.map((vision) => renderVisionCard(vision, false))}
        </div>
      )}

      {/* ========== NON-FOCUSED VISIONS (Collapsible) ========== */}
      {nonFocusedVisions.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setOtherVisionsExpanded(!otherVisionsExpanded)}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-3 flex items-center justify-center gap-1 transition-colors"
          >
            <ChevronDown 
              className={`h-4 w-4 transition-transform ${otherVisionsExpanded ? 'rotate-180' : ''}`} 
            />
            +{nonFocusedVisions.length} more vision{nonFocusedVisions.length !== 1 ? 's' : ''}
          </button>

          {otherVisionsExpanded && (
            <div className="mt-4 space-y-4">
              <h3 className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
                Other visions
              </h3>
              {nonFocusedVisions.map((vision) => renderVisionCard(vision, true))}
            </div>
          )}
        </div>
      )}

      {/* ========== MOBILE GLOBAL FAB (for adding new vision only) ========== */}
      {isMobile && (
        <button
          onClick={() => setAddDialogOpen(true)}
          className="fixed bottom-20 right-4 w-12 h-12 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center z-40 hover:bg-primary/90 transition-colors"
          aria-label="Add new vision"
        >
          <Plus className="h-5 w-5" />
        </button>
      )}



      {/* ========== MOBILE VISION ACTION SHEET ========== */}
      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-xl">
          <SheetHeader>
            <SheetTitle className="truncate text-left">{mobileSheetVision?.title}</SheetTitle>
          </SheetHeader>
          <div className="py-3 space-y-0.5">
            {/* Section 1: Add */}
            <button
              onClick={() => {
                setMobileSheetOpen(false);
                navigate(`/goal/new?type=three_year&vision=${mobileSheetVision?.id}`);
              }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-muted rounded-md transition-colors"
            >
              Add 3-Year Goal
            </button>
            <button
              onClick={() => {
                setMobileSheetOpen(false);
                navigate(`/goal/new?type=one_year&vision=${mobileSheetVision?.id}`);
              }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-muted rounded-md transition-colors"
            >
              Add 1-Year Goal
            </button>
            <button
              onClick={() => {
                setMobileSheetOpen(false);
                navigate(`/goal/new?type=ninety_day&vision=${mobileSheetVision?.id}`);
              }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-muted rounded-md transition-colors"
            >
              Add 90-Day Plan
            </button>
            <div className="border-t border-border my-2" />
            {/* Section 2: Edit */}
            <button
              onClick={() => {
                setMobileSheetOpen(false);
                if (mobileSheetVision) navigate(`/vision/${mobileSheetVision.id}`);
              }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-muted rounded-md transition-colors"
            >
              Edit vision
            </button>
            <div className="border-t border-border my-2" />
            {/* Section 3: Destructive */}
            <button
              onClick={() => {
                setMobileSheetOpen(false);
                if (mobileSheetVision) handleArchiveVision(mobileSheetVision.id, mobileSheetVision.title);
              }}
              className="w-full text-left px-4 py-3 text-sm text-muted-foreground hover:bg-muted rounded-md transition-colors"
            >
              Archive vision
            </button>
            <button
              onClick={() => {
                if (confirm("Are you sure you want to delete this vision? This action cannot be undone.")) {
                  setMobileSheetOpen(false);
                  if (mobileSheetVision) handleDeleteVision(mobileSheetVision.id);
                }
              }}
              className="w-full text-left px-4 py-3 text-sm text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            >
              Delete vision
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ========== ADD VISION DIALOG ========== */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Vision</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="pillar">Pillar</Label>
              <Select value={selectedPillarId} onValueChange={setSelectedPillarId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a pillar" />
                </SelectTrigger>
                <SelectContent>
                  {pillars.map(pillar => (
                    <SelectItem key={pillar.id} value={pillar.id}>
                      {pillar.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Who do you want to become?"
              />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Describe your vision..."
                rows={3}
              />
            </div>
            <Button 
              onClick={handleAddVision} 
              disabled={saving || !newTitle.trim() || !selectedPillarId}
              className="w-full"
            >
              {saving ? "Saving..." : "Add Vision"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
