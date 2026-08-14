export interface Logger {
  debug(message: string, details?: unknown): void;
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

export const logger: Logger = {
  debug: (message, details) => console.debug(message, details ?? ""),
  info: (message, details) => console.info(message, details ?? ""),
  warn: (message, details) => console.warn(message, details ?? ""),
  error: (message, details) => console.error(message, details ?? ""),
};
