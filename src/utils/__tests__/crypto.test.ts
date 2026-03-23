import { bytesToHex, hexToBytes, generateKey, getRandomValues } from '../crypto';

describe('bytesToHex', () => {
  it('converts empty buffer to empty string', () => {
    expect(bytesToHex(new Uint8Array(0))).toBe('');
  });

  it('converts single byte with leading zero', () => {
    expect(bytesToHex(new Uint8Array([0x0a]))).toBe('0a');
  });

  it('converts single byte at max value', () => {
    expect(bytesToHex(new Uint8Array([0xff]))).toBe('ff');
  });

  it('converts multi-byte buffer', () => {
    expect(bytesToHex(new Uint8Array([0x00, 0x01, 0xab, 0xff]))).toBe('0001abff');
  });
});

describe('hexToBytes', () => {
  it('converts empty string to empty buffer', () => {
    expect(hexToBytes('')).toEqual(new Uint8Array(0));
  });

  it('converts hex string to bytes', () => {
    expect(hexToBytes('0001abff')).toEqual(new Uint8Array([0x00, 0x01, 0xab, 0xff]));
  });

  it('handles odd-length hex by truncating last nibble', () => {
    const result = hexToBytes('abc');
    expect(result.length).toBe(1);
    expect(result[0]).toBe(0xab);
  });
});

describe('bytesToHex <-> hexToBytes roundtrip', () => {
  it('roundtrips arbitrary byte arrays', () => {
    const original = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]);
    const hex = bytesToHex(original);
    const restored = hexToBytes(hex);
    expect(restored).toEqual(original);
  });

  it('roundtrips all 256 byte values', () => {
    const original = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      original[i] = i;
    }
    const hex = bytesToHex(original);
    expect(hex.length).toBe(512);
    expect(hexToBytes(hex)).toEqual(original);
  });
});

describe('generateKey', () => {
  beforeEach(() => {
    const mockGetRandomValues = jest.fn((buffer: Uint8Array) => {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = i % 256;
      }
    });
    (globalThis as any).crypto = { getRandomValues: mockGetRandomValues };
  });

  afterEach(() => {
    delete (globalThis as any).crypto;
  });

  it('generates a hex string of correct length for default 32 bytes', () => {
    const key = generateKey();
    expect(key.length).toBe(64);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates a hex string of correct length for custom byte length', () => {
    const key = generateKey(16);
    expect(key.length).toBe(32);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('calls getRandomValues with the correct buffer size', () => {
    generateKey(8);
    expect((globalThis as any).crypto.getRandomValues).toHaveBeenCalledTimes(1);
    const passedBuffer = (globalThis as any).crypto.getRandomValues.mock.calls[0][0];
    expect(passedBuffer.length).toBe(8);
  });

  it('generates unique keys across calls', () => {
    let callCount = 0;
    (globalThis as any).crypto.getRandomValues = (buffer: Uint8Array) => {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = (callCount + i) % 256;
      }
      callCount++;
    };
    const key1 = generateKey();
    const key2 = generateKey();
    expect(key1).not.toBe(key2);
  });
});

describe('getRandomValues', () => {
  afterEach(() => {
    delete (globalThis as any).crypto;
  });

  it('uses globalThis.crypto.getRandomValues when available', () => {
    const mockFn = jest.fn((buffer: Uint8Array) => {
      buffer.fill(0xab);
    });
    (globalThis as any).crypto = { getRandomValues: mockFn };

    const buffer = new Uint8Array(4);
    getRandomValues(buffer);

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(buffer).toEqual(new Uint8Array([0xab, 0xab, 0xab, 0xab]));
  });

  it('throws when no crypto source is available', () => {
    (globalThis as any).crypto = undefined;

    const buffer = new Uint8Array(4);
    expect(() => getRandomValues(buffer)).toThrow(
      'No cryptographically secure random source available'
    );
  });
});
