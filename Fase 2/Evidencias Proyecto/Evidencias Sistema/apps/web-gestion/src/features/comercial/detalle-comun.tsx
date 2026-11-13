import { formatearRut } from '@vitriauto/shared-types';
import type { ReactNode } from 'react';
import { Ban, CalendarClock, CalendarDays, Car, MapPin, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fecha, fechaHora, pesos } from '../../lib/formato';
import type { TipoDocumentoCorreo } from '../../lib/tipos';
import {
  Avatar,
  Chip,
  cx,
  DatoIcono,
  EncabezadoPagina,
  Insignia,
  Tarjeta,
} from '../../ui/componentes';
import { CorreosDocumento } from './correos';

export const enlace =
  'text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900';

// El vehículo del documento como cabecera: ícono en círculo, enlace a su ficha y
// patente en chip; `extra` agrega estado o documento de origen en la misma fila.
export function CabeceraVehiculo({
  vehiculo,
  extra,
}: {
  vehiculo: { id?: string | null; descripcion: string; patente: string };
  extra?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
        <Car className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0">
        {vehiculo.id ? (
          <Link to={`/vehiculos/${vehiculo.id}`} className={`font-medium ${enlace}`}>
            {vehiculo.descripcion}
          </Link>
        ) : (
          <span className="font-medium text-slate-900">{vehiculo.descripcion}</span>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
          <Chip mono>{vehiculo.patente}</Chip>
          {extra}
        </div>
      </div>
    </div>
  );
}

// Monto principal del documento en cifra grande y su desglose en filas.
export function Desglose({
  etiqueta,
  monto,
  children,
}: {
  etiqueta: string;
  monto: number;
  children?: ReactNode;
}) {
  return (
    <>
      <p className="mt-6 text-sm text-slate-500">{etiqueta}</p>
      <p className="mt-2 text-[2.25rem] font-light leading-none tracking-[-0.04em] tabular-nums text-slate-950">
        {pesos(monto)}
      </p>
      {children && (
        <dl className="mt-6 divide-y divide-slate-100 border-t border-slate-100 text-sm [&>div]:flex [&>div]:justify-between [&>div]:gap-4 [&>div]:py-3">
          {children}
        </dl>
      )}
    </>
  );
}

// Fila del desglose; `total` la destaca como cierre.
export function FilaDesglose({
  texto,
  monto,
  total,
}: {
  texto: ReactNode;
  monto: ReactNode;
  total?: boolean;
}) {
  return (
    <div className={total ? 'font-medium' : undefined}>
      <dt className={total ? 'text-slate-900' : 'text-slate-500'}>{texto}</dt>
      <dd className={cx('tabular-nums', total ? 'text-slate-950' : 'text-slate-900')}>{monto}</dd>
    </div>
  );
}

// Cabecera y datos comunes del detalle de un documento comercial.
export function DetalleDocumento({
  volver,
  titulo,
  estado,
  sucursal,
  acciones,
  cliente,
  emision,
  emitidoPor,
  vence,
  anulacion,
  correos,
  children,
}: {
  volver: { ruta: string; texto: string };
  titulo: string;
  estado: string;
  sucursal: string;
  acciones?: ReactNode;
  cliente: { id: string; nombre: string; rut: string };
  emision: string;
  emitidoPor: string;
  vence?: string;
  anulacion?: { titulo: string; motivo: string; fecha: string | null; extra?: ReactNode } | null;
  // Historial y reenvío de los correos al cliente.
  correos?: { tipo: TipoDocumentoCorreo; id: string };
  children: ReactNode;
}) {
  return (
    <>
      <EncabezadoPagina
        volver={{ a: volver.ruta, texto: volver.texto }}
        titulo={titulo}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <Insignia valor={estado} />
            <Chip icono={MapPin} className="bg-superficie">
              {sucursal}
            </Chip>
          </span>
        }
        acciones={acciones}
      />
      {anulacion && (
        <div
          role="note"
          className="mb-6 flex items-start gap-2.5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <Ban className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
          <div>
            <strong className="font-semibold">{anulacion.titulo}</strong> el{' '}
            {fechaHora(anulacion.fecha)}: {anulacion.motivo}
            {anulacion.extra}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">{children}</div>
        <div className="min-w-0 space-y-6 self-start">
          <Tarjeta>
            <Link
              to={`/clientes/${cliente.id}`}
              className="-m-2 flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-slate-50"
            >
              <Avatar nombre={cliente.nombre} className="size-12 text-sm" />
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-900">{cliente.nombre}</span>
                <span className="block text-xs tabular-nums text-slate-500">
                  {formatearRut(cliente.rut)}
                </span>
              </span>
            </Link>
            <dl className="mt-5 space-y-4 border-t border-slate-100 pt-5">
              <DatoIcono icono={CalendarDays} etiqueta="Emisión">
                {fechaHora(emision)}
              </DatoIcono>
              {vence && (
                <DatoIcono icono={CalendarClock} etiqueta="Vence">
                  {fecha(vence)}
                </DatoIcono>
              )}
              <DatoIcono icono={UserRound} etiqueta="Emitido por">
                {emitidoPor}
              </DatoIcono>
            </dl>
          </Tarjeta>
          {correos && (
            <CorreosDocumento tipo={correos.tipo} id={correos.id} anulado={!!anulacion} />
          )}
        </div>
      </div>
    </>
  );
}
