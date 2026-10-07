// Contrato de API (estructural, no parchear por endpoint):
// - El éxito se determina por el HTTP status (2xx). Los fronts DEBEN
//   chequear `res.ok`, nunca un flag del cuerpo.
// - El error es siempre `{ error: string }` con status >= 400.
// - `ok(obj)` con objeto plano inyecta `ok: true` (defensa en profundidad
//   para consumidores legacy que lean el cuerpo). Arrays/primitivos se
//   devuelven tal cual por compatibilidad.
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
    },
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function ok(data?: unknown): Response {
  if (data === undefined) return json({ ok: true }, 200);
  if (isPlainObject(data)) return json({ ok: true, ...data }, 200);
  return json(data, 200);
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}
