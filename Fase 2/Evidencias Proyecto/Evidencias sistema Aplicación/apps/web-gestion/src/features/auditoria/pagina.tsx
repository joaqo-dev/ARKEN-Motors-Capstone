import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  BadgeDollarSign,
  Bell,
  Building,
  CalendarClock,
  Car,
  ClipboardCheck,
  FileText,
  Handshake,
  History,
  KeyRound,
  LogIn,
  LogOut,
  MailCheck,
  Receipt,
  Settings,
  ShieldAlert,
  UserCheck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../../auth/sesion';
import { useSucursalActiva } from '../../auth/sucursal-activa';
import { api, qs } from '../../lib/api';
import { etiqueta, fecha, fechaHora, pesos } from '../../lib/formato';
import {
  Cargando,
  cx,
  EncabezadoPagina,
  Filtros,
  MensajeError,
  Paginacion,
  Pestanas,
  RangoFechas,
  Select,
  Vacio,
} from '../../ui/componentes';

interface Registro {
  id: string;
  fecha: string;
  usuario: { id: string; nombre: string; email: string };
  sucursal: { id: string; nombre: string } | null;
  accion: string;
  entidad: { tipo: string; id: string };
  valorAnterior: Record<string, unknown> | null;
  valorNuevo: Record<string, unknown> | null;
}

const ENTIDADES: Record<string, string> = {
  VEHICULO: 'Vehículos',
  VENTA: 'Ventas',
  RESERVA: 'Reservas',
  COTIZACION: 'Cotizaciones',
  TASACION: 'Tasaciones',
  CONSIGNACION: 'Consignaciones',
  GASTO: 'Gastos',
  CLIENTE: 'Clientes',
  USUARIO: 'Usuarios',
  SUCURSAL: 'Sucursales',
  NOTIFICACION: 'Notificaciones',
  AUTOMOTORA: 'Configuración de la automotora',
};
const LIMITE = 50;

const RUTAS: Record<string, [ruta: string, texto: string]> = {
  VEHICULO: ['vehiculos', 'Vehículo'],
  VENTA: ['ventas', 'Venta'],
  RESERVA: ['reservas', 'Reserva'],
  COTIZACION: ['cotizaciones', 'Cotización'],
  TASACION: ['tasaciones', 'Tasación'],
  CONSIGNACION: ['consignaciones', 'Consignación'],
  CLIENTE: ['clientes', 'Cliente'],
  GASTO: ['gastos', 'Gasto'],
};

// Mismos íconos que el menú lateral.
const ICONOS: Record<string, LucideIcon> = {
  VEHICULO: Car,
  VENTA: BadgeDollarSign,
  RESERVA: CalendarClock,
  COTIZACION: FileText,
  TASACION: ClipboardCheck,
  CONSIGNACION: Handshake,
  GASTO: Receipt,
  CLIENTE: Users,
  USUARIO: UserCog,
  SUCURSAL: Building,
  NOTIFICACION: Bell,
  AUTOMOTORA: Settings,
};

