import type { Scope } from '../../common/scope';

// Arma las condiciones comunes de listado de documentos comerciales.
// Scope de cotizaciones/reservas: visibles desde la sucursal donde se emitieron
// (congelada) y desde la sucursal donde está hoy el vehículo.
export function condicionesListado(
  scope: Scope,
  filtro: {
    estado?: string;
    clienteId?: string;
    vehiculoId?: string;
    sucursalId?: string;
    desde?: string;
    hasta?: string;
    q?: string;
  },
  opciones: { conVehiculo: boolean },
): { where: string; params: unknown[] } {
  const conditions = ['d.automotora_id = $1'];
  const params: unknown[] = [scope.automotoraId];
  const agregar = (condicion: (p: string) => string, valor: unknown) => {
    params.push(valor);
    conditions.push(condicion(`$${params.length}`));
  };
  const porSucursal = (p: string) =>
    opciones.conVehiculo
      ? `(d.sucursal_id = ${p} OR v.sucursal_id = ${p})`
      : `d.sucursal_id = ${p}`;

  if (scope.sucursalId) agregar(porSucursal, scope.sucursalId);
  if (filtro.sucursalId) agregar(porSucursal, filtro.sucursalId);
  if (filtro.estado) agregar((p) => `d.estado::text = ${p}`, filtro.estado);
  if (filtro.clienteId) agregar((p) => `d.cliente_id = ${p}`, filtro.clienteId);
  if (filtro.vehiculoId && opciones.conVehiculo)
    agregar((p) => `d.vehiculo_id = ${p}`, filtro.vehiculoId);
  if (filtro.desde) agregar((p) => `d.fecha_emision >= ${p}::date`, filtro.desde);
  if (filtro.hasta) agregar((p) => `d.fecha_emision < (${p}::date + 1)`, filtro.hasta);
  if (filtro.q?.trim()) agregarBusqueda(filtro.q.trim(), opciones, params, conditions);
  return { where: conditions.join(' AND '), params };
}

// Búsqueda libre: N° de folio exacto, nombre o RUT del cliente (con o sin puntos y
// guion), patente, marca o modelo. En la tasación los datos del auto están en el
// propio documento; en el resto, en el vehículo (alias v).
function agregarBusqueda(
  q: string,
  opciones: { conVehiculo: boolean },
  params: unknown[],
  conditions: string[],
) {
  const auto = opciones.conVehiculo ? 'v' : 'd';
  params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const texto = `$${params.length}`;
  const opcionesBusqueda = [
    `EXISTS (SELECT 1 FROM cliente c WHERE c.id = d.cliente_id AND c.nombre ILIKE ${texto})`,
    `${auto}.marca ILIKE ${texto}`,
    `${auto}.modelo ILIKE ${texto}`,
    `(${auto}.marca || ' ' || ${auto}.modelo) ILIKE ${texto}`,
  ];
  const compacto = q.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  if (compacto) {
    params.push(`%${compacto}%`);
    const p = `$${params.length}`;
    opcionesBusqueda.push(
      `${auto}.patente ILIKE ${p}`,
      `EXISTS (SELECT 1 FROM cliente c WHERE c.id = d.cliente_id AND replace(c.rut, '-', '') ILIKE ${p})`,
    );
  }
  const folio = q.replace(/^n[°º]?\s*/i, '');
  if (/^\d{1,9}$/.test(folio)) {
    params.push(Number(folio));
    opcionesBusqueda.push(`d.folio = $${params.length}`);
  }
  conditions.push(`(${opcionesBusqueda.join(' OR ')})`);
}

export type OrdenDocumentos = 'recientes' | 'antiguos' | 'monto_desc' | 'monto_asc';
export const ORDENES_DOCUMENTOS: readonly OrdenDocumentos[] = [
  'recientes',
  'antiguos',
  'monto_desc',
  'monto_asc',
];

// ORDER BY de los listados según la columna de fecha y de monto de cada documento.
export function ordenListado(
  orden: OrdenDocumentos | undefined,
  columnas: { fecha: string; monto: string },
  porDefecto = `${columnas.fecha} DESC`,
): string {
  switch (orden) {
    case 'recientes':
      return `${columnas.fecha} DESC, d.folio DESC`;
    case 'antiguos':
      return `${columnas.fecha} ASC, d.folio ASC`;
    case 'monto_desc':
      return `${columnas.monto} DESC, ${columnas.fecha} DESC`;
    case 'monto_asc':
      return `${columnas.monto} ASC, ${columnas.fecha} DESC`;
    default:
      return porDefecto;
  }
}
