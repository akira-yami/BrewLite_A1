import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

export interface JwtPayload {
  sub: string;        // user UUID
  role: 'CUSTOMER' | 'BARISTA';
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
}

function base64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64url');
}

function sign(payload: object, secret: string, expiresInSeconds: number, issuer: string, audience: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(JSON.stringify({ ...payload, iss: issuer, aud: audience, iat: now, exp: now + expiresInSeconds }));
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verify(token: string, secret: string, issuer: string, audience: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [header, body, sig] = parts;
  const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as { alg?: string; typ?: string };
  if (decodedHeader.alg !== 'HS256' || decodedHeader.typ !== 'JWT') throw new Error('invalid token header');
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  // Compare the encoded signatures so alternate base64 spellings are rejected.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('invalid signature');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload & { exp?: number };
  if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('token expired');
  }
  if (payload.iss !== issuer || payload.aud !== audience) throw new Error('invalid token issuer or audience');
  if (!payload.sub || !['CUSTOMER', 'BARISTA'].includes(payload.role)) throw new Error('invalid token claims');
  return payload;
}

export const jwt = { sign, verify };
