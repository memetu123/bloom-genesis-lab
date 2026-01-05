import { format, addDays, isSameDay, startOfWeek, subWeeks, addWeeks } from "date-fns";
import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * MobileWeekStrip - Compact horizontal week strip for mobile Today view
 * Shows weekday names with numeric day underneath
 * Supports swipe to change weeks and tap to select day
 */

interface MobileWeekStripProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

const MobileWeekStrip = ({
  selectedDate,
  onDateSelect,
  weekStartsOn,
}: MobileWeekStripProps) => {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    startOfWeek(selectedDate, { weekStartsOn })
  );
  
  // Touch handling for swipe
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  
  // Update week when selected date changes to a different week
  useEffect(() => {
    const dateWeekStart = startOfWeek(selectedDate, { weekStartsOn });
    if (format(dateWeekStart, "yyyy-MM-dd") !== format(currentWeekStart, "yyyy-MM-dd")) {
      setCurrentWeekStart(dateWeekStart);
    }
  }, [selectedDate, weekStartsOn, currentWeekStart]);

  // Generate 7 days starting from currentWeekStart
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(currentWeekStart, i);
    return {
      date,
      dayName: format(date, "EEE").slice(0, 3), // Mon, Tue, etc.
      dayNum: format(date, "d"),
      isToday: isSameDay(date, new Date()),
      isSelected: isSameDay(date, selectedDate),
    };
  });

  const goToPreviousWeek = useCallback(() => {
    const newWeekStart = subWeeks(currentWeekStart, 1);
    setCurrentWeekStart(newWeekStart);
    // Select the same day of week in the new week
    const dayOfWeek = (selectedDate.getDay() - weekStartsOn + 7) % 7;
    onDateSelect(addDays(newWeekStart, dayOfWeek));
  }, [currentWeekStart, selectedDate, weekStartsOn, onDateSelect]);

  const goToNextWeek = useCallback(() => {
    const newWeekStart = addWeeks(currentWeekStart, 1);
    setCurrentWeekStart(newWeekStart);
    // Select the same day of week in the new week
    const dayOfWeek = (selectedDate.getDay() - weekStartsOn + 7) % 7;
    onDateSelect(addDays(newWeekStart, dayOfWeek));
  }, [currentWeekStart, selectedDate, weekStartsOn, onDateSelect]);

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    const threshold = 50; // minimum swipe distance
    
    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        // Swiped left -> next week
        goToNextWeek();
      } else {
        // Swiped right -> previous week
        goToPreviousWeek();
      }
    }
    
    touchStartX.current = null;
  };

  const isCurrentWeek = format(currentWeekStart, "yyyy-MM-dd") === 
    format(startOfWeek(new Date(), { weekStartsOn }), "yyyy-MM-dd");

  return (
    <div className="bg-background border-b border-border/50">
      {/* Week navigation row - subtle */}
      <div className="flex items-center justify-between px-2 pt-2 pb-1">
        <button
          onClick={goToPreviousWeek}
          className="p-1.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          aria-label="Previous week"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        
        <div className="text-center">
          <span className="text-xs text-muted-foreground/70">
            {format(currentWeekStart, "MMM d")} – {format(addDays(currentWeekStart, 6), "MMM d")}
          </span>
          {!isCurrentWeek && (
            <button
              onClick={() => {
                const today = new Date();
                setCurrentWeekStart(startOfWeek(today, { weekStartsOn }));
                onDateSelect(today);
              }}
              className="ml-2 text-xs text-primary hover:underline"
            >
              Today
            </button>
          )}
        </div>
        
        <button
          onClick={goToNextWeek}
          className="p-1.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          aria-label="Next week"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day strip */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="flex items-stretch justify-around px-1 pb-2"
      >
        {weekDays.map(({ date, dayName, dayNum, isToday, isSelected }) => (
          <button
            key={dayNum + dayName}
            onClick={() => onDateSelect(date)}
            className={cn(
              "flex flex-col items-center justify-center py-1.5 px-2 min-w-[40px] rounded-lg transition-colors",
              isSelected
                ? "bg-primary text-primary-foreground"
                : isToday
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <span className={cn(
              "text-[11px] font-medium uppercase tracking-wide",
              isSelected ? "text-primary-foreground" : ""
            )}>
              {dayName}
            </span>
            <span className={cn(
              "text-base font-semibold mt-0.5",
              isSelected ? "text-primary-foreground" : isToday ? "text-primary" : ""
            )}>
              {dayNum}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default MobileWeekStrip;
