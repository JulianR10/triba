import type { APIRoute } from "astro";
import { supabase } from "../../lib/supabase";

/** Called from PayPal JS SDK after buyer approves */
export const POST: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: { orderId: string; currency: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
  }

  return new Response(
    JSON.stringify({
      note: "Payment captured server-side via PayPal webhook. Subscription will be activated once webhook confirms.",
      orderId: body.orderId,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
