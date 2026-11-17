import { BadRequestException } from '@nestjs/common';
import {
  avisoMesRevision,
  validarDocumentoLegal,
  vencimientoHomologacion,
  vencimientosPosibles,
} from '@vitriauto/shared-types';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { VehiculoArchivosService } from './vehiculo-archivos.service';

// Patente terminada en 4: revisión técnica en julio.
const auto = { patente: 'BCDF14', anio: 2020 };
const HOY = '2026-11-06';

describe('Reglas de documentos legales (Módulo 7.5)', () => {
  it('SOAP y permiso total solo vencen un 31 de marzo, a lo más el del período ya pagable', () => {
    expect(vencimientosPosibles('POLIZA_SOAP', HOY, 2)).toEqual(['2027-03-31', '2026-03-31']);
    const ok = validarDocumentoLegal(
      { tipo: 'SOAP', respaldo: 'POLIZA_SOAP', fechaVencimiento: '2027-03-31' },
      auto,
      HOY,
    );
    expect(ok).toEqual({ ok: true, fechaVencimiento: '2027-03-31', fechaPrimeraInscripcion: null });
    // Un período que aún no se puede pagar: es el caso "le pusieron un año más".
    expect(
      validarDocumentoLegal(
        { tipo: 'SOAP', respaldo: 'POLIZA_SOAP', fechaVencimiento: '2028-03-31' },
        auto,
        HOY,
      ).ok,
    ).toBe(false);
    expect(
      validarDocumentoLegal(
        {
          tipo: 'PERMISO_CIRCULACION',
          respaldo: 'PERMISO_PAGO_TOTAL',
          fechaVencimiento: '2027-02-15',
        },
        auto,
        HOY,
      ).ok,
    ).toBe(false);
  });

  it('en enero todavía no se puede pagar el período siguiente', () => {
    expect(vencimientosPosibles('PERMISO_PAGO_TOTAL', '2027-01-20', 1)).toEqual(['2027-03-31']);
    expect(vencimientosPosibles('PERMISO_PAGO_TOTAL', '2027-02-01', 1)).toEqual(['2028-03-31']);
  });

  it('permiso en cuotas: con la primera vence el 31 de agosto del año de pago', () => {
    expect(vencimientosPosibles('PERMISO_PRIMERA_CUOTA', HOY, 1)).toEqual(['2026-08-31']);
    expect(
      validarDocumentoLegal(
        {
          tipo: 'PERMISO_CIRCULACION',
          respaldo: 'PERMISO_PRIMERA_CUOTA',
          fechaVencimiento: '2027-08-31',
        },
        auto,
        HOY,
      ).ok,
    ).toBe(false);
  });

  it('el respaldo tiene que corresponder al tipo', () => {
    expect(
      validarDocumentoLegal(
        { tipo: 'SOAP', respaldo: 'PERMISO_PAGO_TOTAL', fechaVencimiento: '2027-03-31' },
        auto,
        HOY,
      ).ok,
    ).toBe(false);
  });

  it('la revisión técnica no puede vencer a más de 12 meses; el mes distinto solo avisa', () => {
    const revision = (fechaVencimiento: string) =>
      validarDocumentoLegal(
        { tipo: 'REVISION_TECNICA', respaldo: 'CERTIFICADO_REVISION', fechaVencimiento },
        auto,
        HOY,
      );
    expect(revision('2027-07-31').ok).toBe(true);
    expect(revision('2027-11-30').ok).toBe(true);
    expect(revision('2027-12-31').ok).toBe(false);
    // Ya vencida: se acepta (el vehículo llegó así) y queda avisada.
    expect(revision('2025-07-31').ok).toBe(true);
    expect(avisoMesRevision('BCDF14', '2027-07-31')).toBeNull();
    expect(avisoMesRevision('BCDF14', '2027-03-31')).toMatch(/julio/);
  });

  it('homologación: el vencimiento se calcula desde la primera inscripción y la patente', () => {
    expect(vencimientoHomologacion('2026-06-10', 'BCDF14')).toBe('2028-07-31');
    const nuevo = { patente: 'BCDF14', anio: 2026 };
    const r = validarDocumentoLegal(
      {
        tipo: 'REVISION_TECNICA',
        respaldo: 'CERTIFICADO_HOMOLOGACION',
        fechaVencimiento: '2030-01-01', // se ignora: lo fija la regla
        fechaPrimeraInscripcion: '2026-06-10',
      },
      nuevo,
      HOY,
    );
    expect(r).toEqual({
      ok: true,
      fechaVencimiento: '2028-07-31',
      fechaPrimeraInscripcion: '2026-06-10',
    });
  });

  it('homologación: rechaza inscripciones futuras, imposibles para el año, o ya fuera de la exención', () => {
    const homologacion = (fechaPrimeraInscripcion: string, anio: number) =>
      validarDocumentoLegal(
        { tipo: 'REVISION_TECNICA', respaldo: 'CERTIFICADO_HOMOLOGACION', fechaPrimeraInscripcion },
        { patente: 'BCDF14', anio },
        HOY,
      );
    expect(homologacion('2026-12-01', 2026).ok).toBe(false);
    expect(homologacion('2019-05-01', 2026).ok).toBe(false);
    // Inscrito en 2023: su exención terminó en julio de 2025.
    expect(homologacion('2023-05-01', 2023).ok).toBe(false);
  });
});

