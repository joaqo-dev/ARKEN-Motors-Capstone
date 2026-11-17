import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import type { CorreoRow, DocumentoCorreoRow } from './correos.repository';
import { CorreosService, MAX_INTENTOS } from './correos.service';
import { contenidoCorreo, cuando, motivoDescarte, whatsappSucursal } from './reglas';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
}));

const documento = (cambios: Partial<DocumentoCorreoRow> = {}): DocumentoCorreoRow => ({
  automotora_id: 'a1',
  automotora_nombre: 'Autos Demo',
  automotora_email: 'contacto@demo.cl',
  scope_sucursal_id: 's1',
  sucursal_nombre: 'Casa matriz',
  sucursal_direccion: 'Av. Siempre Viva 123',
  sucursal_comuna: 'Providencia',
  sucursal_telefono: '+56222334455',
  sucursal_whatsapp: '+56912345678',
  cliente_id: '7b1f2f9e-3c55-4c2a-9a55-0d6f3b1e2a10',
  cliente_nombre: 'Ana María Pérez',
  cliente_email: 'ana@correo.cl',
  cliente_activo: true,
  acepta_recordatorios: true,
  folio: 12,
  estado: 'VIGENTE',
  fecha_vencimiento: '2026-10-10',
  vehiculo: 'Toyota Corolla 2020',
  patente: 'ABCD12',
  vehiculo_estado: 'DISPONIBLE',
  monto: '12990000.00',
  envio_automatico: true,
  ...cambios,
});

const correo = (cambios: Partial<CorreoRow> = {}): CorreoRow => ({
  id: 'c1',
  automotora_id: 'a1',
  documento_tipo: 'COTIZACION',
  documento_id: 'd1',
  tipo: 'DOCUMENTO',
  destinatario: 'ana@correo.cl',
  estado: 'PENDIENTE',
  intentos: 1,
  ultimo_error: null,
  fecha_creacion: new Date(),
  fecha_envio: null,
  ...cambios,
});

const vendedor: UsuarioAutenticado = {
  id: 'u1',
  automotoraId: 'a1',
  sucursalId: 's1',
  rol: 'VENDEDOR',
};

function crear(doc: DocumentoCorreoRow | null = documento()) {
  const repo = {
    documento: jest.fn().mockResolvedValue(doc),
    encolar: jest.fn().mockResolvedValue(true),
    tomarPendientes: jest.fn().mockResolvedValue([]),
    marcarEnviado: jest.fn(),
    reprogramar: jest.fn(),
    cerrar: jest.fn(),
    historial: jest.fn().mockResolvedValue([]),
    cliente: jest.fn().mockResolvedValue({
      nombre: 'Ana María Pérez',
      automotora: 'Autos Demo',
      acepta_recordatorios: false,
    }),
    fijarRecordatorios: jest.fn(),
  };
  const email = { enviarAlCliente: jest.fn().mockResolvedValue({ id: 'resend-1' }) };
  const pdf = { ruta: jest.fn().mockResolvedValue({ ruta: '/tmp/x.pdf' }) };
  const config = { SITIO_URL: 'https://autos.cl', JWT_SECRET: 'x'.repeat(40) };
  const auditoria = { registrar: jest.fn() };
  const tx = { run: jest.fn().mockImplementation((fn) => fn({ cliente: 'tx' })) };
  const service = new CorreosService(
    repo as never,
    email as never,
    pdf as never,
    auditoria as never,
    tx as never,
    config as never,
  );
  return { service, repo, email, auditoria };
}

describe('reglas de correos', () => {
  it('descarta el seguimiento si el vehículo ya no está disponible', () => {
    expect(
      motivoDescarte('SEGUIMIENTO_COTIZACION', documento({ vehiculo_estado: 'RESERVADO' })),
    ).toBe('El vehículo ya no está disponible');
    expect(motivoDescarte('SEGUIMIENTO_COTIZACION', documento())).toBeNull();
  });

  it('respeta la baja en seguimientos y avisos de cotización/tasación, no en la reserva', () => {
    const sinRecordatorios = documento({ acepta_recordatorios: false });
    expect(motivoDescarte('COTIZACION_POR_VENCER', sinRecordatorios)).toMatch(/no recibir/);
    expect(motivoDescarte('TASACION_POR_VENCER', sinRecordatorios)).toMatch(/no recibir/);
    expect(motivoDescarte('RESERVA_POR_VENCER', sinRecordatorios)).toBeNull();
    expect(motivoDescarte('DOCUMENTO', sinRecordatorios)).toBeNull();
  });

  it('no envía recordatorios de documentos que dejaron de estar vigentes', () => {
    expect(motivoDescarte('COTIZACION_POR_VENCER', documento({ estado: 'CONCRETADA' }))).toMatch(
      /CONCRETADA/,
    );
    expect(motivoDescarte('DOCUMENTO', documento({ estado: 'ANULADA' }))).toBe(
      'El documento fue anulado',
    );
  });

  it('arma el contenido con "hoy" / "mañana" y el enlace de baja solo donde corresponde', () => {
    expect(cuando('2026-10-10', '2026-10-10')).toBe('hoy');
    expect(cuando('2026-10-10', '2026-10-09')).toBe('mañana');
    expect(cuando('2026-10-17', '2026-10-02')).toBe('el sábado 17 de octubre');
    const aviso = contenidoCorreo('COTIZACION_POR_VENCER', 'COTIZACION', documento(), '2026-10-09');
    expect(aviso.asunto).toBe('Tu cotización del Toyota Corolla 2020 vence mañana');
    expect(aviso.permiteBaja).toBe(true);
    expect(
      contenidoCorreo('RESERVA_POR_VENCER', 'RESERVA', documento(), '2026-10-09').permiteBaja,
    ).toBe(false);
  });

  it('usa el WhatsApp de la sucursal, o su teléfono si es celular', () => {
    expect(whatsappSucursal(documento())).toBe('56912345678');
    expect(whatsappSucursal(documento({ sucursal_whatsapp: null }))).toBeNull();
    expect(
      whatsappSucursal(documento({ sucursal_whatsapp: null, sucursal_telefono: '9 8765 4321' })),
    ).toBe('56987654321');
  });
});

