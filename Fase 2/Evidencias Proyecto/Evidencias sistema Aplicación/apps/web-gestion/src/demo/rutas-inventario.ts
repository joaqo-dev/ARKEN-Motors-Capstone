import {
  ESTADOS_VEHICULO_MANUALES,
  FOTOS_MAXIMAS_POR_VEHICULO,
  normalizarNombreVehiculo,
  normalizarPatente,
  sugerirResultado,
  sugerirVencimientoRevisionTecnica,
  validarDocumentoLegal,
  type EvaluacionInspeccion,
  type ResultadoInspeccion,
  type RespaldoDocumentoLegal,
  type TipoDocumentoLegal,
} from '@vitriauto/shared-types';
import { etiqueta, hoy } from '../lib/formato';
import { datos, type FilaInspeccion, type FilaVehiculo } from './db';
import { plantillaInspeccion } from './datos';
import {
  ahora,
  auditar,
  coincide,
  comisionConsignacion,
  consignacionDe,
  cuerpo,
  delAlcance,
  descripcion,
  diasDesde,
  EN_INVENTARIO,
  fallo,
  gastoDto,
  imagenComoDataUrl,
  noEncontrado,
  nuevoId,
  paginar,
  pendientesDe,
  registrarEvento,
  siguienteFolio,
  soloAdmin,
  soloGeneral,
  sucursalesVisibles,
  texto,
  totalGastosVehiculo,
  usuarioRef,
  vehiculoDetalle,
  vehiculoListado,
  visible,
  type Contexto,
  type Rutas,
} from './comun';

const pesosTexto = (n: number) => `$${n.toLocaleString('es-CL')}`;

export function vehiculoDelAlcance(c: Contexto, id: string): FilaVehiculo {
  return delAlcance(
    c,
    datos().vehiculos.find((v) => v.id === id),
    (v) => v.sucursalId,
    'Vehículo',
  );
}

const ORDEN_ESTADO = [
  'DISPONIBLE',
  'RESERVADO',
  'EN_PREPARACION',
  'PENDIENTE_REVISION',
  'VENDIDO',
  'DADO_DE_BAJA',
];

function listar(c: Contexto) {
  const alcance = sucursalesVisibles(c);
  const q = texto(c, 'q');
  const estado = texto(c, 'estado');
  const origen = texto(c, 'origen');
  const inventario = c.query.get('inventario') === 'true';
  const conPendientes = c.query.get('pendientes') === 'true';
  const items = datos().vehiculos.filter(
    (v) =>
      v.automotoraId === c.automotoraId &&
      visible(alcance, v.sucursalId) &&
      (!inventario || EN_INVENTARIO(v)) &&
      (!estado || v.estado === estado) &&
      (!origen || v.origen === origen) &&
      (!conPendientes || pendientesDe(v).length > 0) &&
      coincide(q, v.marca, v.modelo, v.version, v.patente, `${v.marca} ${v.modelo}`),
  );
  const campo = texto(c, 'orden');
  const signo = texto(c, 'direccion') === 'desc' ? -1 : 1;
  const valor: Record<string, (v: FilaVehiculo) => number> = {
    estado: (v) => ORDEN_ESTADO.indexOf(v.estado),
    precio: (v) => v.precioVenta,
    costo: (v) => v.costoAdquisicion,
    dias: (v) => diasDesde(v.fechaIngreso),
  };
  const fn = campo ? valor[campo] : undefined;
  items.sort((a, b) =>
    fn
      ? (fn(a) - fn(b)) * signo || b.fechaIngreso.localeCompare(a.fechaIngreso)
      : b.fechaIngreso.localeCompare(a.fechaIngreso),
  );
  return paginar(
    c,
    items.map((v) => vehiculoListado(c, v)),
  );
}

// Datos generales del formulario (alta y edición), normalizados como en la API.
function datosGenerales(b: Record<string, unknown>) {
  const opcional = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v));
  return {
    marca: normalizarNombreVehiculo(String(b.marca)),
    modelo: normalizarNombreVehiculo(String(b.modelo)),
    version: opcional(b.version),
    anio: Number(b.anio),
    kilometraje: Number(b.kilometraje),
    color: String(b.color),
    combustible: String(b.combustible),
    transmision: String(b.transmision),
    cilindrada: opcional(b.cilindrada),
    patente: normalizarPatente(String(b.patente)),
    categoria: String(b.categoria),
    traccion: b.categoria === 'MOTO' ? null : opcional(b.traccion),
    descripcion: opcional(b.descripcion),
    precioVenta: Number(b.precioVenta),
  };
}

