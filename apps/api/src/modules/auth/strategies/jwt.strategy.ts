import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const jwtSecret =
      process.env.JWT_SECRET ||
      (process.env.NODE_ENV === 'test' ? 'test-jwt-secret-for-isolated-tests-only-32bytes-long' : undefined);
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required and has no default fallback');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
      issuer: process.env.JWT_ISSUER || 'brewlite-api',
      audience: process.env.JWT_AUDIENCE || 'brewlite-web',
    });
  }

  async validate(payload: { sub: string; username: string; role: string }) {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }
    return { id: payload.sub, sub: payload.sub, username: payload.username, role: payload.role };
  }
}
