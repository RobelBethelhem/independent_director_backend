import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../decorators/current-user.decorator';
import { UserRole } from '../../common/enums';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  /** Unique per issueSession() call — without it, two sessions for the same
   *  user issued within the same wall-clock second would sign byte-identical
   *  JWTs (same payload, same iat), which would defeat single-sign-on
   *  enforcement (an "invalidated" token would still verify). */
  jti: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  // Passport puts the return value on req.user. Defense-in-depth: a real
  // access token always carries a valid role; mid-login challenge tokens
  // (2FA step, session-conflict step) deliberately don't and are signed with
  // a different secret anyway, but reject on shape too in case that ever changes.
  validate(payload: AccessTokenPayload): AuthUser {
    if (!payload.role || !Object.values(UserRole).includes(payload.role)) {
      throw new UnauthorizedException('Invalid token');
    }
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
