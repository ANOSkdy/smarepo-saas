export const logger = {
  info: (msg: string, data?: unknown) => {
    console.log(`[INFO] ${msg}`, JSON.stringify(data ?? {}, null, 2));
  },
  warn: (msg: string, data?: unknown) => {
    console.warn(`[WARN] ${msg}`, JSON.stringify(data ?? {}, null, 2));
  },
  error: (msg: string, error: unknown) => {
    const payload =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : error;
    console.error(`[ERROR] ${msg}`, JSON.stringify(payload ?? {}, null, 2));
  },
};
