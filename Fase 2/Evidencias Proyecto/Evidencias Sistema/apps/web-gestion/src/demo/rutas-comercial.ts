import { esRutValido, normalizarRut } from '@vitriauto/shared-types';
import { etiqueta, hoy } from '../lib/formato';
import {
  datos,
  type FilaCliente,
  type FilaConsignacion,
  type FilaCotizacion,
  type FilaReserva,
  type FilaTasacion,
  type FilaVehiculo,
  type FilaVenta,
} from './db';
import {
  ahora,
  auditar,
  coincide,
  comisionConsignacion,
  consignacionDe,
  consignacionDto,
  cotizacionDto,
  cuerpo,
  delAlcance,
  descripcion,
  diasDesde,
  EN_INVENTARIO,
  estadoConsignacion,
  estadoCotizacion,
  estadoReserva,
  estadoTasacion,
  fallo,
  fechaChile,
  margenVenta,
  noEncontrado,
  nuevoId,
  paginar,
  registrarEvento,
  reservaDto,
  siguienteFolio,
  soloAdmin,
  sucursalesVisibles,
  sumarDias,
  tasacionDto,
  texto,
  ventaDto,
  visible,
  type Contexto,
  type Rutas,
} from './comun';
import { vehiculoDelAlcance } from './rutas-inventario';

const pesosTexto = (n: number) => `$${n.toLocaleString('es-CL')}`;
const automotora = (c: Contexto) => datos().automotoras.find((a) => a.id === c.automotoraId)!;

// ---------------------------------------------------------------- Clientes (de toda la automotora)

function clienteDe(c: Contexto, id: string): FilaCliente {
  const cl = datos().clientes.find((x) => x.id === id && x.automotoraId === c.automotoraId);
  if (!cl) throw noEncontrado('Cliente');
  return cl;
}
const clienteDto = ({ automotoraId: _a, ...resto }: FilaCliente) => resto;

function clienteActivo(c: Contexto, id: unknown) {
  const cl = clienteDe(c, String(id ?? ''));
  if (cl.estado !== 'ACTIVO') throw fallo(409, 'El cliente está inactivo');
  return cl;
}

function datosCliente(c: Contexto, b: Record<string, unknown>, excepto?: string) {
  const r: Partial<FilaCliente> = {};
  if (b.nombre !== undefined) r.nombre = String(b.nombre).trim();
  if (b.rut !== undefined) {
    if (!esRutValido(String(b.rut))) throw fallo(400, 'El RUT no es válido');
    r.rut = normalizarRut(String(b.rut));
    const repetido = datos().clientes.find(
      (x) => x.automotoraId === c.automotoraId && x.rut === r.rut && x.id !== excepto,
    );
    if (repetido) throw fallo(409, `Ya existe un cliente con el RUT ${r.rut} (${repetido.nombre})`);
  }
  for (const campo of ['telefono', 'email', 'direccion'] as const) {
    if (b[campo] !== undefined) r[campo] = String(b[campo]).trim();
  }
  if (b.aceptaRecordatorios !== undefined) r.aceptaRecordatorios = Boolean(b.aceptaRecordatorios);
  return r;
}

function historialCliente(c: Contexto) {
  const cl = clienteDe(c, c.params.id!);
  const db = datos();
  const alcance = sucursalesVisibles(c);
  const v = (id: string | null) => {
    const veh = id ? db.vehiculos.find((x) => x.id === id) : undefined;
    return { id: veh?.id ?? null, descripcion: veh ? `${descripcion(veh)} · ${veh.patente}` : '—' };
  };
  const filas = [
    ...db.cotizaciones
      .filter((x) => x.clienteId === cl.id)
      .map((x) => ({
        tipo: 'COTIZACION',
        id: x.id,
        folio: x.folio,
        sucursal: x.sucursalId,
        fecha: x.fechaEmision,
        estado: estadoCotizacion(x),
        vehiculo: v(x.vehiculoId),
        monto: x.precioCotizado,
      })),
    ...db.reservas
      .filter((x) => x.clienteId === cl.id)
      .map((x) => ({
        tipo: 'RESERVA',
        id: x.id,
        folio: x.folio,
        sucursal: x.sucursalId,
        fecha: x.fechaEmision,
        estado: estadoReserva(x),
        vehiculo: v(x.vehiculoId),
        monto: x.montoReserva,
      })),
    ...db.ventas
      .filter((x) => x.clienteId === cl.id)
      .map((x) => ({
        tipo: 'VENTA',
        id: x.id,
        folio: x.folio,
        sucursal: x.sucursalId,
        fecha: x.fechaVenta,
        estado: x.estado,
        vehiculo: v(x.vehiculoId),
        monto: x.precioVentaFinal,
      })),
    ...db.tasaciones
      .filter((x) => x.clienteId === cl.id)
      .map((x) => ({
        tipo: 'TASACION',
        id: x.id,
        folio: x.folio,
        sucursal: x.sucursalId,
        fecha: x.fechaEmision,
        estado: estadoTasacion(x),
        vehiculo: {
          id: x.vehiculoCreadoId,
          descripcion: `${x.vehiculoTasado.marca} ${x.vehiculoTasado.modelo} ${x.vehiculoTasado.anio} · ${x.vehiculoTasado.patente}`,
        },
        monto: x.ofertaMonto,
      })),
    ...db.consignaciones
      .filter((x) => x.clienteId === cl.id)
      .map((x) => ({
        tipo: 'CONSIGNACION',
        id: x.id,
        folio: x.folio,
        sucursal: x.sucursalRegistroId,
        fecha: x.fechaCreacion,
        estado: estadoConsignacion(x),
        vehiculo: v(x.vehiculoId),
        monto: db.vehiculos.find((y) => y.id === x.vehiculoId)?.precioVenta ?? 0,
      })),
  ];
  return filas
    .filter((f) => visible(alcance, f.sucursal))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map((f) => ({
      ...f,
      sucursal: {
        id: f.sucursal,
        nombre: db.sucursales.find((s) => s.id === f.sucursal)?.nombre ?? '—',
      },
    }));
}

