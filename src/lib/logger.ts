import pino from "pino";

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
});
