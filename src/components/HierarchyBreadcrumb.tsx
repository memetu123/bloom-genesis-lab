import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * HierarchyBreadcrumb - Shows the full hierarchy path with visual emphasis
 * - Distant ancestors: smaller, lighter text
 * - Immediate parent: larger, more prominent
 * - All segments are clickable except the current page indicator
 */

export interface BreadcrumbSegment {
  label: string;
  href?: string; // If undefined, not clickable (current page)
}

interface HierarchyBreadcrumbProps {
  segments: BreadcrumbSegment[];
  className?: string;
}

const HierarchyBreadcrumb = ({ segments, className }: HierarchyBreadcrumbProps) => {
  const navigate = useNavigate();

  if (segments.length === 0) return null;

  return (
    <nav 
      aria-label="Hierarchy breadcrumb" 
      className={cn("flex items-center flex-wrap gap-1 mb-4", className)}
    >
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const isImmediateParent = index === segments.length - 2;
        const isDistantAncestor = index < segments.length - 2;
        const isClickable = !!segment.href;

        return (
          <span key={index} className="flex items-center gap-1">
            <span
              onClick={isClickable ? () => navigate(segment.href!) : undefined}
              className={cn(
                "transition-colors",
                // Distant ancestors: smallest and lightest
                isDistantAncestor && "text-xs text-muted-foreground/70",
                // Immediate parent: slightly larger and more prominent
                isImmediateParent && "text-sm text-muted-foreground font-medium",
                // Current (last, non-clickable): just text, no emphasis needed
                isLast && !isClickable && "text-sm text-muted-foreground",
                // Last but clickable (rare case): treat as immediate parent
                isLast && isClickable && "text-sm text-muted-foreground font-medium",
                // Clickable styling
                isClickable && "hover:text-foreground cursor-pointer"
              )}
            >
              {segment.label}
            </span>
            {!isLast && (
              <ChevronRight 
                className={cn(
                  "flex-shrink-0",
                  isDistantAncestor ? "h-2.5 w-2.5 text-muted-foreground/50" : "h-3 w-3 text-muted-foreground/70"
                )} 
              />
            )}
          </span>
        );
      })}
    </nav>
  );
};

export default HierarchyBreadcrumb;
