import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, browserLocalPersistence, setPersistence, sendPasswordResetEmail, type User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { safeLocalStorage } from './safeLocalStorage';

// Reuse existing app instance if initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Use local persistence so auth persists reliably across sessions & devices
setPersistence(auth, browserLocalPersistence).catch(console.error);

let cachedAccessToken: string | null = null;
try {
  cachedAccessToken = sessionStorage.getItem('INFLUENCER_MANAGER_TOKEN') || safeLocalStorage.getItem('INFLUENCER_MANAGER_TOKEN');
} catch (e) {
  // Ignore in restricted environments
}

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive'
];

const provider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach(scope => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account'
});

export const isGoogleOAuthToken = (token?: string | null): boolean => {
  return Boolean(token && typeof token === 'string' && token.startsWith('ya29.') && token.length > 20);
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const gToken = getGoogleAccessToken() || '';
      if (onAuthSuccess) {
        onAuthSuccess(user, gToken);
      }
    } else {
      cachedAccessToken = null;
      try {
        sessionStorage.removeItem('INFLUENCER_MANAGER_TOKEN');
        sessionStorage.removeItem('INFLUENCER_MANAGER_G_TOKEN');
        safeLocalStorage.removeItem('INFLUENCER_MANAGER_G_TOKEN');
      } catch (e) {}
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const emailSignIn = async (email: string, password: string): Promise<{ user: User; accessToken: string } | null> => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    cachedAccessToken = await result.user.getIdToken();
    try {
      sessionStorage.setItem('INFLUENCER_MANAGER_TOKEN', cachedAccessToken);
      safeLocalStorage.setItem('INFLUENCER_MANAGER_TOKEN', cachedAccessToken);
    } catch (e) {}
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Email Sign-In Error:', error);
    throw error;
  }
};

export const emailSignUp = async (email: string, password: string): Promise<{ user: User; accessToken: string } | null> => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    cachedAccessToken = await result.user.getIdToken();
    try {
      sessionStorage.setItem('INFLUENCER_MANAGER_TOKEN', cachedAccessToken);
      safeLocalStorage.setItem('INFLUENCER_MANAGER_TOKEN', cachedAccessToken);
    } catch (e) {}
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Email Sign-Up Error:', error);
    throw error;
  }
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    let gToken = credential?.accessToken || '';
    if (gToken) {
      try {
        sessionStorage.setItem('INFLUENCER_MANAGER_G_TOKEN', gToken);
        safeLocalStorage.setItem('INFLUENCER_MANAGER_G_TOKEN', gToken);
      } catch (e) {}
    }
    
    return { user: result.user, accessToken: gToken };
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    throw error;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken || sessionStorage.getItem('INFLUENCER_MANAGER_TOKEN') || safeLocalStorage.getItem('INFLUENCER_MANAGER_TOKEN');
};

export const getGoogleAccessToken = (): string | null => {
  try {
    const raw = sessionStorage.getItem('INFLUENCER_MANAGER_G_TOKEN') || safeLocalStorage.getItem('INFLUENCER_MANAGER_G_TOKEN');
    if (isGoogleOAuthToken(raw)) {
      return raw;
    }
    return null;
  } catch (e) {
    return null;
  }
};

/**
 * Validates whether the given Google OAuth access token is still active.
 */
export const validateGoogleAccessToken = async (token: string): Promise<boolean> => {
  if (!isGoogleOAuthToken(token)) return false;
  try {
    const res = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`);
    if (!res.ok) return false;
    const data = await res.json();
    return Number(data.expires_in || 0) > 10;
  } catch (e) {
    return false;
  }
};

/**
 * Ensures a valid Google access token is present. If missing or expired, prompts Google Sign-In automatically.
 */
export const ensureGoogleAccessToken = async (
  currentToken?: string | null,
  onSuccess?: (user: User, token: string) => void,
  forceRefresh: boolean = false
): Promise<string> => {
  let token = !forceRefresh ? ((isGoogleOAuthToken(currentToken) ? currentToken : null) || getGoogleAccessToken()) : null;
  if (token && isGoogleOAuthToken(token)) {
    const isValid = await validateGoogleAccessToken(token);
    if (isValid) {
      return token;
    }
  }

  // Clear expired or invalid token from cache
  cachedAccessToken = null;
  try {
    sessionStorage.removeItem('INFLUENCER_MANAGER_G_TOKEN');
    safeLocalStorage.removeItem('INFLUENCER_MANAGER_G_TOKEN');
  } catch (e) {}

  // Prompt Google Sign-In directly to obtain a fresh valid OAuth access token
  const signInResult = await googleSignIn();
  if (!signInResult || !signInResult.accessToken) {
    throw new Error('Google Workspace OAuth access token is required to access Google Drive & Sheets. Please ensure popups are allowed.');
  }

  if (onSuccess) {
    onSuccess(signInResult.user, signInResult.accessToken);
  }

  return signInResult.accessToken;
};

export const sendResetEmail = async (email: string): Promise<void> => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    console.error('Password Reset Error:', error);
    throw error;
  }
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  try {
    sessionStorage.removeItem('INFLUENCER_MANAGER_TOKEN');
    sessionStorage.removeItem('INFLUENCER_MANAGER_G_TOKEN');
    safeLocalStorage.removeItem('INFLUENCER_MANAGER_G_TOKEN');
  } catch (e) {}
};

