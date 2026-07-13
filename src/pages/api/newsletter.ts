import type { APIRoute } from "astro";
import { supabase } from "../../lib/supabase";

export const POST: APIRoute = async ({ request }) => {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ ok: false, error: "Email requerido" }), { status: 400 });
    }

    const { error } = await supabase.from("newsletters").insert({ email });

    if (error) {
      if (error.code === "23505") {
        return new Response(JSON.stringify({ ok: false, existing: true }), { status: 200 });
      }
      throw error;
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("Newsletter error:", err);
    return new Response(JSON.stringify({ ok: false, error: "Error interno" }), { status: 500 });
  }
};