function patenteLibre(c: Contexto, patente: string, excepto?: string) {
  const repetida = datos().vehiculos.find(
    (v) =>
      v.automotoraId === c.automotoraId &&
      v.patente === patente &&
      v.id !== excepto &&
      EN_INVENTARIO(v),
  );
  if (repetida) throw fallo(409, `Ya hay un vehículo en inventario con la patente ${patente}`);
}

function crear(c: Contexto) {
  const db = datos();
  const b = cuerpo(c);
  const g = datosGenerales(b);
  patenteLibre(c, g.patente);
  const sucursalId = c.esGeneral ? String(b.sucursalId ?? '') : c.usuario.sucursalId!;
  if (
    !db.sucursales.some((s) => s.id === sucursalId && s.automotoraId === c.automotoraId && s.activa)
  ) {
    throw fallo(400, 'Elige la sucursal');
  }
  const origen = String(b.origen);
  const fechaIngreso = b.fechaIngreso ? `${String(b.fechaIngreso)}T15:00:00.000Z` : ahora();
  const v: FilaVehiculo = {
    id: nuevoId('veh'),
    automotoraId: c.automotoraId,
    sucursalId,
    ...g,
    costoAdquisicion: origen === 'CONSIGNACION' ? 0 : Number(b.costoAdquisicion ?? 0),
    origen,
    // Sin fotos no se publica: entra en preparación (Módulo 7).
    estado: 'EN_PREPARACION',
    fechaIngreso,
    fotos: [],
    documentos: [],
  };
  if (origen === 'COMPRA_PARTICULAR') {
    const tas = db.tasaciones.find(
      (t) => t.id === b.tasacionId && t.automotoraId === c.automotoraId,
    );
    if (!tas || tas.estado !== 'ACEPTADA' || tas.vehiculoCreadoId)
      throw fallo(400, 'Elige una tasación aceptada');
    tas.vehiculoCreadoId = v.id;
  }
  if (origen === 'CONSIGNACION') {
    const k = (b.consignacion ?? {}) as Record<string, unknown>;
    if (!k.clienteId) throw fallo(400, 'Elige al consignante');
    db.consignaciones.push({
      id: nuevoId('con'),
      folio: siguienteFolio(c.automotoraId, 'CONSIGNACION'),
      automotoraId: c.automotoraId,
      vehiculoId: v.id,
      clienteId: String(k.clienteId),
      tipoTrato: k.tipoTrato === 'PRECIO_NETO' ? 'PRECIO_NETO' : 'COMISION_VENTA',
      porcentajeComision: k.porcentajeComision !== undefined ? Number(k.porcentajeComision) : null,
      montoNeto: k.montoNeto !== undefined ? Number(k.montoNeto) : null,
      precioMinimo: Number(k.precioMinimo ?? k.montoNeto ?? 0),
      fechaInicio: hoy(),
      fechaFin: String(k.fechaFin),
      estado: 'ACTIVA',
      sucursalRegistroId: sucursalId,
      fechaCreacion: ahora(),
    });
  }
  db.vehiculos.push(v);
  registrarEvento(c, v.id, 'ALTA', `Ingreso al inventario (${etiqueta(origen).toLowerCase()})`);
  return vehiculoDetalle(c, v);
}

