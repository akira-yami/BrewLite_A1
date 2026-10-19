'use client';

import { useSyncExternalStore } from 'react';
import { authSession } from './session';

export function useAuthSession() {
  return useSyncExternalStore(
    authSession.subscribe,
    authSession.getSnapshot,
    authSession.getServerSnapshot,
  );
}
