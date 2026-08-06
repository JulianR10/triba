export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          role: "free" | "subscriber" | "admin";
          subscription_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: "free" | "subscriber" | "admin";
          subscription_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: "free" | "subscriber" | "admin";
          subscription_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          provider: "stripe" | "mercadopago" | "migrated";
          provider_subscription_id: string;
          status: "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "migrated";
          plan_currency: "EUR" | "USD" | "ARS";
          current_period_start: string | null;
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
          canceled_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: "stripe" | "mercadopago" | "migrated";
          provider_subscription_id: string;
          status?: "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "migrated";
          plan_currency: "EUR" | "USD" | "ARS";
          current_period_start?: string | null;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
          canceled_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: "stripe" | "mercadopago" | "migrated";
          provider_subscription_id?: string;
          status?: "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "migrated";
          plan_currency?: "EUR" | "USD" | "ARS";
          current_period_start?: string | null;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
          canceled_at?: string | null;
        };
        Relationships: [];
      };
      editions: {
        Row: {
          id: number;
          edition_number: number;
          title: string;
          description: string;
          cover_url: string;
          pdf_url: string | null;
          featured: boolean;
          badge: string | null;
          published_at: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          edition_number: number;
          title: string;
          description: string;
          cover_url: string;
          pdf_url?: string | null;
          featured?: boolean;
          badge?: string | null;
          published_at?: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          edition_number?: number;
          title?: string;
          description?: string;
          cover_url?: string;
          pdf_url?: string | null;
          featured?: boolean;
          badge?: string | null;
          published_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      edition_pages: {
        Row: {
          id: number;
          edition_id: number;
          page_number: number;
          image_url: string;
          alt_text: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          edition_id: number;
          page_number: number;
          image_url: string;
          alt_text: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          edition_id?: number;
          page_number?: number;
          image_url?: string;
          alt_text?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      newsletters: {
        Row: {
          id: string;
          email: string;
          subscribed_at: string;
          sender_synced: boolean;
          sender_synced_at: string | null;
          sender_sync_error: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          subscribed_at?: string;
          sender_synced?: boolean;
          sender_synced_at?: string | null;
          sender_sync_error?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          subscribed_at?: string;
          sender_synced?: boolean;
          sender_synced_at?: string | null;
          sender_sync_error?: string | null;
        };
        Relationships: [];
      };
      creator_applications: {
        Row: {
          id: string;
          nombre: string;
          email: string;
          pais: string;
          areas: string[];
          propuesta: string;
          trabajo_url: string | null;
          status: "pending" | "approved" | "rejected";
          admin_notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          email: string;
          pais: string;
          areas?: string[];
          propuesta: string;
          trabajo_url?: string | null;
          status?: "pending" | "approved" | "rejected";
          admin_notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          email?: string;
          pais?: string;
          areas?: string[];
          propuesta?: string;
          trabajo_url?: string | null;
          status?: "pending" | "approved" | "rejected";
          admin_notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      feedback: {
        Row: {
          id: string;
          user_id: string | null;
          mensaje: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          mensaje: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          mensaje?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      admin_audit_log: {
        Row: {
          id: string;
          admin_id: string;
          admin_email: string;
          action: string;
          entity_type: string;
          entity_id: string | null;
          details: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          admin_email: string;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          details?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          admin_email?: string;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          details?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          id: number;
          ip: string;
          endpoint: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          ip: string;
          endpoint: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          ip?: string;
          endpoint?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      subscriber_migrations: {
        Row: {
          id: string;
          email: string;
          old_subscription_data: Json | null;
          stripe_subscription_id: string | null;
          stripe_customer_id: string | null;
          mp_preapproval_id: string | null;
          mp_plan_currency: string | null;
          migrated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          old_subscription_data?: Json | null;
          stripe_subscription_id?: string | null;
          stripe_customer_id?: string | null;
          mp_preapproval_id?: string | null;
          mp_plan_currency?: string | null;
          migrated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          old_subscription_data?: Json | null;
          stripe_subscription_id?: string | null;
          stripe_customer_id?: string | null;
          mp_preapproval_id?: string | null;
          mp_plan_currency?: string | null;
          migrated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      cancel_subscription: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      cleanup_rate_limits: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}