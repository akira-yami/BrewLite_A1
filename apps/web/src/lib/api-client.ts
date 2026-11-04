import { authenticatedRequest as authRequest } from '@/features/auth/api';

export function authenticatedRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const path = endpoint.replace(/^\/api\/v1(?=\/|$)/, '') || '/';
  const headers = new Headers(options.headers);
  if (typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return authRequest<T>(path, { ...options, headers });
}
