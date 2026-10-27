'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { authSession } from './session';
import { getMeApi } from './api';
import { useAuthSession } from './use-auth-session';

export function AuthSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = useAuthSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const previousToken = useRef<string | null>(null);
  useEffect(() => {
    const restore = () => {
      void authSession.restore(getMeApi);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'brewlite_token') restore();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') authSession.checkExpiry();
    };
    restore();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      authSession.stop();
    };
  }, []);
  useEffect(() => {
    if (
      session.reason ||
      (previousToken.current &&
        session.token &&
        previousToken.current !== session.token)
    ) {
      void queryClient.cancelQueries();
      queryClient.clear();
    }
    previousToken.current = session.token;
    if (session.reason) router.replace('/login');
  }, [session.reason, session.token, queryClient, router]);
  return children;
}
