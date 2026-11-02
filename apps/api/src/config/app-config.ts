export interface AppConfig {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtExpiresInSeconds: number;
  orderReservationTtlMinutes: number;
}

type Environment = Record<string, string | undefined>;
const MAX_JWT_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_ORDER_RESERVATION_TTL_MINUTES = 7 * 24 * 60;

function parseJwtExpiresIn(value: string | undefined): number {
  const normalized = value?.trim() || '15m';
  const match = /^(\d+)(s|m|h|d)$/i.exec(normalized);

  if (!match) {
    throw new Error('JWT_EXPIRES_IN must be a positive duration such as 15m, 900s, 1h, or 1d');
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const secondsPerUnitByUnit: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  const secondsPerUnit = secondsPerUnitByUnit[unit];
  const seconds = amount * secondsPerUnit;

  if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds > MAX_JWT_TTL_SECONDS) {
    throw new Error('JWT_EXPIRES_IN must resolve to a duration between 1 second and 7 days');
  }

  return seconds;
}

function parsePositiveInteger(name: string, value: string | undefined, defaultValue: number): number {
  const normalized = value?.trim();
  if (!normalized) return defaultValue;

  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${name} must be a positive integer`);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_ORDER_RESERVATION_TTL_MINUTES) {
    throw new Error(`${name} must be a positive integer no greater than 10080`);
  }

  return parsed;
}

export function loadAppConfig(env: Environment = process.env): AppConfig {
  const jwtSecret = env.JWT_SECRET?.trim();
  const isTest = env.NODE_ENV === 'test';

  if (!jwtSecret && !isTest) {
    throw new Error('JWT_SECRET environment variable is required and has no default fallback');
  }

  const jwtExpiresInSeconds = parseJwtExpiresIn(env.JWT_EXPIRES_IN);

  return {
    jwtSecret: jwtSecret || 'test-jwt-secret-for-isolated-tests-only-32bytes-long',
    jwtIssuer: env.JWT_ISSUER?.trim() || 'brewlite-api',
    jwtAudience: env.JWT_AUDIENCE?.trim() || 'brewlite-web',
    jwtExpiresInSeconds,
    orderReservationTtlMinutes: parsePositiveInteger(
      'ORDER_RESERVATION_TTL_MINUTES',
      env.ORDER_RESERVATION_TTL_MINUTES,
      15,
    ),
  };
}
