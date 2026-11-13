import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Building2, Car, Paperclip, Pencil, Plus, Receipt } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSesion } from '../../auth/sesion';
import { useSucursalActiva } from '../../auth/sucursal-activa';
import { api, qs } from '../../lib/api';
import { urlApi } from '../../lib/config';
import { etiqueta, fecha, hoy, pesos, ACEPTA_DOCUMENTOS } from '../../lib/formato';
import { useFormulario } from '../../lib/formulario';
import { usePeriodo } from '../../lib/persistente';
import {
  Acciones,
  Boton,
  BotonIcono,
  Chip,
  cx,
  filaClicable,
  Campo,
  Cargando,
  Casilla,
  EncabezadoPagina,
  Filtros,
  Indicador,
  Input,
  MensajeError,
  Modal,
  Opciones,
  Paginacion,
  RangoFechas,
  Segmentado,
  Select,
  Tabla,
  Td,
  Textarea,
  Th,
  Vacio,
  Insignia,
  ItemMovil,
  ListaMovil,
} from '../../ui/componentes';
import { InputArchivo } from '../../ui/input-archivo';
import { Confirmar } from '../../ui/confirmar';
import { FormularioGasto } from '../vehiculos/paneles';
import { useAviso } from '../../ui/toast';

export const CATEGORIAS_VEHICULO = ['MECANICA', 'ESTETICA', 'DOCUMENTACION', 'TRAMITES'];
export const CATEGORIAS_OPERACIONAL = [
  'ARRIENDO',
  'SUELDOS_COMISIONES',
  'PUBLICIDAD',
  'SERVICIOS_BASICOS',
  'MANTENCION_LOCAL',
  'CONTABILIDAD_LEGAL',
  'IMPUESTOS_PATENTES',
  'OTROS',
];

export interface GastoListado {
  id: string;
  numero: number; // correlativo por automotora
  tipo: 'VEHICULO' | 'OPERACIONAL';
  vehiculo: { id: string; patente: string; descripcion: string } | null;
  sucursal: { id: string; nombre: string } | null; // null = general de la automotora
  categoria: string;
  monto: number;
  fecha: string;
  comentario: string | null;
  adjuntoUrl: string | null;
  estado: 'ACTIVO' | 'ANULADO';
}

interface Respuesta {
  items: GastoListado[];
  total: number;
  totales: {
    porCategoria: { tipo: string; categoria: string; total: number }[];
    vehiculos: number;
    operacionales: number;
    general: number;
  };
}

