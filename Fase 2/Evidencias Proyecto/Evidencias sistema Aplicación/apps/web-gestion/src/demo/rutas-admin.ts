import { normalizarWhatsapp } from '@vitriauto/shared-types';
import type { Usuario } from '../lib/tipos';
import { datos, type FilaGasto, type FilaSucursal } from './db';
import {
  ahora,
  auditar,
  cuerpo,
  delAlcance,
  fallo,
  gastoDto,
  imagenComoDataUrl,
  noEncontrado,
  nuevoId,
  sin,
  paginar,
  soloAdmin,
  soloGeneral,
  sucursalDe,
  sucursalesVisibles,
  texto,
  visible,
  type Contexto,
  type Rutas,
} from './comun';
import { siguienteNumeroGasto } from './rutas-inventario';

const automotoraDe = (c: Contexto) => datos().automotoras.find((a) => a.id === c.automotoraId)!;

// ---------------------------------------------------------------- Sesión y automotora

const rutasSesion: Rutas = {
  // En la demo no hay credenciales: siempre se entra como el perfil elegido.
  'GET /auth/me': (c) => c.usuario,
  'POST /auth/login': (c) => c.usuario,
  'POST /auth/logout': () => undefined,
  'GET /automotora': (c) => automotoraDe(c),
  'PATCH /automotora': (c) => {
    soloGeneral(c);
    const a = automotoraDe(c);
    const b = cuerpo(c);
    // El subdominio, los archivos y los correos no se cambian por esta vía.
    const permitidos = sin(b, 'correos', 'id', 'subdominio', 'logoUrl', 'bannerUrl');
    const correos = Object.fromEntries(
      Object.keys(a.correos)
        .filter((k) => k in b)
        .map((k) => [k, b[k]]),
    );
    Object.assign(a, Object.fromEntries(Object.entries(permitidos).filter(([k]) => k in a)));
    a.correos = { ...a.correos, ...correos };
    const f = a.financiamiento;
    a.financiamiento = {
      activo: (b.financiamientoActivo as boolean | undefined) ?? f.activo,
      tasaMensual:
        b.financiamientoTasaMensual !== undefined
          ? (b.financiamientoTasaMensual as number | null)
          : f.tasaMensual,
      pieMinimo: (b.financiamientoPieMinimo as number | undefined) ?? f.pieMinimo,
      plazoMaximo: (b.financiamientoPlazoMaximo as number | undefined) ?? f.plazoMaximo,
    };
    if (a.financiamiento.activo && a.financiamiento.tasaMensual === null)
      throw fallo(400, 'Indica la tasa mensual para activar el simulador de crédito');
    auditar(c, 'CONFIGURACION_EDITADA', { tipo: 'AUTOMOTORA', id: a.id }, null, permitidos);
    return a;
  },
  'POST /automotora/:tipo': async (c) => {
    soloGeneral(c);
    const a = automotoraDe(c);
    const archivo = (c.body as FormData).get('imagen');
    if (!(archivo instanceof File)) throw fallo(400, 'Elige una imagen');
    const url = await imagenComoDataUrl(archivo, c.params.tipo === 'logo' ? 400 : 1600);
    if (c.params.tipo === 'logo') a.logoUrl = url;
    else a.bannerUrl = url;
    auditar(
      c,
      c.params.tipo === 'logo' ? 'LOGO_ACTUALIZADO' : 'BANNER_ACTUALIZADO',
      { tipo: 'AUTOMOTORA', id: a.id },
      null,
    );
    return a;
  },
  'DELETE /automotora/:tipo': (c) => {
    soloGeneral(c);
    const a = automotoraDe(c);
    if (c.params.tipo === 'logo') a.logoUrl = null;
    else a.bannerUrl = null;
    auditar(
      c,
      c.params.tipo === 'logo' ? 'LOGO_ELIMINADO' : 'BANNER_ELIMINADO',
      { tipo: 'AUTOMOTORA', id: a.id },
      null,
    );
    return a;
  },
};

