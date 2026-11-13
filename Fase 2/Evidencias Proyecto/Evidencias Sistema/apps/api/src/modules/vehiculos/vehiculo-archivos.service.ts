import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FOTOS_MAXIMAS_POR_VEHICULO, validarDocumentoLegal } from '@vitriauto/shared-types';
import { PoolClient } from 'pg';
import { AlmacenamientoService } from '../../common/almacenamiento/almacenamiento.service';
import { hoyEnChile } from '../../common/fechas';
import { getScope } from '../../common/scope';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { TransactionRunner } from '../../db/transaction';
import { AuditoriaRepository } from '../auditoria/auditoria.repository';
import { DocumentosLegalesRepository } from './documentos-legales.repository';
import { SubirDocumentoLegalDto } from './dto/documento-legal.dto';
import { VehiculoFotosRepository } from './vehiculo-fotos.repository';
import { toDocumentoResponse, toFotoResponse } from './vehiculos.mapper';
import { VehiculoRow, VehiculosRepository } from './vehiculos.repository';

export interface ArchivoSubido {
  buffer: Buffer;
}

// Fotos (públicas, 1 a 30, la primera es la portada) y documentos legales
// (privados; al renovar se conserva el historial) de un vehículo.
@Injectable()
export class VehiculoArchivosService {
  constructor(
    private readonly vehiculos: VehiculosRepository,
    private readonly fotos: VehiculoFotosRepository,
    private readonly documentos: DocumentosLegalesRepository,
    private readonly almacenamiento: AlmacenamientoService,
    private readonly auditoria: AuditoriaRepository,
    private readonly tx: TransactionRunner,
  ) {}

  async subirFotos(vehiculoId: string, archivos: ArchivoSubido[], actor: UsuarioAutenticado) {
    if (archivos.length === 0) throw new BadRequestException('Adjunta al menos una foto');
    await this.buscarOFallar(vehiculoId, actor);
    // Valida todos antes de escribir cualquiera.
    const validados = archivos.map((a) => this.almacenamiento.validarFoto(a.buffer));

    const urls: string[] = [];
    try {
      for (const archivo of validados) urls.push(await this.almacenamiento.guardarFoto(archivo));

      await this.tx.run(async (client) => {
        const vehiculo = await this.bloquear(vehiculoId, actor, client);
        if (vehiculo.estado === 'VENDIDO') {
          throw new ConflictException('Un vehículo vendido no admite cambios en sus fotos');
        }
        const existentes = await this.fotos.contar(vehiculoId, client);
        if (existentes + urls.length > FOTOS_MAXIMAS_POR_VEHICULO) {
          throw new BadRequestException(
            `Máximo ${FOTOS_MAXIMAS_POR_VEHICULO} fotos por vehículo (ya tiene ${existentes})`,
          );
        }
        for (const [i, url] of urls.entries()) {
          await this.fotos.create(vehiculoId, url, existentes + i + 1, client);
        }
        await this.auditar(
          actor,
          vehiculo,
          'VEHICULO_FOTOS_AGREGADAS',
          client,
          { fotos: existentes },
          { fotos: existentes + urls.length, agregadas: urls },
        );
      });
    } catch (err) {
      await Promise.all(urls.map((u) => this.almacenamiento.eliminar(u)));
      throw err;
    }

    return (await this.fotos.findByVehiculo(vehiculoId)).map(toFotoResponse);
  }

  async eliminarFoto(vehiculoId: string, fotoId: string, actor: UsuarioAutenticado) {
    await this.buscarOFallar(vehiculoId, actor);
    const borrada = await this.tx.run(async (client) => {
      const vehiculo = await this.bloquear(vehiculoId, actor, client);
      if (vehiculo.estado === 'VENDIDO') {
        throw new ConflictException('Un vehículo vendido no admite cambios en sus fotos');
      }
      if (vehiculo.estado === 'DISPONIBLE' && (await this.fotos.contar(vehiculoId, client)) === 1) {
        throw new ConflictException(
          'Un vehículo publicado debe tener al menos 1 foto. Sube otra antes, o cámbialo a EN_PREPARACION.',
        );
      }
      const foto = await this.fotos.deleteYCompactar(vehiculoId, fotoId, client);
      if (!foto) throw new NotFoundException('Foto no encontrada');
      await this.auditar(
        actor,
        vehiculo,
        'VEHICULO_FOTO_ELIMINADA',
        client,
        { url: foto.url, orden: foto.orden },
        null,
      );
      return foto;
    });
    // El archivo se borra solo después del COMMIT.
    await this.almacenamiento.eliminar(borrada.url);
    return (await this.fotos.findByVehiculo(vehiculoId)).map(toFotoResponse);
  }

