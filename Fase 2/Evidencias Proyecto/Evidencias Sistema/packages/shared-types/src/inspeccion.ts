// Inspección pre-compra: lista de chequeo estándar. Cada inspección copia
// estos puntos al crearse (un cambio en la lista no altera las ya hechas) y
// puede sumar puntos propios en cualquier sección.

export const EVALUACIONES_INSPECCION = ['BUENO', 'REGULAR', 'MALO', 'NO_APLICA'] as const;
export type EvaluacionInspeccion = (typeof EVALUACIONES_INSPECCION)[number];

export const RESULTADOS_INSPECCION = [
  'APROBADO',
  'APROBADO_CON_OBSERVACIONES',
  'NO_APROBADO',
] as const;
export type ResultadoInspeccion = (typeof RESULTADOS_INSPECCION)[number];

// Resultados que se publican en la página del vehículo (nunca NO_APROBADO).
export const RESULTADOS_PUBLICABLES: readonly ResultadoInspeccion[] = [
  'APROBADO',
  'APROBADO_CON_OBSERVACIONES',
];

export const MAX_FOTOS_POR_PUNTO = 6;

export interface PuntoPlantilla {
  codigo: string;
  nombre: string;
}

export interface SeccionInspeccion {
  codigo: string;
  nombre: string;
  puntos: PuntoPlantilla[];
}

