import { Progress } from "@/components/ui/progress";

/**
 * Progress Indicator Component
 * Shows completion progress as a bar with count
 */

interface ProgressIndicatorProps {
  completed: number;
  total: number;
  label?: string;
  showBar?: boolean;
}

const ProgressIndicator = ({ completed, total, label, showBar = true }: ProgressIndicatorProps) => {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  return (
    <div className="flex items-center gap-3">
      {showBar && (
        <Progress value={percentage} className="h-2 flex-1 min-w-[60px]" />
      )}
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {label ? `${label}: ` : ""}{completed}/{total}
        {!showBar && ` (${percentage}%)`}
      </span>
    </div>
  );
};

export default ProgressIndicator;
