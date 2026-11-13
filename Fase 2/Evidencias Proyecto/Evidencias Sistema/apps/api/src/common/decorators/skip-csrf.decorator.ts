import { SetMetadata } from '@nestjs/common';

export const SKIP_CSRF_KEY = 'skipCsrf';

// Solo para endpoints públicos previos a tener sesión (aún no existe cookie CSRF).
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);
