import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, ChevronRight, Circle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isTomorrow, startOfWeek, endOfWeek, addDays, parseISO, isBefore, isAfter, isWithinInterval } from "date-fns";
import NorthStarIcon from "@/components/icons/NorthStarIcon";

/**
 * GlobalSearch Component - MVP Grouped Dropdown
 * Searches across tasks, 90-day plans, 1-year goals, and visions
 * Clean grouped UI with hierarchy context
 */

// Types for search results
interface TaskSearchResult {
  type: "task";
  id: string;
  commitmentId: string;
  title: string;
  instanceDate: string;
  timeStart?: string;
  planId?: string;
  planTitle?: string;
  visionId?: string;
  visionTitle?: string;
  isCompleted: boolean;
  isLinked: boolean;
}

interface Plan90dSearchResult {
  type: "plan90d";
  id: string;
  title: string;
  visionId?: string;
  visionTitle?: string;
  progress?: number;
  tasksThisWeek?: number;
}

interface Goal1ySearchResult {
  type: "goal1y";
  id: string;
  title: string;
  visionId?: string;
  visionTitle?: string;
  activePlansCount?: number;
}

interface VisionSearchResult {
  type: "vision";
  id: string;
  title: string;
  pillarName?: string;
}

type SearchResult = TaskSearchResult | Plan90dSearchResult | Goal1ySearchResult | VisionSearchResult;