// La acción como frase: "Carolina Rojas <emitió una cotización>".
const ACCIONES: Record<string, string> = {
  COTIZACION_EMITIDA: 'emitió una cotización',
  COTIZACION_ANULADA: 'anuló una cotización',
  COTIZACION_ACEPTADA: 'marcó una cotización como aceptada',
  COTIZACION_RECHAZADA: 'marcó una cotización como rechazada',
  RESERVA_EMITIDA: 'emitió una reserva',
  RESERVA_EXTENDIDA: 'extendió una reserva',
  RESERVA_CANCELADA: 'canceló una reserva',
  TASACION_EMITIDA: 'emitió una tasación',
  TASACION_ANULADA: 'anuló una tasación',
  TASACION_ACEPTADA: 'marcó una tasación como aceptada',
  TASACION_RECHAZADA: 'marcó una tasación como rechazada',
  VENTA_CONFIRMADA: 'registró una venta',
  VENTA_ANULADA: 'anuló una venta',
  CONSIGNACION_EMITIDA: 'registró una consignación',
  CONSIGNACION_CAMBIO_CONDICIONES: 'cambió las condiciones de una consignación',
  CONSIGNACION_EXTENDIDA: 'extendió una consignación',
  CONSIGNACION_DEVUELTA: 'devolvió un vehículo consignado',
  VEHICULO_CAMBIO_PRECIO: 'cambió el precio de un vehículo',
  VEHICULO_CAMBIO_COSTO: 'cambió el costo de un vehículo',
  VEHICULO_CAMBIO_ESTADO: 'cambió el estado de un vehículo',
  VEHICULO_TRANSFERIDO: 'transfirió un vehículo de sucursal',
  VEHICULO_CREADO: 'ingresó un vehículo al inventario',
  VEHICULO_EDITADO: 'editó los datos de un vehículo',
  VEHICULO_FOTOS_AGREGADAS: 'subió fotos de un vehículo',
  VEHICULO_FOTO_ELIMINADA: 'eliminó una foto de un vehículo',
  VEHICULO_FOTOS_REORDENADAS: 'cambió el orden de las fotos de un vehículo',
  VEHICULO_DOCUMENTO_SUBIDO: 'subió un documento legal de un vehículo',
  INSPECCION_INICIADA: 'inició una inspección pre-compra',
  INSPECCION_DESCARTADA: 'descartó una inspección pre-compra en borrador',
  INSPECCION_FINALIZADA: 'finalizó una inspección pre-compra',
  DOCUMENTO_REENVIADO: 'reenvió un documento por correo al cliente',
  NOTIFICACION_RESUELTA: 'marcó una notificación como resuelta',
  GASTO_CREADO: 'registró un gasto',
  GASTO_EDITADO: 'editó un gasto',
  GASTO_ANULADO: 'anuló un gasto',
  GASTO_ADJUNTO_REEMPLAZADO: 'cambió la boleta de un gasto',
  CLIENTE_CREADO: 'registró un cliente',
  CLIENTE_EDITADO: 'editó los datos de un cliente',
  CLIENTE_ACTIVADO: 'reactivó un cliente',
  CLIENTE_DESACTIVADO: 'desactivó un cliente',
  USUARIO_INVITADO: 'invitó a un usuario',
  USUARIO_INVITACION_REENVIADA: 'reenvió la invitación a un usuario',
  USUARIO_EDITADO: 'editó un usuario',
  USUARIO_ACTIVADO: 'reactivó un usuario',
  USUARIO_DESACTIVADO: 'desactivó un usuario',
  SUCURSAL_CREADA: 'creó una sucursal',
  SUCURSAL_EDITADA: 'editó una sucursal',
  SUCURSAL_DADA_DE_BAJA: 'dio de baja una sucursal',
  CONFIGURACION_EDITADA: 'editó la configuración',
  LOGO_ACTUALIZADO: 'cambió el logo',
  LOGO_ELIMINADO: 'quitó el logo',
  BANNER_ACTUALIZADO: 'cambió el banner',
  BANNER_ELIMINADO: 'quitó el banner',
};

// Acciones que deshacen o quitan algo: su ícono se marca en rojo.
const NEGATIVA = /ANULAD|CANCELAD|DESACTIVAD|DADA_DE_BAJA|ELIMINAD|DEVUELTA|RECHAZAD|DESCARTAD/;

// Nombres de campo con tildes y en lenguaje de negocio; el resto se deriva del camelCase.
const CAMPOS: Record<string, string> = {
  folio: 'Folio',
  numero: 'N°',
  resultado: 'Resultado',
  fechaVencimiento: 'Vence',
  nuevaFechaVencimiento: 'Vence',
  respaldo: 'Respaldo',
  fechaPrimeraInscripcion: 'Primera inscripción',
  precioCotizado: 'Precio cotizado',
  precioVenta: 'Precio de venta',
  precioVentaFinal: 'Precio final',
  montoReserva: 'Monto de la reserva',
  ofertaMonto: 'Oferta',
  descripcion: 'Descripción',
  anio: 'Año',
  version: 'Versión',
  transmision: 'Transmisión',
  traccion: 'Tracción',
  costoAdquisicion: 'Costo de adquisición',
  aceptaRecordatorios: 'Recibe recordatorios',
  rut: 'RUT',
  fotos: 'Fotos',
  agregadas: 'Fotos agregadas',
  orden: 'Posición',
  portada: 'Cambió la portada',
  conAdjunto: 'Boleta adjunta',
  destinatario: 'Enviado a',
  evaluados: 'Puntos evaluados',
  puntos: 'Puntos de la lista',
  mensaje: 'Aviso',
  direccion: 'Dirección',
  telefono: 'Teléfono',
  categoria: 'Categoría',
  sucursalId: 'Sucursal',
  sucursalOrigenId: 'Desde',
  sucursalDestinoId: 'Hacia',
  porcentajeComision: 'Comisión (%)',
  diasValidezCotizacion: 'Vigencia de cotizaciones (días)',
  diasValidezReserva: 'Vigencia de reservas (días)',
  diasValidezTasacion: 'Vigencia de tasaciones (días)',
  correoCotizacion: 'PDF por correo: cotización',
  correoReserva: 'PDF por correo: reserva',
  correoTasacion: 'PDF por correo: tasación',
  correoVenta: 'PDF por correo: venta',
  correoConsignacion: 'PDF por correo: consignación',
  diasSeguimientoCotizacion: 'Seguimiento de cotización (días)',
  diasAvisoCotizacion: 'Aviso de cotización (días antes)',
  diasAvisoReserva: 'Aviso de reserva (días antes)',
  diasAvisoTasacion: 'Aviso de tasación (días antes)',
  financiamientoActivo: 'Simulador de crédito',
  financiamientoTasaMensual: 'Tasa mensual del simulador (%)',
  financiamientoPieMinimo: 'Pie mínimo del simulador (%)',
  financiamientoPlazoMaximo: 'Plazo máximo del simulador (meses)',
};

