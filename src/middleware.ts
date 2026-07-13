import { defineMiddleware } from "astro/middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  if (response.headers.get("content-type")?.startsWith("text/html")) {
    response.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data:",
        "connect-src 'self' https://api.stripe.com",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ")
    );
  }

  return response;
});
