import { supabaseAdmin } from "./supabase-admin";

// Un pago nunca degrada a una admin: el rol de acceso solo se concede a
// perfiles que no sean admin (requireAdmin exige role === "admin").
export async function roleAfterPayment(userId: string): Promise<"admin" | "subscriber"> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return data?.role === "admin" ? "admin" : "subscriber";
}
