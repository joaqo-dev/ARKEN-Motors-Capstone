import { nombreVehiculo } from './transforms';

const n = (value: unknown) => nombreVehiculo({ value });

describe('nombreVehiculo (marca y modelo)', () => {
  it('unifica mayúsculas y espacios', () => {
    expect(n('toyota HILUX')).toBe('Toyota Hilux');
    expect(n('  Toyota   hilux ')).toBe('Toyota Hilux');
  });

  it('deja en mayúsculas las palabras con dígitos y las siglas de marca', () => {
    expect(n('mazda cx-5')).toBe('Mazda CX-5');
    expect(n('toyota rav4')).toBe('Toyota RAV4');
    expect(n('bmw serie 3')).toBe('BMW Serie 3');
  });

  it('deja en mayúsculas las siglas sin vocales (modelos de motos), sin importar cómo se escriban', () => {
    expect(n('honda cb 190r')).toBe('Honda CB 190R');
    expect(n('Yamaha xtz 250')).toBe(n('YAMAHA XTZ 250'));
    expect(n('yamaha xtz 250')).toBe('Yamaha XTZ 250');
    expect(n('ktm duke 390')).toBe('KTM Duke 390');
    expect(n('chevrolet spark gt')).toBe('Chevrolet Spark GT');
  });

  it('respeta guiones y tildes', () => {
    expect(n('MERCEDES-BENZ')).toBe('Mercedes-Benz');
    expect(n('citroën c3 aircross')).toBe('Citroën C3 Aircross');
  });
});
