/* User Preferences Hook - v3 - Fixed import path */
import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * User preferences hook - provides access to user settings throughout the app
 * Handles fetching, caching, and defaults for user preferences
 */

export interface UserPreferences {
  startOfWeek: "sunday" | "monday";
  timeFormat: "12h" | "24h";
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
}

const DEFAULT_PREFERENCES: UserPreferences = {
  startOfWeek: "monday",
  timeFormat: "24h",
  dateFormat: "YYYY-MM-DD",
};

interface UserPreferencesContextType {
  preferences: UserPreferences;
  loading: boolean;
  refetch: () => Promise<void>;
}

const UserPreferencesContext = createContext<UserPreferencesContextType | undefined>(undefined);

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  const fetchPreferences = useCallback(async () => {
    // No user - use defaults
    if (!user) {
      setPreferences(DEFAULT_PREFERENCES);
      setLoading(false);
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
      setLoading(false);
    }
  }, [user]);

  // When auth finishes loading, fetch preferences
  useEffect(() => {
    if (!authLoading) {
      fetchPreferences();
    }
  }, [authLoading, fetchPreferences]);

  // Timeout fallback - ensure we never get stuck loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, [loading]);

  return (
    <UserPreferencesContext.Provider value={{ preferences, loading, refetch: fetchPreferences }}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext);
  if (context === undefined) {
    // Return defaults if used outside provider (fallback)
    return {
      preferences: DEFAULT_PREFERENCES,
      loading: false,
      refetch: async () => {},
    };
  }
  return context;
}

// Helper: Get weekStartsOn value for date-fns (0 = Sunday, 1 = Monday)
export function getWeekStartsOn(startOfWeek: "sunday" | "monday"): 0 | 1 {
  return startOfWeek === "sunday" ? 0 : 1;
}
