import { useMemo, useSyncExternalStore } from 'react';
import type { User } from './types';

const USER_STORAGE_KEY = 'brewlite_user';
const TOKEN_STORAGE_KEY = 'brewlite_token';

let listeners: Array<() => void> = [];

export function emitAuthChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function logoutUser() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  }
  emitAuthChange();
}

export function useCurrentUser(): User | null {
  const rawUser = useSyncExternalStore(
    (onStoreChange) => {
      listeners.push(onStoreChange);
      if (typeof window !== 'undefined') {
        window.addEventListener('storage', onStoreChange);
      }
      return () => {
        listeners = listeners.filter((l) => l !== onStoreChange);
        if (typeof window !== 'undefined') {
          window.removeEventListener('storage', onStoreChange);
        }
      };
    },
    () => (typeof window !== 'undefined' ? localStorage.getItem(USER_STORAGE_KEY) : null),
    () => null,
  );

  return useMemo(() => {
    if (!rawUser) return null;
    try {
      return JSON.parse(rawUser) as User;
    } catch {
      return null;
    }
  }, [rawUser]);
}
