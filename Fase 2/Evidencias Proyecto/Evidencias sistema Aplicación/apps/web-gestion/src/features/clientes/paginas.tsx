import { formatearRut } from '@vitriauto/shared-types';
import {
  Bell,
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  FileText,
  Handshake,
  Mail,
  MapPin,
  Phone,
  Plus,
  Receipt,
  Scale,
  type LucideIcon,
} from 'lucide-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSesion } from '../../auth/sesion';
import { api, qs } from '../../lib/api';
import { fecha, fechaHora, pesos } from '../../lib/formato';
import type { Pagina } from '../../lib/tipos';
import {
  Avatar,
  Boton,
  Buscador,
  Cargando,
  Chip,
  cx,
  DatoIcono,
  EncabezadoPagina,
  Filtros,
  Insignia,
  MensajeError,
  Modal,
  Paginacion,
  Segmentado,
  Tabla,
  Tarjeta,
  Td,
  Th,
  Vacio,
  ItemMovil,
  ListaMovil,
} from '../../ui/componentes';
import { Confirmar } from '../../ui/confirmar';
import { useAviso } from '../../ui/toast';
import { FormularioCliente } from './formulario-cliente';
import type { Cliente } from './tipos';

const LIMITE = 25;

// CRM de la automotora completa (Módulo 6): todas las sucursales ven a todos los clientes.
export function ClientesPage() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [q, setQ] = useState('');
  const [inactivos, setInactivos] = useState(false);
  const [offset, setOffset] = useState(0);
  const [creando, setCreando] = useState(false);

  const consulta = useQuery({
    queryKey: ['clientes', { q, inactivos, offset }],
    queryFn: () =>
      api<Pagina<Cliente>>(
        'GET',
        `/clientes${qs({ q, incluirInactivos: inactivos || undefined, limit: LIMITE, offset })}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Clientes"
        descripcion="Ficha única por cliente, compartida por todas las sucursales."
        acciones={
          <Boton
            ayuda="Registra un cliente nuevo; su ficha la comparten todas las sucursales"
            onClick={() => setCreando(true)}
          >
            <Plus aria-hidden />
            Nuevo cliente
          </Boton>
        }
      />
      <Filtros>
        <Buscador
          className="sm:w-80"
          placeholder="Buscar por nombre o RUT"
          valor={q}
          onCambiar={(t) => {
            setQ(t);
            setOffset(0);
          }}
        />
        <Segmentado
          className="max-sm:col-span-2 max-sm:justify-self-start"
          etiqueta="Clientes a mostrar"
          opciones={[
            { id: 'activos', texto: 'Activos' },
            { id: 'todos', texto: 'Incluir inactivos' },
          ]}
          actual={inactivos ? 'todos' : 'activos'}
          onCambiar={(id) => {
            setInactivos(id === 'todos');
            setOffset(0);
          }}
        />
      </Filtros>
      {consulta.isLoading && <Cargando />}
      {consulta.error && <MensajeError error={consulta.error} />}
      {consulta.data?.items.length === 0 && <Vacio titulo="No hay clientes con esa búsqueda" />}
      {!!consulta.data?.items.length && (
        <>
          <Tabla
            movil={
              <ListaMovil>
                {consulta.data.items.map((c) => (
                  <ItemMovil
                    key={c.id}
                    a={`/clientes/${c.id}`}
                    avatar={<Avatar nombre={c.nombre} />}
                    titulo={c.nombre}
                    subtitulo={`${formatearRut(c.rut)} · ${c.telefono}`}
                    insignia={<Insignia valor={c.estado} />}
                    pie={c.email}
                    tenue={c.estado === 'INACTIVO'}
                  />
                ))}
              </ListaMovil>
            }
          >
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>RUT</Th>
                <Th>Teléfono</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {consulta.data.items.map((c) => (
                <tr
                  key={c.id}
                  className={cx(
                    'cursor-pointer transition-colors duration-100 hover:bg-slate-50',
                    c.estado === 'INACTIVO' && '[&>td]:opacity-60',
                  )}
                  onClick={() => navegar(`/clientes/${c.id}`)}
                >
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar nombre={c.nombre} />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{c.nombre}</p>
                        <p className="text-xs text-slate-500">{c.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="tabular-nums">{formatearRut(c.rut)}</Td>
                  <Td className="tabular-nums">{c.telefono}</Td>
                  <Td>
                    <Insignia valor={c.estado} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <Paginacion
            total={consulta.data.total}
            limite={LIMITE}
            offset={offset}
            onCambiar={setOffset}
          />
        </>
      )}
      {creando && (
        <Modal titulo="Nuevo cliente" onCerrar={() => setCreando(false)}>
          <FormularioCliente
            textoBoton="Crear cliente"
            onCancelar={() => setCreando(false)}
            onGuardar={async (datos) => {
              try {
                const c = await api<Cliente>('POST', '/clientes', { body: datos });
                qc.invalidateQueries({ queryKey: ['clientes'] });
                avisar('Cliente creado');
                navegar(`/clientes/${c.id}`);
              } catch (e) {
                avisar((e as Error).message, 'error');
              }
            }}
          />
        </Modal>
      )}
    </>
  );
}

interface FilaHistorial {
  tipo: 'COTIZACION' | 'RESERVA' | 'TASACION' | 'VENTA' | 'CONSIGNACION';
  id: string;
  folio: number;
  sucursal: { id: string; nombre: string };
  fecha: string;
  estado: string;
  vehiculo: { id: string | null; descripcion: string };
  monto: number;
}

const DOCUMENTO: Record<
  FilaHistorial['tipo'],
  { texto: string; ruta: string; monto: string; icono: LucideIcon }
> = {
  COTIZACION: {
    texto: 'Cotización',
    ruta: '/cotizaciones',
    monto: 'Precio cotizado',
    icono: FileText,
  },
  RESERVA: { texto: 'Reserva', ruta: '/reservas', monto: 'Seña', icono: CalendarCheck },
  TASACION: { texto: 'Tasación', ruta: '/tasaciones', monto: 'Oferta', icono: Scale },
  VENTA: { texto: 'Venta', ruta: '/ventas', monto: 'Precio final', icono: Receipt },
  CONSIGNACION: {
    texto: 'Consignación',
    ruta: '/consignaciones',
    monto: 'Precio mínimo',
    icono: Handshake,
  },
};

export function ClientePage() {
  const { id = '' } = useParams();
  const { esAdmin } = useSesion();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [editando, setEditando] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  const cliente = useQuery({
    queryKey: ['cliente', id],
    queryFn: () => api<Cliente>('GET', `/clientes/${id}`),
  });
  const historial = useQuery({
    queryKey: ['cliente', id, 'historial'],
    queryFn: () => api<FilaHistorial[]>('GET', `/clientes/${id}/historial`),
  });

  const estado = useMutation({
    mutationFn: (accion: 'activar' | 'desactivar') => api('POST', `/clientes/${id}/${accion}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cliente', id] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
      setCambiandoEstado(false);
      avisar('Estado del cliente actualizado');
    },
    onError: (e) => avisar(e.message, 'error'),
  });

  // Seguimientos y avisos de cotización/tasación (Módulo 18). El cliente se da
  // de baja desde el correo; aquí se reactiva si lo pide.
  const recordatorios = useMutation({
    mutationFn: (acepta: boolean) =>
      api<Cliente>('PATCH', `/clientes/${id}`, { body: { aceptaRecordatorios: acepta } }),
    onSuccess: (actualizado) => {
      qc.setQueryData(['cliente', id], actualizado);
      avisar(
        actualizado.aceptaRecordatorios
          ? 'Volverá a recibir recordatorios por correo'
          : 'No recibirá más recordatorios por correo',
      );
    },
    onError: (e) => avisar(e.message, 'error'),
  });

  if (cliente.isLoading) return <Cargando />;
  if (!cliente.data) return <MensajeError error={cliente.error} />;
  const c = cliente.data;
  const activo = c.estado === 'ACTIVO';

  return (
    <>
      <EncabezadoPagina
        volver={{ a: '/clientes', texto: 'Clientes' }}
        titulo={c.nombre}
        descripcion={
          <span className="flex flex-wrap items-center gap-2.5">
            <Insignia valor={c.estado} />
            <Chip className="bg-superficie tabular-nums">{formatearRut(c.rut)}</Chip>
          </span>
        }
        acciones={
          <>
            <Boton
              ayuda="Corrige los datos del cliente; el cambio queda en la auditoría"
              variante="secundario"
              onClick={() => setEditando(true)}
            >
              Editar
            </Boton>
            {esAdmin && (
              <Boton
                ayuda={
                  activo
                    ? 'Lo oculta de las búsquedas en todas las sucursales; su historial se conserva'
                    : 'Vuelve a dejarlo disponible en todas las sucursales'
                }
                variante={activo ? 'peligro' : 'secundario'}
                onClick={() => setCambiandoEstado(true)}
              >
                {activo ? 'Desactivar' : 'Reactivar'}
              </Boton>
            )}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="space-y-6 self-start">
          <Tarjeta>
            <div className="flex items-center gap-4">
              <Avatar nombre={c.nombre} grande />
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{c.nombre}</p>
                <p className="text-xs text-slate-500">Cliente desde {fecha(c.fechaCreacion)}</p>
              </div>
            </div>
            {/* Contactar en un toque, como las acciones de una ficha de contacto */}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <a
                href={`tel:${c.telefono.replace(/\s+/g, '')}`}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-slate-900 text-sm font-medium text-invertido transition-colors hover:bg-slate-800"
              >
                <Phone className="size-4" aria-hidden />
                Llamar
              </a>
              <a
                href={`mailto:${c.email}`}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-full text-sm font-medium text-slate-800 ring-1 ring-inset ring-slate-300 transition-shadow hover:ring-slate-900"
              >
                <Mail className="size-4" aria-hidden />
                Escribir
              </a>
            </div>
            <dl className="mt-6 space-y-4 border-t border-slate-100 pt-5">
              <DatoIcono icono={Phone} etiqueta="Teléfono">
                <span className="tabular-nums">{c.telefono}</span>
              </DatoIcono>
              <DatoIcono icono={Mail} etiqueta="Email">
                <span title={c.email}>{c.email}</span>
              </DatoIcono>
              <DatoIcono icono={MapPin} etiqueta="Dirección">
                <span title={c.direccion}>{c.direccion}</span>
              </DatoIcono>
              <DatoIcono icono={CalendarDays} etiqueta="Registrado">
                {fechaHora(c.fechaCreacion)}
              </DatoIcono>
              <DatoIcono icono={Bell} etiqueta="Recordatorios por correo">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {c.aceptaRecordatorios ? 'Los recibe' : 'Pidió no recibirlos'}
                  <button
                    type="button"
                    disabled={recordatorios.isPending}
                    onClick={() => recordatorios.mutate(!c.aceptaRecordatorios)}
                    className="text-[0.8125rem] font-normal text-slate-500 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:text-slate-900 hover:decoration-slate-900 disabled:opacity-55"
                  >
                    {c.aceptaRecordatorios ? 'Desactivar' : 'Volver a activar'}
                  </button>
                </span>
              </DatoIcono>
            </dl>
          </Tarjeta>
        </div>
        <div className="min-w-0 space-y-6">
          {historial.data && <ResumenCliente historial={historial.data} />}
          <Tarjeta
            titulo="Historial"
            descripcion="Documentos del cliente en todas las sucursales."
            sinRelleno
          >
            {historial.isLoading && (
              <div className="p-5">
                <Cargando />
              </div>
            )}
            {historial.data?.length === 0 && (
              <p className="px-5 pb-5 pt-3 text-sm text-slate-500">Sin movimientos todavía.</p>
            )}
            {!!historial.data?.length && (
              <ul className="space-y-0.5 px-2 pb-2 pt-2">
                {historial.data.map((h) => {
                  const doc = DOCUMENTO[h.tipo];
                  return (
                    <li key={`${h.tipo}-${h.id}`}>
                      <Link
                        to={`${doc.ruta}/${h.id}`}
                        className="group flex items-center gap-3 rounded-2xl p-3 transition-colors duration-150 hover:bg-slate-50 sm:gap-4"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                          <doc.icono className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <span className="font-medium text-slate-900">
                              {doc.texto} N° {h.folio}
                            </span>
                            <Insignia valor={h.estado} />
                          </span>
                          <span className="mt-0.5 block truncate text-sm text-slate-600">
                            {h.vehiculo.descripcion}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {h.sucursal.nombre} · {fecha(h.fecha)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-medium tabular-nums text-slate-900">
                            {pesos(h.monto)}
                          </span>
                          <span className="text-xs text-slate-500">{doc.monto}</span>
                        </span>
                        <ChevronRight
                          className="size-4 shrink-0 text-slate-400 transition-transform duration-150 group-hover:translate-x-0.5 max-sm:hidden"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>
      {editando && (
        <Modal titulo="Editar cliente" onCerrar={() => setEditando(false)}>
          <FormularioCliente
            inicial={c}
            textoBoton="Guardar"
            onCancelar={() => setEditando(false)}
            onGuardar={async (datos) => {
              try {
                await api('PATCH', `/clientes/${id}`, { body: datos });
                qc.invalidateQueries({ queryKey: ['cliente', id] });
                qc.invalidateQueries({ queryKey: ['clientes'] });
                avisar('Cliente actualizado');
                setEditando(false);
              } catch (e) {
                avisar((e as Error).message, 'error');
              }
            }}
          />
        </Modal>
      )}
      {cambiandoEstado && (
        <Confirmar
          titulo={activo ? 'Desactivar cliente' : 'Reactivar cliente'}
          mensaje={
            activo
              ? 'El cliente dejará de aparecer en las búsquedas de todas las sucursales. Su historial se conserva y queda registrado en la auditoría.'
              : 'El cliente volverá a estar disponible en todas las sucursales.'
          }
          textoConfirmar={activo ? 'Desactivar' : 'Reactivar'}
          peligro={activo}
          cargando={estado.isPending}
          onConfirmar={() => estado.mutate(activo ? 'desactivar' : 'activar')}
          onCerrar={() => setCambiandoEstado(false)}
        />
      )}
    </>
  );
}

// Lo que el cliente ha hecho con la automotora, de un vistazo.
function ResumenCliente({ historial }: { historial: FilaHistorial[] }) {
  const ventas = historial.filter((h) => h.tipo === 'VENTA' && h.estado === 'CONFIRMADA');
  const comprado = ventas.reduce((s, h) => s + h.monto, 0);
  const abiertos = historial.filter((h) => ['VIGENTE', 'ACTIVA'].includes(h.estado)).length;
  const datos: [string, string][] = [
    ['Comprado', pesos(comprado)],
    ['Compras', String(ventas.length)],
    ['Documentos abiertos', String(abiertos)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 max-sm:[&>div:first-child]:col-span-2">
      {datos.map(([titulo, valor]) => (
        <div
          key={titulo}
          className="min-w-0 rounded-2xl bg-superficie p-4 sm:p-5 dark:ring-1 dark:ring-inset dark:ring-slate-200"
        >
          <dt className="truncate text-xs text-slate-500 sm:text-sm">{titulo}</dt>
          <dd className="mt-2 truncate text-[1.625rem] font-light leading-none tracking-[-0.04em] tabular-nums text-slate-950 sm:text-[2rem]">
            {valor}
          </dd>
        </div>
      ))}
    </dl>
  );
}
