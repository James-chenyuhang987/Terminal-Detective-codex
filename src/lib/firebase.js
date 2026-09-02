import { getApp, getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth';

const firebaseConfig = Object.freeze({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
});

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

let authInstance = null;
let persistencePromise = null;

export function getFirebaseAuth() {
  if (!isFirebaseConfigured) return null;
  if (!authInstance) {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    authInstance = getAuth(app);
    persistencePromise = setPersistence(authInstance, browserLocalPersistence);
  }
  return authInstance;
}

export async function firebaseAuthReady() {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  await persistencePromise;
  return auth;
}

export const firebasePublicConfig = firebaseConfig;
