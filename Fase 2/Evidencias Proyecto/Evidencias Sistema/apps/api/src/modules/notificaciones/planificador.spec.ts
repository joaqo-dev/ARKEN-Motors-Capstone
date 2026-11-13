import { planificarNotificaciones } from './planificador';

const HOY = '2026-09-29';

function doc(parcial: Record<string, unknown>) {
  return {
    documento_id: 'd1',
    tipo: 'SOAP',
    fecha_vencimiento: '2026-10-05',
    vehiculo_id: 'v1',
    patente: 'AAAA11',
    descripcion: 'Toyota Yaris',
    automotora_id: 'a1',
    sucursal_id: 's1',
    sucursal_nombre: 'Casa Matriz',
    ...parcial,
  } as never;
}

const vacio = { documentos: [], reservas: [], consignacionesPrevio: [], consignacionesDia: [] };

describe('planificarNotificaciones', () => {
  it('agrupa el SOAP de 2 vehículos de la misma sucursal en UNA notificación', () => {
    const plan = planificarNotificaciones(
      {
        ...vacio,
        documentos: [
          doc({ documento_id: 'd1', vehiculo_id: 'v1', patente: 'AAAA11' }),
          doc({
            documento_id: 'd2',
            vehiculo_id: 'v2',
            patente: 'BBBB22',
            fecha_vencimiento: '2026-10-06',
          }),
        ],
      },
      HOY,
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].referencias.map((r) => r.claveEvento)).toEqual(['DOC:d1', 'DOC:d2']);
    expect(plan[0].mensaje).toContain('2 vehículos de Casa Matriz');
  });

  it('no agrupa entre sucursales ni entre tipos de documento', () => {
    const plan = planificarNotificaciones(
      {
        ...vacio,
        documentos: [
          doc({ documento_id: 'd1' }),
          doc({ documento_id: 'd2', sucursal_id: 's2', sucursal_nombre: 'Norte' }),
          doc({ documento_id: 'd3', tipo: 'PERMISO_CIRCULACION' }),
        ],
      },
      HOY,
    );
    expect(plan).toHaveLength(3);
  });

  it('la revisión técnica es siempre individual', () => {
    const plan = planificarNotificaciones(
      {
        ...vacio,
        documentos: [
          doc({ documento_id: 'd1', tipo: 'REVISION_TECNICA' }),
          doc({ documento_id: 'd2', tipo: 'REVISION_TECNICA', vehiculo_id: 'v2' }),
        ],
      },
      HOY,
    );
    expect(plan).toHaveLength(2);
  });

  it('consignación: claves distintas para el aviso previo y el del día', () => {
    const c = {
      consignacion_id: 'c1',
      folio: 3,
      fecha_fin: HOY,
      patente: 'KLMN11',
      cliente_nombre: 'Pedro',
      automotora_id: 'a1',
      sucursal_id: 's1',
    };
    const plan = planificarNotificaciones({ ...vacio, consignacionesDia: [c] }, HOY);
    expect(plan[0].referencias[0].claveEvento).toBe(`CONSIGNACION:c1:${HOY}:DIA`);
    expect(plan[0].mensaje).toContain('vence hoy');
  });
});
