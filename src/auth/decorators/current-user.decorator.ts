import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../../common/enums';

/** Shape attached to req.user by JwtStrategy.validate(). */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

/** Injects the authenticated user (or a single property of it) into a handler. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    return data && user ? user[data] : user;
  },
);
