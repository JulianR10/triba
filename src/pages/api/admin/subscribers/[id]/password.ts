import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../lib/auth";
import { ok, error } from "../../../../../lib/response";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { logAdminAction } from "../../../../../lib/admin/audit";
import { logger } from "../../../../../lib/logger";
import { enforceRateLimit } from "../../../../../lib/rate-limit";

export const prerender = false;

const MIN_LENGTH = 8;
// bcrypt (Supabase Auth) ignora/rechaza lo que pasa de 72 bytes.
const MAX_LENGTH = 72;

// Soporte: una admin define una contraseña nueva cuando la usuaria no puede
// entrar. Nunca se loguea ni se audita la contraseña. No se permite sobre
// otras admins (evita toma de cuenta entre admins).
export const POST: APIRoute = async ({ params, locals, request }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;
  const limited = await enforceRateLimit(request, "admin-set-password", {
    maxRequests: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const id = params.id;
  if (!id) return error("ID inválido", 400);

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < MIN_LENGTH) {
    return error(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`, 400);
  }
  if (new TextEncoder().encode(password).length > MAX_LENGTH) {
    return error(`La contraseña no puede superar ${MAX_LENGTH} caracteres.`, 400);
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role")
    .eq("id", id)
    .maybeSingle();
  if (!profile) return error("Usuaria no encontrada", 404);
  if (profile.role === "admin" && profile.id !== admin.user.id) {
    return error("No se puede cambiar la contraseña de otra administradora.", 403);
  }

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(profile.id, { password });
  if (updateErr) {
    logger.error({ err: updateErr, targetUserId: profile.id }, "admin set password error");
    return error("No se pudo cambiar la contraseña. Intentá de nuevo.", 500);
  }

  logAdminAction(admin.user.id, admin.profile.email, "subscriber.password_set", "subscriber", profile.id, {
    target_email: profile.email,
  });

  return ok({ message: "Contraseña actualizada. Pasásela a la usuaria por un canal seguro." });
};
