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
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          provider: "stripe" | "mercadopago" | "paypal";
          provider_subscription_id: string;
          status: "active" | "canceled" | "past_due" | "trialing" | "incomplete";
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
          provider: "stripe" | "mercadopago" | "paypal";
          provider_subscription_id: string;
          status?: "active" | "canceled" | "past_due" | "trialing" | "incomplete";
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
          provider?: "stripe" | "mercadopago" | "paypal";
          provider_subscription_id?: string;
          status?: "active" | "canceled" | "past_due" | "trialing" | "incomplete";
          plan_currency?: "EUR" | "USD" | "ARS";
          current_period_start?: string | null;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
          canceled_at?: string | null;
        };
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
      };
      newsletters: {
        Row: {
          id: string;
          email: string;
          subscribed_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          subscribed_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          subscribed_at?: string;
        };
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
      };
    };
    Functions: {
      cancel_subscription: {
        Args: { p_user_id: string };
        Returns: void;
      };
    };
  };
}
