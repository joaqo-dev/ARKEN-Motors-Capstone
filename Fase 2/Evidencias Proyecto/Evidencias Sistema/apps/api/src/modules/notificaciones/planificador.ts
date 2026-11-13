import type {
  ConsignacionPorVencer,
  DocumentoPorVencer,
  NuevaNotificacion,
  ReservaPorVencer,
} from './notificaciones.repository';

const NOMBRE_DOCUMENTO = {
  PERMISO_CIRCULACION: 'Permiso de circulación',
  REVISION_TECNICA: 'Revisión técnica',
  SOAP: 'SOAP',
} as const;

// 'YYYY-MM-DD' → 'DD-MM-YYYY'
const fecha = (valor: string) => valor.split('-').reverse().join('-');

const vence = (fechaVencimiento: string, hoy: string) =>
  fechaVencimiento < hoy
    ? `venció el ${fecha(fechaVencimiento)}`
    : fechaVencimiento === hoy
      ? 'vence hoy'
      : `vence el ${fecha(fechaVencimiento)}`;

// Arma las notificaciones a partir de los eventos aún no avisados:
// - Permiso de circulación y SOAP: un aviso por automotora + sucursal + tipo,
//   que agrupa todos los vehículos que entran a la vez en la ventana.
// - Revisión técnica, reservas y consignaciones: un aviso por entidad.
export function planificarNotificaciones(
  entrada: {
    documentos: DocumentoPorVencer[];
    reservas: ReservaPorVencer[];
    consignacionesPrevio: ConsignacionPorVencer[];
    consignacionesDia: ConsignacionPorVencer[];
  },
  hoy: string,
): NuevaNotificacion[] {
  const resultado: NuevaNotificacion[] = [];

  const grupos = new Map<string, DocumentoPorVencer[]>();
  for (const doc of entrada.documentos) {
    if (doc.tipo === 'REVISION_TECNICA') {
      resultado.push({
        automotoraId: doc.automotora_id,
        sucursalId: doc.sucursal_id,
        tipo: 'DOCUMENTO_LEGAL_POR_VENCER',
        mensaje: `Revisión técnica del ${doc.patente} (${doc.descripcion}) ${vence(doc.fecha_vencimiento, hoy)}`,
        referencias: [
          {
            entidadTipo: 'VEHICULO',
            entidadId: doc.vehiculo_id,
            claveEvento: `DOC:${doc.documento_id}`,
          },
        ],
      });
      continue;
    }
    const clave = `${doc.automotora_id}|${doc.sucursal_id}|${doc.tipo}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), doc]);
  }
  for (const docs of grupos.values()) {
    const [primero] = docs;
    const nombre = NOMBRE_DOCUMENTO[primero.tipo];
    const mensaje =
      docs.length === 1
        ? `${nombre} del ${primero.patente} (${primero.descripcion}) ${vence(primero.fecha_vencimiento, hoy)}`
        : `${nombre} por vencer en ${docs.length} vehículos de ${primero.sucursal_nombre}: ` +
          docs.map((d) => `${d.patente} (${vence(d.fecha_vencimiento, hoy)})`).join(', ');
    resultado.push({
      automotoraId: primero.automotora_id,
      sucursalId: primero.sucursal_id,
      tipo: 'DOCUMENTO_LEGAL_POR_VENCER',
      mensaje,
      referencias: docs.map((d) => ({
        entidadTipo: 'VEHICULO' as const,
        entidadId: d.vehiculo_id,
        claveEvento: `DOC:${d.documento_id}`,
      })),
    });
  }

  for (const r of entrada.reservas) {
    resultado.push({
      automotoraId: r.automotora_id,
      sucursalId: r.sucursal_id,
      tipo: 'RESERVA_POR_VENCER',
      mensaje: `Reserva N° ${r.folio} (${r.patente}, ${r.cliente_nombre}) ${vence(r.fecha_vencimiento, hoy)}: extenderla o darla de baja`,
      referencias: [
        {
          entidadTipo: 'RESERVA',
          entidadId: r.reserva_id,
          claveEvento: `RESERVA:${r.reserva_id}:${r.fecha_vencimiento}`,
        },
      ],
    });
  }

  for (const [momento, lista] of [
    ['PREVIO', entrada.consignacionesPrevio],
    ['DIA', entrada.consignacionesDia],
  ] as const) {
    for (const c of lista) {
      resultado.push({
        automotoraId: c.automotora_id,
        sucursalId: c.sucursal_id,
        tipo: 'CONSIGNACION_POR_VENCER',
        mensaje: `Consignación N° ${c.folio} (${c.patente}, ${c.cliente_nombre}) ${vence(c.fecha_fin, hoy)}: decidir extender el plazo o devolver el vehículo`,
        referencias: [
          {
            entidadTipo: 'CONSIGNACION',
            entidadId: c.consignacion_id,
            claveEvento: `CONSIGNACION:${c.consignacion_id}:${c.fecha_fin}:${momento}`,
          },
        ],
      });
    }
  }

  return resultado;
}
