import { hoyEnChile, sumarDias, sumarDiasHabiles } from './fechas';

describe('fechas', () => {
  it('sumarDias cruza meses y años bisiestos', () => {
    expect(sumarDias('2026-01-30', 3)).toBe('2026-02-02');
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDias('2026-12-31', 15)).toBe('2027-01-15');
  });

  it('hoyEnChile usa la hora de Chile, no UTC', () => {
    // 02:00 UTC del 1 de octubre = 23:00 del 30 de septiembre en Chile (UTC-3).
    expect(hoyEnChile(new Date('2026-10-01T02:00:00Z'))).toBe('2026-09-30');
  });

  it('sumarDiasHabiles salta sábados y domingos', () => {
    // Martes 29-09-2026 + 7 hábiles = jueves 08-10-2026.
    expect(sumarDiasHabiles('2026-09-29', 7)).toBe('2026-10-08');
    // Viernes + 1 hábil = lunes.
    expect(sumarDiasHabiles('2026-10-02', 1)).toBe('2026-10-05');
  });
});