const rutasClientes: Rutas = {
  'GET /clientes': (c) => {
    const q = texto(c, 'q');
    const inactivos = c.query.get('incluirInactivos') === 'true';
    const items = datos()
      .clientes.filter(
        (x) =>
          x.automotoraId === c.automotoraId &&
          (inactivos || x.estado === 'ACTIVO') &&
          coincide(q, x.nombre, x.rut, x.rut.replace('-', ''), x.email, x.telefono),
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map(clienteDto);
    return paginar(c, items);
  },
  'POST /clientes': (c) => {
    const d = datosCliente(c, cuerpo(c));
    const cl: FilaCliente = {
      id: nuevoId('cli'),
      automotoraId: c.automotoraId,
      nombre: d.nombre ?? '',
      rut: d.rut ?? '',
      telefono: d.telefono ?? '',
      email: d.email ?? '',
      direccion: d.direccion ?? '',
      estado: 'ACTIVO',
      aceptaRecordatorios: d.aceptaRecordatorios ?? true,
      fechaCreacion: ahora(),
    };
    datos().clientes.push(cl);
    return clienteDto(cl);
  },
  'GET /clientes/:id': (c) => clienteDto(clienteDe(c, c.params.id!)),
  'PATCH /clientes/:id': (c) => {
    const cl = clienteDe(c, c.params.id!);
    const d = datosCliente(c, cuerpo(c), cl.id);
    Object.assign(cl, d);
    return clienteDto(cl);
  },
  'POST /clientes/:id/activar': (c) => {
    const cl = clienteDe(c, c.params.id!);
    cl.estado = 'ACTIVO';
    auditar(c, 'CLIENTE_ACTIVADO', { tipo: 'CLIENTE', id: cl.id }, c.usuario.sucursalId, {
      nombre: cl.nombre,
    });
  },
  'POST /clientes/:id/desactivar': (c) => {
    const cl = clienteDe(c, c.params.id!);
    cl.estado = 'INACTIVO';
    auditar(c, 'CLIENTE_DESACTIVADO', { tipo: 'CLIENTE', id: cl.id }, c.usuario.sucursalId, {
      nombre: cl.nombre,
    });
  },
  'GET /clientes/:id/historial': historialCliente,
};

// ---------------------------------------------------------------- Listados de documentos

interface Documento {
  automotoraId: string;
  sucursalId: string;
  vehiculoId?: string;
  clienteId: string;
  folio: number;
}

// Filtros comunes de los listados (estado, período, búsqueda, orden, sucursal).
function listarDocumentos<T extends Documento>(
  c: Contexto,
  filas: T[],
  campos: {
    fecha: (f: T) => string;
    estado: (f: T) => string;
    monto: (f: T) => number;
    patente: (f: T) => string;
  },
) {
  const alcance = sucursalesVisibles(c);
  const estado = texto(c, 'estado');
  const desde = texto(c, 'desde');
  const hasta = texto(c, 'hasta');
  const q = texto(c, 'q');
  const vehiculoId = texto(c, 'vehiculoId');
  const items = filas.filter((f) => {
    const dia = fechaChile(campos.fecha(f));
    const cl = datos().clientes.find((x) => x.id === f.clienteId);
    return (
      f.automotoraId === c.automotoraId &&
      visible(alcance, f.sucursalId) &&
      (!estado || campos.estado(f) === estado) &&
      (!desde || dia >= desde) &&
      (!hasta || dia <= hasta) &&
      (!vehiculoId || f.vehiculoId === vehiculoId) &&
      coincide(q, f.folio, cl?.nombre, cl?.rut, campos.patente(f))
    );
  });
  const orden = texto(c, 'orden');
  items.sort((a, b) =>
    orden === 'antiguos'
      ? campos.fecha(a).localeCompare(campos.fecha(b))
      : orden === 'monto_desc'
        ? campos.monto(b) - campos.monto(a)
        : orden === 'monto_asc'
          ? campos.monto(a) - campos.monto(b)
          : campos.fecha(b).localeCompare(campos.fecha(a)),
  );
  return paginar(c, items);
}

const patenteDe = (f: { vehiculoId: string }) =>
  datos().vehiculos.find((v) => v.id === f.vehiculoId)?.patente ?? '';

// Vehículo apto para un documento comercial (ni vendido ni dado de baja).
function vehiculoComercial(c: Contexto, id: unknown): FilaVehiculo {
  const v = vehiculoDelAlcance(c, String(id ?? ''));
  if (!EN_INVENTARIO(v)) throw fallo(409, `El vehículo está ${etiqueta(v.estado).toLowerCase()}`);
  return v;
}

function correoAlEmitir(
  c: Contexto,
  enviar: unknown,
  documentoTipo: string,
  documentoId: string,
  clienteId: string,
) {
  if (!enviar) return;
  const cl = datos().clientes.find((x) => x.id === clienteId);
  if (!cl?.email) return;
  datos().correos.unshift({
    id: nuevoId('cor'),
    documentoTipo,
    documentoId,
    destinatario: cl.email,
    fechaCreacion: ahora(),
    pedidoPor: null,
  });
}

// ---------------------------------------------------------------- Cotizaciones

function cotizacionDe(c: Contexto, id: string): FilaCotizacion {
  return delAlcance(
    c,
    datos().cotizaciones.find((x) => x.id === id),
    (x) => x.sucursalId,
    'Cotización',
  );
}

const rutasCotizaciones: Rutas = {
  'GET /cotizaciones': (c) => {
    const p = listarDocumentos(c, datos().cotizaciones, {
      fecha: (x) => x.fechaEmision,
      estado: estadoCotizacion,
      monto: (x) => x.precioCotizado,
      patente: patenteDe,
    });
    return { ...p, items: p.items.map(cotizacionDto) };
  },
  'POST /cotizaciones': (c) => {
    const b = cuerpo(c);
    const v = vehiculoComercial(c, b.vehiculoId);
    const cl = clienteActivo(c, b.clienteId);
    const vigencia = Number(b.vigenciaDias ?? automotora(c).diasValidezCotizacion);
    const x: FilaCotizacion = {
      id: nuevoId('cot'),
      folio: siguienteFolio(c.automotoraId, 'COTIZACION'),
      automotoraId: c.automotoraId,
      sucursalId: v.sucursalId, // sucursal fijada al emitir
      clienteId: cl.id,
      vehiculoId: v.id,
      precioCotizado: Number(b.precioCotizado),
      costosAdicionales:
        (b.costosAdicionales as FilaCotizacion['costosAdicionales'] | undefined) ?? [],
      vigenciaDias: vigencia,
      fechaEmision: ahora(),
      fechaVencimiento: sumarDias(hoy(), vigencia),
      estado: 'VIGENTE',
      ventaId: null,
      emitidaPorId: c.usuario.id,
      anulacion: null,
    };
    datos().cotizaciones.push(x);
    registrarEvento(c, v.id, 'COTIZACION_GENERADA', `Cotización N° ${x.folio}`);
    auditar(c, 'COTIZACION_EMITIDA', { tipo: 'COTIZACION', id: x.id }, x.sucursalId, {
      folio: x.folio,
      precioCotizado: x.precioCotizado,
    });
    correoAlEmitir(c, b.enviarCorreo, 'COTIZACION', x.id, cl.id);
    return cotizacionDto(x);
  },
  'GET /cotizaciones/:id': (c) => cotizacionDto(cotizacionDe(c, c.params.id!)),
  'POST /cotizaciones/:id/anular': (c) => {
    const x = cotizacionDe(c, c.params.id!);
    if (!['VIGENTE', 'VENCIDA'].includes(estadoCotizacion(x)))
      throw fallo(409, 'Esta cotización no se puede anular');
    x.estado = 'ANULADA';
    x.anulacion = { motivo: String(cuerpo(c).motivo ?? ''), fecha: ahora() };
    registrarEvento(c, x.vehiculoId, 'ANULACION', `Cotización N° ${x.folio} anulada`);
    auditar(c, 'COTIZACION_ANULADA', { tipo: 'COTIZACION', id: x.id }, x.sucursalId, {
      motivo: x.anulacion.motivo,
    });
  },
};

// ---------------------------------------------------------------- Reservas

function reservaDe(c: Contexto, id: string): FilaReserva {
  return delAlcance(
    c,
    datos().reservas.find((x) => x.id === id),
    (x) => x.sucursalId,
    'Reserva',
  );
}
const reservaActiva = (vehiculoId: string) =>
  datos().reservas.find(
    (r) => r.vehiculoId === vehiculoId && ['VIGENTE', 'VENCIDA'].includes(estadoReserva(r)),
  );

const rutasReservas: Rutas = {
  'GET /reservas': (c) => {
    const p = listarDocumentos(c, datos().reservas, {
      fecha: (x) => x.fechaEmision,
      estado: estadoReserva,
      monto: (x) => x.montoReserva,
      patente: patenteDe,
    });
    return { ...p, items: p.items.map(reservaDto) };
  },
  'POST /reservas': (c) => {
    const b = cuerpo(c);
    const v = vehiculoComercial(c, b.vehiculoId);
    if (v.estado === 'RESERVADO' || reservaActiva(v.id))
      throw fallo(409, 'El vehículo ya tiene una reserva activa');
    const cl = clienteActivo(c, b.clienteId);
    const vigencia = Number(b.vigenciaDias ?? automotora(c).diasValidezReserva);
    const x: FilaReserva = {
      id: nuevoId('res'),
      folio: siguienteFolio(c.automotoraId, 'RESERVA'),
      automotoraId: c.automotoraId,
      sucursalId: v.sucursalId,
      clienteId: cl.id,
      vehiculoId: v.id,
      montoReserva: Number(b.montoReserva),
      condicionesDevolucion: b.condicionesDevolucion ? String(b.condicionesDevolucion) : null,
      fechaEmision: ahora(),
      fechaVencimiento: sumarDias(hoy(), vigencia),
      estado: 'VIGENTE',
      emitidaPorId: c.usuario.id,
      cancelacion: null,
      estadoVehiculoPrevio: v.estado,
    };
    datos().reservas.push(x);
    v.estado = 'RESERVADO';
    registrarEvento(
      c,
      v.id,
      'RESERVA_GENERADA',
      `Reserva N° ${x.folio} por ${pesosTexto(x.montoReserva)}`,
    );
    auditar(c, 'RESERVA_EMITIDA', { tipo: 'RESERVA', id: x.id }, x.sucursalId, {
      folio: x.folio,
      montoReserva: x.montoReserva,
    });
    correoAlEmitir(c, b.enviarCorreo, 'RESERVA', x.id, cl.id);
    return reservaDto(x);
  },
  'GET /reservas/:id': (c) => reservaDto(reservaDe(c, c.params.id!)),
  'POST /reservas/:id/extender': (c) => {
    const x = reservaDe(c, c.params.id!);
    if (!['VIGENTE', 'VENCIDA'].includes(estadoReserva(x)))
      throw fallo(409, 'Esta reserva ya no se puede extender');
    const nueva = String(cuerpo(c).nuevaFechaVencimiento);
    if (nueva < hoy()) throw fallo(400, 'La nueva fecha no puede ser anterior a hoy');
    x.fechaVencimiento = nueva;
    x.estado = 'VIGENTE';
    auditar(c, 'RESERVA_EXTENDIDA', { tipo: 'RESERVA', id: x.id }, x.sucursalId, {
      fechaVencimiento: nueva,
    });
  },
  'POST /reservas/:id/cancelar': (c) => {
    const x = reservaDe(c, c.params.id!);
    if (!['VIGENTE', 'VENCIDA'].includes(estadoReserva(x)))
      throw fallo(409, 'Esta reserva ya no está activa');
    const b = cuerpo(c) as { motivo?: string; senaRetenida?: boolean | null };
    if (b.senaRetenida === null || b.senaRetenida === undefined)
      throw fallo(400, 'Indica si la seña se retiene o se devuelve');
    x.estado = 'CANCELADA';
    x.cancelacion = { motivo: b.motivo ?? '', fecha: ahora(), senaRetenida: b.senaRetenida };
    const v = datos().vehiculos.find((y) => y.id === x.vehiculoId);
    if (v && v.estado === 'RESERVADO')
      v.estado = x.estadoVehiculoPrevio === 'RESERVADO' ? 'DISPONIBLE' : x.estadoVehiculoPrevio;
    registrarEvento(
      c,
      x.vehiculoId,
      'ANULACION',
      `Reserva N° ${x.folio} dada de baja${b.senaRetenida ? ' (seña retenida)' : ''}`,
    );
    auditar(c, 'RESERVA_CANCELADA', { tipo: 'RESERVA', id: x.id }, x.sucursalId, {
      motivo: b.motivo,
      senaRetenida: b.senaRetenida,
    });
  },
};

// ---------------------------------------------------------------- Ventas

function ventaDe(c: Contexto, id: string): FilaVenta {
  return delAlcance(
    c,
    datos().ventas.find((x) => x.id === id),
    (x) => x.sucursalId,
    'Venta',
  );
}

function crearVenta(c: Contexto) {
  const db = datos();
  const b = cuerpo(c);
  const v = vehiculoComercial(c, b.vehiculoId);
  const cl = clienteActivo(c, b.clienteId);
  const reserva = b.reservaId ? reservaDe(c, String(b.reservaId)) : reservaActiva(v.id);
  if (reserva && reserva.clienteId !== cl.id)
    throw fallo(409, 'El vehículo está reservado para otro cliente');
  const cot = b.cotizacionId ? cotizacionDe(c, String(b.cotizacionId)) : undefined;
  const precio = Number(b.precioVentaFinal);
  const formas =
    (b.formasPago as
      { tipo: string; monto: number; vehiculoRecibido?: Record<string, unknown> }[] | undefined) ??
    [];
  if (formas.length === 0) throw fallo(400, 'Indica al menos una forma de pago');
  const ventaId = nuevoId('ven');
  const folio = siguienteFolio(c.automotoraId, 'VENTA');

  // Auto recibido en parte de pago: entra al inventario pendiente de revisión.
  const formasPago = formas.map((f) => {
    if (f.tipo !== 'PARTE_PAGO' || !f.vehiculoRecibido)
      return { tipo: f.tipo, monto: Number(f.monto), vehiculoRecibidoId: null };
    const r = f.vehiculoRecibido;
    const recibido: FilaVehiculo = {
      id: nuevoId('veh'),
      automotoraId: c.automotoraId,
      sucursalId: v.sucursalId,
      marca: String(r.marca),
      modelo: String(r.modelo),
      anio: Number(r.anio),
      version: null,
      kilometraje: Number(r.kilometraje),
      color: String(r.color),
      combustible: 'BENCINA',
      transmision: 'MANUAL',
      cilindrada: null,
      patente: String(r.patente).toUpperCase(),
      categoria: 'OTRO',
      traccion: 'X4X2',
      descripcion: `Recibido en parte de pago (venta N° ${folio}).`,
      precioVenta: Math.round(Number(f.monto) * 1.15),
      costoAdquisicion: Number(f.monto),
      origen: 'PARTE_PAGO',
      estado: 'PENDIENTE_REVISION',
      fechaIngreso: ahora(),
      fotos: [],
      documentos: [],
    };
    db.vehiculos.push(recibido);
    registrarEvento(
      c,
      recibido.id,
      'ALTA',
      `Ingreso al inventario (parte de pago de la venta N° ${folio})`,
    );
    return { tipo: f.tipo, monto: Number(f.monto), vehiculoRecibidoId: recibido.id };
  });

  const cons = v.origen === 'CONSIGNACION' ? consignacionDe(v.id) : undefined;
  const comision = cons ? comisionConsignacion(cons, precio) : 0;
  const x: FilaVenta = {
    id: ventaId,
    folio,
    automotoraId: c.automotoraId,
    sucursalId: v.sucursalId,
    clienteId: cl.id,
    vehiculoId: v.id,
    precioVentaFinal: precio,
    precioPublicado: v.precioVenta,
    reservaId: reserva?.id ?? null,
    senaDescontada: reserva?.montoReserva ?? 0,
    cotizacionId: cot?.id ?? null,
    formasPago,
    costosAdicionales: (b.costosAdicionales as FilaVenta['costosAdicionales'] | undefined) ?? [],
    fechaVenta: ahora(),
    estado: 'CONFIRMADA',
    vendidaPorId: c.usuario.id,
    anulacion: null,
    margen: margenVenta(v, precio),
    liquidacion: cons
      ? { precioVenta: precio, comision, montoConsignante: precio - comision }
      : null,
  };
  db.ventas.push(x);
  v.estado = 'VENDIDO';
  if (reserva) reserva.estado = 'CONVERTIDA_EN_VENTA';
  if (cot) {
    cot.estado = 'CONCRETADA';
    cot.ventaId = x.id;
  }
  if (cons) cons.estado = 'VENDIDA';
  registrarEvento(c, v.id, 'VENTA_CONCRETADA', `Venta N° ${x.folio} por ${pesosTexto(precio)}`);
  auditar(c, 'VENTA_CONFIRMADA', { tipo: 'VENTA', id: x.id }, x.sucursalId, {
    folio: x.folio,
    precioVentaFinal: precio,
  });
  correoAlEmitir(c, b.enviarCorreo, 'VENTA', x.id, cl.id);
  return ventaDto(c, x);
}

function anularVenta(c: Contexto) {
  soloAdmin(c);
  const db = datos();
  const x = ventaDe(c, c.params.id!);
  if (x.estado !== 'CONFIRMADA') throw fallo(409, 'La venta ya está anulada');
  x.estado = 'ANULADA';
  x.anulacion = { motivo: String(cuerpo(c).motivo ?? ''), fecha: ahora() };
  const v = db.vehiculos.find((y) => y.id === x.vehiculoId);
  const reserva = x.reservaId ? db.reservas.find((r) => r.id === x.reservaId) : undefined;
  if (reserva) reserva.estado = 'VIGENTE';
  if (v) v.estado = reserva ? 'RESERVADO' : 'DISPONIBLE';
  const cot = x.cotizacionId ? db.cotizaciones.find((r) => r.id === x.cotizacionId) : undefined;
  if (cot) {
    cot.estado = 'VIGENTE';
    cot.ventaId = null;
  }
  const cons = v ? consignacionDe(v.id) : undefined;
  if (cons?.estado === 'VENDIDA') cons.estado = 'ACTIVA';
  // El auto recibido en parte de pago sale del inventario.
  for (const f of x.formasPago) {
    const recibido = f.vehiculoRecibidoId
      ? db.vehiculos.find((y) => y.id === f.vehiculoRecibidoId)
      : undefined;
    if (recibido && EN_INVENTARIO(recibido)) recibido.estado = 'DADO_DE_BAJA';
  }
  registrarEvento(c, x.vehiculoId, 'ANULACION', `Venta N° ${x.folio} anulada`);
  auditar(c, 'VENTA_ANULADA', { tipo: 'VENTA', id: x.id }, x.sucursalId, {
    motivo: x.anulacion.motivo,
  });
}

const rutasVentas: Rutas = {
  'GET /ventas': (c) => {
    const p = listarDocumentos(c, datos().ventas, {
      fecha: (x) => x.fechaVenta,
      estado: (x) => x.estado,
      monto: (x) => x.precioVentaFinal,
      patente: patenteDe,
    });
    return { ...p, items: p.items.map((x) => ventaDto(c, x)) };
  },
  'POST /ventas': crearVenta,
  'GET /ventas/:id': (c) => ventaDto(c, ventaDe(c, c.params.id!)),
  'POST /ventas/:id/anular': anularVenta,
};

// ---------------------------------------------------------------- Tasaciones

function tasacionDe(c: Contexto, id: string): FilaTasacion {
  return delAlcance(
    c,
    datos().tasaciones.find((x) => x.id === id),
    (x) => x.sucursalId,
    'Tasación',
  );
}

const rutasTasaciones: Rutas = {
  'GET /tasaciones': (c) => {
    const p = listarDocumentos(c, datos().tasaciones, {
      fecha: (x) => x.fechaEmision,
      estado: estadoTasacion,
      monto: (x) => x.ofertaMonto,
      patente: (x) => x.vehiculoTasado.patente,
    });
    return { ...p, items: p.items.map(tasacionDto) };
  },
  'POST /tasaciones': (c) => {
    const b = cuerpo(c);
    const cl = clienteActivo(c, b.clienteId);
    const sucursalId = c.esGeneral ? String(b.sucursalId ?? '') : c.usuario.sucursalId!;
    if (!datos().sucursales.some((s) => s.id === sucursalId && s.automotoraId === c.automotoraId))
      throw fallo(400, 'Elige la sucursal');
    const vigencia = Number(b.vigenciaDias ?? automotora(c).diasValidezTasacion);
    const x: FilaTasacion = {
      id: nuevoId('tas'),
      folio: siguienteFolio(c.automotoraId, 'TASACION'),
      automotoraId: c.automotoraId,
      sucursalId,
      clienteId: cl.id,
      vehiculoTasado: {
        patente: String(b.patente).toUpperCase(),
        marca: String(b.marca),
        modelo: String(b.modelo),
        version: b.version ? String(b.version) : null,
        anio: Number(b.anio),
        kilometraje: Number(b.kilometraje),
        estadoGeneral: String(b.estadoGeneral ?? ''),
      },
      ofertaMonto: Number(b.ofertaMonto),
      fechaEmision: ahora(),
      fechaVencimiento: sumarDias(hoy(), vigencia),
      estado: 'VIGENTE',
      emitidaPorId: c.usuario.id,
      vehiculoCreadoId: null,
      anulacion: null,
    };
    datos().tasaciones.push(x);
    auditar(c, 'TASACION_EMITIDA', { tipo: 'TASACION', id: x.id }, sucursalId, {
      folio: x.folio,
      ofertaMonto: x.ofertaMonto,
    });
    correoAlEmitir(c, b.enviarCorreo, 'TASACION', x.id, cl.id);
    return tasacionDto(x);
  },
  'GET /tasaciones/:id': (c) => tasacionDto(tasacionDe(c, c.params.id!)),
  'POST /tasaciones/:id/resolver': (c) => {
    const x = tasacionDe(c, c.params.id!);
    if (estadoTasacion(x) !== 'VIGENTE') throw fallo(409, 'Solo se resuelve una tasación vigente');
    x.estado = String(cuerpo(c).estado);
    auditar(
      c,
      `TASACION_${x.estado === 'ACEPTADA' ? 'ACEPTADA' : 'RECHAZADA'}`,
      { tipo: 'TASACION', id: x.id },
      x.sucursalId,
      { estado: x.estado },
    );
  },
  'POST /tasaciones/:id/anular': (c) => {
    const x = tasacionDe(c, c.params.id!);
    if (x.vehiculoCreadoId) throw fallo(409, 'Esta tasación ya originó un vehículo');
    x.estado = 'ANULADA';
    x.anulacion = { motivo: String(cuerpo(c).motivo ?? ''), fecha: ahora() };
    auditar(c, 'TASACION_ANULADA', { tipo: 'TASACION', id: x.id }, x.sucursalId, {
      motivo: x.anulacion.motivo,
    });
  },
};

// ---------------------------------------------------------------- Consignaciones

function consignacionDelAlcance(c: Contexto, id: string): FilaConsignacion {
  const x = datos().consignaciones.find((y) => y.id === id && y.automotoraId === c.automotoraId);
  if (!x) throw noEncontrado('Consignación');
  vehiculoDelAlcance(c, x.vehiculoId);
  return x;
}

const rutasConsignaciones: Rutas = {
  'GET /consignaciones': (c) => {
    const db = datos();
    const alcance = sucursalesVisibles(c);
    const estado = texto(c, 'estado');
    const q = texto(c, 'q');
    const filas = db.consignaciones.filter((x) => {
      const v = db.vehiculos.find((y) => y.id === x.vehiculoId);
      const cl = db.clientes.find((y) => y.id === x.clienteId);
      return (
        x.automotoraId === c.automotoraId &&
        visible(alcance, v?.sucursalId ?? null) &&
        (!estado || estadoConsignacion(x) === estado) &&
        coincide(q, x.folio, cl?.nombre, cl?.rut, v?.patente, v?.marca, v?.modelo)
      );
    });
    const campo = texto(c, 'orden');
    const signo = texto(c, 'direccion') === 'desc' ? -1 : 1;
    const valor = (x: FilaConsignacion) => {
      const v = db.vehiculos.find((y) => y.id === x.vehiculoId);
      if (campo === 'dias') return v ? diasDesde(v.fechaIngreso) : 0;
      if (campo === 'plazo') return Date.parse(x.fechaFin);
      return x.precioMinimo;
    };
    filas.sort((a, b) =>
      campo ? (valor(a) - valor(b)) * signo : b.fechaCreacion.localeCompare(a.fechaCreacion),
    );
    const p = paginar(c, filas);
    return { ...p, items: p.items.map((x) => consignacionDto(c, x)) };
  },
  'GET /consignaciones/:id': (c) => consignacionDto(c, consignacionDelAlcance(c, c.params.id!)),
  'GET /consignaciones/:id/liquidacion': (c) => {
    soloAdmin(c);
    const x = consignacionDelAlcance(c, c.params.id!);
    const v = datos().vehiculos.find((y) => y.id === x.vehiculoId)!;
    const precio = Number(c.query.get('precioVenta') || v.precioVenta);
    const comision = comisionConsignacion(x, precio);
    const advertencias: string[] = [];
    if (precio < x.precioMinimo)
      advertencias.push(
        `El precio está bajo el mínimo acordado con el dueño (${pesosTexto(x.precioMinimo)}).`,
      );
    if (comision < 0)
      advertencias.push(
        'Con este precio la automotora pierde dinero: no alcanza a cubrir el monto neto garantizado.',
      );
    return { precioVenta: precio, comision, montoConsignante: precio - comision, advertencias };
  },
  'PATCH /consignaciones/:id': (c) => {
    soloAdmin(c);
    const x = consignacionDelAlcance(c, c.params.id!);
    const b = cuerpo(c) as Partial<FilaConsignacion>;
    x.tipoTrato = b.tipoTrato ?? x.tipoTrato;
    x.porcentajeComision =
      x.tipoTrato === 'COMISION_VENTA'
        ? Number(b.porcentajeComision ?? x.porcentajeComision)
        : null;
    x.montoNeto = x.tipoTrato === 'PRECIO_NETO' ? Number(b.montoNeto ?? x.montoNeto) : null;
    x.precioMinimo =
      x.tipoTrato === 'PRECIO_NETO' ? (x.montoNeto ?? 0) : Number(b.precioMinimo ?? x.precioMinimo);
    auditar(
      c,
      'CONSIGNACION_CAMBIO_CONDICIONES',
      { tipo: 'CONSIGNACION', id: x.id },
      x.sucursalRegistroId,
      { tipoTrato: x.tipoTrato },
    );
  },
  'POST /consignaciones/:id/extender': (c) => {
    const x = consignacionDelAlcance(c, c.params.id!);
    x.fechaFin = String(cuerpo(c).nuevaFechaFin);
    x.estado = 'ACTIVA';
    auditar(c, 'CONSIGNACION_EXTENDIDA', { tipo: 'CONSIGNACION', id: x.id }, x.sucursalRegistroId, {
      fechaFin: x.fechaFin,
    });
  },
  'POST /consignaciones/:id/devolver': (c) => {
    const x = consignacionDelAlcance(c, c.params.id!);
    const v = datos().vehiculos.find((y) => y.id === x.vehiculoId)!;
    if (v.estado === 'RESERVADO')
      throw fallo(409, 'El vehículo tiene una reserva activa: dala de baja primero');
    x.estado = 'DEVUELTA';
    v.estado = 'DADO_DE_BAJA';
    registrarEvento(c, v.id, 'CAMBIO_ESTADO', 'Devuelto al consignante');
    auditar(c, 'CONSIGNACION_DEVUELTA', { tipo: 'CONSIGNACION', id: x.id }, x.sucursalRegistroId, {
      motivo: cuerpo(c).motivo ?? null,
    });
  },
};

// ---------------------------------------------------------------- Correos

const correosDe = (tipo: string, id: string) =>
  datos()
    .correos.filter((x) => x.documentoTipo === tipo && x.documentoId === id)
    .map((x) => ({
      id: x.id,
      tipo: 'DOCUMENTO' as const,
      destinatario: x.destinatario,
      estado: 'ENVIADO' as const,
      intentos: 1,
      error: null,
      fechaCreacion: x.fechaCreacion,
      fechaEnvio: x.fechaCreacion,
      pedidoPor: x.pedidoPor,
    }));

const rutasCorreos: Rutas = {
  'GET /correos': (c) => correosDe(texto(c, 'documentoTipo') ?? '', texto(c, 'documentoId') ?? ''),
  // En la demo no sale ningún correo: solo queda registrado como enviado.
  'POST /correos/reenviar': (c) => {
    const { documentoTipo, documentoId } = cuerpo(c) as {
      documentoTipo: string;
      documentoId: string;
    };
    const db = datos();
    const doc =
      db.cotizaciones.find((x) => x.id === documentoId) ??
      db.reservas.find((x) => x.id === documentoId) ??
      db.ventas.find((x) => x.id === documentoId) ??
      db.tasaciones.find((x) => x.id === documentoId) ??
      db.consignaciones.find((x) => x.id === documentoId);
    if (!doc || doc.automotoraId !== c.automotoraId) throw noEncontrado('Documento');
    const destinatario = db.clientes.find((x) => x.id === doc.clienteId)?.email;
    if (!destinatario) throw fallo(409, 'El cliente no tiene email');
    db.correos.unshift({
      id: nuevoId('cor'),
      documentoTipo,
      documentoId,
      destinatario,
      fechaCreacion: ahora(),
      pedidoPor: c.usuario.nombre,
    });
    return correosDe(documentoTipo, documentoId);
  },
};

export const rutasComercial: Rutas = {
  ...rutasClientes,
  ...rutasCotizaciones,
  ...rutasReservas,
  ...rutasVentas,
  ...rutasTasaciones,
  ...rutasConsignaciones,
  ...rutasCorreos,
};
