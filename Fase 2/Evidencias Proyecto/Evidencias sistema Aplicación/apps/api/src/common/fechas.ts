const ZONA_HORARIA_NEGOCIO = 'America/Santiago';

// Fecha de hoy (YYYY-MM-DD) en la zona horaria del negocio, no la del servidor.
export function hoyEnChile(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA_NEGOCIO }).format(ahora);
}

const formatoCLP = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

export function formatearCLP(monto: number): string {
  return formatoCLP.format(monto);
}

// Suma días a una fecha 'YYYY-MM-DD' (aritmética de calendario, sin zona horaria).
export function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

// Suma días hábiles (lunes a viernes) a una fecha 'YYYY-MM-DD'. Simplificación:
// no considera feriados.
export function sumarDiasHabiles(fecha: string, dias: number): string {
  let actual = fecha;
  let restantes = dias;
  while (restantes > 0) {
    actual = sumarDias(actual, 1);
    const diaSemana = new Date(`${actual}T12:00:00Z`).getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) restantes--;
  }
  return actual;
}
