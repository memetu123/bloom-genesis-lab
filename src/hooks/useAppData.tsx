/**
 * AppDataProvider - Global data ownership layer
 * Fetches and caches core entities ONCE per user session:
 * - user_preferences
 * - life_visions
 * - pillars
 * - goals
 * 
 * All pages consume from this context instead of fetching directly.
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ============ TYPES ============

export interface UserPreferences {
  startOfWeek: "sunday" | "monday";
  timeFormat: "12h" | "24h";
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
}

export interface Pillar {
  id: string;
  name: string;
  description: string | null;
  sort_order: number | null;
}

export interface Vision {
  id: string;
  title: string;
  description: string | null;
  pillar_id: string;
  is_focus: boolean;
  status: "active" | "completed" | "archived";
  is_deleted: boolean;
}

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  goal_type: "three_year" | "one_year" | "ninety_day";
  pillar_id: string;
  life_vision_id: string | null;
  parent_goal_id: string | null;
  is_focus: boolean;
  status: string | null;
  is_deleted: boolean;
}

// ============ DEFAULTS ============

const DEFAULT_PREFERENCES: UserPreferences = {
  startOfWeek: "monday",
  timeFormat: "24h",
  dateFormat: "YYYY-MM-DD",
};

// ============ CONTEXT ============

interface AppDataContextType {
  // Data
  preferences: UserPreferences;
  pillars: Pillar[];
  visions: Vision[];
  goals: Goal[];
  
  // Lookup maps for O(1) access
  pillarsMap: Map<string, Pillar>;
  visionsMap: Map<string, Vision>;
  goalsMap: Map<string, Goal>;
  
  // Loading states
  loading: boolean;
  preferencesLoading: boolean;
  
  // Manual refetch methods
  refetchPreferences: () => Promise<void>;
  refetchPillars: () => Promise<void>;
  refetchVisions: () => Promise<void>;
  refetchGoals: () => Promise<void>;
  refetchAll: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

// ============ PROVIDER ============

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  
  // Data state
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [visions, setVisions] = useState<Vision[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  
  // Loading states
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [coreDataLoading, setCoreDataLoading] = useState(true);
  
  // Strict guards to prevent duplicate fetches
  const didFetchRef = useRef(false);
  const userIdRef = useRef<string | null>(null);

  // ============ FETCH FUNCTIONS ============

  const fetchPreferences = useCallback(async () => {
    if (!user) {
      setPreferences(DEFAULT_PREFERENCES);
      setPreferencesLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("start_of_week, time_format, date_format")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching preferences:", error);
      }

      if (data) {
        setPreferences({
          startOfWeek: (data.start_of_week as "sunday" | "monday") || DEFAULT_PREFERENCES.startOfWeek,
          timeFormat: (data.time_format as "12h" | "24h") || DEFAULT_PREFERENCES.timeFormat,
          dateFormat: (data.date_format as UserPreferences["dateFormat"]) || DEFAULT_PREFERENCES.dateFormat,
        });
      } else {
        setPreferences(DEFAULT_PREFERENCES);
      }
    } catch (err) {
      console.error("Error in fetchPreferences:", err);
      setPreferences(DEFAULT_PREFERENCES);
    } finally {
      setPreferencesLoading(false);
    }
  }, [user]);

  const fetchCoreData = useCallback(async () => {
    if (!user) {
      setPillars([]);
      setVisions([]);
      setGoals([]);
      setCoreDataLoading(false);
      return;
    }

    try {
      // Fetch all core data in a single parallel batch
      const [pillarsResult, visionsResult, goalsResult] = await Promise.all([
        supabase
          .from("pillars")
          .select("*")
          .eq("user_id", user.id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("life_visions")
          .select("*")
          .eq("user_id", user.id)
          .or("is_deleted.is.null,is_deleted.eq.false"),
        supabase
          .from("goals")
          .select("*")
          .eq("user_id", user.id)
          .or("is_deleted.is.null,is_deleted.eq.false"),
      ]);

      if (pillarsResult.error) throw pillarsResult.error;
      if (visionsResult.error) throw visionsResult.error;
      if (goalsResult.error) throw goalsResult.error;

      setPillars(pillarsResult.data || []);
      
      setVisions((visionsResult.data || []).map(v => ({
        ...v,
        status: (v.status as "active" | "completed" | "archived") || "active",
        is_deleted: v.is_deleted || false,
      })));
      
      setGoals((goalsResult.data || []).map(g => ({
        ...g,
        is_deleted: g.is_deleted || false,
      })));

    } catch (err) {
      console.error("Error fetching core data:", err);
    } finally {
      setCoreDataLoading(false);
    }
  }, [user]);

  const fetchAllData = useCallback(async () => {
    if (!user) {
      setPreferences(DEFAULT_PREFERENCES);
      setPillars([]);
      setVisions([]);
      setGoals([]);
      setPreferencesLoading(false);
      setCoreDataLoading(false);
      return;
    }

    // Prevent duplicate fetches for same user
    if (didFetchRef.current && userIdRef.current === user.id) {
      return;
    }

    setPreferencesLoading(true);
    setCoreDataLoading(true);

    try {
      // Fetch everything in parallel
      const [prefsResult, pillarsResult, visionsResult, goalsResult] = await Promise.all([
        supabase
          .from("user_preferences")
          .select("start_of_week, time_format, date_format")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("pillars")
          .select("*")
          .eq("user_id", user.id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("life_visions")
          .select("*")
          .eq("user_id", user.id)
          .or("is_deleted.is.null,is_deleted.eq.false"),
        supabase
          .from("goals")
          .select("*")
          .eq("user_id", user.id)
          .or("is_deleted.is.null,is_deleted.eq.false"),
      ]);

      // Process preferences
      if (prefsResult.data) {
        setPreferences({
          startOfWeek: (prefsResult.data.start_of_week as "sunday" | "monday") || DEFAULT_PREFERENCES.startOfWeek,
          timeFormat: (prefsResult.data.time_format as "12h" | "24h") || DEFAULT_PREFERENCES.timeFormat,
          dateFormat: (prefsResult.data.date_format as UserPreferences["dateFormat"]) || DEFAULT_PREFERENCES.dateFormat,
        });
      } else {
        setPreferences(DEFAULT_PREFERENCES);
      }

      // Process pillars
      if (!pillarsResult.error) {
        setPillars(pillarsResult.data || []);
      }

      // Process visions
      if (!visionsResult.error) {
        setVisions((visionsResult.data || []).map(v => ({
          ...v,
          status: (v.status as "active" | "completed" | "archived") || "active",
          is_deleted: v.is_deleted || false,
        })));
      }

      // Process goals
      if (!goalsResult.error) {
        setGoals((goalsResult.data || []).map(g => ({
          ...g,
          is_deleted: g.is_deleted || false,
        })));
      }

      didFetchRef.current = true;
      userIdRef.current = user.id;

    } catch (err) {
      console.error("Error fetching all data:", err);
    } finally {
      setPreferencesLoading(false);
      setCoreDataLoading(false);
    }
  }, [user]);

  // ============ EFFECTS ============

  // Fetch all data when auth finishes loading
  useEffect(() => {
    if (!authLoading) {
      fetchAllData();
    }
  }, [authLoading, fetchAllData]);

  // Reset when user changes
  useEffect(() => {
    if (user?.id !== userIdRef.current) {
      didFetchRef.current = false;
      if (user) {
        fetchAllData();
      } else {
        setPreferences(DEFAULT_PREFERENCES);
        setPillars([]);
        setVisions([]);
        setGoals([]);
        setPreferencesLoading(false);
        setCoreDataLoading(false);
      }
    }
  }, [user, fetchAllData]);

  // Timeout fallback for preferences
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (preferencesLoading) {
        setPreferencesLoading(false);
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, [preferencesLoading]);

  // ============ MEMOIZED MAPS ============

  const pillarsMap = useMemo(() => 
    new Map(pillars.map(p => [p.id, p])), 
    [pillars]
  );

  const visionsMap = useMemo(() => 
    new Map(visions.map(v => [v.id, v])), 
    [visions]
  );

  const goalsMap = useMemo(() => 
    new Map(goals.map(g => [g.id, g])), 
    [goals]
  );

  // ============ REFETCH METHODS ============

  const refetchPreferences = useCallback(async () => {
    await fetchPreferences();
  }, [fetchPreferences]);

  const refetchPillars = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("pillars")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true });
    setPillars(data || []);
  }, [user]);

  const refetchVisions = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("life_visions")
      .select("*")
      .eq("user_id", user.id)
      .or("is_deleted.is.null,is_deleted.eq.false");
    setVisions((data || []).map(v => ({
      ...v,
      status: (v.status as "active" | "completed" | "archived") || "active",
      is_deleted: v.is_deleted || false,
    })));
  }, [user]);

  const refetchGoals = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("goals")
      .select("*")
      .eq("user_id", user.id)
      .or("is_deleted.is.null,is_deleted.eq.false");
    setGoals((data || []).map(g => ({
      ...g,
      is_deleted: g.is_deleted || false,
    })));
  }, [user]);

  const refetchAll = useCallback(async () => {
    didFetchRef.current = false;
    await fetchAllData();
  }, [fetchAllData]);

  // ============ CONTEXT VALUE ============

  const loading = preferencesLoading || coreDataLoading;

  const contextValue = useMemo<AppDataContextType>(() => ({
    preferences,
    pillars,
    visions,
    goals,
    pillarsMap,
    visionsMap,
    goalsMap,
    loading,
    preferencesLoading,
    refetchPreferences,
    refetchPillars,
    refetchVisions,
    refetchGoals,
    refetchAll,
  }), [
    preferences,
    pillars,
    visions,
    goals,
    pillarsMap,
    visionsMap,
    goalsMap,
    loading,
    preferencesLoading,
    refetchPreferences,
    refetchPillars,
    refetchVisions,
    refetchGoals,
    refetchAll,
  ]);

  return (
    <AppDataContext.Provider value={contextValue}>
      {children}
    </AppDataContext.Provider>
  );
}

// ============ HOOKS ============

/**
 * Main hook to access all app data
 */