function editar(c: Contexto) {
  const v = vehiculoDelAlcance(c, c.params.id!);
  if (v.estado === 'VENDIDO') throw fallo(409, 'Un vehículo vendido no se edita');
  const b = cuerpo(c);
  const g = datosGenerales(b);
  if (b.precioVenta === undefined) g.precioVenta = v.precioVenta;
  // El precio de un auto publicado lo cambia un admin (Módulo 7.6).
  if (!c.esAdmin && v.estado === 'DISPONIBLE' && g.precioVenta !== v.precioVenta) {
    throw fallo(403, 'El precio de un vehículo publicado solo lo cambia un admin');
  }
  patenteLibre(c, g.patente, v.id);
  if (g.precioVenta !== v.precioVenta) {
    registrarEvento(
      c,
      v.id,
      'CAMBIO_PRECIO',
      `Precio de venta: ${pesosTexto(v.precioVenta)} → ${pesosTexto(g.precioVenta)}`,
    );
    auditar(
      c,
      'VEHICULO_CAMBIO_PRECIO',
      { tipo: 'VEHICULO', id: v.id },
      v.sucursalId,
      { precioVenta: g.precioVenta },
      { precioVenta: v.precioVenta },
    );
  }
  const costo = Number(b.costoAdquisicion);
  if (
    c.esAdmin &&
    b.costoAdquisicion !== undefined &&
    v.origen !== 'CONSIGNACION' &&
    costo !== v.costoAdquisicion
  ) {
    auditar(
      c,
      'VEHICULO_CAMBIO_COSTO',
      { tipo: 'VEHICULO', id: v.id },
      v.sucursalId,
      { costoAdquisicion: costo },
      { costoAdquisicion: v.costoAdquisicion },
    );
    v.costoAdquisicion = costo;
  }
  Object.assign(v, g);
  return vehiculoDetalle(c, v);
}

function cambiarEstado(c: Contexto) {
  const v = vehiculoDelAlcance(c, c.params.id!);
  const { estado, motivo } = cuerpo(c) as { estado: string; motivo?: string };
  if (!(ESTADOS_VEHICULO_MANUALES as readonly string[]).includes(estado)) {
    throw fallo(400, 'Ese estado no se puede fijar a mano');
  }
  if (v.estado === 'RESERVADO' || v.estado === 'VENDIDO') {
    throw fallo(
      409,
      `Un vehículo ${etiqueta(v.estado).toLowerCase()} cambia de estado desde su reserva o venta`,
    );
  }
  // Revisión antes de publicar (Módulo 7.6), como en la API.
  if (estado === 'DISPONIBLE' && !c.esAdmin) {
    throw fallo(403, 'Solo un admin publica vehículos: envíalo a revisión');
  }
  if (!c.esAdmin && (estado === 'DADO_DE_BAJA' || v.estado === 'DADO_DE_BAJA')) {
    throw fallo(403, 'Solo un admin da de baja o reactiva un vehículo');
  }
  if ((estado === 'DISPONIBLE' || estado === 'PENDIENTE_REVISION') && v.fotos.length === 0) {
    throw fallo(
      409,
      estado === 'DISPONIBLE'
        ? 'Agrega al menos una foto antes de publicarlo'
        : 'Para enviarlo a revisión necesita al menos 1 foto',
    );
  }
  const devuelto = c.esAdmin && v.estado === 'PENDIENTE_REVISION' && estado === 'EN_PREPARACION';
  if (devuelto && !motivo?.trim()) {
    throw fallo(400, 'Indica qué hay que corregir para que lo puedan arreglar');
  }
  const previo = v.estado;
  v.estado = estado;
  if (devuelto) v.observacionRevision = motivo!.trim();
  else if (estado === 'PENDIENTE_REVISION' || estado === 'DISPONIBLE') v.observacionRevision = null;
  if (previo === 'PENDIENTE_REVISION') {
    for (const n of datos().notificaciones) {
      if (
        n.tipo === 'VEHICULO_POR_REVISAR' &&
        n.estado === 'PENDIENTE' &&
        n.referencias.some((r) => r.tipo === 'VEHICULO' && r.id === v.id)
      ) {
        n.estado = 'RESUELTA';
        n.fechaResolucion = ahora();
      }
    }
  }
  if (estado === 'PENDIENTE_REVISION') {
    datos().notificaciones.unshift({
      id: nuevoId('not'),
      automotoraId: v.automotoraId,
      tipo: 'VEHICULO_POR_REVISAR',
      mensaje: `${v.marca} ${v.modelo} ${v.anio} (${v.patente}) está listo para revisar y publicar`,
      sucursalId: v.sucursalId,
      fechaGeneracion: ahora(),
      estado: 'PENDIENTE',
      fechaResolucion: null,
      referencias: [{ tipo: 'VEHICULO', id: v.id }],
    });
  }
  registrarEvento(
    c,
    v.id,
    'CAMBIO_ESTADO',
    `Estado: ${etiqueta(previo)} → ${etiqueta(estado)}${motivo ? ` (${motivo})` : ''}`,
  );
  auditar(
    c,
    'VEHICULO_CAMBIO_ESTADO',
    { tipo: 'VEHICULO', id: v.id },
    v.sucursalId,
    { estado },
    { estado: previo },
  );
}

