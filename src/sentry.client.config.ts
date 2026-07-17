import * as Sentry from "@sentry/astro";

Sentry.init({
  dsn: import.meta.env.SENTRY_DSN,
  environment: import.meta.env.PROD ? "production" : "development",
  beforeSend(event) {
    if (!import.meta.env.PROD) return null;
    return event;
  },
});