export function useAppData() {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    throw new Error("useAppData must be used within an AppDataProvider");
  }
  return context;
}

/**
 * User preferences selector (backwards compatible with useUserPreferences)
 */
export function usePreferences() {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    return {
      preferences: DEFAULT_PREFERENCES,
      loading: false,
      refetch: async () => {},
    };
  }
  return {
    preferences: context.preferences,
    loading: context.preferencesLoading,
    refetch: context.refetchPreferences,
  };
}

/**
 * Goals selector (backwards compatible with useGoals)
 */
export function useGoalsData() {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    return {
      goals: [],
      goalsMap: new Map(),
      loading: false,
      refetch: async () => {},
    };
  }
  return {
    goals: context.goals,
    goalsMap: context.goalsMap,
    loading: context.loading,
    refetch: context.refetchGoals,
  };
}

/**
 * Visions selector
 */
export function useVisionsData() {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    return {
      visions: [],
      visionsMap: new Map(),
      loading: false,
      refetch: async () => {},
    };
  }
  return {
    visions: context.visions,
    visionsMap: context.visionsMap,
    loading: context.loading,
    refetch: context.refetchVisions,
  };
}

/**
 * Pillars selector
 */
export function usePillarsData() {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    return {
      pillars: [],
      pillarsMap: new Map(),
      loading: false,
      refetch: async () => {},
    };
  }
  return {
    pillars: context.pillars,
    pillarsMap: context.pillarsMap,
    loading: context.loading,
    refetch: context.refetchPillars,
  };
}

// ============ HELPER ============

export function getWeekStartsOn(startOfWeek: "sunday" | "monday"): 0 | 1 {
  return startOfWeek === "sunday" ? 0 : 1;
}
