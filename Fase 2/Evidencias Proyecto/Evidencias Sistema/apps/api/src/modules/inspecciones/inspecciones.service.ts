import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MAX_FOTOS_POR_PUNTO,
  NOMBRE_SECCION,
  SECCIONES_INSPECCION,
  sugerirResultado,
  type ResultadoInspeccion,
} from '@vitriauto/shared-types';
import { DatabaseError, type PoolClient } from 'pg';
import { AlmacenamientoService } from '../../common/almacenamiento/almacenamiento.service';
import { PdfService } from '../../common/pdf/pdf.service';
import { getScope } from '../../common/scope';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { TransactionRunner } from '../../db/transaction';
import { AuditoriaRepository } from '../auditoria/auditoria.repository';
import { AutomotorasRepository } from '../automotoras/automotoras.repository';
import { VehiculoBitacoraRepository } from '../vehiculos/vehiculo-bitacora.repository';
import { VehiculosRepository } from '../vehiculos/vehiculos.repository';
import type {
  ActualizarInspeccionDto,
  ActualizarPuntoDto,
  AgregarPuntoDto,
} from './dto/inspeccion.dto';
import { InspeccionDetalleRow, InspeccionesRepository, PuntoRow } from './inspecciones.repository';
import { plantillaInspeccion } from './plantilla-inspeccion';

// Fotos de la inspección: públicas (se ven en la página del vehículo) y en webp.
const LADO_FOTO_INSPECCION = 1600;

export const ETIQUETA_RESULTADO: Record<ResultadoInspeccion, string> = {
  APROBADO: 'Aprobado',
  APROBADO_CON_OBSERVACIONES: 'Aprobado con observaciones',
  NO_APROBADO: 'No aprobado',
};

export function toInspeccionResumen(row: InspeccionDetalleRow) {
  return {
    id: row.id,
    estado: row.estado,
    resultado: row.resultado,
    kilometraje: row.kilometraje,
    fechaCreacion: row.fecha_creacion,
    fechaFinalizacion: row.fecha_finalizacion,
    iniciadaPor: row.usuario_nombre,
    finalizadaPor: row.finalizada_por,
    progreso: { evaluados: row.puntos_evaluados, total: row.puntos_total },
  };
}

// Puntos agrupados por sección, en el orden de la lista estándar. `interno`
// incluye las notas internas (panel); el sitio público nunca las recibe.
export function agruparPuntos(puntos: PuntoRow[], interno: boolean) {
  return SECCIONES_INSPECCION.map((s) => ({
    codigo: s.codigo,
    nombre: s.nombre,
    puntos: puntos
      .filter((p) => p.seccion === s.codigo)
      .sort((a, b) => a.orden - b.orden)
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        personalizado: p.codigo === null,
        evaluacion: p.evaluacion,
        observacion: p.observacion,
        ...(interno ? { notaInterna: p.nota_interna } : {}),
        fotos: p.fotos,
      })),
  })).filter((s) => s.puntos.length > 0);
}

// Informe de inspección pre-compra (Módulo 7.11). El acceso es el del
// vehículo: cualquier rol de la sucursal donde está hoy (o el Admin General).
@Injectable()
export class InspeccionesService {
  constructor(
    private readonly inspecciones: InspeccionesRepository,
    private readonly vehiculos: VehiculosRepository,
    private readonly automotoras: AutomotorasRepository,
    private readonly bitacora: VehiculoBitacoraRepository,
    private readonly auditoria: AuditoriaRepository,
    private readonly almacenamiento: AlmacenamientoService,
    private readonly pdf: PdfService,
    private readonly tx: TransactionRunner,
  ) {}

  async listar(vehiculoId: string, actor: UsuarioAutenticado) {
    await this.vehiculo(vehiculoId, actor);
    return (await this.inspecciones.porVehiculo(vehiculoId)).map(toInspeccionResumen);
  }

