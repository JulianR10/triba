export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          role: "free" | "subscriber" | "admin";
          preferred_locale: "es" | "en";
          subscription_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: "free" | "subscriber" | "admin";
          preferred_locale?: "es" | "en";
          subscription_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: "free" | "subscriber" | "admin";
          preferred_locale?: "es" | "en";
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
          plan_type: "digital" | "mail_club";
          current_period_start: string | null;
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
          canceled_at: string | null;
          cancel_at_period_end: boolean;
          scheduled_plan_type: "digital" | "mail_club" | null;
          scheduled_plan_at: string | null;
          welcome_sent_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: "stripe" | "mercadopago" | "migrated";
          provider_subscription_id: string;
          status?: "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "migrated";
          plan_currency: "EUR" | "USD" | "ARS";
          plan_type?: "digital" | "mail_club";
          current_period_start?: string | null;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
          canceled_at?: string | null;
          cancel_at_period_end?: boolean;
          scheduled_plan_type?: "digital" | "mail_club" | null;
          scheduled_plan_at?: string | null;
          welcome_sent_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: "stripe" | "mercadopago" | "migrated";
          provider_subscription_id?: string;
          status?: "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "migrated";
          plan_currency?: "EUR" | "USD" | "ARS";
          plan_type?: "digital" | "mail_club";
          current_period_start?: string | null;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
          canceled_at?: string | null;
          cancel_at_period_end?: boolean;
          scheduled_plan_type?: "digital" | "mail_club" | null;
          scheduled_plan_at?: string | null;
          welcome_sent_at?: string | null;
        };
        Relationships: [];
      };
      editions: {
        Row: {
          id: number;
          edition_number: number | null;
          featured: boolean;
          kind: "magazine" | "free";
          published_at: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          edition_number?: number | null;
          featured?: boolean;
          kind?: "magazine" | "free";
          published_at?: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          edition_number?: number | null;
          featured?: boolean;
          kind?: "magazine" | "free";
          published_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      edition_languages: {
        Row: {
          id: number;
          edition_id: number;
          language: "es" | "en";
          title: string;
          description: string;
          cover_url: string | null;
          pdf_url: string | null;
          badge: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          edition_id: number;
          language: "es" | "en";
          title: string;
          description?: string;
          cover_url?: string | null;
          pdf_url?: string | null;
          badge?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          edition_id?: number;
          language?: "es" | "en";
          title?: string;
          description?: string;
          cover_url?: string | null;
          pdf_url?: string | null;
          badge?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "edition_languages_edition_id_fkey";
            columns: ["edition_id"];
            isOneToOne: false;
            referencedRelation: "editions";
            referencedColumns: ["id"];
          }
        ];
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
      mailing_addresses: {
        Row: {
          id: string;
          user_id: string;
          recipient_name: string;
          country_iso: string;
          region: string;
          city: string;
          postal_code: string;
          street_address: string;
          address_extra: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          recipient_name: string;
          country_iso: string;
          region?: string;
          city?: string;
          postal_code?: string;
          street_address?: string;
          address_extra?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          recipient_name?: string;
          country_iso?: string;
          region?: string;
          city?: string;
          postal_code?: string;
          street_address?: string;
          address_extra?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      mail_club_consents: {
        Row: {
          id: string;
          user_id: string;
          terms_version: string;
          accepted_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          terms_version: string;
          accepted_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          terms_version?: string;
          accepted_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      mail_club_upgrades: {
        Row: {
          id: string;
          user_id: string;
          from_plan: string;
          to_plan: string;
          plan_currency: "EUR" | "USD" | "ARS";
          amount_cents: number;
          provider: "stripe" | "mercadopago";
          provider_payment_ref: string | null;
          status: "pending" | "payment_confirmed" | "recurrence_updated" | "failed";
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          from_plan?: string;
          to_plan?: string;
          plan_currency: "EUR" | "USD" | "ARS";
          amount_cents: number;
          provider: "stripe" | "mercadopago";
          provider_payment_ref?: string | null;
          status?: "pending" | "payment_confirmed" | "recurrence_updated" | "failed";
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          from_plan?: string;
          to_plan?: string;
          plan_currency?: "EUR" | "USD" | "ARS";
          amount_cents?: number;
          provider?: "stripe" | "mercadopago";
          provider_payment_ref?: string | null;
          status?: "pending" | "payment_confirmed" | "recurrence_updated" | "failed";
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      mail_club_founders: {
        Row: {
          user_id: string;
          founder_number: number;
          first_confirmed_at: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          founder_number: number;
          first_confirmed_at?: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          founder_number?: number;
          first_confirmed_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      mail_club_batches: {
        Row: {
          id: string;
          period_year: number;
          period_month: number;
          cutoff_at: string;
          dispatched_at: string | null;
          status: "open" | "closed" | "dispatched";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          period_year: number;
          period_month: number;
          cutoff_at: string;
          dispatched_at?: string | null;
          status?: "open" | "closed" | "dispatched";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          period_year?: number;
          period_month?: number;
          cutoff_at?: string;
          dispatched_at?: string | null;
          status?: "open" | "closed" | "dispatched";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      mail_club_batch_items: {
        Row: {
          id: string;
          batch_id: string;
          user_id: string;
          subscription_id: string | null;
          address_snapshot: Json;
          email: string;
          zone: string;
          plan_currency: "EUR" | "USD" | "ARS";
          founder_number: number | null;
          status: "included" | "dispatched" | "failed" | "refunded";
          notice_sent: boolean;
          joined_at: string | null;
          sub_status: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          batch_id: string;
          user_id: string;
          subscription_id?: string | null;
          address_snapshot: Json;
          email?: string;
          zone?: string;
          plan_currency?: "EUR" | "USD" | "ARS";
          founder_number?: number | null;
          status?: "included" | "dispatched" | "failed" | "refunded";
          notice_sent?: boolean;
          joined_at?: string | null;
          sub_status?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          batch_id?: string;
          user_id?: string;
          subscription_id?: string | null;
          address_snapshot?: Json;
          email?: string;
          zone?: string;
          plan_currency?: "EUR" | "USD" | "ARS";
          founder_number?: number | null;
          status?: "included" | "dispatched" | "failed" | "refunded";
          notice_sent?: boolean;
          joined_at?: string | null;
          sub_status?: string | null;
          created_at?: string;
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
        Returns: number;
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