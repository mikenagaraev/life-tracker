/**
 * Связь с Google Apps Script: POST JSON {token, action, args} → {ok, result | error}.
 * Content-Type text/plain — так браузер не делает CORS-preflight, который Apps Script не умеет.
 */
export interface Conn {
  url: string;
  token: string;
}

export type ApiErrorKind = 'network' | 'auth' | 'server' | 'config';

export class ApiError extends Error {
  kind: ApiErrorKind;
  constructor(message: string, kind: ApiErrorKind) {
    super(message);
    this.kind = kind;
  }
}

export async function call<T>(conn: Conn | null, action: string, args: object = {}, timeoutMs = 30000): Promise<T> {
  if (!conn || !conn.url || !conn.token) throw new ApiError('Не настроено подключение к таблице', 'config');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(conn.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: conn.token, action, args }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError('Нет связи с таблицей', 'network');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new ApiError(`Сервер ответил ${res.status}`, 'server');
  let data: { ok: boolean; result?: T; error?: string; code?: string };
  try {
    data = await res.json();
  } catch {
    throw new ApiError('Ответ не похож на JSON — проверь ссылку и доступ «Все» у развертывания', 'server');
  }
  if (!data.ok) throw new ApiError(data.error || 'Ошибка сервера', data.code === 'auth' ? 'auth' : 'server');
  return data.result as T;
}

/** Ссылка-приглашение: …/finance/#k=<ключ>&u=<адрес скрипта>. Ключ не уходит на сервер — он в hash. */
export function readConnFromHash(hash: string): Partial<Conn> | null {
  const h = hash.replace(/^#/, '');
  if (!h) return null;
  const p = new URLSearchParams(h);
  const token = p.get('k') || undefined;
  const url = p.get('u') || undefined;
  if (!token && !url) return null;
  return { token, url };
}
