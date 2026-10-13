import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { error, ok } from "../../../../lib/response";
import { logger } from "../../../../lib/logger";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { removeStoragePaths } from "../../../../lib/storage";
import {
  isAllowedUploadPath,
  validateStoredUpload,
  type EditionFileKind,
  type UploadValidationFailure,
} from "../../../../lib/storage-validation";

export const prerender = false;

const BUCKET = "editions";
const SIGNATURE_BYTES = 32;

async function readObjectPrefix(path: string): Promise<Uint8Array> {
  const { data, error: signError } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, 60);
  if (signError || !data) throw new Error("No se pudo crear el enlace temporal de verificación");

  const response = await fetch(data.signedUrl, {
    headers: { Range: `bytes=0-${SIGNATURE_BYTES - 1}` },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Storage devolvió HTTP ${response.status} al leer la firma del archivo`);
  }

  const reader = response.body.getReader();
  const prefix = new Uint8Array(SIGNATURE_BYTES);
  let length = 0;
  try {
    while (length < SIGNATURE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = Math.min(value.length, SIGNATURE_BYTES - length);
      prefix.set(value.subarray(0, take), length);
      length += take;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return prefix.subarray(0, length);
}

const failureMessages: Record<UploadValidationFailure, string> = {
  invalid_path: "La ruta del archivo no es válida.",
  invalid_size: "El archivo está vacío o no se pudo leer su tamaño.",
  too_large: "El archivo subido supera el tamaño máximo permitido.",
  invalid_mime: "El tipo real del archivo no está permitido.",
  invalid_signature: "El contenido del archivo no coincide con un PDF o una imagen permitida.",
  extension_mismatch: "La extensión del archivo no coincide con su contenido real.",
};

async function rejectAndClean(path: string, message: string): Promise<Response> {
  try {
    await removeStoragePaths([path]);
  } catch (err) {
    logger.error({ err, path }, "invalid edition upload cleanup error");
  }
  return error(message, 422);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = requireAdmin(locals);
  if (admin instanceof Response) return admin;

  let body: { kind?: unknown; path?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("Body inválido: se esperaba JSON", 400);
  }

  const kind: EditionFileKind | null = body.kind === "pdf" || body.kind === "cover"
    ? body.kind
    : null;
  const path = typeof body.path === "string" ? body.path : "";
  if (!kind || !isAllowedUploadPath(kind, path)) {
    return error("Tipo o ruta de archivo inválidos", 400);
  }

  const { data: stored, error: infoError } = await supabaseAdmin.storage
    .from(BUCKET)
    .info(path);
  if (infoError || !stored) {
    logger.error({ err: infoError, kind }, "edition upload metadata verification failed");
    return error("No pudimos verificar el archivo subido. Volvé a intentarlo.", 422);
  }

  const size = stored.size ?? stored.metadata?.size;
  const contentType = stored.contentType ?? stored.metadata?.mimetype ?? "";
  let prefix: Uint8Array;
  try {
    prefix = await readObjectPrefix(path);
  } catch (err) {
    logger.error({ err, kind }, "edition upload signature read failed");
    return error("No pudimos verificar el archivo subido. Volvé a intentarlo.", 502);
  }

  const validationFailure = validateStoredUpload({
    kind,
    path,
    size: size ?? 0,
    contentType,
    prefix,
  });
  if (validationFailure) {
    return rejectAndClean(path, failureMessages[validationFailure]);
  }

  return ok({ verified: true });
};
