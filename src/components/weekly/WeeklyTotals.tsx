/**
 * WeeklyTotals - Shows weekly summary stats grouped by 90-day plan
 * 
 * List-based view differentiation:
 * - Tasks grouped by their associated 90-day plan
 * - Plan name as section header
 * - Tasks without a plan under "Independent tasks"
 * - No per-task colors, borders, or background tints
 * - Uses headers, spacing, and typography only
 */

interface CommitmentTotal {
  id: string;
  title: string;
  planned: number;
  actual: number;
  goalId?: string | null;
  goalTitle?: string | null;
}

interface WeeklyTotalsProps {
  commitments: CommitmentTotal[];
}

const WeeklyTotals = ({ commitments }: WeeklyTotalsProps) => {
  const totalPlanned = commitments.reduce((sum, c) => sum + c.planned, 0);
  const totalActual = commitments.reduce((sum, c) => sum + c.actual, 0);
  const overallProgress = totalPlanned > 0 ? Math.min(totalActual / totalPlanned, 1) : 0;

  // Group commitments by plan
  const groupedByPlan: Record<string, { title: string; commitments: CommitmentTotal[] }> = {};
  const independentTasks: CommitmentTotal[] = [];

  commitments.forEach((c) => {
    if (c.goalId && c.goalTitle) {
      if (!groupedByPlan[c.goalId]) {
        groupedByPlan[c.goalId] = { title: c.goalTitle, commitments: [] };
      }
      groupedByPlan[c.goalId].commitments.push(c);
    } else {
      independentTasks.push(c);
    }
  });

  const planGroups = Object.entries(groupedByPlan);
  const hasGroups = planGroups.length > 0 || independentTasks.length > 0;

  return (
    <div className="border border-border mt-6">
      <div className="border-b border-border px-4 py-2 bg-muted/30">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Weekly Summary
        </span>
      </div>
      <div className="p-4">
        {/* Overall progress */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-foreground">Overall Progress</span>
          <span className="text-sm font-medium text-foreground">
            {totalActual}/{totalPlanned}
          </span>
        </div>
        <div className="h-1 bg-muted mb-4">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${overallProgress * 100}%` }}
          />
        </div>

        {/* Grouped commitments by plan */}
        {hasGroups ? (
          <div className="space-y-4">
            {/* Plan groups */}
            {planGroups.map(([planId, group]) => (
              <div key={planId}>
                {/* Plan section header */}
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 truncate">
                  {group.title}
                </h4>
                <div className="space-y-2 pl-2">
                  {group.commitments.map((c) => {
                    const progress = c.planned > 0 ? Math.min(c.actual / c.planned, 1) : 0;
                    const isComplete = c.actual >= c.planned;

                    return (
                      <div key={c.id} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {isComplete ? "●" : "○"}
                        </span>
                        <span className="text-xs text-foreground flex-1 truncate">
                          {c.title}
                        </span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {c.actual}/{c.planned}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Independent tasks */}
            {independentTasks.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Independent tasks
                </h4>
                <div className="space-y-2 pl-2">
                  {independentTasks.map((c) => {
                    const isComplete = c.actual >= c.planned;

                    return (
                      <div key={c.id} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {isComplete ? "●" : "○"}
                        </span>
                        <span className="text-xs text-foreground flex-1 truncate">
                          {c.title}
                        </span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {c.actual}/{c.planned}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Fallback: flat list if no grouping data */
          <div className="space-y-2">
            {commitments.map((c) => {
              const isComplete = c.actual >= c.planned;

              return (
                <div key={c.id} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {isComplete ? "●" : "○"}
                  </span>
                  <span className="text-xs text-foreground flex-1 truncate">
                    {c.title}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {c.actual}/{c.planned}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default WeeklyTotals;
