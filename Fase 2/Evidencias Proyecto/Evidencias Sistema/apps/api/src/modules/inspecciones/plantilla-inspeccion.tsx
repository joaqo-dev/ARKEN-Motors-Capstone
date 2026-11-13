import type * as ReactPdf from '@react-pdf/renderer';
import type { EvaluacionInspeccion, ResultadoInspeccion } from '@vitriauto/shared-types';

export interface InformeInspeccion {
  automotora: string;
  vehiculo: string;
  version: string | null;
  patente: string;
  kilometraje: number;
  estado: 'BORRADOR' | 'FINALIZADA';
  resultado: string | null;
  resultadoCodigo: ResultadoInspeccion | null;
  fecha: Date;
  inspector: string;
  observaciones: string | null;
  secciones: {
    nombre: string;
    puntos: {
      nombre: string;
      evaluacion: EvaluacionInspeccion | null;
      observacion: string | null;
      fotos: Buffer[];
    }[];
  }[];
}

const EVALUACION: Record<EvaluacionInspeccion, { texto: string; color: string }> = {
  BUENO: { texto: 'Bueno', color: '#15803d' },
  REGULAR: { texto: 'Regular', color: '#b45309' },
  MALO: { texto: 'Malo', color: '#b91c1c' },
  NO_APLICA: { texto: 'N/A', color: '#71717a' },
};

const COLOR_RESULTADO: Record<ResultadoInspeccion, string> = {
  APROBADO: '#15803d',
  APROBADO_CON_OBSERVACIONES: '#15803d', // aprobado igual: verde
  NO_APROBADO: '#b91c1c',
};

const fechaHora = (d: Date) =>
  new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);

// Informe de inspección pre-compra en PDF, sin notas internas: se puede
// entregar al cliente.
export function plantillaInspeccion(rp: typeof ReactPdf, d: InformeInspeccion) {
  const { Document, Font, Image, Page, StyleSheet, Text, View } = rp;
  // Sin separación silábica: "observaciones" no se corta con guion.
  Font.registerHyphenationCallback((palabra) => [palabra]);
  const s = StyleSheet.create({
    pagina: {
      padding: 40,
      paddingBottom: 56,
      fontSize: 9.5,
      fontFamily: 'Helvetica',
      color: '#18181b',
    },
    automotora: { fontSize: 10, color: '#52525b' },
    titulo: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginTop: 4 },
    vehiculo: { fontSize: 12, marginTop: 4 },
    resumen: {
      flexDirection: 'row',
      marginTop: 14,
      marginBottom: 6,
      border: '0.75pt solid #e4e4e7',
      borderRadius: 6,
    },
    resumenCelda: { flex: 1, padding: 8, borderRight: '0.75pt solid #e4e4e7' },
    resumenEtiqueta: { fontSize: 7.5, color: '#71717a', marginBottom: 2 },
    resumenValor: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
    observaciones: { marginTop: 8, color: '#3f3f46', lineHeight: 1.4 },
    seccion: { marginTop: 14 },
    seccionTitulo: {
      fontSize: 10.5,
      fontFamily: 'Helvetica-Bold',
      backgroundColor: '#f4f4f5',
      padding: 5,
    },
    punto: { paddingVertical: 5, paddingHorizontal: 5, borderBottom: '0.5pt solid #e4e4e7' },
    puntoFila: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    puntoNombre: { flex: 1 },
    evaluacion: { width: 52, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
    observacion: { marginTop: 2, color: '#52525b', fontSize: 8.5 },
    fotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
    foto: { width: 88, height: 66, objectFit: 'cover', borderRadius: 3 },
    pie: {
      position: 'absolute',
      bottom: 24,
      left: 40,
      right: 40,
      flexDirection: 'row',
      justifyContent: 'space-between',
      fontSize: 7.5,
      color: '#71717a',
    },
  });

  return (
    <Document title={`Inspección pre-compra — ${d.vehiculo}`} author={d.automotora}>
      <Page size="LETTER" style={s.pagina}>
        <Text style={s.automotora}>{d.automotora}</Text>
        <Text style={s.titulo}>Informe de inspección pre-compra</Text>
        <Text style={s.vehiculo}>
          {d.vehiculo}
          {d.version ? ` · ${d.version}` : ''} · Patente {d.patente}
        </Text>

        <View style={s.resumen}>
          <View style={[s.resumenCelda, { flex: 1.7 }]}>
            <Text style={s.resumenEtiqueta}>RESULTADO</Text>
            <Text
              style={[
                s.resumenValor,
                { color: d.resultadoCodigo ? COLOR_RESULTADO[d.resultadoCodigo] : '#71717a' },
              ]}
            >
              {d.resultado ?? 'Borrador (sin finalizar)'}
            </Text>
          </View>
          <View style={s.resumenCelda}>
            <Text style={s.resumenEtiqueta}>FECHA</Text>
            <Text style={s.resumenValor}>{fechaHora(d.fecha)}</Text>
          </View>
          <View style={s.resumenCelda}>
            <Text style={s.resumenEtiqueta}>KILOMETRAJE</Text>
            <Text style={s.resumenValor}>
              {new Intl.NumberFormat('es-CL').format(d.kilometraje)} km
            </Text>
          </View>
          <View style={[s.resumenCelda, { borderRight: 'none' }]}>
            <Text style={s.resumenEtiqueta}>INSPECCIONADO POR</Text>
            <Text style={s.resumenValor}>{d.inspector}</Text>
          </View>
        </View>
        {d.observaciones && <Text style={s.observaciones}>{d.observaciones}</Text>}

        {d.secciones.map((sec) => (
          <View style={s.seccion} key={sec.nombre}>
            <Text style={s.seccionTitulo} minPresenceAhead={60}>
              {sec.nombre}
            </Text>
            {sec.puntos.map((p, i) => (
              <View style={s.punto} key={`${p.nombre}-${i}`} wrap={false}>
                <View style={s.puntoFila}>
                  <Text style={s.puntoNombre}>{p.nombre}</Text>
                  <Text
                    style={[
                      s.evaluacion,
                      { color: p.evaluacion ? EVALUACION[p.evaluacion].color : '#a1a1aa' },
                    ]}
                  >
                    {p.evaluacion ? EVALUACION[p.evaluacion].texto : '—'}
                  </Text>
                </View>
                {p.observacion && <Text style={s.observacion}>{p.observacion}</Text>}
                {p.fotos.length > 0 && (
                  <View style={s.fotos}>
                    {p.fotos.map((f, j) => (
                      <Image key={j} style={s.foto} src={{ data: f, format: 'jpg' }} />
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}

        <View style={s.pie} fixed>
          <Text>
            {d.automotora} · {d.vehiculo}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
