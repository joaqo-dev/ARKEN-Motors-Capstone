import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PublicoService } from './publico.service';

const automotora = {
  id: 'a1',
  nombre: 'Autos Demo',
  subdominio: 'autos-demo',
  email: 'contacto@autosdemo.cl',
  sucursales: [{ id: 's1', nombre: 'Casa Matriz', comuna: 'Providencia' }],
};

function crear(opciones: { automotora?: unknown; enviado?: boolean } = {}) {
  const repo = {
    directorio: jest.fn().mockResolvedValue([
      {
        nombre: 'Autos Demo',
        subdominio: 'autos-demo',
        descripcion: null,
        logo_url: null,
        banner_url: '/archivos/fotos/b.jpg',
        vehiculos: '6',
        comunas: ['Providencia'],
      },
    ]),
    automotora: jest
      .fn()
      .mockResolvedValue('automotora' in opciones ? opciones.automotora : automotora),
  };
  const email = { enviarContactoVitrina: jest.fn().mockResolvedValue(opciones.enviado ?? true) };
  return { service: new PublicoService(repo as never, email as never, {} as never), email };
}

const mensaje = {
  nombre: 'Ana',
  email: 'ana@correo.cl',
  mensaje: 'Me interesa el Yaris, ¿sigue disponible?',
};

describe('PublicoService.contactar', () => {
  it('envía el mensaje al correo de la automotora, con la sucursal elegida', async () => {
    const { service, email } = crear();
    await expect(
      service.contactar('autos-demo', { ...mensaje, sucursalId: 's1' }),
    ).resolves.toEqual({ enviado: true });
    expect(email.enviarContactoVitrina).toHaveBeenCalledWith(
      'contacto@autosdemo.cl',
      expect.objectContaining({
        automotora: 'Autos Demo',
        email: 'ana@correo.cl',
        sucursal: 'Casa Matriz (Providencia)',
      }),
    );
  });

  it('descarta en silencio lo que llena el campo trampa (bots)', async () => {
    const { service, email } = crear();
    await expect(
      service.contactar('autos-demo', { ...mensaje, sitioWeb: 'http://spam' }),
    ).resolves.toEqual({ enviado: true });
    expect(email.enviarContactoVitrina).not.toHaveBeenCalled();
  });

  it('rechaza una sucursal de otra automotora', async () => {
    const { service } = crear();
    await expect(
      service.contactar('autos-demo', { ...mensaje, sucursalId: 'otra' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('automotora inexistente → 404', async () => {
    const { service } = crear({ automotora: null });
    await expect(service.contactar('no-existe', mensaje)).rejects.toThrow(NotFoundException);
  });

  it('si el correo no sale, avisa al visitante', async () => {
    const { service } = crear({ enviado: false });
    await expect(service.contactar('autos-demo', mensaje)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});

describe('PublicoService.directorio', () => {
  it('expone solo datos públicos y la cantidad como número', async () => {
    const { service } = crear();
    await expect(service.directorio()).resolves.toEqual([
      {
        nombre: 'Autos Demo',
        subdominio: 'autos-demo',
        descripcion: null,
        logoUrl: null,
        bannerUrl: '/archivos/fotos/b.jpg',
        vehiculos: 6,
        comunas: ['Providencia'],
      },
    ]);
  });
});
