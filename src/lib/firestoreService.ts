import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { safeLocalStorage } from './safeLocalStorage';
import { offlineStore } from './offlineStore';

// Safe initialization of Firebase App and Auth (for user login without remote database lock)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Graceful local-mode Firestore instance (fallback if referenced)
export const db = getFirestore(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const msg = error instanceof Error ? error.message : String(error);
  console.log(`[Local Sync - Firestore Offline] Operation ${operationType} on ${path}:`, msg);
}

/**
 * Validates connection to Firestore on initialization - safe no-op in local mode
 */
export async function testConnection() {
  return Promise.resolve();
}

/**
 * Recursively removes any keys with `undefined` values.
 */
export function cleanUndefined(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item));
  }
  const result: any = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      result[key] = cleanUndefined(val);
    }
  }
  return result;
}

/**
 * Saves a document to local storage & offline store
 */
export async function saveDoc(collectionName: string, docId: string, data: any) {
  try {
    const cleanData = cleanUndefined(data);
    const storeKey = `ptg_${collectionName}_${docId}`;
    safeLocalStorage.setItem(storeKey, JSON.stringify(cleanData));
    await offlineStore.setItem(storeKey, cleanData);

    // Update collection list in local cache
    const listKey = `ptg_${collectionName}_list`;
    const existingListRaw = safeLocalStorage.getItem(listKey);
    let list: any[] = existingListRaw ? JSON.parse(existingListRaw) : [];
    const idx = list.findIndex((item: any) => item.id === docId);
    if (idx >= 0) {
      list[idx] = cleanData;
    } else {
      list.push(cleanData);
    }
    safeLocalStorage.setItem(listKey, JSON.stringify(list));
    await offlineStore.setItem(listKey, list);
  } catch (err) {
    console.warn(`[Local Storage Save] Failed to persist ${collectionName}/${docId}:`, err);
  }
}

/**
 * Partially updates fields of a document in local cache
 */
export async function updateDocInDb(collectionName: string, docId: string, data: any) {
  try {
    const cleanData = cleanUndefined(data);
    const storeKey = `ptg_${collectionName}_${docId}`;
    const existingRaw = safeLocalStorage.getItem(storeKey);
    const existing = existingRaw ? JSON.parse(existingRaw) : {};
    const merged = { ...existing, ...cleanData };

    safeLocalStorage.setItem(storeKey, JSON.stringify(merged));
    await offlineStore.setItem(storeKey, merged);

    const listKey = `ptg_${collectionName}_list`;
    const existingListRaw = safeLocalStorage.getItem(listKey);
    let list: any[] = existingListRaw ? JSON.parse(existingListRaw) : [];
    const idx = list.findIndex((item: any) => item.id === docId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...cleanData };
    } else {
      list.push(merged);
    }
    safeLocalStorage.setItem(listKey, JSON.stringify(list));
    await offlineStore.setItem(listKey, list);
  } catch (err) {
    console.warn(`[Local Storage Update] Failed to update ${collectionName}/${docId}:`, err);
  }
}

/**
 * Bulk updates multiple documents
 */
export async function updateDocBatchInDb(collectionName: string, updates: { id: string; data: any }[]) {
  for (const u of updates) {
    await updateDocInDb(collectionName, u.id, u.data);
  }
}

/**
 * Deletes a document
 */
export async function deleteDocInDb(collectionName: string, docId: string) {
  try {
    const storeKey = `ptg_${collectionName}_${docId}`;
    safeLocalStorage.removeItem(storeKey);
    await offlineStore.removeItem(storeKey);

    const listKey = `ptg_${collectionName}_list`;
    const existingListRaw = safeLocalStorage.getItem(listKey);
    if (existingListRaw) {
      let list: any[] = JSON.parse(existingListRaw);
      list = list.filter((item: any) => item.id !== docId);
      safeLocalStorage.setItem(listKey, JSON.stringify(list));
      await offlineStore.setItem(listKey, list);
    }
  } catch (err) {
    console.warn(`[Local Storage Delete] Failed to delete ${collectionName}/${docId}:`, err);
  }
}

/**
 * Bulk deletes multiple documents
 */
export async function deleteDocBatchInDb(collectionName: string, docIds: string[]) {
  for (const id of docIds) {
    await deleteDocInDb(collectionName, id);
  }
}

/**
 * Batch initialize elements locally
 */
export async function batchInitializeCollection(collectionName: string, items: any[], ownerId: string) {
  const promises = items.map(async (item) => {
    const dataWithOwner = cleanUndefined({ ...item, ownerId });
    await saveDoc(collectionName, item.id, dataWithOwner);
  });
  await Promise.all(promises);
}