// camelCase → "Camel case"
const legible = (clave: string) => {
  if (CAMPOS[clave]) return CAMPOS[clave];
  const t = clave
    .replace(/Id$/, '')
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function valor(clave: string, v: unknown, nombreSucursal: (id: string) => string): string {
  if (v === null || v === undefined || v === '') {
    return /^dias(Seguimiento|Aviso)/.test(clave) ? 'No se envía' : 'vacío';
  }
  // Fotos: se cuentan, no se muestran (pueden haberse borrado después).
  if (clave === 'agregadas' && Array.isArray(v))
    return `${v.length} ${v.length === 1 ? 'foto' : 'fotos'}`;
  if (clave === 'orden' && typeof v === 'number') return `N° ${v}`;
  if (Array.isArray(v)) return v.map((x) => valor(clave, x, nombreSucursal)).join(' + ');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('tipo' in o && 'monto' in o) return `${etiqueta(String(o.tipo))} ${pesos(Number(o.monto))}`;
    return Object.entries(o)
      .map(([k, x]) => `${legible(k)}: ${valor(k, x, nombreSucursal)}`)
      .join(', ');
  }
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'number' && /monto|precio|costo|valor(?!Comision)|seña|sena/i.test(clave))
    return pesos(v);
  if (clave === 'sucursalId' || clave === 'sucursalDestinoId' || clave === 'sucursalOrigenId')
    return nombreSucursal(String(v));
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fecha(v);
  if (typeof v === 'string') return etiqueta(v);
  return String(v);
}

// Solo lo que cambió. Al crear algo (sin "antes") o quitarlo (sin "después")
// se muestran sus datos tal cual.
function cambios(r: Registro) {
  // Reordenar fotos: se describe el cambio en vez de listar direcciones.
  if (r.accion === 'VEHICULO_FOTOS_REORDENADAS') {
    const antes = (r.valorAnterior?.orden as unknown[] | undefined) ?? [];
    const despues = (r.valorNuevo?.orden as unknown[] | undefined) ?? [];
    return {
      tipo: 'datos' as const,
      claves: ['fotos', 'portada'],
      datos: { fotos: despues.length, portada: antes[0] !== despues[0] },
    };
  }
  const antes = r.valorAnterior ?? {};
  const despues = r.valorNuevo ?? {};
  // El folio/número ya va en el enlace; la dirección de una foto no se muestra.
  const claves = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter(
    (k) => k !== 'folio' && k !== 'numero' && k !== 'url',
  );
  if (!r.valorAnterior || !r.valorNuevo) {
    return { tipo: 'datos' as const, claves, datos: r.valorNuevo ?? r.valorAnterior ?? {} };
  }
  return {
    tipo: 'diferencias' as const,
    claves: claves.filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k])),
    antes,
    despues,
  };
}

const VISIBLES = 4;