  // Nuevo borrador con la lista estándar completa. A lo sumo uno por vehículo.
  async crear(vehiculoId: string, actor: UsuarioAutenticado) {
    const v = await this.vehiculo(vehiculoId, actor);
    if (v.estado === 'VENDIDO' || v.estado === 'DADO_DE_BAJA') {
      throw new ConflictException('Solo se inspeccionan vehículos en inventario');
    }
    let orden = 0;
    const puntos = SECCIONES_INSPECCION.flatMap((s) =>
      s.puntos.map((p) => ({
        seccion: s.codigo,
        codigo: p.codigo,
        nombre: p.nombre,
        orden: ++orden,
      })),
    );
    try {
      const id = await this.tx.run(async (client) => {
        const nueva = await this.inspecciones.crear(
          {
            automotoraId: v.automotora_id,
            sucursalId: v.sucursal_id,
            vehiculoId,
            kilometraje: v.kilometraje,
            usuarioId: actor.id,
          },
          puntos,
          client,
        );
        await this.auditar(actor, v, 'INSPECCION_INICIADA', client, null, {
          kilometraje: v.kilometraje,
        });
        return nueva;
      });
      return this.obtener(id, actor);
    } catch (err) {
      if (
        err instanceof DatabaseError &&
        err.constraint === 'uq_inspeccion_borrador_por_vehiculo'
      ) {
        throw new ConflictException('El vehículo ya tiene una inspección en borrador');
      }
      throw err;
    }
  }

  async obtener(id: string, actor: UsuarioAutenticado) {
    const { inspeccion, vehiculo } = await this.acceso(id, actor);
    const puntos = await this.inspecciones.puntos(id);
    return {
      ...toInspeccionResumen(inspeccion),
      observaciones: inspeccion.observaciones,
      vehiculo: {
        id: vehiculo.id,
        descripcion: `${vehiculo.marca} ${vehiculo.modelo} ${vehiculo.anio}`,
        patente: vehiculo.patente,
        estado: vehiculo.estado,
      },
      resultadoSugerido: sugerirResultado(puntos.map((p) => p.evaluacion)),
      secciones: agruparPuntos(puntos, true),
    };
  }

  async actualizar(id: string, dto: ActualizarInspeccionDto, actor: UsuarioAutenticado) {
    await this.borrador(id, actor);
    await this.inspecciones.actualizar(id, {
      kilometraje: dto.kilometraje,
      observaciones: dto.observaciones === '' ? null : dto.observaciones,
    });
    return this.obtener(id, actor);
  }

  async actualizarPunto(
    id: string,
    puntoId: string,
    dto: ActualizarPuntoDto,
    actor: UsuarioAutenticado,
  ) {
    await this.borrador(id, actor);
    const punto = await this.punto(id, puntoId);
    if (dto.nombre !== undefined && punto.codigo !== null) {
      throw new BadRequestException('Solo se puede renombrar un punto agregado en esta inspección');
    }
    await this.inspecciones.actualizarPunto(puntoId, {
      evaluacion: dto.evaluacion,
      observacion: dto.observacion === '' ? null : dto.observacion,
      notaInterna: dto.notaInterna === '' ? null : dto.notaInterna,
      nombre: dto.nombre,
    });
    return this.puntoResponse(id, puntoId);
  }

  async agregarPunto(id: string, dto: AgregarPuntoDto, actor: UsuarioAutenticado) {
    await this.borrador(id, actor);
    if (!NOMBRE_SECCION[dto.seccion]) throw new BadRequestException('Sección inválida');
    await this.inspecciones.agregarPunto(id, dto.seccion, dto.nombre);
    return this.obtener(id, actor);
  }

  async eliminarPunto(id: string, puntoId: string, actor: UsuarioAutenticado) {
    await this.borrador(id, actor);
    const punto = await this.punto(id, puntoId);
    if (punto.codigo !== null) {
      throw new BadRequestException(
        'Los puntos de la lista estándar no se eliminan: márcalo "No aplica"',
      );
    }
    const fotos = await this.inspecciones.eliminarPunto(puntoId);
    await Promise.all(fotos.map((url) => this.almacenamiento.eliminar(url)));
    return this.obtener(id, actor);
  }

