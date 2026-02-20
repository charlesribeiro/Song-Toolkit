type LogLevel = "info" | "warn" | "error";

function formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  return JSON.stringify(entry);
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(formatMessage("info", message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(formatMessage("warn", message, meta));
  },
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(formatMessage("error", message, meta));
  },
};
