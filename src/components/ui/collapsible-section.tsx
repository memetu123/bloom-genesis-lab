import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * CollapsibleSection - A styled expandable section for optional form fields.
 * Used in creation modals for progressive disclosure.
 */
export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
  className,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className={cn("", className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        <span>{title}</span>
        {subtitle && !isOpen && (
          <span className="text-foreground/70 truncate">— {subtitle}</span>
        )}
      </button>
      
      {isOpen && (
        <div className="mt-3 pl-6 space-y-3 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * ControlledCollapsibleSection - A collapsible section with external state control.
 */
interface ControlledCollapsibleSectionProps extends Omit<CollapsibleSectionProps, 'defaultOpen'> {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ControlledCollapsibleSection({
  title,
  subtitle,
  isOpen,
  onOpenChange,
  children,
  className,
}: ControlledCollapsibleSectionProps) {
  return (
    <div className={cn("", className)}>
      <button
        type="button"
        onClick={() => onOpenChange(!isOpen)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        <span>{title}</span>
        {subtitle && !isOpen && (
          <span className="text-foreground/70 truncate">— {subtitle}</span>
        )}
      </button>
      
      {isOpen && (
        <div className="mt-3 pl-6 space-y-3 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}
