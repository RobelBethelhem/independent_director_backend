import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../common/enums';

export const ROLES_KEY = 'roles';

/** Restricts a route to one or more roles. Enforced by RolesGuard. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
