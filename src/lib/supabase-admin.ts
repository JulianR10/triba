import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || "";
const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
