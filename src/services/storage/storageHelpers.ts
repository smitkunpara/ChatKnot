import type { StateStorage } from 'zustand/middleware';

export const resolveDefaultFallbackStorage = (): StateStorage => {
  try {
    const asyncStorage = require('@react-native-async-storage/async-storage').default;
    return {
      getItem: async (name) => asyncStorage.getItem(name),
      setItem: async (name, value) => {
        await asyncStorage.setItem(name, value);
      },
      removeItem: async (name) => {
        await asyncStorage.removeItem(name);
      },
    };
  } catch (error) {
    throw new Error(`Persistent fallback storage is unavailable: ${String(error)}`);
  }
};