const GlobalSearch = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { goals, visions, pillars } = useAppData();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build lookup maps
  const visionsMap = useMemo(() => {
    const map = new Map<string, { title: string; pillarId?: string }>();
    visions.forEach(v => map.set(v.id, { title: v.title, pillarId: v.pillar_id }));
    return map;
  }, [visions]);

  const pillarsMap = useMemo(() => {
    const map = new Map<string, string>();
    pillars.forEach(p => map.set(p.id, p.name));
    return map;
  }, [pillars]);

  const goalsMap = useMemo(() => {
    const map = new Map<string, { title: string; type: string; visionId?: string }>();
    goals.forEach(g => map.set(g.id, { 
      title: g.title, 
      type: g.goal_type, 
      visionId: g.life_vision_id || undefined 
    }));
    return map;
  }, [goals]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search function
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!user || !searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    const q = searchQuery.toLowerCase();
    const today = new Date();
    const todayStr = format(today, "yyyy-MM-dd");

    try {
      // Fetch all data in parallel
      const [visionsRes, goalsRes, tasksRes] = await Promise.all([
        // Search visions
        supabase
          .from("life_visions")
          .select("id, title, pillar_id")
          .eq("user_id", user.id)
          .eq("is_deleted", false)
          .or(`title.ilike.%${q}%`)
          .limit(5),
        
        // Search goals (all types)
        supabase
          .from("goals")
          .select("id, title, goal_type, life_vision_id")
          .eq("user_id", user.id)
          .eq("is_deleted", false)
          .or(`title.ilike.%${q}%`)
          .limit(10),
        
        // Search tasks (weekly_commitments)
        supabase
          .from("weekly_commitments")
          .select("id, title, goal_id, default_time_start, repeat_days_of_week, start_date, end_date, is_active")
          .eq("user_id", user.id)
          .or("is_deleted.is.null,is_deleted.eq.false")
          .ilike("title", `%${q}%`)
          .limit(8),
      ]);

      const allResults: SearchResult[] = [];

      // Process visions
      if (visionsRes.data) {
        for (const v of visionsRes.data) {
          const pillarName = v.pillar_id ? pillarsMap.get(v.pillar_id) : undefined;
          allResults.push({
            type: "vision",
            id: v.id,
            title: v.title,
            pillarName,
          });
        }
      }

      // Process goals - separate 1yr and 90d
      if (goalsRes.data) {
        const oneYearGoals = goalsRes.data.filter(g => g.goal_type === "one_year");
        const ninetyDayPlans = goalsRes.data.filter(g => g.goal_type === "ninety_day");

        // 1-year goals
        for (const g of oneYearGoals.slice(0, 5)) {
          const vision = g.life_vision_id ? visionsMap.get(g.life_vision_id) : undefined;
          // Count active 90d plans under this 1yr goal
          const activePlans = goals.filter(
            plan => plan.goal_type === "ninety_day" && 
            plan.parent_goal_id === g.id && 
            !plan.is_deleted
          );
          allResults.push({
            type: "goal1y",
            id: g.id,
            title: g.title,
            visionId: g.life_vision_id || undefined,
            visionTitle: vision?.title,
            activePlansCount: activePlans.length || undefined,
          });
        }

        // 90-day plans
        for (const g of ninetyDayPlans.slice(0, 5)) {
          const vision = g.life_vision_id ? visionsMap.get(g.life_vision_id) : undefined;
          allResults.push({
            type: "plan90d",
            id: g.id,
            title: g.title,
            visionId: g.life_vision_id || undefined,
            visionTitle: vision?.title,
          });
        }
      }

      // Process tasks - find nearest relevant instance
      if (tasksRes.data) {
        // Get completions for matching tasks to determine instance dates
        const taskIds = tasksRes.data.map(t => t.id);
        
        const { data: completions } = await supabase
          .from("commitment_completions")
          .select("commitment_id, completed_date, is_completed")
          .in("commitment_id", taskIds)
          .gte("completed_date", format(addDays(today, -30), "yyyy-MM-dd"))
          .order("completed_date", { ascending: true });

        const completionsByTask = new Map<string, Array<{ date: string; isCompleted: boolean }>>();
        completions?.forEach(c => {
          if (!completionsByTask.has(c.commitment_id!)) {
            completionsByTask.set(c.commitment_id!, []);
          }
          completionsByTask.get(c.commitment_id!)!.push({ 
            date: c.completed_date, 
            isCompleted: c.is_completed ?? true 
          });
        });

        for (const task of tasksRes.data) {
          // Find the plan info if linked
          let planId: string | undefined;
          let planTitle: string | undefined;
          let visionId: string | undefined;
          let visionTitle: string | undefined;
          
          if (task.goal_id) {
            const goal = goalsMap.get(task.goal_id);
            if (goal && goal.type === "ninety_day") {
              planId = task.goal_id;
              planTitle = goal.title;
              if (goal.visionId) {
                visionId = goal.visionId;
                visionTitle = visionsMap.get(goal.visionId)?.title;
              }
            }
          }

          // Determine next/nearest instance date
          const taskCompletions = completionsByTask.get(task.id) || [];
          let instanceDate = todayStr;
          let isCompleted = false;

          // Check for upcoming instances based on repeat_days_of_week
          if (task.repeat_days_of_week && task.repeat_days_of_week.length > 0) {
            const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
            const repeatDays = task.repeat_days_of_week.map(d => dayNames.indexOf(d.toLowerCase()));
            
            // Find next scheduled day from today
            for (let i = 0; i <= 7; i++) {
              const checkDate = addDays(today, i);
              const dayOfWeek = checkDate.getDay();
              if (repeatDays.includes(dayOfWeek)) {
                const checkDateStr = format(checkDate, "yyyy-MM-dd");
                // Check if within start/end date bounds
                if (task.start_date && isBefore(checkDate, parseISO(task.start_date))) continue;
                if (task.end_date && isAfter(checkDate, parseISO(task.end_date))) continue;
                
                instanceDate = checkDateStr;
                // Check if this instance is completed
                const completion = taskCompletions.find(c => c.date === checkDateStr);
                isCompleted = completion?.isCompleted ?? false;
                break;
              }
            }
          } else {
            // Fallback: use most recent or today
            if (taskCompletions.length > 0) {
              const sorted = [...taskCompletions].sort((a, b) => b.date.localeCompare(a.date));
              instanceDate = sorted[0].date;
              isCompleted = sorted[0].isCompleted;
            }
          }

          allResults.push({
            type: "task",
            id: `${task.id}-${instanceDate}`,
            commitmentId: task.id,
            title: task.title,
            instanceDate,
            timeStart: task.default_time_start || undefined,
            planId,
            planTitle,
            visionId,
            visionTitle,
            isCompleted,
            isLinked: !!planId,
          });
        }
      }

      setResults(allResults);
      setSelectedIndex(-1);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  }, [user, pillarsMap, visionsMap, goalsMap, goals]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      performSearch(query);
    }, 180);

    return () => clearTimeout(timer);
  }, [query, performSearch]);

  // Handle selection
  const handleSelect = (result: SearchResult) => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    
    switch (result.type) {
      case "vision":
        navigate(`/vision/${result.id}`);
        break;
      case "goal1y":
        navigate(`/goal/${result.id}`);
        break;
      case "plan90d":
        navigate(`/goal/${result.id}`);
        break;
      case "task":
        // Navigate to weekly with the task highlighted
        navigate(`/weekly?taskId=${result.commitmentId}&date=${result.instanceDate}`);
        break;
    }
  };

  // Group results by type
  const groupedResults = useMemo(() => {
    const tasks = results.filter((r): r is TaskSearchResult => r.type === "task");
    const plans90d = results.filter((r): r is Plan90dSearchResult => r.type === "plan90d");
    const goals1y = results.filter((r): r is Goal1ySearchResult => r.type === "goal1y");
    const visionsResults = results.filter((r): r is VisionSearchResult => r.type === "vision");
    
    return { tasks, plans90d, goals1y, visions: visionsResults };
  }, [results]);

  // Flat list for keyboard navigation
  const flatResults = useMemo(() => {
    return [
      ...groupedResults.tasks,
      ...groupedResults.plans90d,
      ...groupedResults.goals1y,
      ...groupedResults.visions,
    ];
  }, [groupedResults]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || flatResults.length === 0) {
      if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(prev => (prev < flatResults.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : flatResults.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < flatResults.length) {
          handleSelect(flatResults[selectedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedEl?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Format date label
  const getDateLabel = (dateStr: string, timeStr?: string) => {
    const date = parseISO(dateStr);
    let label = "";
    
    if (isToday(date)) {
      label = "Today";
    } else if (isTomorrow(date)) {
      label = "Tomorrow";
    } else {
      label = format(date, "EEE");
    }
    
    if (timeStr) {
      // Format time - assuming HH:mm:ss format
      const timeParts = timeStr.split(":");
      if (timeParts.length >= 2) {
        label += ` ${timeParts[0]}:${timeParts[1]}`;
      }
    }
    
    return label;
  };

  // Calculate running index for keyboard navigation
  let runningIndex = 0;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search…"
          className="pl-8 pr-8 h-8 text-sm w-40 md:w-52 bg-background border-border focus:ring-primary focus:border-primary"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-calm"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {isOpen && query && (
        <div 
          ref={listRef}
          className="absolute top-full mt-1.5 right-0 w-80 md:w-96 bg-popover border border-border rounded-lg shadow-soft z-50 max-h-[70vh] overflow-y-auto"
        >
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Searching...
            </div>
          ) : flatResults.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No results
            </div>
          ) : (
            <div className="py-1.5">
              {/* Tasks Section */}
              {groupedResults.tasks.length > 0 && (
                <div className="mb-1">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Tasks ({groupedResults.tasks.length})
                  </div>
                  {groupedResults.tasks.map((result) => {
                    const idx = runningIndex++;
                    return (
                      <button
                        key={result.id}
                        data-index={idx}
                        onClick={() => handleSelect(result)}
                        className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-calm group ${
                          selectedIndex === idx ? "bg-accent" : "hover:bg-muted/50"
                        }`}
                      >
                        {/* Completion circle */}
                        <Circle 
                          className={`h-4 w-4 shrink-0 ${
                            result.isCompleted 
                              ? "text-primary fill-primary" 
                              : "text-muted-foreground"
                          }`} 
                        />
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-foreground truncate">{result.title}</div>
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            <span>{getDateLabel(result.instanceDate, result.timeStart)}</span>
                            {result.isLinked && result.planTitle && result.visionTitle ? (
                              <span className="ml-1">
                                · {result.planTitle} → {result.visionTitle}
                              </span>
                            ) : !result.isLinked ? (
                              <span className="ml-1 opacity-60">· Unlinked</span>
                            ) : null}
                          </div>
                        </div>
                        
                        {/* Chevron */}
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 90-Day Plans Section */}
              {groupedResults.plans90d.length > 0 && (
                <div className="mb-1">
                  {groupedResults.tasks.length > 0 && (
                    <div className="h-px bg-border mx-3 my-1" />
                  )}
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    90-Day Plans ({groupedResults.plans90d.length})
                  </div>
                  {groupedResults.plans90d.map((result) => {
                    const idx = runningIndex++;
                    return (
                      <button
                        key={result.id}
                        data-index={idx}
                        onClick={() => handleSelect(result)}
                        className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-calm group ${
                          selectedIndex === idx ? "bg-accent" : "hover:bg-muted/50"
                        }`}
                      >
                        {/* 90d pill */}
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-olive-light text-accent-foreground shrink-0">
                          90d
                        </span>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-foreground truncate">{result.title}</div>
                          {result.visionTitle && (
                            <div className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                              <NorthStarIcon className="h-3 w-3 opacity-60" />
                              {result.visionTitle}
                            </div>
                          )}
                        </div>
                        
                        {/* Chevron */}
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 1-Year Goals Section */}
              {groupedResults.goals1y.length > 0 && (
                <div className="mb-1">
                  {(groupedResults.tasks.length > 0 || groupedResults.plans90d.length > 0) && (
                    <div className="h-px bg-border mx-3 my-1" />
                  )}
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    1-Year Goals ({groupedResults.goals1y.length})
                  </div>
                  {groupedResults.goals1y.map((result) => {
                    const idx = runningIndex++;
                    return (
                      <button
                        key={result.id}
                        data-index={idx}
                        onClick={() => handleSelect(result)}
                        className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-calm group ${
                          selectedIndex === idx ? "bg-accent" : "hover:bg-muted/50"
                        }`}
                      >
                        {/* 1yr pill */}
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-olive-light text-accent-foreground shrink-0">
                          1yr
                        </span>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-foreground truncate">{result.title}</div>
                          <div className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                            {result.visionTitle && (
                              <>
                                <NorthStarIcon className="h-3 w-3 opacity-60" />
                                <span>{result.visionTitle}</span>
                              </>
                            )}
                            {result.activePlansCount && result.activePlansCount > 0 && (
                              <span className={result.visionTitle ? "ml-1" : ""}>
                                {result.visionTitle ? "· " : ""}{result.activePlansCount} active plan{result.activePlansCount !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Chevron */}
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Visions Section */}
              {groupedResults.visions.length > 0 && (
                <div>
                  {(groupedResults.tasks.length > 0 || groupedResults.plans90d.length > 0 || groupedResults.goals1y.length > 0) && (
                    <div className="h-px bg-border mx-3 my-1" />
                  )}
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Visions ({groupedResults.visions.length})
                  </div>
                  {groupedResults.visions.map((result) => {
                    const idx = runningIndex++;
                    return (
                      <button
                        key={result.id}
                        data-index={idx}
                        onClick={() => handleSelect(result)}
                        className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-calm group ${
                          selectedIndex === idx ? "bg-accent" : "hover:bg-muted/50"
                        }`}
                      >
                        {/* Star icon */}
                        <NorthStarIcon className="h-4 w-4 shrink-0 opacity-70" />
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-foreground truncate">{result.title}</div>
                          {result.pillarName && (
                            <div className="text-xs text-muted-foreground truncate mt-0.5">
                              {result.pillarName}
                            </div>
                          )}
                        </div>
                        
                        {/* Chevron */}
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalSearch;
