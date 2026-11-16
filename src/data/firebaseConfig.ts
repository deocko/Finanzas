/**
 * Configuración de Firebase desde variables de entorno (.env / secretos de GitHub).
 * La configuración web de Firebase no es una contraseña: la seguridad real
 * está en las reglas de Firestore y Storage (ver firestore.rules / storage.rules).
 */
export interface FirebaseEnv {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const env = import.meta.env;

export const firebaseEnv: FirebaseEnv = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: env.VITE_FIREBASE_APP_ID ?? '',
};

/** Dónde guardar fotos de tickets: "storage" (Firebase Storage, requiere plan Blaze) o "firestore" (gratis, comprimida). */
export const ticketBackend: 'storage' | 'firestore' =
  env.VITE_TICKETS_BACKEND === 'storage' ? 'storage' : 'firestore';

const isPlaceholder = (v: string) => v === '' || v.startsWith('TU_') || v.includes('PEGA_AQUI');

export const firebaseConfigured =
  !isPlaceholder(firebaseEnv.apiKey) && !isPlaceholder(firebaseEnv.projectId) && !isPlaceholder(firebaseEnv.appId);