// ---------------------------------------------------------------- Sucursales

const sucursalDto = ({ automotoraId: _a, activa: _b, ...resto }: FilaSucursal) => resto;

function sucursalDelAlcance(c: Contexto, id: string) {
  const s = datos().sucursales.find(
    (x) => x.id === id && x.automotoraId === c.automotoraId && x.activa,
  );
  if (!s) throw noEncontrado('Sucursal');
  return s;
}

function datosSucursal(b: Record<string, unknown>) {
  const r: Record<string, unknown> = {};
  for (const k of [
    'nombre',
    'direccion',
    'region',
    'comuna',
    'telefono',
    'encargado',
    'horarioAtencion',
  ]) {
    if (b[k] !== undefined) r[k] = b[k] === '' ? null : b[k];
  }
  if (b.whatsapp !== undefined)
    r.whatsapp = b.whatsapp ? normalizarWhatsapp(String(b.whatsapp)) : null;
  return r as Partial<FilaSucursal>;
}

const rutasSucursales: Rutas = {
  'GET /sucursales': (c) =>
    datos()
      .sucursales.filter((s) => s.automotoraId === c.automotoraId && s.activa)
      .sort(
        (a, b) => Number(b.esPrincipal) - Number(a.esPrincipal) || a.nombre.localeCompare(b.nombre),
      )
      .map(sucursalDto),
  'POST /sucursales': (c) => {
    soloGeneral(c);
    const s: FilaSucursal = {
      id: nuevoId('suc'),
      automotoraId: c.automotoraId,
      nombre: '',
      direccion: '',
      region: 'METROPOLITANA',
      comuna: '',
      telefono: '',
      encargado: null,
      horarioAtencion: null,
      whatsapp: null,
      esPrincipal: false,
      fechaCreacion: ahora(),
      activa: true,
      ...datosSucursal(cuerpo(c)),
    };
    datos().sucursales.push(s);
    auditar(c, 'SUCURSAL_CREADA', { tipo: 'SUCURSAL', id: s.id }, s.id, {
      nombre: s.nombre,
      comuna: s.comuna,
    });
    return sucursalDto(s);
  },
  'PATCH /sucursales/:id': (c) => {
    soloGeneral(c);
    const s = sucursalDelAlcance(c, c.params.id!);
    Object.assign(s, datosSucursal(cuerpo(c)));
    auditar(c, 'SUCURSAL_EDITADA', { tipo: 'SUCURSAL', id: s.id }, s.id, { nombre: s.nombre });
    return sucursalDto(s);
  },
  'POST /sucursales/:id/dar-de-baja': (c) => {
    soloGeneral(c);
    const db = datos();
    const s = sucursalDelAlcance(c, c.params.id!);
    if (s.esPrincipal) throw fallo(409, 'La sucursal principal no se puede dar de baja');
    const conStock = db.vehiculos.some(
      (v) => v.sucursalId === s.id && v.estado !== 'VENDIDO' && v.estado !== 'DADO_DE_BAJA',
    );
    if (conStock)
      throw fallo(
        409,
        'La sucursal tiene vehículos en inventario: transfiérelos antes de darla de baja',
      );
    if (db.usuarios.some((u) => u.sucursalId === s.id && u.estado === 'ACTIVO')) {
      throw fallo(409, 'La sucursal tiene usuarios activos: reasígnalos o desactívalos primero');
    }
    s.activa = false;
    auditar(c, 'SUCURSAL_DADA_DE_BAJA', { tipo: 'SUCURSAL', id: s.id }, s.id, { nombre: s.nombre });
  },
};

// ---------------------------------------------------------------- Usuarios

function usuarioDelAlcance(c: Contexto, id: string): Usuario {
  const u = datos().usuarios.find((x) => x.id === id && x.automotoraId === c.automotoraId);
  if (!u || (!c.esGeneral && u.sucursalId !== c.usuario.sucursalId)) throw noEncontrado('Usuario');
  return u;
}

