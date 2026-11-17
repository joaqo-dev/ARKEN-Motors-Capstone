import { FlaskConical, RotateCcw, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Confirmar } from '../ui/confirmar';
import { cambiarPerfil, perfilActual, PERFILES, reiniciarDemo } from './db';

// Aviso siempre visible del modo demo, con el cambio de perfil (rol y
// automotora) y "Reiniciar demo", que vuelve a los datos de ejemplo.
export function AvisoDemo() {
  const [abierto, setAbierto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const perfil = perfilActual();

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  return (
    <>
      <div
        ref={caja}
        className="fixed bottom-3 left-1/2 z-[55] -translate-x-1/2 text-xs print:hidden lg:left-[calc(50%+8rem)]"
      >
        {abierto && (
          <div
            role="dialog"
            aria-label="Opciones de la demo"
            className="absolute bottom-full left-1/2 mb-2 w-72 -translate-x-1/2 rounded-xl bg-superficie p-3 text-slate-700 shadow-flotante ring-1 ring-slate-200"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="leading-snug text-slate-600">
                Demo con datos de ejemplo inventados. Los cambios se guardan solo en este navegador.
              </p>
              <button
                type="button"
                aria-label="Cerrar"
                className="-mr-1 -mt-1 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setAbierto(false)}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <label
              className="mb-1 flex items-center gap-1.5 font-medium text-slate-900"
              htmlFor="perfil-demo"
            >
              <UserRound className="size-3.5" aria-hidden />
              Ver como
            </label>
            <select
              id="perfil-demo"
              className="mb-3 h-9 w-full rounded-lg bg-superficie px-2 text-sm ring-1 ring-inset ring-slate-200 outline-none focus-visible:ring-slate-400"
              value={perfil}
              onChange={(e) => cambiarPerfil(e.target.value)}
            >
              {PERFILES.map((p) => (
                <option key={p.usuarioId} value={p.usuarioId}>
                  {p.texto}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-sm font-medium text-invertido transition-colors hover:bg-slate-700"
              onClick={() => {
                setAbierto(false);
                setConfirmando(true);
              }}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Reiniciar demo
            </button>
            <a
              href={`${import.meta.env.BASE_URL}CREDITOS-FOTOS.md`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-center text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
            >
              Créditos de las fotos
            </a>
          </div>
        )}
        <div className="flex items-center gap-1 rounded-full bg-superficie py-1 pl-3 pr-1 text-slate-600 shadow-flotante ring-1 ring-slate-200">
          <FlaskConical className="size-3.5 shrink-0 text-amber-600" aria-hidden />
          <span className="whitespace-nowrap">
            <span className="font-medium text-slate-900">Modo demo</span>
            <span className="max-sm:hidden"> — datos de ejemplo</span>
          </span>
          <button
            type="button"
            aria-expanded={abierto}
            className="ml-1 whitespace-nowrap rounded-full px-2.5 py-1 font-medium text-slate-900 transition-colors hover:bg-slate-100 aria-expanded:bg-slate-100"
            onClick={() => setAbierto(!abierto)}
          >
            Opciones
          </button>
          <button
            type="button"
            className="flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 font-medium text-slate-900 transition-colors hover:bg-slate-100"
            onClick={() => setConfirmando(true)}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            <span className="max-sm:sr-only">Reiniciar demo</span>
          </button>
        </div>
      </div>
      {confirmando && (
        <Confirmar
          titulo="Reiniciar demo"
          mensaje="Se borran los cambios que hiciste y vuelven los datos de ejemplo originales."
          textoConfirmar="Reiniciar"
          onConfirmar={reiniciarDemo}
          onCerrar={() => setConfirmando(false)}
        />
      )}
    </>
  );
}
