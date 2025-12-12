/**
 * Global Goals Context - Caches goals once per app session
 * Goals are fetched once and reused across all pages
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface GoalData {
  id: string;
  title: string;
  is_focus: boolean;
  goal_type?: string;
}

interface GoalsContextType {
  goals: GoalData[];
  goalsMap: Map<string, GoalData>;
  loading: boolean;
  refetch: () => Promise<void>;
}

const GoalsContext = createContext<GoalsContextType | undefined>(undefined);

export function GoalsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);
  const userIdRef = useRef<string | null>(null);

  const fetchGoals = useCallback(async () => {
    if (!user) {
      setGoals([]);
      setLoading(false);
      return;
    }

    // Prevent duplicate fetches for same user
    if (fetchedRef.current && userIdRef.current === user.id) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from("goals")
        .select("id, title, is_focus, goal_type")
        .eq("user_id", user.id)
        .or("is_deleted.is.null,is_deleted.eq.false");

      if (error) {
        console.error("Error fetching goals:", error);
        return;
      }

      setGoals(data || []);
      fetchedRef.current = true;
      userIdRef.current = user.id;
    } catch (err) {
      console.error("Error in fetchGoals:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch goals when auth finishes loading
  useEffect(() => {
    if (!authLoading) {
      fetchGoals();
    }
  }, [authLoading, fetchGoals]);

  // Reset when user changes
  useEffect(() => {
    if (user?.id !== userIdRef.current) {
      fetchedRef.current = false;
      if (user) {
        fetchGoals();
      } else {
        setGoals([]);
        setLoading(false);
      }
    }
  }, [user, fetchGoals]);

  // Build lookup map for O(1) access
  const goalsMap = new Map(goals.map(g => [g.id, g]));

  const refetch = useCallback(async () => {
    fetchedRef.current = false;
    await fetchGoals();
  }, [fetchGoals]);

  return (
    <GoalsContext.Provider value={{ goals, goalsMap, loading, refetch }}>
      {children}
    </GoalsContext.Provider>
  );
}

export function useGoals() {
  const context = useContext(GoalsContext);
  if (context === undefined) {
    // Fallback if used outside provider
    return {
      goals: [],
      goalsMap: new Map(),
      loading: false,
      refetch: async () => {},
    };
  }
  return context;
}
