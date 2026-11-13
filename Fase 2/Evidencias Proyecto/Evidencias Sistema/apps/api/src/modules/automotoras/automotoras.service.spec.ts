import { BadRequestException } from '@nestjs/common';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { AutomotorasService } from './automotoras.service';

const ag: UsuarioAutenticado = {
  id: 'ag',
  automotoraId: 'a1',
  sucursalId: null,
  rol: 'ADMIN_GENERAL',
};
const fila = {
  id: 'a1',
  nombre: 'Autos Demo',
  rut: '11111111-1',
  subdominio: 'autos-demo',
  direccion: 'Av. 1',
  telefono: '+56911111111',
  email: 'c@demo.cl',
  descripcion: null,
  logo_url: '/archivos/fotos/viejo.png',
  banner_url: null,
  dias_validez_cotizacion: 15,
  dias_validez_reserva: 3,
  dias_validez_tasacion: 15,
  correo_cotizacion: true,
  correo_reserva: true,
  correo_tasacion: true,
  correo_venta: true,
  correo_consignacion: true,
  dias_seguimiento_cotizacion: 3,
  dias_aviso_cotizacion: 2,
  dias_aviso_reserva: 1,
  dias_aviso_tasacion: 2,
  financiamiento_activo: false,
  financiamiento_tasa_mensual: null as string | null,
  financiamiento_pie_minimo: 20,
  financiamiento_plazo_maximo: 48,
  fecha_registro: new Date(),
};

function crearServicio() {
  const automotoras = {
    lockById: jest.fn().mockResolvedValue(fila),
    update: jest.fn().mockImplementation(async (_id, c) => ({
      ...fila,
      dias_validez_cotizacion: c.diasValidezCotizacion ?? 15,
    })),
    setImagen: jest.fn(),
    findById: jest.fn().mockResolvedValue(fila),
  };
  const auditoria = { registrar: jest.fn() };
  const almacenamiento = {
    validarFoto: jest.fn().mockReturnValue({}),
    guardarFoto: jest.fn().mockResolvedValue('/archivos/fotos/nuevo.png'),
    eliminar: jest.fn(),
  };
  const tx = { run: jest.fn().mockImplementation((fn) => fn({})) };
  const service = new AutomotorasService(
    automotoras as never,
    auditoria as never,
    almacenamiento as never,
    tx as never,
  );
  return { service, automotoras, auditoria, almacenamiento };
}

describe('AutomotorasService', () => {
  it('rechaza un RUT inválido', async () => {
    const { service } = crearServicio();
    await expect(service.actualizar({ rut: '11.111.111-2' }, ag)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('no activa el simulador de crédito sin tasa', async () => {
    const { service, automotoras } = crearServicio();
    await expect(service.actualizar({ financiamientoActivo: true }, ag)).rejects.toThrow(
      BadRequestException,
    );
    expect(automotoras.update).not.toHaveBeenCalled();
  });

  it('no deja quitar la tasa con el simulador activo', async () => {
    const { service, automotoras } = crearServicio();
    automotoras.lockById.mockResolvedValue({
      ...fila,
      financiamiento_activo: true,
      financiamiento_tasa_mensual: '1.50',
    });
    await expect(service.actualizar({ financiamientoTasaMensual: null }, ag)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('activa el simulador cuando trae la tasa', async () => {
    const { service, automotoras } = crearServicio();
    await service.actualizar({ financiamientoActivo: true, financiamientoTasaMensual: 1.5 }, ag);
    expect(automotoras.update).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ financiamientoActivo: true, financiamientoTasaMensual: 1.5 }),
      expect.anything(),
    );
  });

  it('audita el cambio de vigencia a nivel automotora', async () => {
    const { service, auditoria } = crearServicio();
    await service.actualizar({ diasValidezCotizacion: 30 }, ag);
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'CONFIGURACION_EDITADA',
        sucursalId: null,
        valorAnterior: expect.objectContaining({ diasValidezCotizacion: 15 }),
        valorNuevo: expect.objectContaining({ diasValidezCotizacion: 30 }),
      }),
      expect.anything(),
    );
  });

  it('al reemplazar el logo borra el archivo anterior después del commit', async () => {
    const { service, automotoras, almacenamiento } = crearServicio();
    await service.subirImagen('LOGO', { buffer: Buffer.from('x') }, ag);
    expect(automotoras.setImagen).toHaveBeenCalledWith(
      'a1',
      'LOGO',
      '/archivos/fotos/nuevo.png',
      expect.anything(),
    );
    expect(almacenamiento.eliminar).toHaveBeenCalledWith('/archivos/fotos/viejo.png');
  });
});
