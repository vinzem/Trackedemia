/**
 * Minimal structured JSON logger. Sensitive keys are redacted recursively so
 * note content, tokens and credentials never reach the logs.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const SENSITIVE = /token|secret|password|authorization|cookie|api[_-]?key|^content$|^text$|description|ciphertext/i;

export function redact(value, depth = 0) {
  if (value == null || depth > 5) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message, code: value.code, status: value.status };
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE.test(key) ? '[redacted]' : redact(item, depth + 1),
    ]));
  }
  return value;
}

export function createLogger({ level = process.env.LOG_LEVEL || 'info', stream = process.stdout } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const write = (lvl, message, meta) => {
    if (LEVELS[lvl] < threshold) return;
    const entry = { time: new Date().toISOString(), level: lvl, message, ...(meta ? redact(meta) : {}) };
    stream.write(`${JSON.stringify(entry)}\n`);
  };
  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  };
}

export const logger = createLogger({ level: process.env.NODE_ENV === 'test' ? 'silent' : undefined });
