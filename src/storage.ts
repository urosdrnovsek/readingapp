import type { Anchor, Highlight, Preferences } from './reading';
import type { Language } from './content';

export type Bookmark = { key: string; sentence: Anchor };
export type ReadingData = {
  preferences?: Preferences;
  bookmark?: Bookmark;
  highlights: Record<string, Highlight[]>;
  interfaceLanguage?: 'en' | 'sl';
  passageLanguage?: Language;
};

export const emptyData = (): ReadingData => ({ highlights: {} });

function openStore() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('reading-room', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('reading');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Storage is blocked'));
  });
}

export async function loadStore() {
  const db = await openStore();
  const data = await new Promise<ReadingData | undefined>((resolve, reject) => {
    const request = db.transaction('reading').objectStore('reading').get('data');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return {
    data: data ?? emptyData(),
    save(value: ReadingData) {
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('reading', 'readwrite');
        transaction.objectStore('reading').put(value, 'data');
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
    },
  };
}
