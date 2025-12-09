import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Eye, Target, CheckSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

/**
 * GlobalSearch Component
 * Searches across visions, goals, and tasks with dropdown results
 */

interface SearchResult {
  id: string;
  type: "vision" | "goal" | "task";
  title: string;
  description?: string;
  taskDate?: string; // For tasks, store latest date if available
}

const GlobalSearch = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

    try {
      // Search visions
      const { data: visions } = await supabase
        .from("life_visions")
        .select("id, title, description")
        .eq("user_id", user.id)
        .eq("is_deleted", false)
        .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(5);

      // Search goals
      const { data: goals } = await supabase
        .from("goals")
        .select("id, title, description")
        .eq("user_id", user.id)
        .eq("is_deleted", false)
        .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(5);

      // Search tasks (weekly_commitments) and get their latest completion date
      const { data: tasks } = await supabase
        .from("weekly_commitments")
        .select("id, title")
        .eq("user_id", user.id)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .ilike("title", `%${q}%`)
        .limit(5);

      // For tasks, try to get the latest completion date
      const taskResults: SearchResult[] = [];
      for (const task of tasks || []) {
        // Get the most recent completion for this task
        const { data: completion } = await supabase
          .from("commitment_completions")
          .select("completed_date")
          .eq("commitment_id", task.id)
          .order("completed_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        taskResults.push({
          id: task.id,
          type: "task",
          title: task.title,
          taskDate: completion?.completed_date || format(new Date(), "yyyy-MM-dd"),
        });
      }

      const allResults: SearchResult[] = [
        ...(visions || []).map(v => ({ id: v.id, type: "vision" as const, title: v.title, description: v.description || undefined })),
        ...(goals || []).map(g => ({ id: g.id, type: "goal" as const, title: g.title, description: g.description || undefined })),
        ...taskResults,
      ];

      setResults(allResults);
      setSelectedIndex(-1);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      performSearch(query);
    }, 200);

    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const handleSelect = (result: SearchResult) => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    
    switch (result.type) {
      case "vision":
        navigate(`/visions?focusId=${result.id}`);
        break;
      case "goal":
        navigate(`/goals?focusId=${result.id}`);
        break;
      case "task":
        navigate(`/daily?date=${result.taskDate}&taskId=${result.id}`);
        break;
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const getIcon = (type: SearchResult["type"]) => {
    switch (type) {
      case "vision":
        return <Eye className="h-4 w-4 text-muted-foreground" />;
      case "goal":
        return <Target className="h-4 w-4 text-muted-foreground" />;
      case "task":
        return <CheckSquare className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTypeLabel = (type: SearchResult["type"]) => {
    switch (type) {
      case "vision":
        return "Vision";
      case "goal":
        return "Goal";
      case "task":
        return "Task";
    }
  };

  // Group results by type
  const visionResults = results.filter(r => r.type === "vision");
  const goalResults = results.filter(r => r.type === "goal");
  const taskResults = results.filter(r => r.type === "task");

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
          className="pl-8 pr-8 h-8 text-sm w-40 md:w-52 focus:ring-primary focus:border-primary"
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
        <div className="absolute top-full mt-1 right-0 w-72 md:w-80 bg-background border border-border rounded-md shadow-lg z-50 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="p-3 text-sm text-muted-foreground text-center">
              Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">
              No results found
            </div>
          ) : (
            <div className="py-1">
              {/* Visions */}
              {visionResults.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Visions
                  </div>
                  {visionResults.map((result) => {
                    const globalIndex = results.indexOf(result);
                    return (
                      <button
                        key={`vision-${result.id}`}
                        onClick={() => handleSelect(result)}
                        className={`w-full px-3 py-2 flex items-center gap-2 text-left transition-calm ${
                          selectedIndex === globalIndex ? "bg-primary/10" : "hover:bg-muted"
                        }`}
                      >
                        {getIcon(result.type)}
                        <span className="text-sm text-foreground truncate">{result.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Goals */}
              {goalResults.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-t border-border mt-1 pt-2">
                    Goals
                  </div>
                  {goalResults.map((result) => {
                    const globalIndex = results.indexOf(result);
                    return (
                      <button
                        key={`goal-${result.id}`}
                        onClick={() => handleSelect(result)}
                        className={`w-full px-3 py-2 flex items-center gap-2 text-left transition-calm ${
                          selectedIndex === globalIndex ? "bg-primary/10" : "hover:bg-muted"
                        }`}
                      >
                        {getIcon(result.type)}
                        <span className="text-sm text-foreground truncate">{result.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Tasks */}
              {taskResults.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-t border-border mt-1 pt-2">
                    Tasks
                  </div>
                  {taskResults.map((result) => {
                    const globalIndex = results.indexOf(result);
                    return (
                      <button
                        key={`task-${result.id}`}
                        onClick={() => handleSelect(result)}
                        className={`w-full px-3 py-2 flex items-center gap-2 text-left transition-calm ${
                          selectedIndex === globalIndex ? "bg-primary/10" : "hover:bg-muted"
                        }`}
                      >
                        {getIcon(result.type)}
                        <span className="text-sm text-foreground truncate">{result.title}</span>
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
