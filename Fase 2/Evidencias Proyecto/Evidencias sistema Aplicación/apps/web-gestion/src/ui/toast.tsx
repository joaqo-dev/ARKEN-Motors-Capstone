import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { ContextoAviso, type TipoAviso } from '../auth/contextos';

type Tipo = TipoAviso;
interface Aviso {
  id: number;
  tipo: Tipo;
  texto: string;
  saliendo?: boolean;
}

const Contexto = ContextoAviso;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const temporizadores = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  // Sale hacia abajo, por donde entró; luego se retira del DOM.
  const quitar = useCallback((id: number) => {
    clearTimeout(temporizadores.current.get(id));
    temporizadores.current.delete(id);
    setAvisos((a) => a.map((x) => (x.id === id ? { ...x, saliendo: true } : x)));
    window.setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 200);
  }, []);

  const avisar = useCallback(
    (texto: string, tipo: Tipo = 'exito') => {
      const id = Date.now() + Math.random();
      // Máximo 3 visibles: el más antiguo se va primero.
      setAvisos((a) => [...a.slice(-2), { id, tipo, texto }]);
      temporizadores.current.set(
        id,
        setTimeout(() => quitar(id), tipo === 'error' ? 7000 : 4000),
      );
    },
    [quitar],
  );

  return (
    <Contexto.Provider value={avisar}>
      {children}
      <ol
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:right-5 sm:bottom-5"
        aria-live="polite"
      >
        {avisos.map((a) => {
          const Icono = a.tipo === 'error' ? CircleAlert : CircleCheck;
          return (
            <li
              key={a.id}
              role={a.tipo === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex w-full items-start gap-2.5 rounded-xl bg-superficie py-3 pl-3.5 pr-2.5 text-sm text-slate-800 shadow-flotante transition-[opacity,transform] ease-(--ease-out) starting:translate-y-3 starting:opacity-0 sm:w-[22rem] ${a.saliendo ? 'translate-y-2 opacity-0 duration-200' : 'duration-300'}`}
            >
              <Icono
                className={`mt-px size-[1.125rem] shrink-0 ${a.tipo === 'error' ? 'text-red-500' : 'text-lima-fuerte'}`}
                aria-hidden
              />
              <span className="flex-1 leading-snug">{a.texto}</span>
              <button
                type="button"
                onClick={() => quitar(a.id)}
                className="-my-0.5 rounded-full p-0.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cerrar aviso"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ol>
    </Contexto.Provider>
  );
}

// Notificación breve (éxito o error) tras una acción.
export const useAviso = () => useContext(Contexto);
