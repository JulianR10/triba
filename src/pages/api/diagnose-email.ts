import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const email = url.searchParams.get("email")?.trim().toLowerCase();
    if (!email) {
      return new Response(
        JSON.stringify({ error: "?email= required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const apiKey = import.meta.env.SENDER_API_KEY || "";
    const fromEmail = import.meta.env.SENDER_FROM_EMAIL || "hola@comunidadtriba.com";
    const fromName = import.meta.env.SENDER_FROM_NAME || "Triba";

    const envStatus = {
      SENDER_API_KEY: apiKey ? `set (${apiKey.slice(0, 8)}...)` : "NOT SET",
      SENDER_FROM_EMAIL: fromEmail,
      SENDER_FROM_NAME: fromName,
    };

    let senderResult: unknown = { skipped: true, reason: "no api key" };

    if (apiKey) {
      const res = await fetch("https://api.sender.net/v2/message/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: { email: fromEmail, name: fromName },
          to: { email },
          subject: "Test desde Triba",
          html: "<p>Si ves esto, el email funciona.</p>",
        }),
      });

      const body = await res.text().catch(() => "(no body)");
      senderResult = { status: res.status, statusText: res.statusText, body };
    }

    return new Response(
      JSON.stringify({ env: envStatus, sender: senderResult }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "diagnostic crashed",
        message: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
