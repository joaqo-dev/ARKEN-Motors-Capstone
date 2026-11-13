import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Historial de navegación del panel, para que "‹ Volver" lleve a la pantalla
// de la que realmente se vino (p. ej. Gasto N° 15 → ficha del vehículo →
// "‹ Gasto N° 15") y no siempre a la sección padre. Sigue la pila del
// navegador por location.key y se guarda en sessionStorage.

interface Estado {
  pila: string[]; // location.key de cada entrada
  indice: number; // entrada actual
  titulos: Record<string, string>; // título de la página de cada entrada
}

const CLAVE = 'panel.historial';
const MAXIMO = 50;

function leer(): Estado | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    return crudo ? (JSON.parse(crudo) as Estado) : null;
  } catch {
    return null;
  }
}

function guardar(e: Estado) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(e));
  } catch {
    // Sin almacenamiento: el historial funciona igual mientras no se recargue.
  }
}

interface Contexto {
  anterior: string | null; // título de la pantalla anterior, si se vino desde el panel
  registrarTitulo: (titulo: string) => void;
}

const HistorialContexto = createContext<Contexto>({
  anterior: null,
  registrarTitulo: () => undefined,
});

export function HistorialProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const tipo = useNavigationType();
  const [estado, setEstado] = useState<Estado>(
    () => leer() ?? { pila: [location.key], indice: 0, titulos: {} },
  );

  // Sigue cada navegación como lo hace el navegador: PUSH agrega (y descarta lo
  // que estaba "adelante"), REPLACE reemplaza y POP (atrás/adelante) se mueve.
  useEffect(() => {
    setEstado((e) => {
      const { key } = location;
      if (e.pila[e.indice] === key) return e;
      let pila: string[];
      let indice: number;
      if (tipo === 'POP') {
        const i = e.pila.indexOf(key);
        if (i === -1) [pila, indice] = [[key], 0];
        else [pila, indice] = [e.pila, i];
      } else if (tipo === 'REPLACE') {
        pila = [...e.pila];
        pila[e.indice] = key;
        indice = e.indice;
      } else {
        pila = [...e.pila.slice(0, e.indice + 1), key].slice(-MAXIMO);
        indice = pila.length - 1;
      }
      const titulos = Object.fromEntries(
        Object.entries(e.titulos).filter(([k]) => pila.includes(k)),
      );
      const nuevo = { pila, indice, titulos };
      guardar(nuevo);
      return nuevo;
    });
  }, [location, tipo]);

  const registrarTitulo = useCallback(
    (titulo: string) => {
      setEstado((e) => {
        if (e.titulos[location.key] === titulo) return e;
        const nuevo = { ...e, titulos: { ...e.titulos, [location.key]: titulo } };
        guardar(nuevo);
        return nuevo;
      });
    },
    [location.key],
  );

  const actual = estado.pila[estado.indice] === location.key;
  const previa = actual && estado.indice > 0 ? estado.pila[estado.indice - 1] : undefined;
  const anterior = previa ? (estado.titulos[previa] ?? null) : null;

  const valor = useMemo(() => ({ anterior, registrarTitulo }), [anterior, registrarTitulo]);
  return <HistorialContexto.Provider value={valor}>{children}</HistorialContexto.Provider>;
}

export const useHistorial = () => useContext(HistorialContexto);
