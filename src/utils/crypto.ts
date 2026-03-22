export const getRandomValues = (buffer: Uint8Array): void => {
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buffer);
    return;
  }

  try {
    require('react-native-get-random-values');
  } catch {
    // Polyfill unavailable; fall through to error check.
  }

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buffer);
    return;
  }

  throw new Error('No cryptographically secure random source available');
};

export const bytesToHex = (buffer: Uint8Array): string => {
  let output = '';
  for (let i = 0; i < buffer.length; i += 1) {
    output += buffer[i].toString(16).padStart(2, '0');
  }
  return output;
};

export const hexToBytes = (value: string): Uint8Array => {
  const size = Math.floor(value.length / 2);
  const output = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    output[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return output;
};

export const generateKey = (byteLength: number = 32): string => {
  const bytes = new Uint8Array(byteLength);
  getRandomValues(bytes);
  return bytesToHex(bytes);
};
