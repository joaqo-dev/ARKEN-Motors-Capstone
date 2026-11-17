import { CarFront, CircleAlert, CircleCheck, Info } from 'lucide-react';
import type { ReactNode } from 'react';

const PUNTOS = [
  'Inventario, clientes y ventas de todas tus sucursales en un solo lugar.',
  'Cotizaciones, reservas y tasaciones con folio y PDF listos para enviar.',
  'Tu vitrina pública se actualiza sola con cada vehículo publicado.',
];

// Marco común de las pantallas de acceso (sin sesión).
export function MarcoAcceso({
  titulo,
  subtitulo,
  children,
  ancho = 'max-w-sm',
}: {
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
  ancho?: string;
}) {
  return (
    <div className="grid grid-cols-1 min-h-full bg-superficie lg:grid-cols-[1fr_minmax(0,34rem)]">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <span className="flex size-9 items-center justify-center rounded-full bg-slate-900 text-invertido">
            <CarFront className="size-4" aria-hidden />
          </span>
          Panel de gestión
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className={`w-full ${ancho} animate-aparecer`}>
            <h1 className="display text-[1.75rem] leading-tight text-slate-950">{titulo}</h1>
            {subtitulo && <p className="mt-1.5 text-sm text-slate-500">{subtitulo}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>
      <aside className="relative m-3 hidden overflow-hidden rounded-[28px] bg-[#111113] ring-1 ring-inset ring-white/5 lg:flex lg:flex-col lg:justify-end lg:p-12">
        <svg
          className="pointer-events-none absolute -right-40 -top-40 size-[44rem] opacity-[0.14]"
          viewBox="0 0 400 400"
          aria-hidden
        >
          {Array.from({ length: 24 }, (_, i) => (
            <circle
              key={i}
              cx="200"
              cy="200"
              r={12 + i * 8.5}
              fill="none"
              stroke="white"
              strokeWidth="0.7"
            />
          ))}
        </svg>
        <div className="relative">
          <p className="display max-w-md text-[2rem] leading-[1.15] text-white">
            La gestión completa de tu automotora, de la entrada del vehículo a la venta.
          </p>
          <ul className="mt-8 space-y-3">
            {PUNTOS.map((p) => (
              <li key={p} className="flex gap-3 text-sm leading-relaxed text-slate-300">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-[#cdf04a]" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

export function Alerta({
  tipo,
  children,
}: {
  tipo: 'error' | 'exito' | 'info';
  children: ReactNode;
}) {
  const { caja, Icono } = {
    error: {
      caja: 'bg-red-50 text-red-800 shadow-[0_0_0_1px_var(--color-red-200)]',
      Icono: CircleAlert,
    },
    exito: {
      caja: 'bg-lima-suave text-slate-900',
      Icono: CircleCheck,
    },
    info: { caja: 'bg-sky-50 text-sky-800 shadow-[0_0_0_1px_var(--color-sky-200)]', Icono: Info },
  }[tipo];
  return (
    <div
      role={tipo === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm leading-relaxed ${caja}`}
    >
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
