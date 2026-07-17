import pino from "pino";

const sentryWrite = {
  level: "error",
  write: async (msg: string) => {
    try {
      const { SeverityLevel } = await import("@sentry/astro");
      const parsed = JSON.parse(msg);
      const err = parsed.err ? new Error(parsed.err.message) : undefined;
      if (err) {
        const { captureException, withScope, setExtras } = await import("@sentry/astro");
        withScope((scope) => {
          setExtras(parsed);
          captureException(err);
        });
      } else {
        const { captureMessage, withScope, setExtras } = await import("@sentry/astro");
        withScope((scope) => {
          setExtras(parsed);
          captureMessage(parsed.msg || msg, "error" as SeverityLevel);
        });
      }
    } catch {
      // Sentry no disponible — ignorar
    }
  },
};

export const logger = pino({
  level: import.meta.env.LOG_LEVEL || "info",
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  redact: ["req.headers.authorization", "req.headers.cookie"],
  ...(import.meta.env.DEV
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
        },
      }
    : {}),
}, sentryWrite);
