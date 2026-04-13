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
      clients: {
        Row: {
          cnpj: string
          competencia_inicio: string
          created_at: string
          created_by: string
          id: string
          obrigatoriedade_ecd: boolean
          perfil: string
          razao_social: string
          tributacao: string
          unidade: string
          updated_at: string
        }
        Insert: {
          cnpj: string
          competencia_inicio: string
          created_at?: string
          created_by: string
          id?: string
          obrigatoriedade_ecd?: boolean
          perfil?: string
          razao_social: string
          tributacao?: string
          unidade?: string
          updated_at?: string
        }
        Update: {
          cnpj?: string
          competencia_inicio?: string
          created_at?: string
          created_by?: string
          id?: string
          obrigatoriedade_ecd?: boolean
          perfil?: string
          razao_social?: string
          tributacao?: string
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      demand_status_entries: {
        Row: {
          client_name: string
          created_at: string
          demand_type: string
          filled_by: string
          id: string
          month: string
          status: string
          updated_at: string
          year: string
        }
        Insert: {
          client_name: string
          created_at?: string
          demand_type: string
          filled_by: string
          id?: string
          month: string
          status?: string
          updated_at?: string
          year: string
        }
        Update: {
          client_name?: string
          created_at?: string
          demand_type?: string
          filled_by?: string
          id?: string
          month?: string
          status?: string
          updated_at?: string
          year?: string
        }
        Relationships: []
      }
      demands: {
        Row: {
          assignee: string
          client: string
          client_deadline: string
          competencias: string[]
          complexity: string
          created_at: string
          created_by: string
          description: string
          id: string
          internal_deadline: string
          is_legacy: boolean
          notes: string
          priority: string
          status: string
          time_spent_minutes: number
          types: string[]
          updated_at: string
          weight: number
        }
        Insert: {
          assignee: string
          client: string
          client_deadline: string
          competencias: string[]
          complexity?: string
          created_at?: string
          created_by: string
          description?: string
          id?: string
          internal_deadline: string
          is_legacy?: boolean
          notes?: string
          priority?: string
          status?: string
          time_spent_minutes?: number
          types: string[]
          updated_at?: string
          weight?: number
        }
        Update: {
          assignee?: string
          client?: string
          client_deadline?: string
          competencias?: string[]
          complexity?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          internal_deadline?: string
          is_legacy?: boolean
          notes?: string
          priority?: string
          status?: string
          time_spent_minutes?: number
          types?: string[]
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      plannings: {
        Row: {
          assignee: string
          client: string
          competencias: string[]
          created_at: string
          created_by: string
          description: string
          id: string
          internal_deadline: string
          notes: string
          priority: string
          status: string
          types: string[]
          updated_at: string
        }
        Insert: {
          assignee: string
          client: string
          competencias: string[]
          created_at?: string
          created_by: string
          description?: string
          id?: string
          internal_deadline: string
          notes?: string
          priority?: string
          status?: string
          types: string[]
          updated_at?: string
        }
        Update: {
          assignee?: string
          client?: string
          competencias?: string[]
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          internal_deadline?: string
          notes?: string
          priority?: string
          status?: string
          types?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
