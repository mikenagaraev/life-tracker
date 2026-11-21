import { get, set, del } from 'idb-keyval';

/** Хранилище на телефоне (IndexedDB). Если оно недоступно — работаем в памяти. */
const memory = new Map<string, unknown>();

export async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await get<T>(key);
    return v === undefined ? fallback : v;
  } catch {
    return memory.has(key) ? (memory.get(key) as T) : fallback;
  }
}

export async function save<T>(key: string, value: T): Promise<void> {
  memory.set(key, value);
  try {
    await set(key, value);
  } catch {
    /* приватный режим / нет IndexedDB — остаётся копия в памяти */
  }
}

export async function remove(key: string): Promise<void> {
  memory.delete(key);
  try {
    await del(key);
  } catch {
    /* ignore */
  }
}

/** Мелкие удобства (последняя вкладка и т.п.) — в localStorage. */
export function pref(key: string, value?: string): string | null {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
  return value ?? null;
}