function Cambios({ registro }: { registro: Registro }) {
  const { nombre } = useSucursalActiva();
  const [todos, setTodos] = useState(false);
  const c = cambios(registro);
  if (c.claves.length === 0) {
    return c.tipo === 'diferencias' ? (
      <p className="mt-1.5 text-xs text-slate-500">Se guardó sin cambios en los datos.</p>
    ) : null;
  }
  // Se recorta solo si quedan al menos 2 ocultos ("Ver 1 más" no ahorra nada).
  const recortar = c.claves.length > VISIBLES + 1;
  const claves = todos || !recortar ? c.claves : c.claves.slice(0, VISIBLES);
  const ocultos = c.claves.length - claves.length;
  return (
    <div className="mt-2">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        {claves.map((k) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{legible(k)}</dt>
            <dd className="mb-1 break-words text-slate-800 sm:mb-0">
              {c.tipo === 'datos' ? (
                valor(k, c.datos[k], nombre)
              ) : !(k in c.antes) ? (
                // Dato que no existía antes (ej. las fotos agregadas): solo el nuevo.
                <span className="font-medium">{valor(k, c.despues[k], nombre)}</span>
              ) : (
                <>
                  <span className="text-slate-500 line-through decoration-slate-300">
                    {valor(k, c.antes[k], nombre)}
                  </span>
                  <span className="mx-1.5 text-slate-500" aria-label="cambió a">
                    →
                  </span>
                  <span className="font-medium">{valor(k, c.despues[k], nombre)}</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {recortar && (
        <button
          type="button"
          onClick={() => setTodos(!todos)}
          className="mt-1.5 text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:text-slate-900 hover:decoration-slate-900"
        >
          {todos ? 'Ver menos' : `Ver ${ocultos} ${c.tipo === 'datos' ? 'datos' : 'cambios'} más`}
        </button>
      )}
    </div>
  );
}

const ZONA = 'America/Santiago';
const dia = (v: string | Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date(v));
const hora = (v: string) =>
  new Intl.DateTimeFormat('es-CL', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(v));

// "Hoy", "Ayer" o "lunes 29 de septiembre" (con año si no es el actual).
function tituloDia(clave: string): string {
  const hoy = dia(new Date());
  const ayer = dia(new Date(Date.now() - 86_400_000));
  if (clave === hoy) return 'Hoy';
  if (clave === ayer) return 'Ayer';
  const partes = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: clave.slice(0, 4) === hoy.slice(0, 4) ? undefined : 'numeric',
  }).formatToParts(new Date(`${clave}T12:00:00Z`));
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '';
  const texto = `${p('weekday')} ${p('day')} de ${p('month')}${p('year') ? ` de ${p('year')}` : ''}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function Evento({ r }: { r: Registro }) {
  const Icono = ICONOS[r.entidad.tipo] ?? History;
  const ruta = RUTAS[r.entidad.tipo];
  // Folio de los documentos, o número correlativo del gasto.
  const folio =
    r.valorNuevo?.folio ??
    r.valorAnterior?.folio ??
    r.valorNuevo?.numero ??
    r.valorAnterior?.numero;
  return (
    <li className="flex gap-3 rounded-2xl px-4 py-3.5 transition-colors duration-150 hover:bg-slate-50 sm:px-5">
      <span
        className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${
          NEGATIVA.test(r.accion) ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'
        }`}
        aria-hidden
      >
        <Icono className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">{r.usuario.nombre}</span>{' '}
            {ACCIONES[r.accion] ??
              legible(
                r.accion.toLowerCase().replace(/_(\w)/g, (_m, c: string) => c.toUpperCase()),
              ).toLowerCase()}
          </p>
          <time
            dateTime={r.fecha}
            title={fechaHora(r.fecha)}
            className="shrink-0 text-xs tabular-nums text-slate-500"
          >
            {hora(r.fecha)}
          </time>
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
          <span>{r.sucursal?.nombre ?? 'Toda la automotora'}</span>
          {ruta && (
            <>
              <span aria-hidden>·</span>
              <Link
                to={`/${ruta[0]}/${r.entidad.id}`}
                className="text-slate-700 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:text-slate-900 hover:decoration-slate-900"
              >
                {ruta[1]}
                {folio ? ` N° ${String(folio)}` : ''}
              </Link>
            </>
          )}
        </p>
        <Cambios registro={r} />
      </div>
    </li>
  );
}