describe('CorreosService', () => {
  it('al emitir encola el PDF con clave única si la automotora lo tiene activo', async () => {
    const { service, repo } = crear();
    await service.alEmitir('COTIZACION', 'd1', vendedor);
    expect(repo.encolar).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'DOCUMENTO',
        destinatario: 'ana@correo.cl',
        claveEvento: 'DOCUMENTO:d1',
        usuarioId: 'u1',
      }),
    );
  });

  it('la casilla del formulario manda sobre la configuración', async () => {
    const { service, repo } = crear(documento({ envio_automatico: true }));
    await service.alEmitir('COTIZACION', 'd1', vendedor, false);
    expect(repo.encolar).not.toHaveBeenCalled();

    const otro = crear(documento({ envio_automatico: false }));
    await otro.service.alEmitir('COTIZACION', 'd1', vendedor, true);
    expect(otro.repo.encolar).toHaveBeenCalled();
  });

  it('alEmitir nunca lanza', async () => {
    const { service, repo } = crear();
    repo.documento.mockRejectedValue(new Error('BD caída'));
    await expect(service.alEmitir('VENTA', 'd1', vendedor)).resolves.toBeUndefined();
  });

  it('envía con el nombre de la automotora, responder a su email y el PDF adjunto', async () => {
    const { service, repo, email } = crear();
    repo.tomarPendientes.mockResolvedValueOnce([correo()]);
    await service.procesarBandeja();
    expect(email.enviarAlCliente).toHaveBeenCalledWith(
      expect.objectContaining({
        automotora: 'Autos Demo',
        responderA: 'contacto@demo.cl',
        para: 'ana@correo.cl',
        adjunto: expect.objectContaining({ nombre: 'cotizacion-12.pdf' }),
      }),
    );
    expect(repo.marcarEnviado).toHaveBeenCalledWith('c1', 'resend-1');
  });

  it('descarta el recordatorio que ya no corresponde, sin enviarlo', async () => {
    const { service, repo, email } = crear(documento({ vehiculo_estado: 'VENDIDO' }));
    repo.tomarPendientes.mockResolvedValueOnce([correo({ tipo: 'SEGUIMIENTO_COTIZACION' })]);
    await service.procesarBandeja();
    expect(email.enviarAlCliente).not.toHaveBeenCalled();
    expect(repo.cerrar).toHaveBeenCalledWith(
      'c1',
      'DESCARTADO',
      'El vehículo ya no está disponible',
    );
  });

  it('reintenta con espera creciente y al último intento lo deja FALLIDO', async () => {
    const { service, repo, email } = crear();
    email.enviarAlCliente.mockRejectedValue(new Error('Resend caído'));
    repo.tomarPendientes.mockResolvedValueOnce([correo({ intentos: 2 })]);
    await service.procesarBandeja();
    expect(repo.reprogramar).toHaveBeenCalledWith('c1', 'Resend caído', 4);

    repo.tomarPendientes.mockResolvedValueOnce([correo({ intentos: MAX_INTENTOS })]);
    await service.procesarBandeja();
    expect(repo.cerrar).toHaveBeenCalledWith('c1', 'FALLIDO', 'Resend caído');
  });

  it('el historial y el reenvío respetan el scope de sucursal', async () => {
    const { service } = crear(documento({ scope_sucursal_id: 'otra' }));
    await expect(service.historial('COTIZACION', 'd1', vendedor)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('el reenvío manual queda en la auditoría del documento, con su sucursal', async () => {
    const { service, auditoria } = crear();
    await service.reenviar('COTIZACION', 'd1', vendedor);
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'DOCUMENTO_REENVIADO',
        entidadTipo: 'COTIZACION',
        entidadId: 'd1',
        sucursalId: documento().scope_sucursal_id,
      }),
      { cliente: 'tx' },
    );
  });

  it('no reenvía un documento anulado', async () => {
    const { service } = crear(documento({ estado: 'ANULADA' }));
    await expect(service.reenviar('COTIZACION', 'd1', vendedor)).rejects.toThrow(ConflictException);
  });

  it('el enlace de baja es válido solo con la firma correcta', async () => {
    const { service, repo } = crear();
    const token = service.tokenBaja('7b1f2f9e-3c55-4c2a-9a55-0d6f3b1e2a10');
    await expect(service.cambiarRecordatorios(token, false)).resolves.toMatchObject({
      nombre: 'Ana',
      aceptaRecordatorios: false,
    });
    expect(repo.fijarRecordatorios).toHaveBeenCalledWith(
      '7b1f2f9e-3c55-4c2a-9a55-0d6f3b1e2a10',
      false,
    );
    await expect(service.estadoRecordatorios(`${token.split('.')[0]}.falsa`)).rejects.toThrow(
      BadRequestException,
    );
  });
});
