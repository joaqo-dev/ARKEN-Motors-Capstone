import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { sugerirResultado, SECCIONES_INSPECCION } from '@vitriauto/shared-types';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import type { InspeccionDetalleRow, PuntoRow } from './inspecciones.repository';
import { agruparPuntos, InspeccionesService } from './inspecciones.service';

const vendedor: UsuarioAutenticado = {
  id: 'u1',
  automotoraId: 'a1',
  sucursalId: 's1',
  rol: 'VENDEDOR',
};

const vehiculo = {
  id: 'v1',
  automotora_id: 'a1',
  sucursal_id: 's1',
  marca: 'Toyota',
  modelo: 'Hilux',
  anio: 2016,
  version: null,
  patente: 'JVTG65',
  kilometraje: 110000,
  estado: 'DISPONIBLE',
};

const inspeccion = (cambios: Partial<InspeccionDetalleRow> = {}): InspeccionDetalleRow => ({
  id: 'i1',
  automotora_id: 'a1',
  sucursal_id: 's1',
  vehiculo_id: 'v1',
  kilometraje: 110000,
  observaciones: null,
  estado: 'BORRADOR',
  resultado: null,
  usuario_id: 'u1',
  fecha_creacion: new Date(),
  usuario_finalizacion_id: null,
  fecha_finalizacion: null,
  usuario_nombre: 'Ana',
  finalizada_por: null,
  puntos_total: 2,
  puntos_evaluados: 0,
  ...cambios,
});

const punto = (cambios: Partial<PuntoRow> = {}): PuntoRow => ({
  id: 'p1',
  seccion: 'MOTOR',
  codigo: 'aceite',
  nombre: 'Nivel y estado del aceite',
  orden: 1,
  evaluacion: null,
  observacion: null,
  nota_interna: 'secreto',
  fotos: [],
  ...cambios,
});

function crear(insp = inspeccion(), puntos: PuntoRow[] = [punto()]) {
  const repo = {
    porId: jest.fn().mockResolvedValue(insp),
    bloquear: jest.fn().mockResolvedValue(insp),
    puntos: jest.fn().mockResolvedValue(puntos),
    punto: jest
      .fn()
      .mockImplementation(async (id: string) => puntos.find((p) => p.id === id) ?? null),
    crear: jest.fn().mockResolvedValue('i1'),
    finalizar: jest.fn(),
    eliminarPunto: jest.fn().mockResolvedValue([]),
    contarFotos: jest.fn().mockResolvedValue(5),
    agregarFoto: jest.fn(),
  };
  const vehiculos = { findByIdScoped: jest.fn().mockResolvedValue(vehiculo) };
  const bitacora = { registrar: jest.fn() };
  const auditoria = { registrar: jest.fn() };
  const almacenamiento = { validarFoto: jest.fn(), guardarFoto: jest.fn(), eliminar: jest.fn() };
  const tx = { run: jest.fn().mockImplementation((fn) => fn({})) };
  const service = new InspeccionesService(
    repo as never,
    vehiculos as never,
    {} as never,
    bitacora as never,
    auditoria as never,
    almacenamiento as never,
    {} as never,
    tx as never,
  );
  return { service, repo, vehiculos, bitacora, auditoria };
}

describe('sugerirResultado', () => {
  it('algún Malo → No aprobado; algún Regular → con observaciones; si no, Aprobado', () => {
    expect(sugerirResultado(['BUENO', 'MALO', 'REGULAR'])).toBe('NO_APROBADO');
    expect(sugerirResultado(['BUENO', 'REGULAR', 'NO_APLICA'])).toBe('APROBADO_CON_OBSERVACIONES');
    expect(sugerirResultado(['BUENO', 'NO_APLICA'])).toBe('APROBADO');
  });
});

describe('InspeccionesService', () => {
  it('crea el borrador con toda la lista estándar y el kilometraje del vehículo', async () => {
    const { service, repo } = crear();
    await service.crear('v1', vendedor);
    const [datos, puntos] = repo.crear.mock.calls[0];
    expect(datos).toMatchObject({ vehiculoId: 'v1', sucursalId: 's1', kilometraje: 110000 });
    expect(puntos).toHaveLength(SECCIONES_INSPECCION.reduce((n, s) => n + s.puntos.length, 0));
  });

  it('no inspecciona un vehículo vendido', async () => {
    const { service, vehiculos } = crear();
    vehiculos.findByIdScoped.mockResolvedValue({ ...vehiculo, estado: 'VENDIDO' });
    await expect(service.crear('v1', vendedor)).rejects.toThrow(ConflictException);
  });

  it('no finaliza si quedan puntos sin evaluar', async () => {
    const { service, repo } = crear(inspeccion(), [
      punto(),
      punto({ id: 'p2', evaluacion: 'BUENO' }),
    ]);
    await expect(service.finalizar('i1', 'APROBADO', vendedor)).rejects.toThrow(
      'Faltan 1 punto por evaluar',
    );
    expect(repo.finalizar).not.toHaveBeenCalled();
  });

  it('al finalizar registra bitácora y auditoría con el resultado elegido', async () => {
    const { service, repo, bitacora, auditoria } = crear(inspeccion(), [
      punto({ evaluacion: 'REGULAR' }),
    ]);
    await service.finalizar('i1', 'APROBADO', vendedor);
    expect(repo.finalizar).toHaveBeenCalledWith('i1', 'APROBADO', 'u1', {});
    expect(bitacora.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ tipoEvento: 'INSPECCION_FINALIZADA', referenciaId: 'i1' }),
      {},
    );
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'INSPECCION_FINALIZADA', entidadId: 'v1' }),
      {},
    );
  });

  it('una inspección finalizada no se modifica', async () => {
    const { service } = crear(inspeccion({ estado: 'FINALIZADA', resultado: 'APROBADO' }));
    await expect(
      service.actualizarPunto('i1', 'p1', { evaluacion: 'MALO' }, vendedor),
    ).rejects.toThrow(ConflictException);
  });

  it('solo se eliminan los puntos agregados, no los de la lista estándar', async () => {
    const { service } = crear();
    await expect(service.eliminarPunto('i1', 'p1', vendedor)).rejects.toThrow(BadRequestException);
  });

  it('respeta el máximo de fotos por punto', async () => {
    const { service } = crear();
    await expect(
      service.subirFotos(
        'i1',
        'p1',
        [{ buffer: Buffer.from('') }, { buffer: Buffer.from('') }],
        vendedor,
      ),
    ).rejects.toThrow('hasta 6 fotos');
  });

  it('no da acceso a inspecciones de vehículos fuera del alcance', async () => {
    const { service, vehiculos } = crear();
    vehiculos.findByIdScoped.mockResolvedValue(null);
    await expect(service.obtener('i1', vendedor)).rejects.toThrow(NotFoundException);
  });

  it('el sitio público nunca recibe las notas internas', () => {
    const [seccion] = agruparPuntos([punto()], false);
    expect(seccion.puntos[0]).not.toHaveProperty('notaInterna');
    expect(agruparPuntos([punto()], true)[0].puntos[0]).toHaveProperty('notaInterna', 'secreto');
  });
});
