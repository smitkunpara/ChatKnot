type DebugMeta = Record<string, unknown> | undefined;

declare global {
  var __CHATKNOT_DEBUG_ENABLED__: boolean | undefined;
}

const isDebugEnabled = (): boolean => {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) {
    return false;
  }

  if (typeof globalThis.__CHATKNOT_DEBUG_ENABLED__ === 'boolean') {
    return globalThis.__CHATKNOT_DEBUG_ENABLED__;
  }

  return true;
};

const toSerializable = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toSerializable(entry, seen));
  }
  if (typeof value === 'object') {
    if (seen.has(value as object)) {
      return '[Circular]';
    }
    seen.add(value as object);
    const result: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      result[key] = toSerializable(entry, seen);
    });
    return result;
  }
  return String(value);
};

const emit = (
  level: 'log' | 'warn' | 'error',
  file: string,
  fn: string,
  message: string,
  meta?: DebugMeta
) => {
  if (!isDebugEnabled()) {
    return;
  }

  const prefix = `[ChatKnot Debug][${file}][${fn}] ${message}`;
  if (meta && Object.keys(meta).length > 0) {
    console[level](prefix, toSerializable(meta));
    return;
  }

  console[level](prefix);
};

export const createDebugLogger = (file: string) => ({
  moduleLoaded: (meta?: DebugMeta) => emit('log', file, 'module', 'loaded', meta),
  enter: (fn: string, meta?: DebugMeta) => emit('log', file, fn, 'enter', meta),
  log: (fn: string, message: string, meta?: DebugMeta) => emit('log', file, fn, message, meta),
  warn: (fn: string, message: string, meta?: DebugMeta) => emit('warn', file, fn, message, meta),
  error: (fn: string, message: string, meta?: DebugMeta) => emit('error', file, fn, message, meta),
});
