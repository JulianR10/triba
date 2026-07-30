import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return new Response(
      JSON.stringify({ error: "?email= required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const apiKey = import.meta.env.RESEND_API_KEY || "";
  const rawFrom = import.meta.env.RESEND_FROM || "Triba <onboarding@resend.dev>";
  const from = rawFrom.replace(/^"(.*)"$/, "$1");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Test desde Triba",
      html: "<p>Si ves esto, el email funciona.</p>",
    }),
  });

  const body = await res.text().catch(() => "(no body)");

  return new Response(
    JSON.stringify({
      configured: { apiKey: !!apiKey, from },
      resend: { status: res.status, statusText: res.statusText, body },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
