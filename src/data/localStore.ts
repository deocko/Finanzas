import type { CollectionMap, CollectionName } from '../lib/types';
import type { DataStore, NewDoc, Patch } from './store';
import { newId } from './store';
import { compressToDataUrl } from './image';

const PREFIX = 'finanzas-demo:';

type Listener = () => void;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Almacén del MODO DEMO: todo vive en el navegador (localStorage).
 * No se envía nada a ningún servidor.
 */
export class LocalStore implements DataStore {
  readonly mode = 'demo' as const;
  private listeners = new Map<CollectionName, Set<Listener>>();
  private memory = new Map<string, string>();

  private read<K extends CollectionName>(col: K): CollectionMap[K][] {
    const raw = this.memory.get(PREFIX + col) ?? safeGet(PREFIX + col);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as CollectionMap[K][];
    } catch {
      return [];
    }
  }

  private write<K extends CollectionName>(col: K, items: CollectionMap[K][]): void {
    const raw = JSON.stringify(items);
    try {
      localStorage.setItem(PREFIX + col, raw);
    } catch {
      this.memory.set(PREFIX + col, raw);
    }
    this.listeners.get(col)?.forEach((l) => l());
  }

  hasData(): boolean {
    return safeGet(PREFIX + 'seeded') === '1';
  }

  markSeeded(): void {
    try {
      localStorage.setItem(PREFIX + 'seeded', '1');
    } catch {
      /* sin almacenamiento: la demo vive en memoria */
    }
  }

  subscribe<K extends CollectionName>(col: K, onData: (items: CollectionMap[K][]) => void): () => void {
    const l = () => onData(this.read(col));
    let set = this.listeners.get(col);
    if (!set) this.listeners.set(col, (set = new Set()));
    set.add(l);
    queueMicrotask(l);
    return () => set.delete(l);
  }

  async add<K extends CollectionName>(col: K, data: NewDoc<K>): Promise<string> {
    const id = newId();
    const doc = { ...data, id, createdAt: Date.now() } as CollectionMap[K];
    this.write(col, [...this.read(col), doc]);
    return id;
  }

  async set<K extends CollectionName>(col: K, id: string, data: NewDoc<K>): Promise<void> {
    const items = this.read(col);
    const prev = items.find((i) => i.id === id);
    const doc = { ...data, id, createdAt: prev?.createdAt ?? Date.now() } as CollectionMap[K];
    this.write(col, prev ? items.map((i) => (i.id === id ? doc : i)) : [...items, doc]);
  }

  async update<K extends CollectionName>(col: K, id: string, patch: Patch<K>): Promise<void> {
    this.write(col, this.read(col).map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async remove(col: CollectionName, id: string): Promise<void> {
    this.write(col, this.read(col).filter((i) => i.id !== id));
  }

  async saveTicket(image: Blob): Promise<string> {
    const dataUrl = await compressToDataUrl(image, 250_000);
    const id = newId();
    try {
      localStorage.setItem(`${PREFIX}ticket:${id}`, dataUrl);
    } catch {
      this.memory.set(`${PREFIX}ticket:${id}`, dataUrl);
    }
    return `local:${id}`;
  }

  async ticketUrl(ref: string): Promise<string> {
    const id = ref.replace(/^local:/, '');
    const v = safeGet(`${PREFIX}ticket:${id}`) ?? this.memory.get(`${PREFIX}ticket:${id}`);
    if (!v) throw new Error('No se encontró la foto del ticket.');
    return v;
  }

  async deleteTicket(ref: string): Promise<void> {
    const id = ref.replace(/^local:/, '');
    try {
      localStorage.removeItem(`${PREFIX}ticket:${id}`);
    } catch {
      /* nada */
    }
    this.memory.delete(`${PREFIX}ticket:${id}`);
  }

  /** Borra todos los datos de la demo de este navegador. */
  clearAll(): void {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
    } catch {
      /* nada */
    }
    this.memory.clear();
    this.listeners.forEach((set) => set.forEach((l) => l()));
  }
}
