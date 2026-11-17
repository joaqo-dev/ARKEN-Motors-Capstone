import { useSyncExternalStore } from 'react';

// Ayudas de los botones: una breve descripción de lo que hace cada uno al
// pasar el mouse o enfocarlo. Se pueden apagar desde el menú de la cuenta; la
// preferencia se guarda por navegador (como el tema). Activas por defecto.
const CLAVE = 'panel.ayudas';

function leer(): boolean {
  try {
    return localStorage.getItem(CLAVE) !== 'no';
  } catch {
    return true;
  }
}

let activas = leer();
const oyentes = new Set<() => void>();

export function setAyudas(valor: boolean) {
  activas = valor;
  try {
    if (valor) localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, 'no');
  } catch {
    /* sin almacenamiento: la preferencia dura la sesión */
  }
  oyentes.forEach((o) => o());
}

export function useAyudas() {
  const valor = useSyncExternalStore(
    (o) => {
      oyentes.add(o);
      return () => oyentes.delete(o);
    },
    () => activas,
  );
  return { activas: valor, setAyudas };
}
