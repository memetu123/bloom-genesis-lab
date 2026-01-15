import { cn } from "@/lib/utils";

/**
 * HierarchyProgressBar - Visual progress through Todayoum's planning hierarchy
 * Shows: Pillars → Vision → 3-Year → 1-Year → 90-Day → Weekly
 * Current step is emphasized, completed steps are filled, future steps are muted
 */

interface HierarchyProgressBarProps {
  currentStep: number;
}

const HIERARCHY_STEPS = [
  { step: 1, label: "Pillars" },
  { step: 2, label: "Vision" },
  { step: 3, label: "3-Year" },
  { step: 4, label: "1-Year" },
  { step: 5, label: "90-Day" },
  { step: 6, label: "Weekly" },
];

export function HierarchyProgressBar({ currentStep }: HierarchyProgressBarProps) {
  return (
    <div className="flex items-center w-full gap-1">
      {HIERARCHY_STEPS.map((item, index) => {
        const isCompleted = currentStep > item.step;
        const isCurrent = currentStep === item.step;
        const isFuture = currentStep < item.step;

        return (
          <div
            key={item.step}
            className="flex-1 flex flex-col items-center gap-1.5"
          >
            {/* Segment bar */}
            <div
              className={cn(
                "h-1.5 w-full rounded-full transition-all duration-500 ease-out",
                isCompleted && "bg-primary/60",
                isCurrent && "bg-primary",
                isFuture && "bg-muted"
              )}
            />
            {/* Label */}
            <span
              className={cn(
                "text-[10px] sm:text-xs font-medium transition-all duration-300",
                isCompleted && "text-muted-foreground",
                isCurrent && "text-primary font-semibold",
                isFuture && "text-muted-foreground/50"
              )}
            >
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
