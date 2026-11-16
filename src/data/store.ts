import type { CollectionMap, CollectionName } from '../lib/types';

export type NewDoc<K extends CollectionName> = Omit<CollectionMap[K], 'id' | 'createdAt'>;
export type Patch<K extends CollectionName> = Partial<Omit<CollectionMap[K], 'id' | 'createdAt'>>;

export interface DataStore {
  readonly mode: 'demo' | 'firebase';
  subscribe<K extends CollectionName>(
    col: K,
    onData: (items: CollectionMap[K][]) => void,
    onError: (e: Error) => void,
  ): () => void;
  add<K extends CollectionName>(col: K, data: NewDoc<K>): Promise<string>;
  /** Crea o reemplaza un documento con id fijo. */
  set<K extends CollectionName>(col: K, id: string, data: NewDoc<K>): Promise<void>;
  update<K extends CollectionName>(col: K, id: string, patch: Patch<K>): Promise<void>;
  remove(col: CollectionName, id: string): Promise<void>;
  /** Guarda la foto de un ticket y regresa una referencia opaca. */
  saveTicket(image: Blob): Promise<string>;
  ticketUrl(ref: string): Promise<string>;
  deleteTicket(ref: string): Promise<void>;
}

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}
