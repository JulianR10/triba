/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    supabase: ReturnType<typeof import("./lib/supabase-server").createSupabaseServerClient>;
    user: import("@supabase/supabase-js").User | null;
    profile: import("./lib/types").Profile | null;
  }
}
