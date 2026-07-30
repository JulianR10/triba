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

export function ok(data?: unknown): Response {
  return json(data ?? { ok: true }, 200);
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}