function transferir(c: Contexto) {
  soloGeneral(c);
  const v = vehiculoDelAlcance(c, c.params.id!);
  const { sucursalDestinoId } = cuerpo(c) as { sucursalDestinoId: string };
  const destino = datos().sucursales.find(
    (s) => s.id === sucursalDestinoId && s.automotoraId === c.automotoraId && s.activa,
  );
  if (!destino) throw fallo(400, 'Elige la sucursal de destino');
  if (!EN_INVENTARIO(v)) throw fallo(409, 'Solo se transfieren vehículos en inventario');
  const origen = datos().sucursales.find((s) => s.id === v.sucursalId);
  v.sucursalId = destino.id;
  registrarEvento(
    c,
    v.id,
    'TRANSFERENCIA_SUCURSAL',
    `Transferido de ${origen?.nombre ?? '—'} a ${destino.nombre}`,
  );
  auditar(
    c,
    'VEHICULO_TRANSFERIDO',
    { tipo: 'VEHICULO', id: v.id },
    destino.id,
    { sucursal: destino.nombre },
    { sucursal: origen?.nombre },
  );
}

// ---------------------------------------------------------------- Fotos y documentos

async function subirFotos(c: Contexto) {
  const v = vehiculoDelAlcance(c, c.params.id!);
  const archivos = (c.body as FormData).getAll('fotos').filter((f): f is File => f instanceof File);
  if (v.fotos.length + archivos.length > FOTOS_MAXIMAS_POR_VEHICULO) {
    throw fallo(400, `Máximo ${FOTOS_MAXIMAS_POR_VEHICULO} fotos por vehículo`);
  }
  for (const archivo of archivos) {
    v.fotos.push({
      id: nuevoId('foto'),
      url: await imagenComoDataUrl(archivo),
      orden: v.fotos.length,
    });
  }
  return vehiculoDetalle(c, v).fotos;
}

function borrarFoto(c: Contexto) {
  const v = vehiculoDelAlcance(c, c.params.id!);
  if (v.estado === 'DISPONIBLE' && v.fotos.length === 1) {
    throw fallo(409, 'Un vehículo publicado necesita al menos una foto');
  }
  v.fotos = v.fotos.filter((f) => f.id !== c.params.fotoId).map((f, i) => ({ ...f, orden: i }));
}

function ordenarFotos(c: Contexto) {
  const v = vehiculoDelAlcance(c, c.params.id!);
  const { fotoIds } = cuerpo(c) as { fotoIds: string[] };
  v.fotos = fotoIds
    .map((id, orden) => {
      const f = v.fotos.find((x) => x.id === id);
      return f ? { ...f, orden } : null;
    })
    .filter((f) => f !== null);
}

// Mismas reglas de fechas que la API (Módulo 7.5).
function listarDocumentos(c: Contexto) {
  return vehiculoDelAlcance(c, c.params.id!).documentos.map(({ cargadoPorId: _, ...d }) => d);
}

function subirDocumento(c: Contexto) {
  const v = vehiculoDelAlcance(c, c.params.id!);
  const b = cuerpo(c);
  const tipo = String(b.tipo) as TipoDocumentoLegal;
  const regla = validarDocumentoLegal(
    {
      tipo,
      respaldo: String(b.respaldo) as RespaldoDocumentoLegal,
      fechaVencimiento: b.fechaVencimiento ? String(b.fechaVencimiento) : null,
      fechaPrimeraInscripcion: b.fechaPrimeraInscripcion ? String(b.fechaPrimeraInscripcion) : null,
    },
    v,
    hoy(),
  );
  if (!regla.ok) throw fallo(400, regla.error);
  for (const d of v.documentos) if (d.tipo === tipo) d.vigente = false;
  v.documentos.unshift({
    id: nuevoId('doc'),
    tipo,
    respaldo: String(b.respaldo) as RespaldoDocumentoLegal,
    fechaVencimiento: regla.fechaVencimiento,
    fechaPrimeraInscripcion: regla.fechaPrimeraInscripcion,
    fechaCarga: ahora(),
    cargadoPor: c.usuario.nombre,
    cargadoPorId: c.usuario.id,
    vigente: true,
    archivoUrl: '/documentos/demo.pdf',
  });
  auditar(c, 'VEHICULO_DOCUMENTO_SUBIDO', { tipo: 'VEHICULO', id: v.id }, v.sucursalId, {
    tipo,
    respaldo: String(b.respaldo),
    fechaVencimiento: regla.fechaVencimiento,
  });
}

