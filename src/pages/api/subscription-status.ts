import type { APIRoute } from "astro";
import { requireUser } from "../../lib/auth";
import { ok, error } from "../../lib/response";
import { supabaseAdmin } from "../../lib/supabase-admin";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireUser(request, { useAdmin: true });
  if (auth instanceof Response) return auth;
  const user = auth.user;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role, subscription_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return ok({ role: "free", subscription: null });
  }

  let subscription = null;
  if (profile.subscription_id) {
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("status, provider, plan_currency, current_period_end, current_period_start")
      .eq("id", profile.subscription_id)
      .single();
    subscription = sub;
  }

  return ok({
    role: profile.role,
    email: profile.email,
    subscription,
  });
};