const LIMITE = 50;
// Gastos de vehículos (se registran en la ficha de cada auto y entran en su
// margen) y operacionales (arriendo, sueldos...: se restan del resultado del
// período). Los generales no tienen sucursal y solo cuentan en la vista
// consolidada.
export function GastosPage() {
  const { esGeneral } = useSesion();
  const { sucursalId: sucursalGlobal, sucursales } = useSucursalActiva();
  // El Admin General filtra por sucursal aquí mismo (parte de la elegida arriba);
  // 'GENERALES' = solo los gastos sin sucursal.
  const [sucursal, setSucursal] = useState(sucursalGlobal ?? '');
  const [globalPrevia, setGlobalPrevia] = useState(sucursalGlobal);
  if (globalPrevia !== sucursalGlobal) {
    setGlobalPrevia(sucursalGlobal);
    setSucursal(sucursalGlobal ?? '');
  }
  const soloGenerales = sucursal === 'GENERALES';
  const sucursalId = esGeneral ? (soloGenerales ? '' : sucursal) : sucursalGlobal;
  const qc = useQueryClient();
  const avisar = useAviso();
  const navegar = useNavigate();
  // El período elegido se mantiene al ir a otra página y volver.
  const { desde, hasta, setDesde, setHasta } = usePeriodo('gastos', () => ({
    desde: `${hoy().slice(0, 8)}01`,
    hasta: hoy(),
  }));
  const [tipo, setTipo] = useState('');
  const [categoria, setCategoria] = useState('');
  const [anulados, setAnulados] = useState(false);
  const [offset, setOffset] = useState(0);
  const [modal, setModal] = useState<
    { tipo: 'nuevo' | 'nuevoVehiculo' } | { tipo: 'editar' | 'anular'; gasto: GastoListado } | null
  >(null);

  const consulta = useQuery({
    queryKey: [
      'gastos',
      { desde, hasta, tipo, categoria, anulados, sucursalId, soloGenerales, offset },
    ],
    queryFn: () =>
      api<Respuesta>(
        'GET',
        `/gastos${qs({ desde, hasta, tipo, categoria, sucursalId, soloGenerales: soloGenerales || undefined, incluirAnulados: anulados || undefined, limit: LIMITE, offset })}`,
      ),
    placeholderData: keepPreviousData,
  });
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['gastos'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const anular = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api('POST', `/gastos/${id}/anular`, { body: { motivo: motivo || undefined } }),
    onSuccess: () => {
      refrescar();
      setModal(null);
      avisar('Gasto anulado');
    },
    onError: (e) => avisar(e.message, 'error'),
  });

  const categorias =
    tipo === 'VEHICULO'
      ? CATEGORIAS_VEHICULO
      : tipo === 'OPERACIONAL'
        ? CATEGORIAS_OPERACIONAL
        : [...CATEGORIAS_OPERACIONAL, ...CATEGORIAS_VEHICULO];
  const t = consulta.data?.totales;

  return (
    <>
      <EncabezadoPagina
        titulo="Gastos"
        descripcion="Los operacionales (arriendo, sueldos…) se restan de la utilidad del período. Los de vehículos entran en el margen de cada auto."
        acciones={
          <>
            <Boton
              ayuda="Registra un gasto de un vehículo (mecánica, pintura, trámites…); suma a su costo"
              variante="secundario"
              onClick={() => setModal({ tipo: 'nuevoVehiculo' })}
            >
              <Car aria-hidden />
              Gasto de vehículo
            </Boton>
            <Boton
              ayuda="Registra un gasto del negocio que no es de un vehículo (arriendo, luz, publicidad…)"
              onClick={() => setModal({ tipo: 'nuevo' })}
            >
              <Plus aria-hidden />
              Gasto operacional
            </Boton>
          </>
        }
      />
      <Filtros>
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
        {esGeneral && (
          <Select
            className="sm:w-52"
            aria-label="Sucursal"
            value={sucursal}
            onChange={(e) => {
              setSucursal(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
            <option value="GENERALES">Solo generales (sin sucursal)</option>
          </Select>
        )}
        <Segmentado
          className="max-sm:col-span-2 max-sm:justify-self-start"
          etiqueta="Tipo de gasto"
          opciones={[
            { id: 'TODOS', texto: 'Todos' },
            { id: 'OPERACIONAL', texto: 'Operacionales' },
            { id: 'VEHICULO', texto: 'De vehículos' },
          ]}
          actual={tipo || 'TODOS'}
          onCambiar={(id) => {
            setTipo(id === 'TODOS' ? '' : id);
            setCategoria('');
            setOffset(0);
          }}
        />
        <Select
          className="sm:w-52"
          aria-label="Categoría"
          value={categoria}
          onChange={(e) => {
            setCategoria(e.target.value);
            setOffset(0);
          }}
        >
          <Opciones valores={categorias} vacia="Todas las categorías" />
        </Select>
        <Casilla marcada={anulados} onCambiar={setAnulados}>
          Incluir anulados
        </Casilla>
      </Filtros>

      {consulta.isLoading && <Cargando />}
      {consulta.error && <MensajeError error={consulta.error} />}
      {consulta.data && t && (
        <>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <Indicador
              icono={Receipt}
              titulo="Total del período"
              valor={pesos(t.general)}
              detalle="Activos, según los filtros"
            />
            <Indicador
              icono={Building2}
              titulo="Operacionales"
              valor={pesos(t.operacionales)}
              detalle="Se restan de la utilidad"
            />
            <Indicador
              icono={Car}
              titulo="De vehículos"
              valor={pesos(t.vehiculos)}
              detalle="Entran en el margen de cada auto"
            />
          </div>

          {consulta.data.items.length === 0 ? (
            <Vacio
              icono={Receipt}
              titulo="No hay gastos con estos filtros"
              accion={
                <Boton
                  ayuda="Registra un gasto del negocio que no es de un vehículo (arriendo, luz, publicidad…)"
                  onClick={() => setModal({ tipo: 'nuevo' })}
                >
                  <Plus aria-hidden />
                  Gasto operacional
                </Boton>
              }
            >
              Registra un gasto operacional o uno de un vehículo.
            </Vacio>
          ) : (
            <>
              <Tabla
                movil={
                  <ListaMovil>
                    {consulta.data.items.map((g) => (
                      <ItemMovil
                        key={g.id}
                        a={`/gastos/${g.id}`}
                        avatar={<IconoGasto tipo={g.tipo} />}
                        titulo={g.vehiculo?.descripcion ?? (g.comentario || etiqueta(g.categoria))}
                        valor={
                          <span className={g.estado === 'ANULADO' ? 'line-through' : undefined}>
                            {pesos(g.monto)}
                          </span>
                        }
                        subtitulo={`N° ${g.numero} · ${etiqueta(g.categoria)} · ${g.sucursal?.nombre ?? 'General'}`}
                        insignia={g.estado === 'ANULADO' ? <Insignia valor="ANULADO" /> : undefined}
                        pie={fecha(g.fecha)}
                        tenue={g.estado === 'ANULADO'}
                      />
                    ))}
                  </ListaMovil>
                }
              >
                <thead>
                  <tr>
                    <Th>Concepto</Th>
                    <Th>Fecha</Th>
                    <Th>Categoría</Th>
                    <Th derecha>Monto</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {consulta.data.items.map((g) => (
                    <tr
                      key={g.id}
                      className={cx(filaClicable, g.estado === 'ANULADO' && 'text-slate-500')}
                      onClick={() => navegar(`/gastos/${g.id}`)}
                    >
                      <Td className="w-[45%] max-w-0">
                        <div className="flex min-w-0 items-center gap-3">
                          <IconoGasto tipo={g.tipo} />
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              {g.vehiculo ? (
                                <Link
                                  to={`/vehiculos/${g.vehiculo.id}?pestana=gastos`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="truncate text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900"
                                >
                                  {g.vehiculo.descripcion}
                                </Link>
                              ) : (
                                <span className="truncate text-slate-900">
                                  {g.comentario || etiqueta(g.categoria)}
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs text-slate-500">
                              N° {g.numero}
                              {g.vehiculo && g.comentario ? ` · ${g.comentario}` : ''}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td className="tabular-nums">{fecha(g.fecha)}</Td>
                      <Td className="w-[30%] max-w-0">
                        <Chip className="max-w-full">
                          <span className="truncate">{etiqueta(g.categoria)}</span>
                        </Chip>
                        <span
                          className="mt-1 block truncate text-xs text-slate-500"
                          title={g.sucursal?.nombre ?? 'General'}
                        >
                          {g.tipo === 'VEHICULO' ? 'De vehículo' : 'Operacional'} ·{' '}
                          {g.sucursal?.nombre ?? 'General'}
                        </span>
                      </Td>
                      <Td
                        derecha
                        className={cx(
                          'font-medium',
                          g.estado === 'ANULADO' ? 'line-through' : 'text-slate-900',
                        )}
                      >
                        {g.estado === 'ANULADO' && <span className="sr-only">Anulado: </span>}
                        {pesos(g.monto)}
                      </Td>
                      <Td className="w-px">
                        {/* Ranuras fijas: los íconos quedan alineados entre filas aunque falte alguno. */}
                        <div className="flex justify-end gap-0.5">
                          {g.adjuntoUrl ? (
                            <BotonIcono etiqueta="Ver boleta" href={urlApi(g.adjuntoUrl)}>
                              <Paperclip aria-hidden />
                            </BotonIcono>
                          ) : (
                            <span className="size-8" aria-hidden />
                          )}
                          {g.estado === 'ACTIVO' ? (
                            <>
                              <BotonIcono
                                etiqueta="Editar gasto"
                                onClick={() => setModal({ tipo: 'editar', gasto: g })}
                              >
                                <Pencil aria-hidden />
                              </BotonIcono>
                              <BotonIcono
                                ayuda="Deja el gasto sin efecto en los costos; queda en la auditoría"
                                etiqueta="Anular gasto"
                                peligro
                                onClick={() => setModal({ tipo: 'anular', gasto: g })}
                              >
                                <Ban aria-hidden />
                              </BotonIcono>
                            </>
                          ) : (
                            <span className="w-[4.125rem]" aria-hidden />
                          )}
                        </div>
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
        </>
      )}

      {modal?.tipo === 'nuevo' && (
        <FormularioOperacional onCerrar={() => setModal(null)} onGuardado={refrescar} />
      )}
      {modal?.tipo === 'nuevoVehiculo' && (
        <FormularioGasto gasto={null} onCerrar={() => setModal(null)} onGuardado={refrescar} />
      )}
      {modal?.tipo === 'editar' &&
        (modal.gasto.tipo === 'VEHICULO' ? (
          <FormularioGasto
            vehiculoId={modal.gasto.vehiculo!.id}
            gasto={modal.gasto}
            onCerrar={() => setModal(null)}
            onGuardado={refrescar}
          />
        ) : (
          <FormularioOperacional
            gasto={modal.gasto}
            onCerrar={() => setModal(null)}
            onGuardado={refrescar}
          />
        ))}
      {modal?.tipo === 'anular' && (
        <Confirmar
          titulo="Anular gasto"
          mensaje={`¿Anular ${etiqueta(modal.gasto.categoria).toLowerCase()} por ${pesos(modal.gasto.monto)}? Queda en el historial como anulado.`}
          textoConfirmar="Anular gasto"
          peligro
          pedirMotivo
          motivoOpcional
          cargando={anular.isPending}
          onConfirmar={(motivo) => anular.mutate({ id: modal.gasto.id, motivo })}
          onCerrar={() => setModal(null)}
        />
      )}
    </>
  );
}

// Alta o edición de un gasto operacional. La sucursal: el Admin General elige
// una o "General" (toda la automotora); el Admin de Sucursal, siempre la suya.
export function FormularioOperacional({
  gasto,
  onCerrar,
  onGuardado,
}: {
  gasto?: GastoListado;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const { esGeneral } = useSesion();
  const { sucursales, sucursalId, nombre } = useSucursalActiva();
  const avisar = useAviso();
  const { register, handleSubmit, formState } = useFormulario<{
    categoria: string;
    monto: number;
    fecha: string;
    comentario: string;
    sucursalId: string;
    adjunto: FileList;
  }>({
    defaultValues: gasto
      ? {
          categoria: gasto.categoria,
          monto: gasto.monto,
          fecha: gasto.fecha,
          comentario: gasto.comentario ?? '',
        }
      : {
          categoria: 'ARRIENDO',
          fecha: hoy(),
          sucursalId: esGeneral ? (sucursalId ?? '') : '',
        },
  });
  const e = formState.errors;
  const guardar = handleSubmit(async (d) => {
    try {
      if (gasto) {
        await api('PATCH', `/gastos/${gasto.id}`, {
          body: {
            categoria: d.categoria,
            monto: d.monto,
            fecha: d.fecha,
            comentario: d.comentario || null,
          },
        });
      } else {
        const form = new FormData();
        form.append('categoria', d.categoria);
        form.append('monto', String(d.monto));
        form.append('fecha', d.fecha);
        if (d.comentario) form.append('comentario', d.comentario);
        if (esGeneral) form.append('sucursalId', d.sucursalId);
        if (d.adjunto?.[0]) form.append('adjunto', d.adjunto[0]);
        await api('POST', '/gastos', { body: form });
      }
      onGuardado();
      avisar(gasto ? 'Gasto actualizado' : 'Gasto registrado');
      onCerrar();
    } catch (err) {
      avisar((err as Error).message, 'error');
    }
  });
  return (
    <Modal
      titulo={gasto ? 'Editar gasto operacional' : 'Nuevo gasto operacional'}
      descripcion="Se resta de la utilidad del período."
      onCerrar={onCerrar}
    >
      <form onSubmit={guardar} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Categoría">
          <Select {...register('categoria')}>
            <Opciones valores={CATEGORIAS_OPERACIONAL} />
          </Select>
        </Campo>
        <Campo etiqueta="Monto" error={e.monto?.message}>
          <Input
            type="number"
            moneda
            {...register('monto', {
              required: 'Obligatorio',
              valueAsNumber: true,
              min: { value: 1, message: 'Debe ser mayor a 0' },
            })}
          />
        </Campo>
        <Campo etiqueta="Fecha">
          <Input type="date" max={hoy()} {...register('fecha', { required: true })} />
        </Campo>
        {gasto ? (
          <Campo etiqueta="Sucursal">
            <p className="flex h-9 items-center text-sm text-slate-700">
              {gasto.sucursal?.nombre ?? 'General (toda la automotora)'}
            </p>
          </Campo>
        ) : esGeneral ? (
          <Campo
            etiqueta="Sucursal"
            ayuda="“General” solo cuenta en la vista consolidada, no se reparte."
          >
            <Select {...register('sucursalId')}>
              <option value="">General (toda la automotora)</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </Campo>
        ) : (
          <Campo etiqueta="Sucursal">
            <p className="flex h-9 items-center text-sm text-slate-700">{nombre(sucursalId)}</p>
          </Campo>
        )}
        <Campo etiqueta="Detalle" className="sm:col-span-2">
          <Textarea placeholder="Ej. Arriendo local Providencia" {...register('comentario')} />
        </Campo>
        {!gasto && (
          <Campo etiqueta="Boleta (opcional)" className="sm:col-span-2">
            <InputArchivo accept={ACEPTA_DOCUMENTOS} maxMb={10} {...register('adjunto')} />
          </Campo>
        )}
        <Acciones className="sm:col-span-2">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={formState.isSubmitting}>
            Guardar
          </Boton>
        </Acciones>
      </form>
    </Modal>
  );
}

// Tipo del gasto en un círculo: auto para los de vehículo, edificio para los operacionales.
function IconoGasto({ tipo }: { tipo: GastoListado['tipo'] }) {
  const Icono = tipo === 'VEHICULO' ? Car : Building2;
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
      <Icono className="size-4" strokeWidth={1.75} aria-hidden />
    </span>
  );
}