  async reordenarFotos(vehiculoId: string, fotoIds: string[], actor: UsuarioAutenticado) {
    await this.buscarOFallar(vehiculoId, actor);
    await this.tx.run(async (client) => {
      const vehiculo = await this.bloquear(vehiculoId, actor, client);
      const actuales = await this.fotos.findByVehiculo(vehiculoId, client);
      const mismoConjunto =
        actuales.length === fotoIds.length && actuales.every((f) => fotoIds.includes(f.id));
      if (!mismoConjunto) {
        throw new BadRequestException('Envía todas las fotos del vehículo, cada una una sola vez');
      }
      const ordenAnterior = actuales.map((f) => f.id);
      if (ordenAnterior.join() === fotoIds.join()) return;
      await this.fotos.reordenar(vehiculoId, fotoIds, client);
      // Orden por URL (legible y enlazable); la primera es la portada.
      const url = new Map(actuales.map((f) => [f.id, f.url]));
      await this.auditar(
        actor,
        vehiculo,
        'VEHICULO_FOTOS_REORDENADAS',
        client,
        { orden: ordenAnterior.map((id) => url.get(id)) },
        { orden: fotoIds.map((id) => url.get(id)) },
      );
    });
    return (await this.fotos.findByVehiculo(vehiculoId)).map(toFotoResponse);
  }

  async subirDocumento(
    vehiculoId: string,
    archivo: ArchivoSubido | undefined,
    dto: SubirDocumentoLegalDto,
    actor: UsuarioAutenticado,
  ) {
    if (!archivo) throw new BadRequestException('Adjunta el archivo del documento');
    const vehiculo = await this.buscarOFallar(vehiculoId, actor);
    // Reglas por tipo: las fechas imposibles se rechazan y, cuando la regla fija
    // el vencimiento, se usa ese y no el del cliente.
    const regla = validarDocumentoLegal(dto, vehiculo, hoyEnChile());
    if (!regla.ok) throw new BadRequestException(regla.error);
    const validado = this.almacenamiento.validarDocumento(archivo.buffer);

    const clave = await this.almacenamiento.guardarDocumento(validado);
    try {
      const doc = await this.tx.run(async (client) => {
        const bloqueado = await this.bloquear(vehiculoId, actor, client);
        const nuevo = await this.documentos.renovar(
          {
            vehiculoId,
            tipo: dto.tipo,
            respaldo: dto.respaldo,
            archivoClave: clave,
            fechaVencimiento: regla.fechaVencimiento,
            fechaPrimeraInscripcion: regla.fechaPrimeraInscripcion,
            cargadoPor: actor.id,
          },
          client,
        );
        await this.auditar(actor, bloqueado, 'VEHICULO_DOCUMENTO_SUBIDO', client, null, {
          tipo: nuevo.tipo,
          respaldo: nuevo.respaldo,
          fechaVencimiento: nuevo.fecha_vencimiento,
          ...(nuevo.fecha_primera_inscripcion
            ? { fechaPrimeraInscripcion: nuevo.fecha_primera_inscripcion }
            : {}),
        });
        return nuevo;
      });
      return toDocumentoResponse(doc);
    } catch (err) {
      await this.almacenamiento.eliminar(clave);
      throw err;
    }
  }

  async listarDocumentos(vehiculoId: string, incluirHistorial: boolean, actor: UsuarioAutenticado) {
    await this.buscarOFallar(vehiculoId, actor);
    const docs = await this.documentos.findByVehiculo(vehiculoId, incluirHistorial);
    return docs.map(toDocumentoResponse);
  }

  async archivoDocumento(vehiculoId: string, documentoId: string, actor: UsuarioAutenticado) {
    await this.buscarOFallar(vehiculoId, actor);
    const doc = await this.documentos.findById(documentoId, vehiculoId);
    if (!doc) throw new NotFoundException('Documento no encontrado');
    return this.almacenamiento.rutaDocumento(doc.archivo_url);
  }

  // Como el resto de la auditoría del vehículo: con la sucursal del vehículo.
  private async auditar(
    actor: UsuarioAutenticado,
    vehiculo: VehiculoRow,
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

  private async buscarOFallar(id: string, actor: UsuarioAutenticado) {
    const row = await this.vehiculos.findByIdScoped(id, getScope(actor));
    if (!row) throw new NotFoundException('Vehículo no encontrado');
    return row;
  }

  private async bloquear(
    id: string,
    actor: UsuarioAutenticado,
    client: PoolClient,
  ): Promise<VehiculoRow> {
    const row = await this.vehiculos.lockById(id, actor.automotoraId, client);
    const scope = getScope(actor);
    if (!row || (scope.sucursalId && row.sucursal_id !== scope.sucursalId)) {
      throw new NotFoundException('Vehículo no encontrado');
    }
    return row;
  }
}
