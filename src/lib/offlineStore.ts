import { get, set, del, keys, clear } from 'idb-keyval';

export const offlineStore = {
  async getItem<T>(key: string): Promise<T | null> {
    try {
      const val = await get(key);
      if (val !== undefined) {
        return typeof val === 'string' ? JSON.parse(val) : val;
      }
      return null;
    } catch (e) {
      console.warn('IndexedDB get error:', e);
      return null;
    }
  },
  
  async setItem(key: string, value: any): Promise<void> {
    try {
      const valToStore = typeof value === 'string' ? value : JSON.stringify(value);
      await set(key, valToStore);
    } catch (e) {
      console.warn('IndexedDB set error:', e);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await del(key);
    } catch (e) {
      console.warn('IndexedDB remove error:', e);
    }
  },

  async clearAll(): Promise<void> {
    try {
      await clear();
    } catch (e) {
      console.warn('IndexedDB clear error:', e);
    }
  }
};
