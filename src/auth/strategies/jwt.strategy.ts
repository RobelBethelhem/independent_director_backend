import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../decorators/current-user.decorator';
import { UserRole } from '../../common/enums';
import { UsersService } from '../../users/users.service';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  /** Unique per issueSession() call — without it, two sessions for the same
   *  user issued within the same wall-clock second would sign byte-identical
   *  JWTs (same payload, same iat), which would defeat single-sign-on
   *  enforcement (an "invalidated" token would still verify). */
  jti: string;
  /** The user's current activeSessionId at issuance time — checked against
   *  the DB on every request (see validate() below). Unlike jti, this stays
   *  constant across a token refresh and only rotates on a fresh login. */
  sid: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  // Passport puts the return value on req.user. A signature+expiry check
  // alone isn't enough for true single-sign-on: an access token stays
  // cryptographically valid for its full ~15-minute TTL even after the
  // session it belongs to is superseded by a new login or explicitly logged
  // out. Checking `sid` against the user's current activeSessionId here
  // makes that revocation take effect on the very next request, not just
  // whenever this token would next try to refresh.
  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    if (!payload.role || !Object.values(UserRole).includes(payload.role)) {
      throw new UnauthorizedException('Invalid token');
    }
    const user = await this.users.findById(payload.sub);
    if (!user || !payload.sid || user.activeSessionId !== payload.sid) {
      throw new UnauthorizedException('Your session is no longer active — please sign in again');
    }
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