// ------------------------------------------------------------ Carga

const vendedor: UsuarioAutenticado = {
  id: 'ven',
  automotoraId: 'a1',
  sucursalId: '11111111-1111-1111-1111-111111111111',
  rol: 'VENDEDOR',
};

function crearServicio() {
  const vehiculo = {
    id: 'v1',
    automotora_id: 'a1',
    sucursal_id: vendedor.sucursalId,
    patente: 'BCDF14',
    anio: 2020,
  };
  const vehiculos = {
    findByIdScoped: jest.fn().mockResolvedValue(vehiculo),
    lockById: jest.fn().mockResolvedValue(vehiculo),
  };
  const documentos = {
    renovar: jest.fn().mockImplementation(async (d) => ({
      id: 'd1',
      vehiculo_id: 'v1',
      tipo: d.tipo,
      respaldo: d.respaldo,
      archivo_url: d.archivoClave,
      fecha_vencimiento: d.fechaVencimiento,
      fecha_primera_inscripcion: d.fechaPrimeraInscripcion,
      fecha_carga: new Date(),
      cargado_por: d.cargadoPor,
      cargado_por_nombre: 'Vendedor',
      vigente: true,
    })),
  };
  const almacenamiento = {
    validarDocumento: jest.fn().mockReturnValue({}),
    guardarDocumento: jest.fn().mockResolvedValue('clave'),
    eliminar: jest.fn(),
  };
  const auditoria = { registrar: jest.fn() };
  const tx = { run: (fn: (c: unknown) => unknown) => fn({}) };
  const servicio = new VehiculoArchivosService(
    vehiculos as never,
    {} as never,
    documentos as never,
    almacenamiento as never,
    auditoria as never,
    tx as never,
  );
  return { servicio, documentos, auditoria, almacenamiento };
}

describe('Carga de documentos legales', () => {
  it('una fecha imposible se rechaza antes de guardar el archivo', async () => {
    const { servicio, almacenamiento } = crearServicio();
    await expect(
      servicio.subirDocumento(
        'v1',
        { buffer: Buffer.from('x') },
        { tipo: 'SOAP', respaldo: 'POLIZA_SOAP', fechaVencimiento: '2031-03-31' },
        vendedor,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(almacenamiento.guardarDocumento).not.toHaveBeenCalled();
  });

  it('en la homologación guarda el vencimiento calculado, no el que mande el cliente', async () => {
    const { servicio, documentos, auditoria } = crearServicio();
    const hoy = new Date().getFullYear();
    await servicio.subirDocumento(
      'v1',
      { buffer: Buffer.from('x') },
      {
        tipo: 'REVISION_TECNICA',
        respaldo: 'CERTIFICADO_HOMOLOGACION',
        fechaVencimiento: '2099-01-01',
        fechaPrimeraInscripcion: `${hoy}-01-15`,
      },
      { ...vendedor },
    );
    const guardado = documentos.renovar.mock.calls[0][0];
    expect(guardado.fechaVencimiento).toBe(`${hoy + 2}-07-31`);
    expect(guardado.cargadoPor).toBe('ven');
    expect(auditoria.registrar.mock.calls[0][0].valorNuevo).toMatchObject({
      respaldo: 'CERTIFICADO_HOMOLOGACION',
      fechaPrimeraInscripcion: `${hoy}-01-15`,
    });
  });
});
