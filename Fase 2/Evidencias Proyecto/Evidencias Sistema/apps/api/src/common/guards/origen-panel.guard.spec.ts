import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AppConfig } from '../../config/env';
import { OrigenPanelGuard } from './origen-panel.guard';

const guard = new OrigenPanelGuard({ CORS_ORIGINS: ['https://app.ejemplo.cl'] } as AppConfig);
const ctx = (method: string, origin?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ method, header: (n: string) => (n === 'origin' ? origin : undefined) }),
    }),
  }) as unknown as ExecutionContext;

describe('OrigenPanelGuard', () => {
  it('rechaza un POST desde otro sitio (login CSRF)', () => {
    expect(() => guard.canActivate(ctx('POST', 'https://atacante.com'))).toThrow(
      ForbiddenException,
    );
  });
  it('acepta el panel y peticiones sin Origin', () => {
    expect(guard.canActivate(ctx('POST', 'https://app.ejemplo.cl'))).toBe(true);
    expect(guard.canActivate(ctx('POST'))).toBe(true);
    expect(guard.canActivate(ctx('GET', 'https://atacante.com'))).toBe(true);
  });
});