// Auditoría (Módulo 16): inmutable. El Admin General ve todo; el Admin de
// Sucursal solo las acciones de su sucursal. Se muestra como registro de
// actividad por día: cada acción en una frase y solo los datos que cambiaron.
export function AuditoriaPage() {
  const { esGeneral } = useSesion();
  const [pestana, setPestana] = useState<'actividad' | 'accesos'>('actividad');
  return (
    <>
      <EncabezadoPagina
        titulo="Auditoría"
        descripcion="Registro inmutable de todo lo que se hace en el sistema y de quién lo hizo."
      />
      {/* Los accesos (inicios de sesión, contraseñas) solo los ve el Admin General. */}
      {esGeneral && (
        <Pestanas
          pestanas={[
            { id: 'actividad', texto: 'Actividad' },
            { id: 'accesos', texto: 'Accesos' },
          ]}
          actual={pestana}
          onCambiar={setPestana}
        />
      )}
      {esGeneral && pestana === 'accesos' ? <Accesos /> : <Actividad />}
    </>
  );
}

function Actividad() {
  const { esGeneral } = useSesion();
  const { sucursalId } = useSucursalActiva();
  const [entidadTipo, setEntidadTipo] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [offset, setOffset] = useState(0);
  const consulta = useQuery({
    queryKey: ['auditoria', { entidadTipo, desde, hasta, sucursalId, offset }],
    queryFn: () =>
      api<{ items: Registro[]; total: number }>(
        'GET',
        `/auditoria${qs({ entidadTipo, desde, hasta, sucursalId: esGeneral ? sucursalId : undefined, limit: LIMITE, offset })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const dias: { clave: string; registros: Registro[] }[] = [];
  for (const r of consulta.data?.items ?? []) {
    const clave = dia(r.fecha);
    const ultimo = dias.at(-1);
    if (ultimo?.clave === clave) ultimo.registros.push(r);
    else dias.push({ clave, registros: [r] });
  }

  return (
    <>
      <Filtros>
        <Select
          className="sm:w-60"
          value={entidadTipo}
          onChange={(e) => {
            setEntidadTipo(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">Todas las entidades</option>
          {Object.entries(ENTIDADES).map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </Select>
        <RangoFechas
          desde={desde}
          hasta={hasta}
          onDesde={(v) => {
            setDesde(v);
            setOffset(0);
          }}
          onHasta={(v) => {
            setHasta(v);
            setOffset(0);
          }}
        />
      </Filtros>
      {consulta.isLoading && <Cargando />}
      {consulta.error && <MensajeError error={consulta.error} />}
      {consulta.data?.items.length === 0 && <Vacio titulo="Sin registros con esos filtros" />}
      {dias.length > 0 && (
        <div className="space-y-6">
          {dias.map((d) => (
            <section key={d.clave} aria-labelledby={`dia-${d.clave}`}>
              <h2
                id={`dia-${d.clave}`}
                className="mb-2 px-1 text-[0.9375rem] font-medium text-slate-900"
              >
                {tituloDia(d.clave)}
              </h2>
              <ol className="space-y-0.5 rounded-[22px] bg-superficie p-1.5 dark:ring-1 dark:ring-inset dark:ring-slate-200">
                {d.registros.map((r) => (
                  <Evento key={r.id} r={r} />
                ))}
              </ol>
            </section>
          ))}
          <Paginacion
            total={consulta.data!.total}
            limite={LIMITE}
            offset={offset}
            onCambiar={setOffset}
          />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Accesos

interface Acceso {
  id: string;
  fecha: string;
  usuario: { id: string; nombre: string; email: string };
  evento: string;
  motivo: string | null;
  ip: string | null;
  userAgent: string | null;
}

const EVENTOS: Record<string, { texto: string; icono: LucideIcon; negativo?: boolean }> = {
  LOGIN_EXITOSO: { texto: 'inició sesión', icono: LogIn },
  LOGIN_FALLIDO: { texto: 'intentó iniciar sesión sin éxito', icono: ShieldAlert, negativo: true },
  LOGOUT: { texto: 'cerró sesión', icono: LogOut },
  REGISTRO_AUTOMOTORA: { texto: 'registró la automotora', icono: Building },
  EMAIL_VERIFICADO: { texto: 'verificó su email', icono: MailCheck },
  INVITACION_ACEPTADA: { texto: 'aceptó la invitación y creó su contraseña', icono: UserCheck },
  RESET_SOLICITADO: { texto: 'pidió restablecer su contraseña', icono: KeyRound },
  PASSWORD_RESTABLECIDO: { texto: 'restableció su contraseña', icono: KeyRound },
};

const MOTIVOS: Record<string, string> = {
  PASSWORD_INCORRECTA: 'Contraseña incorrecta',
  CUENTA_INACTIVA: 'Cuenta desactivada',
  EMAIL_SIN_VERIFICAR: 'Email sin verificar',
};

// "Chrome en macOS" a partir del user agent (lo justo para reconocer el equipo).
function dispositivo(ua: string | null): string | null {
  if (!ua) return null;
  const navegador = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : null;
  const sistema = /iPhone|iPad/.test(ua)
    ? 'iPhone'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  if (navegador && sistema) return `${navegador} en ${sistema}`;
  return navegador ?? sistema ?? ua.slice(0, 40);
}

function Accesos() {
  const [evento, setEvento] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [offset, setOffset] = useState(0);
  const consulta = useQuery({
    queryKey: ['auditoria-accesos', { evento, desde, hasta, offset }],
    queryFn: () =>
      api<{ items: Acceso[]; total: number }>(
        'GET',
        `/auditoria/accesos${qs({ evento, desde, hasta, limit: LIMITE, offset })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const dias: { clave: string; registros: Acceso[] }[] = [];
  for (const r of consulta.data?.items ?? []) {
    const clave = dia(r.fecha);
    const ultimo = dias.at(-1);
    if (ultimo?.clave === clave) ultimo.registros.push(r);
    else dias.push({ clave, registros: [r] });
  }

  return (
    <>
      <Filtros>
        <Select
          className="sm:w-60"
          value={evento}
          onChange={(e) => {
            setEvento(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">Todos los eventos</option>
          {Object.entries(EVENTOS).map(([valor, e]) => (
            <option key={valor} value={valor}>
              {e.texto.charAt(0).toUpperCase() + e.texto.slice(1)}
            </option>
          ))}
        </Select>
        <RangoFechas
          desde={desde}
          hasta={hasta}
          onDesde={(v) => {
            setDesde(v);
            setOffset(0);
          }}
          onHasta={(v) => {
            setHasta(v);
            setOffset(0);
          }}
        />
      </Filtros>
      {consulta.isLoading && <Cargando />}
      {consulta.error && <MensajeError error={consulta.error} />}
      {consulta.data?.items.length === 0 && <Vacio titulo="Sin accesos con esos filtros" />}
      {dias.length > 0 && (
        <div className="space-y-6">
          {dias.map((d) => (
            <section key={d.clave} aria-labelledby={`acceso-${d.clave}`}>
              <h2
                id={`acceso-${d.clave}`}
                className="mb-2 px-1 text-[0.9375rem] font-medium text-slate-900"
              >
                {tituloDia(d.clave)}
              </h2>
              <ol className="space-y-0.5 rounded-[22px] bg-superficie p-1.5 dark:ring-1 dark:ring-inset dark:ring-slate-200">
                {d.registros.map((r) => {
                  const e = EVENTOS[r.evento] ?? { texto: r.evento, icono: History };
                  const Icono = e.icono;
                  const equipo = dispositivo(r.userAgent);
                  return (
                    <li
                      key={r.id}
                      className="flex gap-3 rounded-2xl px-4 py-3.5 transition-colors duration-150 hover:bg-slate-50 sm:px-5"
                    >
                      <span
                        className={cx(
                          'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full',
                          e.negativo ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500',
                        )}
                        aria-hidden
                      >
                        <Icono className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-sm text-slate-600">
                            <span className="font-medium text-slate-900">{r.usuario.nombre}</span>{' '}
                            {e.texto}
                          </p>
                          <time
                            dateTime={r.fecha}
                            title={fechaHora(r.fecha)}
                            className="shrink-0 text-xs tabular-nums text-slate-500"
                          >
                            {hora(r.fecha)}
                          </time>
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                          <span>{r.usuario.email}</span>
                          {r.motivo && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="font-medium text-red-600">
                                {MOTIVOS[r.motivo] ?? r.motivo}
                              </span>
                            </>
                          )}
                          {equipo && (
                            <>
                              <span aria-hidden>·</span>
                              <span>{equipo}</span>
                            </>
                          )}
                          {r.ip && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="tabular-nums">IP {r.ip}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          <Paginacion
            total={consulta.data!.total}
            limite={LIMITE}
            offset={offset}
            onCambiar={setOffset}
          />
        </div>
      )}
    </>
  );
}
