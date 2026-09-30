import { supabaseAdmin } from "./supabase-admin";
import { MAIL_CLUB_FOUNDER_LIMIT } from "./mail-club";
import { logger } from "./logger";

// Asigna el número de socia fundadora (1..100) al confirmarse el primer pago
// Mail Club. Idempotente: si la usuaria ya tiene número, lo devuelve.
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
    const next = ((maxRow?.founder_number as number | undefined) ?? 0) + 1;
    if (next > MAIL_CLUB_FOUNDER_LIMIT) return null;

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
