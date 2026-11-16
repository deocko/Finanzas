/**
 * Integración con Firebase. Se carga de forma diferida (import dinámico)
 * para que la demo no descargue Firebase si no está configurado.
 *
 * Estructura: users/{uid}/{coleccion}/{id}
 * Tickets:    Storage users/{uid}/tickets/{id}.jpg   o   Firestore users/{uid}/tickets/{id} { dataUrl }
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut, type Auth, type User,
} from 'firebase/auth';
import {
  collection, deleteDoc, deleteField, doc, getDoc, initializeFirestore, onSnapshot, persistentLocalCache,
  persistentMultipleTabManager, setDoc, updateDoc, type Firestore,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, getStorage, ref as sref, uploadBytes } from 'firebase/storage';
import type { CollectionMap, CollectionName } from '../lib/types';
import { firebaseEnv, ticketBackend } from './firebaseConfig';
import type { DataStore, NewDoc, Patch } from './store';
import { newId } from './store';
import { compressImage, compressToDataUrl } from './image';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function init(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!app || !auth || !db) {
    app = initializeApp(firebaseEnv);
    auth = getAuth(app);
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  }
  return { app, auth, db };
}

export function watchAuth(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(init().auth, cb);
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(init().auth, provider);
}

export async function signOutUser(): Promise<void> {
  await signOut(init().auth);
}

/**
 * Comprueba que las reglas de Firestore permitan a este usuario leer su espacio.
 * Si el correo no es el autorizado, las reglas responden "permission-denied".
 */
export async function verifyAccess(uid: string): Promise<boolean> {
  try {
    await getDoc(doc(init().db, 'users', uid, 'settings', 'perfil'));
    return true;
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'permission-denied') return false;
    throw e;
  }
}

function strip<T extends object>(data: T): T {
  // Firestore no acepta undefined
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as T;
}

export class FirebaseStore implements DataStore {
  readonly mode = 'firebase' as const;
  constructor(private readonly uid: string) {}

  private col(name: string) {
    return collection(init().db, 'users', this.uid, name);
  }

  subscribe<K extends CollectionName>(
    name: K,
    onData: (items: CollectionMap[K][]) => void,
    onError: (e: Error) => void,
  ): () => void {
    return onSnapshot(
      this.col(name),
      (snap) => onData(snap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as CollectionMap[K])),
      (err) => onError(err),
    );
  }

  async add<K extends CollectionName>(name: K, data: NewDoc<K>): Promise<string> {
    const id = newId();
    // setDoc sin await de red: con caché local se confirma de inmediato y se sincroniza después.
    await setDoc(doc(this.col(name), id), strip({ ...data, createdAt: Date.now() }));
    return id;
  }

  async set<K extends CollectionName>(name: K, id: string, data: NewDoc<K>): Promise<void> {
    await setDoc(doc(this.col(name), id), strip({ ...data, createdAt: Date.now() }));
  }

  async update<K extends CollectionName>(name: K, id: string, patch: Patch<K>): Promise<void> {
    // undefined en una edición = borrar el campo (p. ej. quitar la foto del ticket)
    const data = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? deleteField() : v]));
    await updateDoc(doc(this.col(name), id), data);
  }

  async remove(name: CollectionName, id: string): Promise<void> {
    await deleteDoc(doc(this.col(name), id));
  }

  async saveTicket(image: Blob): Promise<string> {
    const id = newId();
    if (ticketBackend === 'storage') {
      const blob = await compressImage(image, 2000, 0.82);
      const path = `users/${this.uid}/tickets/${id}.jpg`;
      await uploadBytes(sref(getStorage(init().app), path), blob, { contentType: 'image/jpeg' });
      return `storage:${path}`;
    }
    const dataUrl = await compressToDataUrl(image, 900_000);
    await setDoc(doc(this.col('tickets'), id), { dataUrl, createdAt: Date.now() });
    return `doc:${id}`;
  }

  async ticketUrl(ref: string): Promise<string> {
    if (ref.startsWith('storage:')) return getDownloadURL(sref(getStorage(init().app), ref.slice(8)));
    if (ref.startsWith('doc:')) {
      const snap = await getDoc(doc(this.col('tickets'), ref.slice(4)));
      const v = snap.data()?.dataUrl;
      if (typeof v !== 'string') throw new Error('No se encontró la foto del ticket.');
      return v;
    }
    throw new Error('Referencia de ticket no válida.');
  }

  async deleteTicket(ref: string): Promise<void> {
    if (ref.startsWith('storage:')) await deleteObject(sref(getStorage(init().app), ref.slice(8)));
    else if (ref.startsWith('doc:')) await deleteDoc(doc(this.col('tickets'), ref.slice(4)));
  }
}
