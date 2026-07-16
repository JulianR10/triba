import type { APIRoute } from "astro";
import { supabase } from "../../lib/supabase";
import { supabaseAdmin } from "../../lib/supabase-admin";

const RATE_LIMIT_MS = 60_000;
const MAX_MESSAGE_LENGTH = 2000;

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

  let body: { mensaje?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
  }

  const mensaje = typeof body.mensaje === "string" ? body.mensaje.trim() : "";
  if (!mensaje) {
    return new Response(JSON.stringify({ error: "El mensaje no puede estar vacío" }), { status: 400 });
  }
  if (mensaje.length > MAX_MESSAGE_LENGTH) {
    return new Response(JSON.stringify({ error: "El mensaje es demasiado largo" }), { status: 400 });
  }

  try {
    const { data: lastFeedback } = await supabaseAdmin
      .from("feedback")
      .select("created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastFeedback?.created_at) {
      const last = new Date(lastFeedback.created_at).getTime();
      if (Number.isFinite(last) && Date.now() - last < RATE_LIMIT_MS) {
        return new Response(
          JSON.stringify({ error: "Esperá un momento antes de enviar otro feedback" }),
          { status: 429 }
        );
      }
    }

    const { error: insertError } = await supabaseAdmin.from("feedback").insert({
      user_id: user.id,
      mensaje,
    });

    if (insertError) {
      console.error("feedback insert error:", insertError);
      return new Response(JSON.stringify({ error: "No se pudo guardar el feedback" }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("feedback error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
};
