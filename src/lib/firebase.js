import { getApp, getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth';
import { resolveAuthEmailSender } from '@/lib/authEmail';

const firebaseConfig = Object.freeze({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
});

function placeholder(value) {
  return !value || /^(?:REPLACE_WITH_|YOUR_|<)/i.test(String(value).trim());
}

export function validateFirebasePublicConfig(config = {}) {
  const missing = Object.entries(config).filter(([, value]) => placeholder(value)).map(([key]) => key);
  if (missing.length) return { valid: false, reason: 'missing', fields: missing };
  const projectId = String(config.projectId).trim();
  const authDomain = String(config.authDomain).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(projectId)) return { valid: false, reason: 'project_id', fields: ['projectId'] };
  if (!authDomain.includes('.') || /[/?#]/.test(authDomain)) return { valid: false, reason: 'auth_domain', fields: ['authDomain'] };
  if (!String(config.appId).includes(':')) return { valid: false, reason: 'app_id', fields: ['appId'] };
  return { valid: true, reason: '', fields: [] };
}

export const firebaseConfigValidation = validateFirebasePublicConfig(firebaseConfig);
export const isFirebaseConfigured = firebaseConfigValidation.valid;
export const firebaseAuthEmailSender = resolveAuthEmailSender(
  import.meta.env.VITE_FIREBASE_EMAIL_SENDER,
  firebaseConfig.projectId,
);

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
