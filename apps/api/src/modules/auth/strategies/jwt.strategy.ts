import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'brewlite-super-secret-key-change-in-production',
    });
  }

  async validate(payload: { sub: string; username: string; role: string }) {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }
    return { id: payload.sub, sub: payload.sub, username: payload.username, role: payload.role };
  }
}
