import { useState, useEffect, useMemo } from "react";
import { Check, ChevronRight, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { GoalType } from "@/types/todayoum";

/**
 * Advanced Completion Dialog
 * Shows when completing a Vision or Goal that has child items.
 * Allows users to optionally complete child goals, plans, and tasks.
 */

interface HierarchyNode {
  id: string;
  title: string;
  type: "goal" | "task";
  goalType?: GoalType;
  children: HierarchyNode[];
}

interface AdvancedCompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemType: "vision" | "goal";
  itemId: string;
  itemTitle: string;
  goalType?: GoalType; // Only for goals
  onConfirm: (selectedIds: { 
    goalIds: string[]; 
    taskIds: string[];
    completeParent: boolean;
  }) => Promise<void>;
}

type CompletionMode = "single" | "advanced";

const GOAL_TYPE_ORDER: GoalType[] = ["three_year", "one_year", "ninety_day"];

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  three_year: "3-Year Goal",
  one_year: "1-Year Goal",
  ninety_day: "90-Day Plan",
};

const AdvancedCompletionDialog = ({
  open,
  onOpenChange,
  itemType,
  itemId,
  itemTitle,
  goalType,
  onConfirm,
}: AdvancedCompletionDialogProps) => {
  const { user } = useAuth();
  const [mode, setMode] = useState<CompletionMode>("single");
  const [hierarchy, setHierarchy] = useState<HierarchyNode[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  // Fetch hierarchy when dialog opens
  useEffect(() => {
    if (!open || !user) return;

    const fetchHierarchy = async () => {
      setLoading(true);
      try {
        const nodes: HierarchyNode[] = [];

        if (itemType === "vision") {
          // Fetch all active goals under this vision
          const { data: goals } = await supabase
            .from("goals")
            .select("id, title, goal_type, parent_goal_id, status")
            .eq("life_vision_id", itemId)
            .eq("user_id", user.id)
            .eq("is_deleted", false)
            .in("status", ["active", "not_started", "in_progress"]);

          // Fetch all active tasks for 90-day plans under this vision
          const ninetyDayIds = (goals || [])
            .filter((g) => g.goal_type === "ninety_day")
            .map((g) => g.id);

          let tasks: { id: string; title: string; goal_id: string }[] = [];
          if (ninetyDayIds.length > 0) {
            const { data: taskData } = await supabase
              .from("weekly_commitments")
              .select("id, title, goal_id")
              .in("goal_id", ninetyDayIds)
              .eq("user_id", user.id)
              .eq("is_deleted", false)
              .eq("is_active", true);
            tasks = taskData || [];
          }

          // Build tree: 3-year -> 1-year -> 90-day -> tasks
          const threeYearGoals = (goals || []).filter(
            (g) => g.goal_type === "three_year"
          );

          for (const threeYear of threeYearGoals) {
            const threeYearNode: HierarchyNode = {
              id: threeYear.id,
              title: threeYear.title,
              type: "goal",
              goalType: "three_year",
              children: [],
            };

            const oneYearGoals = (goals || []).filter(
              (g) =>
                g.goal_type === "one_year" && g.parent_goal_id === threeYear.id
            );

            for (const oneYear of oneYearGoals) {
              const oneYearNode: HierarchyNode = {
                id: oneYear.id,
                title: oneYear.title,
                type: "goal",
                goalType: "one_year",
                children: [],
              };

              const ninetyDayGoals = (goals || []).filter(
                (g) =>
                  g.goal_type === "ninety_day" && g.parent_goal_id === oneYear.id
              );

              for (const ninetyDay of ninetyDayGoals) {
                const ninetyDayNode: HierarchyNode = {
                  id: ninetyDay.id,
                  title: ninetyDay.title,
                  type: "goal",
                  goalType: "ninety_day",
                  children: tasks
                    .filter((t) => t.goal_id === ninetyDay.id)
                    .map((t) => ({
                      id: t.id,
                      title: t.title,
                      type: "task" as const,
                      children: [],
                    })),
                };
                oneYearNode.children.push(ninetyDayNode);
              }

              threeYearNode.children.push(oneYearNode);
            }

            nodes.push(threeYearNode);
          }
        } else if (itemType === "goal" && goalType) {
          // For goals, fetch children based on goal type
          if (goalType === "three_year") {
            // Fetch 1-year goals and their children
            const { data: oneYearGoals } = await supabase
              .from("goals")
              .select("id, title, status")
              .eq("parent_goal_id", itemId)
              .eq("goal_type", "one_year")
              .eq("user_id", user.id)
              .eq("is_deleted", false)
              .in("status", ["active", "not_started", "in_progress"]);

            for (const oneYear of oneYearGoals || []) {
              const { data: ninetyDayGoals } = await supabase
                .from("goals")
                .select("id, title, status")
                .eq("parent_goal_id", oneYear.id)
                .eq("goal_type", "ninety_day")
                .eq("user_id", user.id)
                .eq("is_deleted", false)
                .in("status", ["active", "not_started", "in_progress"]);

              const oneYearNode: HierarchyNode = {
                id: oneYear.id,
                title: oneYear.title,
                type: "goal",
                goalType: "one_year",
                children: [],
              };

              for (const ninetyDay of ninetyDayGoals || []) {
                const { data: tasks } = await supabase
                  .from("weekly_commitments")
                  .select("id, title")
                  .eq("goal_id", ninetyDay.id)
                  .eq("user_id", user.id)
                  .eq("is_deleted", false)
                  .eq("is_active", true);

                const ninetyDayNode: HierarchyNode = {
                  id: ninetyDay.id,
                  title: ninetyDay.title,
                  type: "goal",
                  goalType: "ninety_day",
                  children: (tasks || []).map((t) => ({
                    id: t.id,
                    title: t.title,
                    type: "task" as const,
                    children: [],
                  })),
                };
                oneYearNode.children.push(ninetyDayNode);
              }

              nodes.push(oneYearNode);
            }
          } else if (goalType === "one_year") {
            // Fetch 90-day plans and their tasks
            const { data: ninetyDayGoals } = await supabase
              .from("goals")
              .select("id, title, status")
              .eq("parent_goal_id", itemId)
              .eq("goal_type", "ninety_day")
              .eq("user_id", user.id)
              .eq("is_deleted", false)
              .in("status", ["active", "not_started", "in_progress"]);

            for (const ninetyDay of ninetyDayGoals || []) {
              const { data: tasks } = await supabase
                .from("weekly_commitments")
                .select("id, title")
                .eq("goal_id", ninetyDay.id)
                .eq("user_id", user.id)
                .eq("is_deleted", false)
                .eq("is_active", true);

              const ninetyDayNode: HierarchyNode = {
                id: ninetyDay.id,
                title: ninetyDay.title,
                type: "goal",
                goalType: "ninety_day",
                children: (tasks || []).map((t) => ({
                  id: t.id,
                  title: t.title,
                  type: "task" as const,
                  children: [],
                })),
              };
              nodes.push(ninetyDayNode);
            }
          } else if (goalType === "ninety_day") {
            // Fetch only tasks
            const { data: tasks } = await supabase
              .from("weekly_commitments")
              .select("id, title")
              .eq("goal_id", itemId)
              .eq("user_id", user.id)
              .eq("is_deleted", false)
              .eq("is_active", true);

            for (const task of tasks || []) {
              nodes.push({
                id: task.id,
                title: task.title,
                type: "task",
                children: [],
              });
            }
          }
        }

        setHierarchy(nodes);
        // Expand top level by default
        setExpandedNodes(new Set(nodes.map((n) => n.id)));
      } catch (error) {
        console.error("Error fetching hierarchy:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchHierarchy();
  }, [open, user, itemId, itemType, goalType]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setMode("single");
      setSelectedIds(new Set());
      setExpandedNodes(new Set());
    }
  }, [open]);

  // Get all descendant IDs of a node
  const getDescendantIds = (node: HierarchyNode): string[] => {
    const ids: string[] = [];
    for (const child of node.children) {
      ids.push(child.id);
      ids.push(...getDescendantIds(child));
    }
    return ids;
  };

  // Toggle selection of a node and all descendants
  const toggleNode = (node: HierarchyNode, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const descendantIds = getDescendantIds(node);

      if (checked) {
        next.add(node.id);
        descendantIds.forEach((id) => next.add(id));
      } else {
        next.delete(node.id);
        descendantIds.forEach((id) => next.delete(id));
      }

      return next;
    });
  };

  // Toggle expand/collapse
  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Calculate summary counts
  const summary = useMemo(() => {
    let goals = 0;
    let plans = 0;
    let tasks = 0;

    const countNode = (node: HierarchyNode) => {
      if (selectedIds.has(node.id)) {
        if (node.type === "task") {
          tasks++;
        } else if (node.goalType === "ninety_day") {
          plans++;
        } else {
          goals++;
        }
      }
      node.children.forEach(countNode);
    };

    hierarchy.forEach(countNode);

    return { goals, plans, tasks };
  }, [selectedIds, hierarchy]);

  // Check if there are any items to select
  const hasItems = hierarchy.length > 0;

  // Handle confirm
  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const goalIds: string[] = [];
      const taskIds: string[] = [];

      if (mode === "advanced") {
        const collectIds = (node: HierarchyNode) => {
          if (selectedIds.has(node.id)) {
            if (node.type === "task") {
              taskIds.push(node.id);
            } else {
              goalIds.push(node.id);
            }
          }
          node.children.forEach(collectIds);
        };
        hierarchy.forEach(collectIds);
      }

      await onConfirm({ goalIds, taskIds, completeParent: true });
      onOpenChange(false);
    } catch (error) {
      console.error("Error completing:", error);
    } finally {
      setConfirming(false);
    }
  };

  // Render a tree node
  const renderNode = (node: HierarchyNode, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children.length > 0;
    const isChecked = selectedIds.has(node.id);

    // Check if all children are selected (for indeterminate state)
    const allDescendantIds = getDescendantIds(node);
    const allDescendantsSelected =
      allDescendantIds.length > 0 &&
      allDescendantIds.every((id) => selectedIds.has(id));
    const someDescendantsSelected =
      allDescendantIds.some((id) => selectedIds.has(id)) &&
      !allDescendantsSelected;

    return (
      <div key={node.id} className="select-none">
        <div
          className={cn(
            "flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors",
            depth > 0 && "ml-4"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {/* Expand/Collapse button */}
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpand(node.id)}
              className="p-0.5 hover:bg-muted rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}

          {/* Checkbox */}
          <Checkbox
            id={`node-${node.id}`}
            checked={isChecked}
            onCheckedChange={(checked) => toggleNode(node, checked === true)}
            className={cn(
              someDescendantsSelected && !isChecked && "opacity-60"
            )}
          />

          {/* Label */}
          <label
            htmlFor={`node-${node.id}`}
            className="flex-1 text-sm cursor-pointer truncate"
          >
            {node.title}
          </label>

          {/* Type badge */}
          {node.type === "goal" && node.goalType && (
            <span className="text-xs text-muted-foreground">
              {GOAL_TYPE_LABELS[node.goalType]}
            </span>
          )}
          {node.type === "task" && (
            <span className="text-xs text-muted-foreground">Task</span>
          )}
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  const itemLabel = itemType === "vision" ? "vision" : "goal";
  const ItemLabel = itemType === "vision" ? "Vision" : "Goal";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Complete this {ItemLabel}?</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 py-2">
          {/* Context text */}
          {hasItems && (
            <p className="text-sm text-muted-foreground">
              This {itemLabel} has active items underneath it. Choose what you
              want to complete.
            </p>
          )}

          {/* Radio options */}
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as CompletionMode)}
            className="gap-3"
          >
            <div className="flex items-start gap-3">
              <RadioGroupItem value="single" id="mode-single" className="mt-1" />
              <Label htmlFor="mode-single" className="font-normal cursor-pointer">
                Complete only this {itemLabel}
              </Label>
            </div>

            {hasItems && (
              <div className="flex items-start gap-3">
                <RadioGroupItem
                  value="advanced"
                  id="mode-advanced"
                  className="mt-1"
                />
                <Label
                  htmlFor="mode-advanced"
                  className="font-normal cursor-pointer"
                >
                  Advanced: Choose what to complete
                </Label>
              </div>
            )}
          </RadioGroup>

          {/* Advanced checklist */}
          {mode === "advanced" && hasItems && (
            <div className="flex-1 min-h-0 overflow-auto border rounded-md p-2 bg-muted/30">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Loading...
                </p>
              ) : (
                <div className="space-y-0.5">
                  {hierarchy.map((node) => renderNode(node, 0))}
                </div>
              )}
            </div>
          )}

          {/* Summary */}
          {mode === "advanced" && hasItems && (summary.goals > 0 || summary.plans > 0 || summary.tasks > 0) && (
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
              <p className="font-medium text-foreground mb-1">
                This will complete:
              </p>
              <ul className="space-y-0.5">
                {summary.goals > 0 && (
                  <li>
                    • {summary.goals} goal{summary.goals !== 1 ? "s" : ""}
                  </li>
                )}
                {summary.plans > 0 && (
                  <li>
                    • {summary.plans} plan{summary.plans !== 1 ? "s" : ""}
                  </li>
                )}
                {summary.tasks > 0 && (
                  <li>
                    • {summary.tasks} task{summary.tasks !== 1 ? "s" : ""}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={confirming}>
            <Check className="h-4 w-4 mr-2" />
            {confirming ? "Completing..." : "Complete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdvancedCompletionDialog;
