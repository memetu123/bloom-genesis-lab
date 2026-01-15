import { ReactNode } from "react";
import { ChevronLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HierarchyProgressBar } from "./HierarchyProgressBar";

/**
 * OnboardingLayout - Consistent wrapper for all onboarding steps
 * Shows hierarchy progress, title, and navigation
 * Supports "Planning Guide" mode with exit button
 */
interface OnboardingLayoutProps {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  showBack?: boolean;
  onExit?: () => void;
}

export function OnboardingLayout({
  step,
  totalSteps,
  title,
  subtitle,
  children,
  onBack,
  showBack = true,
  onExit
}: OnboardingLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Navigation row */}
        <div className="flex items-center justify-between mb-4">
          {showBack && onBack ? (
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          ) : (
            <div />
          )}
          {onExit && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onExit}
              className="gap-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
              Exit
            </Button>
          )}
        </div>

        {/* Hierarchy progress bar */}
        <div className="mb-8">
          <HierarchyProgressBar currentStep={step} />
        </div>

        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <h1 className="text-2xl font-semibold text-foreground mb-2">{title}</h1>
          {subtitle && (
            <p className="text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {/* Content */}
        <div className="animate-slide-up">
          {children}
        </div>
      </div>
    </div>
  );
}