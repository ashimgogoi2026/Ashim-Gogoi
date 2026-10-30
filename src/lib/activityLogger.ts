import { db } from './firestoreService';
import { doc, setDoc } from 'firebase/firestore';

/**
 * Logs a detailed user action to Firestore user_activity_logs collection.
 * Designed to act silently without breaking the user experience in case of quota or network issues.
 */
export async function logUserActivity(userId: string, userEmail: string, action: string, details: string = '') {
  try {
    const timestamp = new Date().toISOString();
    const id = `LOG-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Server/Unknown';
    
    await setDoc(doc(db, 'user_activity_logs', id), {
      id,
      userId: userId || 'unknown_uid',
      userEmail: userEmail || 'unknown_email',
      action,
      details: details || '',
      timestamp,
      userAgent
    });
    console.log(`[ActivityLog] Synced to Cloud Log: ${action}`);
  } catch (err) {
    console.warn('[ActivityLog] Failed to register log event (might be quota or permission).', err);
  }
}
