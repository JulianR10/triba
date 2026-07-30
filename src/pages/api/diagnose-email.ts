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

    const apiKey = import.meta.env.RESEND_API_KEY || "";
    const rawFrom = import.meta.env.RESEND_FROM || "";
    const from = String(rawFrom).replace(/^"(.*)"$/, "$1");

    const envStatus = {
      RESEND_API_KEY: apiKey ? `set (${apiKey.slice(0, 8)}...)` : "NOT SET",
      RESEND_FROM: from || "NOT SET",
    };

    let resendResult: unknown = { skipped: true, reason: "no api key" };

    if (apiKey && from) {
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
      resendResult = { status: res.status, statusText: res.statusText, body };
    }

    return new Response(
      JSON.stringify({ env: envStatus, resend: resendResult }),
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