// ---------------------------------------------------------------- Gastos y balance del vehículo

function gastosVehiculo(c: Contexto) {
  soloAdmin(c);
  const v = vehiculoDelAlcance(c, c.params.id!);
  return datos()
    .gastos.filter((g) => g.vehiculoId === v.id)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero - a.numero)
    .map((g) => {
      const d = gastoDto(g);
      return { ...d, vehiculo: d.vehiculo!, sucursal: d.sucursal! };
    });
}

let numeroGasto = 0;
export function siguienteNumeroGasto(automotoraId: string) {
  const max = Math.max(
    0,
    ...datos()
      .gastos.filter((g) => g.automotoraId === automotoraId)
      .map((g) => g.numero),
  );
  numeroGasto = Math.max(numeroGasto, max) + 1;
  return numeroGasto;
}

function nuevoGastoVehiculo(c: Contexto) {
  soloAdmin(c);
  const v = vehiculoDelAlcance(c, c.params.id!);
  const b = cuerpo(c);
  const monto = Number(b.monto);
  const g = {
    id: nuevoId('gas'),
    numero: siguienteNumeroGasto(c.automotoraId),
    automotoraId: c.automotoraId,
    tipo: 'VEHICULO' as const,
    vehiculoId: v.id,
    sucursalId: v.sucursalId,
    categoria: String(b.categoria),
    monto,
    fecha: String(b.fecha),
    comentario: b.comentario ? String(b.comentario) : null,
    adjuntoUrl: b.adjunto instanceof File ? '/gastos/boleta-demo.pdf' : null,
    estado: 'ACTIVO' as const,
    registradoPorId: c.usuario.id,
    fechaCreacion: ahora(),
  };
  datos().gastos.push(g);
  registrarEvento(
    c,
    v.id,
    'GASTO_AGREGADO',
    `Gasto de ${etiqueta(g.categoria).toLowerCase()}: ${pesosTexto(monto)}${g.comentario ? ` (${g.comentario})` : ''}`,
  );
  auditar(c, 'GASTO_CREADO', { tipo: 'GASTO', id: g.id }, v.sucursalId, {
    categoria: g.categoria,
    monto,
  });
  return gastoDto(g);
}

function balance(c: Contexto) {
  soloAdmin(c);
  const v = vehiculoDelAlcance(c, c.params.id!);
  const venta = datos().ventas.find((x) => x.vehiculoId === v.id && x.estado === 'CONFIRMADA');
  const margenTipo = venta ? ('REAL' as const) : ('PROYECTADO' as const);
  const precioVenta = venta?.precioVentaFinal ?? v.precioVenta;
  const cons = v.origen === 'CONSIGNACION' ? consignacionDe(v.id) : undefined;
  if (cons) {
    const comision = comisionConsignacion(cons, precioVenta);
    return {
      tipo: 'CONSIGNACION',
      margenTipo,
      precioVenta,
      comision,
      montoConsignante: precioVenta - comision,
      margen: comision,
    };
  }
  const totalGastos = totalGastosVehiculo(v.id);
  const costoTotal = v.costoAdquisicion + totalGastos;
  return {
    tipo: 'PROPIO',
    margenTipo,
    precioVenta,
    costoAdquisicion: v.costoAdquisicion,
    totalGastos,
    costoTotal,
    margen: precioVenta - costoTotal,
  };
}

function bitacora(c: Contexto) {
  const v = vehiculoDelAlcance(c, c.params.id!);
  return datos()
    .bitacora.filter((e) => e.vehiculoId === v.id)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map((e) => ({
      id: e.id,
      tipoEvento: e.tipoEvento,
      descripcion: e.descripcion,
      fecha: e.fecha,
      usuario: usuarioRef(e.usuarioId),
    }));
}

// ---------------------------------------------------------------- Inspección pre-compra (Módulo 7.11)

