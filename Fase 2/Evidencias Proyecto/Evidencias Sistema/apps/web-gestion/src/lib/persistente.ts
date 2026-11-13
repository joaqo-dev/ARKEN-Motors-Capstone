import { useEffect, useState } from 'react';

// Estado que sobrevive al cambiar de página (y al recargar), guardado en
// sessionStorage: dura mientras la pestaña esté abierta. Si el valor guardado
// no es válido, se ignora.
export function usePersistente<T>(
  clave: string,
  porDefecto: () => T,
  esValido: (v: unknown) => v is T,
): [T, (v: T) => void] {
  const llave = `panel.${clave}`;
  const [valor, setValor] = useState<T>(() => {
    try {
      const guardado: unknown = JSON.parse(sessionStorage.getItem(llave) ?? 'null');
      return esValido(guardado) ? guardado : porDefecto();
    } catch {
      return porDefecto();
    }
  });
  const guardar = (v: T) => {
    setValor(v);
    try {
      sessionStorage.setItem(llave, JSON.stringify(v));
    } catch {
      /* sin almacenamiento: el valor dura mientras la página esté abierta */
    }
  };
  return [valor, guardar];
}

export interface Periodo {
  desde: string;
  hasta: string;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const esPeriodo = (v: unknown): v is Periodo =>
  typeof v === 'object' &&
  v !== null &&
  FECHA.test((v as Periodo).desde) &&
  FECHA.test((v as Periodo).hasta) &&
  (v as Periodo).desde <= (v as Periodo).hasta;

// Período (desde/hasta) recordado por pantalla: 'dashboard', 'analitica'…
export function usePeriodo(pantalla: string, porDefecto: () => Periodo) {
  const [periodo, setPeriodo] = usePersistente(`periodo.${pantalla}`, porDefecto, esPeriodo);
  return {
    desde: periodo.desde,
    hasta: periodo.hasta,
    setDesde: (desde: string) => setPeriodo({ ...periodo, desde }),
    setHasta: (hasta: string) => setPeriodo({ ...periodo, hasta }),
    setPeriodo,
  };
}

// Valor que se actualiza recién cuando el usuario deja de escribir (búsquedas).
export function useDemorado<T>(valor: T, ms = 300): T {
  const [demorado, setDemorado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDemorado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return demorado;
}
