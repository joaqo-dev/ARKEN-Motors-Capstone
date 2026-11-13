import { getScope } from './scope';

describe('getScope', () => {
  const base = { id: 'u1', automotoraId: 'a1', sucursalId: 's1' };

  it('ADMIN_GENERAL filtra solo por automotora', () => {
    expect(getScope({ ...base, rol: 'ADMIN_GENERAL' })).toEqual({
      automotoraId: 'a1',
      sucursalId: null,
    });
  });

  it.each(['ADMIN_SUCURSAL', 'VENDEDOR'] as const)('%s filtra por automotora + sucursal', (rol) => {
    expect(getScope({ ...base, rol })).toEqual({ automotoraId: 'a1', sucursalId: 's1' });
  });
});