  async subirFotos(
    id: string,
    puntoId: string,
    archivos: { buffer: Buffer }[],
    actor: UsuarioAutenticado,
  ) {
    await this.borrador(id, actor);
    await this.punto(id, puntoId);
    if (!archivos.length) throw new BadRequestException('Adjunta al menos una foto');
    const actuales = await this.inspecciones.contarFotos(puntoId);
    if (actuales + archivos.length > MAX_FOTOS_POR_PUNTO) {
      throw new BadRequestException(
        `Cada punto admite hasta ${MAX_FOTOS_POR_PUNTO} fotos (ya tiene ${actuales})`,
      );
    }
    const validados = archivos.map((a) => this.almacenamiento.validarFoto(a.buffer));
    for (const archivo of validados) {
      const url = await this.almacenamiento.guardarFoto(archivo, LADO_FOTO_INSPECCION);
      await this.inspecciones.agregarFoto(puntoId, url);
    }
    return this.puntoResponse(id, puntoId);
  }

  async eliminarFoto(id: string, fotoId: string, actor: UsuarioAutenticado) {
    await this.borrador(id, actor);
    const url = await this.inspecciones.eliminarFoto(fotoId, id);
    if (!url) throw new NotFoundException('Foto no encontrada');
    await this.almacenamiento.eliminar(url);
  }

  // Requiere todos los puntos evaluados; el resultado lo decide quien inspecciona.
  async finalizar(id: string, resultado: ResultadoInspeccion, actor: UsuarioAutenticado) {
    const { vehiculo } = await this.acceso(id, actor);
    await this.tx.run(async (client) => {
      const actual = await this.inspecciones.bloquear(id, client);
      if (!actual) throw new NotFoundException('Inspección no encontrada');
      if (actual.estado !== 'BORRADOR')
        throw new ConflictException('La inspección ya está finalizada');
      const puntos = await this.inspecciones.puntos(id, client);
      const pendientes = puntos.filter((p) => p.evaluacion === null).length;
      if (pendientes > 0) {
        throw new BadRequestException(
          `Faltan ${pendientes} ${pendientes === 1 ? 'punto' : 'puntos'} por evaluar`,
        );
      }
      await this.inspecciones.finalizar(id, resultado, actor.id, client);
      await this.bitacora.registrar(
        {
          vehiculoId: vehiculo.id,
          tipoEvento: 'INSPECCION_FINALIZADA',
          descripcion: `Inspección pre-compra: ${ETIQUETA_RESULTADO[resultado]}`,
          usuarioId: actor.id,
          referenciaTipo: 'INSPECCION',
          referenciaId: id,
        },
        client,
      );
      await this.auditar(actor, vehiculo, 'INSPECCION_FINALIZADA', client, null, {
        resultado,
        kilometraje: actual.kilometraje,
      });
    });
    return this.obtener(id, actor);
  }

  async descartar(id: string, actor: UsuarioAutenticado) {
    await this.borrador(id, actor);
    const { vehiculo } = await this.acceso(id, actor);
    const fotos = await this.tx.run(async (client) => {
      const actual = await this.inspecciones.bloquear(id, client);
      if (actual?.estado !== 'BORRADOR') {
        throw new ConflictException('Solo se descarta una inspección en borrador');
      }
      const puntos = await this.inspecciones.puntos(id, client);
      await this.auditar(
        actor,
        vehiculo,
        'INSPECCION_DESCARTADA',
        client,
        {
          kilometraje: actual.kilometraje,
          evaluados: puntos.filter((p) => p.evaluacion !== null).length,
          puntos: puntos.length,
        },
        null,
      );
      return this.inspecciones.eliminar(id, client);
    });
    await Promise.all(fotos.map((url) => this.almacenamiento.eliminar(url)));
  }

