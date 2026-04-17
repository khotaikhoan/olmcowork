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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          args: Json | null
          conversation_id: string | null
          created_at: string
          id: string
          message_id: string | null
          output: string | null
          risk: string
          status: string
          tool_name: string
          user_id: string
        }
        Insert: {
          args?: Json | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          output?: string | null
          risk?: string
          status?: string
          tool_name: string
          user_id: string
        }
        Update: {
          args?: Json | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          output?: string | null
          risk?: string
          status?: string
          tool_name?: string
          user_id?: string
        }
        Relationships: []
      }
      approved_plans: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          model: string | null
          prompt: string
          provider: string | null
          step_count: number
          steps: Json
          user_id: string
          was_early_start: boolean
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          prompt: string
          provider?: string | null
          step_count?: number
          steps?: Json
          user_id: string
          was_early_start?: boolean
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          prompt?: string
          provider?: string | null
          step_count?: number
          steps?: Json
          user_id?: string
          was_early_start?: boolean
        }
        Relationships: []
      }
      conversations: {
        Row: {
          branch_of_message_id: string | null
          created_at: string
          id: string
          mode: Database["public"]["Enums"]["conversation_mode"]
          model: string | null
          system_prompt: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_of_message_id?: string | null
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["conversation_mode"]
          model?: string | null
          system_prompt?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_of_message_id?: string | null
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["conversation_mode"]
          model?: string | null
          system_prompt?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          job_id: string
          output: string | null
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          job_id: string
          output?: string | null
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          job_id?: string
          output?: string | null
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "scheduled_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          tool_calls: Json | null
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tool_calls?: Json | null
          user_id: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tool_calls?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_jobs: {
        Row: {
          created_at: string
          cron: string
          enabled: boolean
          id: string
          job_type: Database["public"]["Enums"]["job_type"]
          last_run_at: string | null
          model: string | null
          name: string
          next_run_at: string | null
          prompt: string
          tools_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cron: string
          enabled?: boolean
          id?: string
          job_type?: Database["public"]["Enums"]["job_type"]
          last_run_at?: string | null
          model?: string | null
          name: string
          next_run_at?: string | null
          prompt: string
          tools_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cron?: string
          enabled?: boolean
          id?: string
          job_type?: Database["public"]["Enums"]["job_type"]
          last_run_at?: string | null
          model?: string | null
          name?: string
          next_run_at?: string | null
          prompt?: string
          tools_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_memories: {
        Row: {
          created_at: string
          fact: string
          id: string
          importance: number
          source_conversation_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fact: string
          id?: string
          importance?: number
          source_conversation_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fact?: string
          id?: string
          importance?: number
          source_conversation_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          allowed_paths: Json
          auto_start: boolean
          auto_stop_minutes: number
          default_model: string | null
          ollama_url: string
          require_confirm: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_paths?: Json
          auto_start?: boolean
          auto_stop_minutes?: number
          default_model?: string | null
          ollama_url?: string
          require_confirm?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_paths?: Json
          auto_start?: boolean
          auto_stop_minutes?: number
          default_model?: string | null
          ollama_url?: string
          require_confirm?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      conversation_mode: "chat" | "control"
      job_type: "local" | "cloud"
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
      conversation_mode: ["chat", "control"],
      job_type: ["local", "cloud"],
    },
  },
} as const