// El Admin de Sucursal solo gestiona Vendedores de su sucursal.
function rolPermitido(c: Contexto, rol: string, sucursalId: string | null | undefined) {
  if (c.esGeneral) {
    if (rol !== 'ADMIN_GENERAL' && !sucursalId) throw fallo(400, 'Elige la sucursal del usuario');
    return rol === 'ADMIN_GENERAL' ? null : sucursalId!;
  }
  if (rol !== 'VENDEDOR') throw fallo(403, 'Solo puedes invitar vendedores a tu sucursal');
  return c.usuario.sucursalId;
}

const rutasUsuarios: Rutas = {
  'GET /usuarios': (c) => {
    soloAdmin(c);
    return datos()
      .usuarios.filter(
        (u) =>
          u.automotoraId === c.automotoraId &&
          (c.esGeneral || u.sucursalId === c.usuario.sucursalId),
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  },
  'POST /usuarios': (c) => {
    soloAdmin(c);
    const b = cuerpo(c) as {
      nombre: string;
      email: string;
      rol: Usuario['rol'];
      sucursalId?: string;
    };
    const email = b.email.trim().toLowerCase();
    if (datos().usuarios.some((u) => u.email === email))
      throw fallo(409, 'Ya existe un usuario con ese email');
    const u: Usuario = {
      id: nuevoId('usr'),
      nombre: b.nombre.trim(),
      email,
      rol: b.rol,
      sucursalId: rolPermitido(c, b.rol, b.sucursalId),
      automotoraId: c.automotoraId,
      estado: 'ACTIVO',
      emailVerificado: false,
      invitacionPendiente: true,
      fechaCreacion: ahora(),
    };
    datos().usuarios.push(u);
    auditar(c, 'USUARIO_INVITADO', { tipo: 'USUARIO', id: u.id }, u.sucursalId, {
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
    });
    return u;
  },
  'PATCH /usuarios/:id': (c) => {
    soloAdmin(c);
    const u = usuarioDelAlcance(c, c.params.id!);
    const b = cuerpo(c) as { nombre?: string; rol?: Usuario['rol']; sucursalId?: string | null };
    if (u.id === c.usuario.id && b.rol && b.rol !== u.rol)
      throw fallo(409, 'No puedes cambiar tu propio rol');
    const anterior = { nombre: u.nombre, rol: u.rol, sucursalId: u.sucursalId };
    if (b.nombre) u.nombre = b.nombre.trim();
    if (b.rol) {
      u.sucursalId = rolPermitido(c, b.rol, b.sucursalId ?? u.sucursalId);
      u.rol = b.rol;
    }
    auditar(
      c,
      'USUARIO_EDITADO',
      { tipo: 'USUARIO', id: u.id },
      u.sucursalId,
      { nombre: u.nombre, rol: u.rol, sucursalId: u.sucursalId },
      anterior,
    );
    return u;
  },
  'POST /usuarios/:id/activar': (c) => {
    soloAdmin(c);
    const u = usuarioDelAlcance(c, c.params.id!);
    u.estado = 'ACTIVO';
    auditar(c, 'USUARIO_ACTIVADO', { tipo: 'USUARIO', id: u.id }, u.sucursalId, {
      estado: 'ACTIVO',
    });
  },
  'POST /usuarios/:id/desactivar': (c) => {
    soloAdmin(c);
    const u = usuarioDelAlcance(c, c.params.id!);
    if (u.id === c.usuario.id) throw fallo(409, 'No puedes desactivar tu propio usuario');
    u.estado = 'INACTIVO';
    auditar(c, 'USUARIO_DESACTIVADO', { tipo: 'USUARIO', id: u.id }, u.sucursalId, {
      estado: 'INACTIVO',
    });
  },
  // En la demo no se envía la invitación: solo se confirma.
  'POST /usuarios/:id/reenviar-invitacion': (c) => {
    soloAdmin(c);
    usuarioDelAlcance(c, c.params.id!);
  },
};

// ---------------------------------------------------------------- Gastos

function gastoDelAlcance(c: Contexto, id: string): FilaGasto {
  return delAlcance(
    c,
    datos().gastos.find((g) => g.id === id),
    (g) => g.sucursalId,
    'Gasto',
  );
}

function listarGastos(c: Contexto) {
  soloAdmin(c);
  const alcance = sucursalesVisibles(c);
  const desde = texto(c, 'desde');
  const hasta = texto(c, 'hasta');
  const tipo = texto(c, 'tipo');
  const categoria = texto(c, 'categoria');
  const soloGenerales = c.esGeneral && c.query.get('soloGenerales') === 'true';
  const anulados = c.query.get('incluirAnulados') === 'true';
  const vehiculoId = texto(c, 'vehiculoId');
  const filtrados = datos().gastos.filter(
    (g) =>
      g.automotoraId === c.automotoraId &&
      // Los generales (sin sucursal) solo los ve el Admin General en el consolidado.
      (g.sucursalId === null ? c.esGeneral && alcance === null : visible(alcance, g.sucursalId)) &&
      (!soloGenerales || g.sucursalId === null) &&
      (!desde || g.fecha >= desde) &&
      (!hasta || g.fecha <= hasta) &&
      (!tipo || g.tipo === tipo) &&
      (!categoria || g.categoria === categoria) &&
      (!vehiculoId || g.vehiculoId === vehiculoId),
  );
  const activos = filtrados.filter((g) => g.estado === 'ACTIVO');
  const porCategoria = new Map<string, { tipo: string; categoria: string; total: number }>();
  for (const g of activos) {
    const clave = `${g.tipo}:${g.categoria}`;
    const t = porCategoria.get(clave) ?? { tipo: g.tipo, categoria: g.categoria, total: 0 };
    t.total += g.monto;
    porCategoria.set(clave, t);
  }
  const lista = [...porCategoria.values()].sort((a, b) => b.total - a.total);
  const deTipo = (t: string) => lista.filter((x) => x.tipo === t).reduce((s, x) => s + x.total, 0);
  const items = (anulados ? filtrados : activos).sort(
    (a, b) => b.fecha.localeCompare(a.fecha) || b.numero - a.numero,
  );
  return {
    ...paginar(c, items.map(gastoDto), 50),
    totales: {
      porCategoria: lista,
      vehiculos: deTipo('VEHICULO'),
      operacionales: deTipo('OPERACIONAL'),
      general: deTipo('VEHICULO') + deTipo('OPERACIONAL'),
    },
  };
}

const rutasGastos: Rutas = {
  'GET /gastos': listarGastos,
  'GET /gastos/:id': (c) => {
    soloAdmin(c);
    return gastoDto(gastoDelAlcance(c, c.params.id!));
  },
  'POST /gastos': (c) => {
    soloAdmin(c);
    const b = cuerpo(c);
    const sucursalId = c.esGeneral
      ? b.sucursalId
        ? String(b.sucursalId)
        : null
      : c.usuario.sucursalId;
    const g: FilaGasto = {
      id: nuevoId('gas'),
      numero: siguienteNumeroGasto(c.automotoraId),
      automotoraId: c.automotoraId,
      tipo: 'OPERACIONAL',
      vehiculoId: null,
      sucursalId,
      categoria: String(b.categoria),
      monto: Number(b.monto),
      fecha: String(b.fecha),
      comentario: b.comentario ? String(b.comentario) : null,
      adjuntoUrl: b.adjunto instanceof File ? '/gastos/boleta-demo.pdf' : null,
      estado: 'ACTIVO',
      registradoPorId: c.usuario.id,
      fechaCreacion: ahora(),
    };
    datos().gastos.push(g);
    auditar(c, 'GASTO_CREADO', { tipo: 'GASTO', id: g.id }, sucursalId, {
      categoria: g.categoria,
      monto: g.monto,
    });
    return gastoDto(g);
  },
  'PATCH /gastos/:id': (c) => {
    soloAdmin(c);
    const g = gastoDelAlcance(c, c.params.id!);
    if (g.estado === 'ANULADO') throw fallo(409, 'Un gasto anulado no se edita');
    const b = cuerpo(c) as Partial<FilaGasto>;
    const anterior = { categoria: g.categoria, monto: g.monto, fecha: g.fecha };
    if (b.categoria) g.categoria = b.categoria;
    if (b.monto !== undefined) g.monto = Number(b.monto);
    if (b.fecha) g.fecha = b.fecha;
    if (b.comentario !== undefined) g.comentario = b.comentario || null;
    auditar(
      c,
      'GASTO_EDITADO',
      { tipo: 'GASTO', id: g.id },
      g.sucursalId,
      { categoria: g.categoria, monto: g.monto, fecha: g.fecha },
      anterior,
    );
    return gastoDto(g);
  },
  'POST /gastos/:id/anular': (c) => {
    soloAdmin(c);
    const g = gastoDelAlcance(c, c.params.id!);
    g.estado = 'ANULADO';
    auditar(c, 'GASTO_ANULADO', { tipo: 'GASTO', id: g.id }, g.sucursalId, {
      motivo: cuerpo(c).motivo ?? null,
    });
  },
};

// ---------------------------------------------------------------- Notificaciones y auditoría

const rutasAvisos: Rutas = {
  'GET /notificaciones': (c) => {
    const alcance = sucursalesVisibles(c);
    const estado = texto(c, 'estado');
    const items = datos()
      .notificaciones.filter(
        (n) =>
          n.automotoraId === c.automotoraId &&
          (c.esGeneral || visible(alcance, n.sucursalId)) &&
          (!estado || n.estado === estado),
      )
      .sort((a, b) => b.fechaGeneracion.localeCompare(a.fechaGeneracion))
      .map(({ automotoraId: _a, sucursalId, ...n }) => ({
        ...n,
        sucursal: sucursalDe(sucursalId),
      }));
    return paginar(c, items, 100);
  },
  'POST /notificaciones/:id/resolver': (c) => {
    const n = datos().notificaciones.find(
      (x) => x.id === c.params.id && x.automotoraId === c.automotoraId,
    );
    if (!n) throw noEncontrado('Notificación');
    n.estado = 'RESUELTA';
    n.fechaResolucion = ahora();
  },
  'GET /auditoria': (c) => {
    soloAdmin(c);
    const db = datos();
    const alcance = sucursalesVisibles(c);
    const entidadTipo = texto(c, 'entidadTipo');
    const desde = texto(c, 'desde');
    const hasta = texto(c, 'hasta');
    const items = db.auditoria
      .filter(
        (r) =>
          r.automotoraId === c.automotoraId &&
          (alcance === null || visible(alcance, r.sucursalId)) &&
          (!entidadTipo || r.entidad.tipo === entidadTipo) &&
          (!desde || r.fecha.slice(0, 10) >= desde) &&
          (!hasta || r.fecha.slice(0, 10) <= hasta),
      )
      .map((r) => {
        const u = db.usuarios.find((x) => x.id === r.usuarioId);
        return {
          id: r.id,
          fecha: r.fecha,
          usuario: { id: r.usuarioId, nombre: u?.nombre ?? '—', email: u?.email ?? '' },
          sucursal: r.sucursalId ? sucursalDe(r.sucursalId) : null,
          accion: r.accion,
          entidad: r.entidad,
          valorAnterior: r.valorAnterior,
          valorNuevo: r.valorNuevo,
        };
      });
    return paginar(c, items, 50);
  },
};

export const rutasAdmin: Rutas = {
  ...rutasSesion,
  ...rutasSucursales,
  ...rutasUsuarios,
  ...rutasGastos,
  ...rutasAvisos,
};
