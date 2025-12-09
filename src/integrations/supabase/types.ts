export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      commitment_completions: {
        Row: {
          commitment_id: string | null
          completed_date: string
          created_at: string | null
          deleted_at: string | null
          id: string
          instance_number: number | null
          is_deleted: boolean | null
          is_detached: boolean | null
          is_flexible_time: boolean | null
          task_type: string | null
          time_end: string | null
          time_start: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          commitment_id?: string | null
          completed_date?: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          instance_number?: number | null
          is_deleted?: boolean | null
          is_detached?: boolean | null
          is_flexible_time?: boolean | null
          task_type?: string | null
          time_end?: string | null
          time_start?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          commitment_id?: string | null
          completed_date?: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          instance_number?: number | null
          is_deleted?: boolean | null
          is_detached?: boolean | null
          is_flexible_time?: boolean | null
          task_type?: string | null
          time_end?: string | null
          time_start?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitment_completions_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "weekly_commitments"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_task_instances: {
        Row: {
          completion_id: string
          created_at: string
          id: string
          is_completed: boolean | null
          time_end: string | null
          time_start: string | null
          user_id: string
        }
        Insert: {
          completion_id: string
          created_at?: string
          id?: string
          is_completed?: boolean | null
          time_end?: string | null
          time_start?: string | null
          user_id: string
        }
        Update: {
          completion_id?: string
          created_at?: string
          id?: string
          is_completed?: boolean | null
          time_end?: string | null
          time_start?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_task_instances_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "commitment_completions"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          description: string | null
          goal_type: Database["public"]["Enums"]["goal_type"]
          id: string
          is_deleted: boolean | null
          is_focus: boolean
          life_vision_id: string | null
          parent_goal_id: string | null
          pillar_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["goal_status"] | null
          target_date: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          goal_type: Database["public"]["Enums"]["goal_type"]
          id?: string
          is_deleted?: boolean | null
          is_focus?: boolean
          life_vision_id?: string | null
          parent_goal_id?: string | null
          pillar_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["goal_status"] | null
          target_date?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          goal_type?: Database["public"]["Enums"]["goal_type"]
          id?: string
          is_deleted?: boolean | null
          is_focus?: boolean
          life_vision_id?: string | null
          parent_goal_id?: string | null
          pillar_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["goal_status"] | null
          target_date?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_life_vision_id_fkey"
            columns: ["life_vision_id"]
            isOneToOne: false
            referencedRelation: "life_visions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_parent_goal_id_fkey"
            columns: ["parent_goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_pillar_id_fkey"
            columns: ["pillar_id"]
            isOneToOne: false
            referencedRelation: "pillars"
            referencedColumns: ["id"]
          },
        ]
      }
      life_visions: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_deleted: boolean | null
          is_focus: boolean
          pillar_id: string
          status: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean | null
          is_focus?: boolean
          pillar_id: string
          status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean | null
          is_focus?: boolean
          pillar_id?: string
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "life_visions_pillar_id_fkey"
            columns: ["pillar_id"]
            isOneToOne: false
            referencedRelation: "pillars"
            referencedColumns: ["id"]
          },
        ]
      }
      pillars: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          sort_order: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          sort_order?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string
          onboarding_completed: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id: string
          onboarding_completed?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          onboarding_completed?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      weekly_checkins: {
        Row: {
          actual_count: number
          created_at: string
          id: string
          notes: string | null
          period_end_date: string
          period_start_date: string
          planned_count: number
          updated_at: string
          user_id: string
          weekly_commitment_id: string
        }
        Insert: {
          actual_count?: number
          created_at?: string
          id?: string
          notes?: string | null
          period_end_date: string
          period_start_date: string
          planned_count?: number
          updated_at?: string
          user_id: string
          weekly_commitment_id: string
        }
        Update: {
          actual_count?: number
          created_at?: string
          id?: string
          notes?: string | null
          period_end_date?: string
          period_start_date?: string
          planned_count?: number
          updated_at?: string
          user_id?: string
          weekly_commitment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_checkins_weekly_commitment_id_fkey"
            columns: ["weekly_commitment_id"]
            isOneToOne: false
            referencedRelation: "weekly_commitments"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_commitments: {
        Row: {
          commitment_type: Database["public"]["Enums"]["commitment_type"]
          created_at: string | null
          default_time_end: string | null
          default_time_start: string | null
          deleted_at: string | null
          flexible_time: boolean | null
          frequency_json: Json | null
          goal_id: string | null
          id: string
          is_active: boolean | null
          is_deleted: boolean | null
          recurrence_type: string | null
          repeat_days_of_week: string[] | null
          repeat_frequency: string | null
          repeat_times_per_period: number | null
          task_type: string | null
          times_per_day: number | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          commitment_type?: Database["public"]["Enums"]["commitment_type"]
          created_at?: string | null
          default_time_end?: string | null
          default_time_start?: string | null
          deleted_at?: string | null
          flexible_time?: boolean | null
          frequency_json?: Json | null
          goal_id?: string | null
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean | null
          recurrence_type?: string | null
          repeat_days_of_week?: string[] | null
          repeat_frequency?: string | null
          repeat_times_per_period?: number | null
          task_type?: string | null
          times_per_day?: number | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          commitment_type?: Database["public"]["Enums"]["commitment_type"]
          created_at?: string | null
          default_time_end?: string | null
          default_time_start?: string | null
          deleted_at?: string | null
          flexible_time?: boolean | null
          frequency_json?: Json | null
          goal_id?: string | null
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean | null
          recurrence_type?: string | null
          repeat_days_of_week?: string[] | null
          repeat_frequency?: string | null
          repeat_times_per_period?: number | null
          task_type?: string | null
          times_per_day?: number | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_commitments_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      commitment_type: "habit" | "task"
      goal_status:
        | "not_started"
        | "in_progress"
        | "completed"
        | "paused"
        | "active"
        | "archived"
      goal_type: "three_year" | "one_year" | "ninety_day"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      commitment_type: ["habit", "task"],
      goal_status: [
        "not_started",
        "in_progress",
        "completed",
        "paused",
        "active",
        "archived",
      ],
      goal_type: ["three_year", "one_year", "ninety_day"],
    },
  },
} as const
