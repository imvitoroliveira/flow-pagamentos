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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      campaigns: {
        Row: {
          created_at: string
          destination_whatsapp: string | null
          id: string
          meta_pixel_id: string | null
          name: string
          prefilled_message: string | null
          seller_id: string | null
          slug: string
          tiktok_pixel_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          created_at?: string
          destination_whatsapp?: string | null
          id?: string
          meta_pixel_id?: string | null
          name: string
          prefilled_message?: string | null
          seller_id?: string | null
          slug: string
          tiktok_pixel_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          created_at?: string
          destination_whatsapp?: string | null
          id?: string
          meta_pixel_id?: string | null
          name?: string
          prefilled_message?: string | null
          seller_id?: string | null
          slug?: string
          tiktok_pixel_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      clicks: {
        Row: {
          campaign_id: string | null
          created_at: string
          fbc: string | null
          fbclid: string | null
          fbp: string | null
          id: string
          ip_hash: string | null
          ref_code: string
          state: string | null
          ttclid: string | null
          user_agent: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          id?: string
          ip_hash?: string | null
          ref_code: string
          state?: string | null
          ttclid?: string | null
          user_agent?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          id?: string
          ip_hash?: string | null
          ref_code?: string
          state?: string | null
          ttclid?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clicks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          order_id: string | null
          ref_code: string | null
          session_id: string | null
          type: Database["public"]["Enums"]["event_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          order_id?: string | null
          ref_code?: string | null
          session_id?: string | null
          type: Database["public"]["Enums"]["event_type"]
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          order_id?: string | null
          ref_code?: string | null
          session_id?: string | null
          type?: Database["public"]["Enums"]["event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_log: {
        Row: {
          channel: string
          created_at: string
          id: string
          order_id: string | null
          status: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          order_id?: string | null
          status: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          order_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          abacate_id: string | null
          amount_cents: number
          campaign_id: string | null
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          event_id: string | null
          id: string
          paid_at: string | null
          panel_username: string
          pix_brcode: string | null
          pix_qr_base64: string | null
          plan_id: string
          ref_code: string | null
          renewal_error: string | null
          renewed_at: string | null
          seller_id: string | null
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          abacate_id?: string | null
          amount_cents: number
          campaign_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          event_id?: string | null
          id?: string
          paid_at?: string | null
          panel_username: string
          pix_brcode?: string | null
          pix_qr_base64?: string | null
          plan_id: string
          ref_code?: string | null
          renewal_error?: string | null
          renewed_at?: string | null
          seller_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          abacate_id?: string | null
          amount_cents?: number
          campaign_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          event_id?: string | null
          id?: string
          paid_at?: string | null
          panel_username?: string
          pix_brcode?: string | null
          pix_qr_base64?: string | null
          plan_id?: string
          ref_code?: string | null
          renewal_error?: string | null
          renewed_at?: string | null
          seller_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "orders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          id: string
          months: number
          name: string
          price_cents: number
          slug: string
        }
        Insert: {
          active?: boolean
          id?: string
          months: number
          name: string
          price_cents: number
          slug: string
        }
        Update: {
          active?: boolean
          id?: string
          months?: number
          name?: string
          price_cents?: number
          slug?: string
        }
        Relationships: []
      }
      renewal_retries: {
        Row: {
          attempt: number
          created_at: string
          id: string
          last_error: string | null
          order_id: string
          run_at: string
          status: string
        }
        Insert: {
          attempt: number
          created_at?: string
          id?: string
          last_error?: string | null
          order_id: string
          run_at: string
          status?: string
        }
        Update: {
          attempt?: number
          created_at?: string
          id?: string
          last_error?: string | null
          order_id?: string
          run_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_retries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          active: boolean
          id: string
          name: string
          telegram_chat_id: string | null
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          telegram_chat_id?: string | null
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          telegram_chat_id?: string | null
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
      webhook_logs: {
        Row: {
          created_at: string
          error: string | null
          event: string | null
          id: string
          payload: Json | null
          processed: boolean
          provider: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event?: string | null
          id?: string
          payload?: Json | null
          processed?: boolean
          provider: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event?: string | null
          id?: string
          payload?: Json | null
          processed?: boolean
          provider?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      arm_renewal_retries: { Args: never; Returns: undefined }
      disarm_renewal_retries: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin"
      event_type:
        | "page_view"
        | "checkout_started"
        | "pix_generated"
        | "paid"
        | "renewed"
      order_status:
        | "pending"
        | "paid"
        | "renewed"
        | "renewal_failed"
        | "expired"
        | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin"],
      event_type: [
        "page_view",
        "checkout_started",
        "pix_generated",
        "paid",
        "renewed",
      ],
      order_status: [
        "pending",
        "paid",
        "renewed",
        "renewal_failed",
        "expired",
        "cancelled",
      ],
    },
  },
} as const