function puntosDe(ins: FilaInspeccion) {
  return ins.secciones.flatMap((s) => s.puntos);
}

function inspeccionResumen(ins: FilaInspeccion) {
  const puntos = puntosDe(ins);
  return {
    id: ins.id,
    estado: ins.estado,
    resultado: ins.resultado,
    kilometraje: ins.kilometraje,
    fechaCreacion: ins.fechaCreacion,
    fechaFinalizacion: ins.fechaFinalizacion,
    iniciadaPor: usuarioRef(ins.iniciadaPorId).nombre,
    finalizadaPor: ins.finalizadaPorId ? usuarioRef(ins.finalizadaPorId).nombre : null,
    progreso: {
      evaluados: puntos.filter((p) => p.evaluacion !== null).length,
      total: puntos.length,
    },
  };
}

function inspeccionDetalle(ins: FilaInspeccion) {
  const v = datos().vehiculos.find((x) => x.id === ins.vehiculoId);
  return {
    ...inspeccionResumen(ins),
    observaciones: ins.observaciones,
    vehiculo: {
      id: ins.vehiculoId,
      descripcion: descripcion(v),
      patente: v?.patente ?? '',
      estado: v?.estado ?? '',
    },
    resultadoSugerido: sugerirResultado(puntosDe(ins).map((p) => p.evaluacion)),
    secciones: ins.secciones,
  };
}

function inspeccionDelAlcance(c: Contexto, id: string, editable = false) {
  const ins = datos().inspecciones.find((i) => i.id === id);
  if (!ins) throw noEncontrado('Inspección');
  vehiculoDelAlcance(c, ins.vehiculoId);
  if (editable && ins.estado !== 'BORRADOR') throw fallo(409, 'La inspección ya está finalizada');
  return ins;
}

function puntoDe(ins: FilaInspeccion, puntoId: string) {
  const p = puntosDe(ins).find((x) => x.id === puntoId);
  if (!p) throw noEncontrado('Punto');
  return p;
}

