import { supabaseAdmin } from "./supabase-admin";
import { nextFounderNumber } from "./mail-club";
import { logger } from "./logger";

// Asigna el siguiente número consecutivo al confirmarse el primer pago Mail Club.
// No hay tope: al superar el 100 continúa 101, 102, etc. Idempotente: si la
// usuaria ya tiene número, lo devuelve.
// Ante webhooks concurrentes, reintenta si otro proceso tomó el número.
export async function assignFounderNumber(userId: string): Promise<number | null> {
  const { data: existing } = await supabaseAdmin
    .from("mail_club_founders")
    .select("founder_number")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return existing.founder_number as number;

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: maxRow } = await supabaseAdmin
      .from("mail_club_founders")
      .select("founder_number")
      .order("founder_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = nextFounderNumber(maxRow?.founder_number as number | undefined);

    const { error } = await supabaseAdmin.from("mail_club_founders").insert({
      user_id: userId,
      founder_number: next,
    });
    if (!error) return next;
    // 23505 = otro proceso tomó ese número (o la usuaria ya tiene fila):
    // releer y reintentar una vez más.
    if (error.code !== "23505") {
      logger.error({ err: error, userId }, "assignFounderNumber insert error");
      return null;
    }
    const { data: retry } = await supabaseAdmin
      .from("mail_club_founders")
      .select("founder_number")
      .eq("user_id", userId)
      .maybeSingle();
    if (retry) return retry.founder_number as number;
  }
  return null;
}