  // En la ficha del vehículo, con su sucursal (como el resto de su auditoría).
  // Las ediciones del borrador punto a punto no se auditan: el resultado queda
  // fijo al finalizar, y descartarlo deja registro.
  private async auditar(
    actor: UsuarioAutenticado,
    vehiculo: { id: string; sucursal_id: string },
    accion: string,
    client: PoolClient,
    anterior: Record<string, unknown> | null,
    nuevo: Record<string, unknown> | null,
  ) {
    await this.auditoria.registrar(
      {
        automotoraId: actor.automotoraId,
        usuarioId: actor.id,
        sucursalId: vehiculo.sucursal_id,
        accion,
        entidadTipo: 'VEHICULO',
        entidadId: vehiculo.id,
        valorAnterior: anterior,
        valorNuevo: nuevo,
      },
      client,
    );
  }

  async generarPdf(id: string, actor: UsuarioAutenticado) {
    const { inspeccion, vehiculo } = await this.acceso(id, actor);
    const puntos = await this.inspecciones.puntos(id);
    const a = (await this.automotoras.findById(vehiculo.automotora_id))!;
    // react-pdf no lee webp: cada foto pasa a JPG chico.
    const fotos = new Map<string, Buffer>();
    for (const url of puntos.flatMap((p) => p.fotos.map((f) => f.url))) {
      const jpg = await this.almacenamiento.fotoParaPdf(url, 600);
      if (jpg) fotos.set(url, jpg);
    }
    const buffer = await this.pdf.renderizarCon((rp) =>
      plantillaInspeccion(rp, {
        automotora: a.nombre,
        vehiculo: `${vehiculo.marca} ${vehiculo.modelo} ${vehiculo.anio}`,
        version: vehiculo.version,
        patente: vehiculo.patente,
        kilometraje: inspeccion.kilometraje,
        estado: inspeccion.estado,
        resultado: inspeccion.resultado ? ETIQUETA_RESULTADO[inspeccion.resultado] : null,
        resultadoCodigo: inspeccion.resultado,
        fecha: inspeccion.fecha_finalizacion ?? inspeccion.fecha_creacion,
        inspector: inspeccion.finalizada_por ?? inspeccion.usuario_nombre,
        observaciones: inspeccion.observaciones,
        secciones: agruparPuntos(puntos, false).map((s) => ({
          nombre: s.nombre,
          puntos: s.puntos.map((p) => ({
            nombre: p.nombre,
            evaluacion: p.evaluacion,
            observacion: p.observacion,
            fotos: p.fotos.map((f) => fotos.get(f.url)).filter((b): b is Buffer => !!b),
          })),
        })),
      }),
    );
    return { buffer, nombre: `inspeccion-${vehiculo.patente.toLowerCase()}.pdf` };
  }

  // ---- Acceso y validaciones

  private async vehiculo(vehiculoId: string, actor: UsuarioAutenticado) {
    const v = await this.vehiculos.findByIdScoped(vehiculoId, getScope(actor));
    if (!v) throw new NotFoundException('Vehículo no encontrado');
    return v;
  }

  private async acceso(id: string, actor: UsuarioAutenticado) {
    const inspeccion = await this.inspecciones.porId(id);
    if (!inspeccion || inspeccion.automotora_id !== actor.automotoraId) {
      throw new NotFoundException('Inspección no encontrada');
    }
    const vehiculo = await this.vehiculos.findByIdScoped(inspeccion.vehiculo_id, getScope(actor));
    if (!vehiculo) throw new NotFoundException('Inspección no encontrada');
    return { inspeccion, vehiculo };
  }

  private async borrador(id: string, actor: UsuarioAutenticado) {
    const { inspeccion } = await this.acceso(id, actor);
    if (inspeccion.estado !== 'BORRADOR') {
      throw new ConflictException(
        'Una inspección finalizada no se modifica: inicia una nueva si el vehículo cambió',
      );
    }
    return inspeccion;
  }

  private async punto(id: string, puntoId: string) {
    const punto = await this.inspecciones.punto(puntoId, id);
    if (!punto) throw new NotFoundException('Punto no encontrado');
    return punto;
  }

  private async puntoResponse(id: string, puntoId: string) {
    const p = await this.punto(id, puntoId);
    return {
      id: p.id,
      nombre: p.nombre,
      personalizado: p.codigo === null,
      evaluacion: p.evaluacion,
      observacion: p.observacion,
      notaInterna: p.nota_interna,
      fotos: p.fotos,
    };
  }
}
