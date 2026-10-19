import type { AuthResponse, User } from './types';

export type SessionReason = 'logout' | 'expired' | 'unauthorized' | null;
export interface SessionSnapshot {
  status: 'loading' | 'authenticated' | 'anonymous' | 'error';
  token: string | null;
  user: User | null;
  expiresAt: number | null;
  reason: SessionReason;
}
interface Environment {
  storage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  now: () => number;
  schedule: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>;
  cancel: (timer: ReturnType<typeof setTimeout>) => void;
}
const TOKEN_KEY = 'brewlite_token';
const USER_KEY = 'brewlite_user';
const serverSnapshot: SessionSnapshot = {
  status: 'loading',
  token: null,
  user: null,
  expiresAt: null,
  reason: null,
};

function tokenExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) return null;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
    );
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp)
      ? payload.exp * 1000
      : null;
  } catch {
    return null;
  }
}
function activeUser(user: User): boolean {
  return (
    !!user &&
    typeof user.id === 'string' &&
    typeof user.username === 'string' &&
    ['CUSTOMER', 'BARISTA'].includes(user.role) &&
    user.isActive === true
  );
}

// Decoding only schedules UX expiry. The API verifies signatures/claims.
export function createAuthSession(overrides: Partial<Environment> = {}) {
  const env: Environment = {
    storage: () => (typeof window === 'undefined' ? null : window.localStorage),
    now: () => Date.now(),
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (timer) => clearTimeout(timer),
    ...overrides,
  };
  let snapshot = serverSnapshot;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  function storage() {
    try {
      return env.storage();
    } catch {
      return null;
    }
  }
  function notify(next: SessionSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
  function cancelTimer() {
    if (timer !== undefined) env.cancel(timer);
    timer = undefined;
  }
  function clear(reason: SessionReason) {
    generation++;
    cancelTimer();
    try {
      const target = storage();
      target?.removeItem(TOKEN_KEY);
      target?.removeItem(USER_KEY);
    } catch {
      /* Memory logout still works if storage is unavailable. */
    }
    notify({
      status: 'anonymous',
      token: null,
      user: null,
      expiresAt: null,
      reason,
    });
  }
  function checkExpiry() {
    if (snapshot.expiresAt !== null && snapshot.expiresAt <= env.now())
      clear('expired');
  }
  function scheduleExpiry() {
    cancelTimer();
    if (snapshot.expiresAt === null) return;
    timer = env.schedule(
      () => {
        timer = undefined;
        checkExpiry();
        if (snapshot.token) scheduleExpiry();
      },
      Math.max(0, Math.min(snapshot.expiresAt - env.now(), 2147483647)),
    );
  }
  function persist(token: string, user: User) {
    try {
      const target = storage();
      target?.setItem(TOKEN_KEY, token);
      target?.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      /* Keep this tab usable without persistent storage. */
    }
  }
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getToken() {
      checkExpiry();
      return snapshot.token;
    },
    establish(auth: AuthResponse) {
      const expiresAt = tokenExpiry(auth.accessToken);
      if (
        !expiresAt ||
        expiresAt <= env.now() ||
        !activeUser(auth.user) ||
        !Number.isFinite(auth.expiresIn) ||
        auth.expiresIn <= 0
      ) {
        throw new Error(
          'Thông tin phiên đăng nhập không hợp lệ. Vui lòng thử lại.',
        );
      }
      generation++;
      persist(auth.accessToken, auth.user);
      notify({
        status: 'authenticated',
        token: auth.accessToken,
        user: auth.user,
        expiresAt: Math.min(expiresAt, env.now() + auth.expiresIn * 1000),
        reason: null,
      });
      scheduleExpiry();
    },
    logout() {
      clear('logout');
    },
    invalidate(token: string | null) {
      // A response for an earlier login cannot invalidate the newer session.
      if (snapshot.token === token) clear('unauthorized');
    },
    checkExpiry,
    async restore(loadProfile: (token: string) => Promise<User>) {
      let token: string | null = null;
      try {
        token = storage()?.getItem(TOKEN_KEY) ?? null;
      } catch {
        /* No persistence. */
      }
      if (!token) {
        clear(snapshot.token ? 'logout' : snapshot.reason);
        return;
      }
      const expiresAt = tokenExpiry(token);
      if (!expiresAt || expiresAt <= env.now()) {
        clear('expired');
        return;
      }
      const current = ++generation;
      notify({ status: 'loading', token, user: null, expiresAt, reason: null });
      scheduleExpiry();
      try {
        const user = await loadProfile(token);
        if (generation !== current) return;
        checkExpiry();
        if (generation !== current) return;
        if (!activeUser(user)) {
          clear('unauthorized');
          return;
        }
        persist(token, user);
        notify({
          status: 'authenticated',
          token,
          user,
          expiresAt,
          reason: null,
        });
      } catch (error) {
        if (generation !== current) return;
        if ((error as { status?: number })?.status === 401)
          clear('unauthorized');
        else
          notify({
            status: 'error',
            token,
            user: null,
            expiresAt,
            reason: null,
          });
      }
    },
    stop() {
      generation++;
      cancelTimer();
    },
  };
}
export const authSession = createAuthSession();