const rutasInspeccion: Rutas = {
  'GET /vehiculos/:id/inspecciones': (c) => {
    const v = vehiculoDelAlcance(c, c.params.id!);
    return datos()
      .inspecciones.filter((i) => i.vehiculoId === v.id)
      .sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion))
      .map(inspeccionResumen);
  },
  'POST /vehiculos/:id/inspecciones': (c) => {
    const v = vehiculoDelAlcance(c, c.params.id!);
    if (datos().inspecciones.some((i) => i.vehiculoId === v.id && i.estado === 'BORRADOR')) {
      throw fallo(409, 'Este vehículo ya tiene una inspección en curso');
    }
    const ins: FilaInspeccion = {
      id: nuevoId('ins'),
      vehiculoId: v.id,
      estado: 'BORRADOR',
      resultado: null,
      kilometraje: v.kilometraje,
      observaciones: null,
      fechaCreacion: ahora(),
      fechaFinalizacion: null,
      iniciadaPorId: c.usuario.id,
      finalizadaPorId: null,
      secciones: plantillaInspeccion(() => nuevoId('pto')),
    };
    datos().inspecciones.push(ins);
    return inspeccionDetalle(ins);
  },
  'GET /inspecciones/:id': (c) => inspeccionDetalle(inspeccionDelAlcance(c, c.params.id!)),
  'PATCH /inspecciones/:id': (c) => {
    const ins = inspeccionDelAlcance(c, c.params.id!, true);
    const b = cuerpo(c) as { kilometraje?: number; observaciones?: string | null };
    if (b.kilometraje !== undefined) ins.kilometraje = Number(b.kilometraje);
    if (b.observaciones !== undefined) ins.observaciones = b.observaciones || null;
    return inspeccionDetalle(ins);
  },
  'DELETE /inspecciones/:id': (c) => {
    const ins = inspeccionDelAlcance(c, c.params.id!, true);
    datos().inspecciones = datos().inspecciones.filter((i) => i.id !== ins.id);
  },
  'POST /inspecciones/:id/puntos': (c) => {
    const ins = inspeccionDelAlcance(c, c.params.id!, true);
    const { seccion, nombre } = cuerpo(c) as { seccion: string; nombre: string };
    const s = ins.secciones.find((x) => x.codigo === seccion);
    if (!s) throw noEncontrado('Sección');
    s.puntos.push({
      id: nuevoId('pto'),
      nombre,
      personalizado: true,
      evaluacion: null,
      observacion: null,
      notaInterna: null,
      fotos: [],
    });
    return inspeccionDetalle(ins);
  },
  'PATCH /inspecciones/:id/puntos/:puntoId': (c) => {
    const p = puntoDe(inspeccionDelAlcance(c, c.params.id!, true), c.params.puntoId!);
    const b = cuerpo(c) as {
      evaluacion?: EvaluacionInspeccion | null;
      observacion?: string | null;
      notaInterna?: string | null;
    };
    if (b.evaluacion !== undefined) p.evaluacion = b.evaluacion;
    if (b.observacion !== undefined) p.observacion = b.observacion || null;
    if (b.notaInterna !== undefined) p.notaInterna = b.notaInterna || null;
    return p;
  },
  'DELETE /inspecciones/:id/puntos/:puntoId': (c) => {
    const ins = inspeccionDelAlcance(c, c.params.id!, true);
    for (const s of ins.secciones)
      s.puntos = s.puntos.filter((p) => p.id !== c.params.puntoId || !p.personalizado);
    return inspeccionDetalle(ins);
  },
  'POST /inspecciones/:id/puntos/:puntoId/fotos': async (c) => {
    const p = puntoDe(inspeccionDelAlcance(c, c.params.id!, true), c.params.puntoId!);
    const archivos = (c.body as FormData)
      .getAll('fotos')
      .filter((f): f is File => f instanceof File);
    for (const a of archivos)
      p.fotos.push({ id: nuevoId('fot'), url: await imagenComoDataUrl(a, 960) });
    return p;
  },
  'DELETE /inspecciones/:id/fotos/:fotoId': (c) => {
    const ins = inspeccionDelAlcance(c, c.params.id!, true);
    for (const p of puntosDe(ins)) p.fotos = p.fotos.filter((f) => f.id !== c.params.fotoId);
  },
  'POST /inspecciones/:id/finalizar': (c) => {
    const ins = inspeccionDelAlcance(c, c.params.id!, true);
    const { resultado } = cuerpo(c) as { resultado: ResultadoInspeccion };
    if (puntosDe(ins).some((p) => p.evaluacion === null))
      throw fallo(400, 'Evalúa todos los puntos antes de finalizar');
    ins.estado = 'FINALIZADA';
    ins.resultado = resultado;
    ins.fechaFinalizacion = ahora();
    ins.finalizadaPorId = c.usuario.id;
    registrarEvento(
      c,
      ins.vehiculoId,
      'INSPECCION_FINALIZADA',
      `Inspección pre-compra: ${etiqueta(resultado).toLowerCase()}`,
    );
    auditar(
      c,
      'INSPECCION_FINALIZADA',
      { tipo: 'VEHICULO', id: ins.vehiculoId },
      datos().vehiculos.find((v) => v.id === ins.vehiculoId)?.sucursalId ?? null,
      { resultado },
    );
    return inspeccionDetalle(ins);
  },
};

export const rutasInventario: Rutas = {
  'GET /vehiculos': listar,
  'POST /vehiculos': crear,
  'GET /vehiculos/sugerencia-revision-tecnica': (c) => ({
    fechaVencimientoSugerida: sugerirVencimientoRevisionTecnica(texto(c, 'patente') ?? ''),
  }),
  'GET /vehiculos/:id': (c) => vehiculoDetalle(c, vehiculoDelAlcance(c, c.params.id!)),
  'PATCH /vehiculos/:id': editar,
  'POST /vehiculos/:id/estado': cambiarEstado,
  'POST /vehiculos/:id/transferir': transferir,
  'POST /vehiculos/:id/fotos': subirFotos,
  'DELETE /vehiculos/:id/fotos/:fotoId': borrarFoto,
  'PUT /vehiculos/:id/fotos/orden': ordenarFotos,
  'GET /vehiculos/:id/documentos': listarDocumentos,
  'POST /vehiculos/:id/documentos': subirDocumento,
  'GET /vehiculos/:id/gastos': gastosVehiculo,
  'POST /vehiculos/:id/gastos': nuevoGastoVehiculo,
  'GET /vehiculos/:id/balance': balance,
  'GET /vehiculos/:id/bitacora': bitacora,
  ...rutasInspeccion,
};
