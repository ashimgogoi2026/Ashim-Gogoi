import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY || 'influencer-manager-fallback-key-2026';

export const encryptData = (data: string): string => {
  try {
    return CryptoJS.AES.encrypt(data, ENCRYPTION_KEY).toString();
  } catch (error) {
    console.error('Encryption failed:', error);
    return data;
  }
};

export const decryptData = (ciphertext: string): string => {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    return originalText || ciphertext;
  } catch (error) {
    console.warn('Decryption failed, returning raw data:', error);
    return ciphertext;
  }
};
