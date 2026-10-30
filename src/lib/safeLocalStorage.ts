import { get, set, del, keys, clear } from 'idb-keyval';
import { encryptData, decryptData } from './encryption';

const ramStorage = new Map<string, string>();
const syncListeners: Array<() => void> = [];

export const safeLocalStorage = {
  get length(): number {
    return ramStorage.size;
  },
  onChange(callback: () => void): () => void {
    syncListeners.push(callback);
    return () => {
      const idx = syncListeners.indexOf(callback);
      if (idx !== -1) {
        syncListeners.splice(idx, 1);
      }
    };
  },
  async hydrate(): Promise<boolean> {
    try {
      let loadedFromLocal = false;
      
      // Clean up localStorage to free quota for Firebase Auth
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.startsWith('SLS_') || k === 'SALES_MASTER_RECORDS')) {
              keysToRemove.push(k);
              // Migrate it to RAM first if we can, to prevent data loss 
              // if it wasn't yet in IndexedDB.
              const val = localStorage.getItem(k);
              if (val) {
                 const originalKey = k.startsWith('SLS_') ? k.replace('SLS_', '') : k;
                 ramStorage.set(originalKey, k.startsWith('SLS_') ? decryptData(val) : val);
                 loadedFromLocal = true;
              }
            }
          }
          // Now remove them to free up quota
          keysToRemove.forEach(k => localStorage.removeItem(k));
          
          if (loadedFromLocal) {
             syncListeners.forEach(cb => cb());
             // And save the migrated ones to IndexedDB
             for (const k of keysToRemove) {
                 const originalKey = k.replace('SLS_', '');
                 const decrypted = ramStorage.get(originalKey);
                 if (decrypted) {
                    set('SLS_' + originalKey, encryptData(decrypted)).catch(()=>{});
                 }
             }
          }
        }
      } catch (e) {
        console.warn('[SafeLocalStorage] localStorage migration failed:', e);
      }

      try {
        const localKeys = await keys();
        for (const k of localKeys) {
          if (typeof k === 'string' && k.startsWith('SLS_')) {
            const originalKey = k.replace('SLS_', '');
            if (!ramStorage.has(originalKey)) {
              const val = await get(k);
              if (val !== undefined && val !== null) {
                const decryptedVal = decryptData(String(val));
                ramStorage.set(originalKey, decryptedVal);
                loadedFromLocal = true;
              }
            }
          }
        }
        if (loadedFromLocal) {
          syncListeners.forEach(cb => cb());
        }
      } catch (idbErr) {
        console.warn('[SafeLocalStorage] IndexedDB hydration failed:', idbErr);
      }

      const res = await fetch('/api/kv-store', {
        headers: { 'Accept': 'application/json' }
      });
      const data = await res.json();
      if (data && data.success && data.store && Object.keys(data.store).length > 0) {
        for (const [k, v] of Object.entries(data.store)) {
          const decryptedVal = decryptData(String(v));
          ramStorage.set(k, decryptedVal);

          set('SLS_' + k, String(v)).catch(() => {});
        }
        
        syncListeners.forEach(cb => cb());
        return true;
      }
      
      return loadedFromLocal;
    } catch (err) {
      console.warn('[SafeLocalStorage] Server KV hydration missed:', err);
    }
    return false;
  },
  clear(): void {
    ramStorage.clear();
    
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('SLS_')) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      }
    } catch(e) {}

    keys().then(localKeys => {
      localKeys.forEach(k => {
        if (typeof k === 'string' && k.startsWith('SLS_')) {
          del(k).catch(() => {});
        }
      });
    }).catch(()=>{});

    fetch('/api/kv-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ bulk: {}, overwrite: true })
    }).catch(err => console.warn('[SafeLocalStorage] Async server store clear error:', err));
  },
  getItem(key: string): string | null {
    if (ramStorage.has(key)) {
      return ramStorage.get(key)!;
    }
    return null;
  },
  key(index: number): string | null {
    const keysArray = Array.from(ramStorage.keys());
    return keysArray[index] || null;
  },
  removeItem(key: string): void {
    ramStorage.delete(key);
    
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('SLS_' + key);
      }
    } catch(e) {}

    del('SLS_' + key).catch(() => {});

    fetch('/api/kv-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ key, value: null })
    }).catch(err => console.warn('[SafeLocalStorage] Async server removal issue:', err));
  },
  setItem(key: string, value: string): void {
    ramStorage.set(key, value);
    
    const encryptedVal = encryptData(value);
    
    set('SLS_' + key, encryptedVal).catch(e => {
        console.warn('[SafeLocalStorage] Failed to write to IndexedDB:', e);
    });

    fetch('/api/kv-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ key, value: encryptedVal })
    }).catch(err => console.warn('[SafeLocalStorage] Async server write fallback error:', err));
  },
  setItems(items: Record<string, string>): void {
    const payloadToPost: Record<string, string> = {};
    for (const [key, value] of Object.entries(items)) {
      ramStorage.set(key, value);
      
      const encryptedVal = encryptData(value);
      
      set('SLS_' + key, encryptedVal).catch(() => {});
      
      payloadToPost[key] = encryptedVal;
    }
    
    fetch('/api/kv-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ bulk: payloadToPost, overwrite: false })
    }).catch(err => console.warn('[SafeLocalStorage] Async server bulk write error:', err));
  }
};
