import type { StateStorage } from 'zustand/middleware';

export const resolveDefaultFallbackStorage = (): StateStorage => {
  throw new Error('Persistent storage fallback (AsyncStorage) has been removed in v0.4.1.');
};