// Revisión pre-compra de un usado en Chile: documentación (anotaciones del
// Registro Civil y multas), estado físico y prueba de ruta.
export const SECCIONES_INSPECCION: SeccionInspeccion[] = [
  {
    codigo: 'DOCUMENTACION',
    nombre: 'Documentación',
    puntos: [
      { codigo: 'permiso_circulacion', nombre: 'Permiso de circulación vigente' },
      { codigo: 'revision_tecnica', nombre: 'Revisión técnica y de gases vigente' },
      { codigo: 'soap', nombre: 'SOAP vigente' },
      {
        codigo: 'anotaciones',
        nombre: 'Certificado de anotaciones sin prendas, embargos ni limitaciones',
      },
      { codigo: 'multas', nombre: 'Sin multas impagas en el Registro de Multas' },
      {
        codigo: 'numeros_identificacion',
        nombre: 'N° de motor y de chasis (VIN) coinciden con los documentos',
      },
      { codigo: 'mantenciones', nombre: 'Historial de mantenciones' },
      { codigo: 'llaves_manuales', nombre: 'Llaves (con copia) y manuales' },
    ],
  },
  {
    codigo: 'CARROCERIA',
    nombre: 'Carrocería y exterior',
    puntos: [
      { codigo: 'pintura', nombre: 'Pintura (diferencias de tono, repintados)' },
      { codigo: 'abolladuras', nombre: 'Abolladuras y rayones' },
      { codigo: 'corrosion', nombre: 'Óxido y corrosión' },
      { codigo: 'alineacion_paneles', nombre: 'Alineación de puertas, capó y portalón' },
      { codigo: 'vidrios', nombre: 'Parabrisas y vidrios' },
      { codigo: 'espejos', nombre: 'Espejos exteriores' },
      { codigo: 'opticos', nombre: 'Focos y ópticos (estado, sin humedad)' },
      { codigo: 'plumillas', nombre: 'Plumillas y lavaparabrisas' },
    ],
  },
  {
    codigo: 'NEUMATICOS',
    nombre: 'Neumáticos y llantas',
    puntos: [
      { codigo: 'dibujo', nombre: 'Profundidad del dibujo (mínimo legal 1,6 mm)' },
      { codigo: 'desgaste_parejo', nombre: 'Desgaste parejo (sin señales de desalineación)' },
      { codigo: 'antiguedad', nombre: 'Antigüedad de los neumáticos (fecha DOT)' },
      { codigo: 'llantas', nombre: 'Llantas sin golpes ni trizaduras' },
      { codigo: 'repuesto', nombre: 'Rueda de repuesto, gata y llave de ruedas' },
    ],
  },
  {
    codigo: 'INTERIOR',
    nombre: 'Interior y confort',
    puntos: [
      { codigo: 'asientos', nombre: 'Asientos y tapiz' },
      { codigo: 'testigos', nombre: 'Tablero sin testigos de falla encendidos' },
      { codigo: 'airbags', nombre: 'Airbags (testigo apagado)' },
      { codigo: 'cinturones', nombre: 'Cinturones de seguridad' },
      { codigo: 'climatizacion', nombre: 'Aire acondicionado y calefacción' },
      { codigo: 'alzavidrios', nombre: 'Alzavidrios, espejos eléctricos y cierre centralizado' },
      { codigo: 'multimedia', nombre: 'Radio, pantalla y conectividad' },
      { codigo: 'humedad', nombre: 'Sin olores ni señales de humedad o inundación' },
      { codigo: 'desgaste_km', nombre: 'Desgaste coherente con el kilometraje' },
    ],
  },
  {
    codigo: 'MOTOR',
    nombre: 'Motor',
    puntos: [
      { codigo: 'arranque', nombre: 'Arranque en frío' },
      { codigo: 'ralenti', nombre: 'Ralentí estable y sin ruidos anormales' },
      { codigo: 'fugas', nombre: 'Sin fugas de aceite ni de otros líquidos' },
      { codigo: 'aceite', nombre: 'Nivel y estado del aceite' },
      { codigo: 'refrigerante', nombre: 'Refrigerante (nivel, sin mezcla con aceite)' },
      { codigo: 'correas', nombre: 'Correas y mangueras' },
      { codigo: 'bateria', nombre: 'Batería y bornes' },
      { codigo: 'humo', nombre: 'Humo del escape (color y cantidad)' },
    ],
  },
  {
    codigo: 'SUSPENSION',
    nombre: 'Suspensión y dirección',
    puntos: [
      { codigo: 'amortiguadores', nombre: 'Amortiguadores' },
      { codigo: 'ruidos_suspension', nombre: 'Sin ruidos al pasar baches' },
      { codigo: 'direccion', nombre: 'Dirección precisa y sin juego' },
      { codigo: 'rotulas', nombre: 'Rótulas, terminales y bujes' },
    ],
  },
  {
    codigo: 'FRENOS',
    nombre: 'Frenos',
    puntos: [
      { codigo: 'pastillas_discos', nombre: 'Pastillas y discos' },
      { codigo: 'liquido_frenos', nombre: 'Líquido de frenos' },
      { codigo: 'freno_mano', nombre: 'Freno de mano' },
      { codigo: 'abs', nombre: 'ABS (testigo apagado)' },
    ],
  },
  {
    codigo: 'TRANSMISION',
    nombre: 'Transmisión',
    puntos: [
      { codigo: 'embrague', nombre: 'Embrague (acople y sin patinaje)' },
      { codigo: 'cambios', nombre: 'Cambios suaves y sin ruidos' },
      { codigo: 'traccion', nombre: 'Tracción 4x4 / AWD (si aplica)' },
    ],
  },
  {
    codigo: 'ELECTRICIDAD',
    nombre: 'Electricidad y luces',
    puntos: [
      { codigo: 'luces', nombre: 'Luces altas, bajas y de posición' },
      { codigo: 'intermitentes', nombre: 'Intermitentes y balizas' },
      { codigo: 'luces_freno', nombre: 'Luces de freno y de retroceso' },
      { codigo: 'bocina', nombre: 'Bocina' },
      { codigo: 'escaner', nombre: 'Escáner OBD sin códigos de falla' },
    ],
  },
  {
    codigo: 'BAJOS',
    nombre: 'Bajos del vehículo',
    puntos: [
      { codigo: 'chasis', nombre: 'Chasis sin golpes ni reparaciones estructurales' },
      { codigo: 'oxido_bajos', nombre: 'Sin óxido en bajos y piso' },
      { codigo: 'escape', nombre: 'Sistema de escape' },
    ],
  },
  {
    codigo: 'PRUEBA_RUTA',
    nombre: 'Prueba de ruta',
    puntos: [
      { codigo: 'marcha', nombre: 'Comportamiento en marcha (motor y caja)' },
      { codigo: 'frenado', nombre: 'Frenado recto y sin vibraciones' },
      { codigo: 'estabilidad', nombre: 'Sin vibraciones ni desvíos a velocidad' },
      { codigo: 'temperatura', nombre: 'Temperatura de operación estable' },
    ],
  },
];

export const NOMBRE_SECCION: Record<string, string> = Object.fromEntries(
  SECCIONES_INSPECCION.map((s) => [s.codigo, s.nombre]),
);

// Resultado sugerido (quien inspecciona decide): algún punto Malo → No
// aprobado; algún Regular → Aprobado con observaciones.
export function sugerirResultado(
  evaluaciones: (EvaluacionInspeccion | null)[],
): ResultadoInspeccion {
  if (evaluaciones.includes('MALO')) return 'NO_APROBADO';
  if (evaluaciones.includes('REGULAR')) return 'APROBADO_CON_OBSERVACIONES';
  return 'APROBADO';
}
