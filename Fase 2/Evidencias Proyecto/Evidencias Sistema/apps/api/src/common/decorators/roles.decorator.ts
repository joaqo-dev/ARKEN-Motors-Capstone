import { SetMetadata } from '@nestjs/common';
import type { RolUsuario } from '@vitriauto/shared-types';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: RolUsuario[]) => SetMetadata(ROLES_KEY, roles);
