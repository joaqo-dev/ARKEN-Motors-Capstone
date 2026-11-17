import type * as ReactPdf from '@react-pdf/renderer';
import type { DocumentoPdf } from './documento-pdf';

// react-pdf es ESM-only: el módulo se carga en tiempo de ejecución y se pasa
// aquí, en vez de importarlo estáticamente (la API compila a CommonJS).
export function plantillaDocumento(rp: typeof ReactPdf, doc: DocumentoPdf) {
  const { Document, Page, StyleSheet, Text, View } = rp;
  const s = StyleSheet.create({
    pagina: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#18181b' },
    encabezado: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    automotora: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
    gris: { color: '#52525b' },
    folioCaja: { border: '1pt solid #18181b', padding: 8, alignItems: 'center', minWidth: 150 },
    titulo: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
    folio: { fontSize: 11, marginTop: 2 },
    fechas: { flexDirection: 'row', gap: 24, marginBottom: 14 },
    seccion: { marginBottom: 12 },
    seccionTitulo: {
      fontSize: 10,
      fontFamily: 'Helvetica-Bold',
      backgroundColor: '#f4f4f5',
      padding: 4,
      marginBottom: 4,
    },
    fila: { flexDirection: 'row', paddingVertical: 2 },
    etiqueta: { width: 150, color: '#52525b' },
    valor: { flex: 1 },
    montoFila: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 3,
      borderBottom: '0.5pt solid #e4e4e7',
    },
    total: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
      fontFamily: 'Helvetica-Bold',
    },
    nota: { marginBottom: 3, color: '#3f3f46' },
    firmas: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 50 },
    firma: { borderTop: '0.5pt solid #18181b', width: 180, paddingTop: 4, textAlign: 'center' },
    pie: {
      position: 'absolute',
      bottom: 24,
      left: 40,
      right: 40,
      fontSize: 8,
      color: '#71717a',
      textAlign: 'center',
    },
  });

  const filas = (datos: { etiqueta: string; valor: string }[]) =>
    datos.map((d) => (
      <View style={s.fila} key={d.etiqueta}>
        <Text style={s.etiqueta}>{d.etiqueta}</Text>
        <Text style={s.valor}>{d.valor}</Text>
      </View>
    ));

  return (
    <Document title={`${doc.titulo} N° ${doc.folio}`} author={doc.emisor.automotora}>
      <Page size="LETTER" style={s.pagina}>
        <View style={s.encabezado}>
          <View>
            <Text style={s.automotora}>{doc.emisor.automotora}</Text>
            <Text style={s.gris}>RUT {doc.emisor.rut}</Text>
            <Text style={s.gris}>
              {doc.emisor.sucursal} — {doc.emisor.direccion}
            </Text>
            <Text style={s.gris}>
              {doc.emisor.telefono} · {doc.emisor.email}
            </Text>
          </View>
          <View style={s.folioCaja}>
            <Text style={s.titulo}>{doc.titulo.toUpperCase()}</Text>
            <Text style={s.folio}>N° {doc.folio}</Text>
          </View>
        </View>

        <View style={s.fechas}>
          {doc.fechas.map((f) => (
            <Text key={f.etiqueta}>
              <Text style={s.gris}>{f.etiqueta}: </Text>
              {f.valor}
            </Text>
          ))}
        </View>

        {doc.secciones.map((sec) => (
          <View style={s.seccion} key={sec.titulo}>
            <Text style={s.seccionTitulo}>{sec.titulo}</Text>
            {filas(sec.filas)}
          </View>
        ))}

        {doc.montos && (
          <View style={s.seccion}>
            <Text style={s.seccionTitulo}>{doc.montos.titulo}</Text>
            {doc.montos.filas.map((m, i) => (
              <View style={s.montoFila} key={`${m.descripcion}-${i}`}>
                <Text>{m.descripcion}</Text>
                <Text>{m.monto}</Text>
              </View>
            ))}
            {doc.montos.total && (
              <View style={s.total}>
                <Text>{doc.montos.total.etiqueta}</Text>
                <Text>{doc.montos.total.monto}</Text>
              </View>
            )}
          </View>
        )}

        {doc.notas && doc.notas.length > 0 && (
          <View style={s.seccion}>
            <Text style={s.seccionTitulo}>Condiciones</Text>
            {doc.notas.map((n) => (
              <Text style={s.nota} key={n}>
                • {n}
              </Text>
            ))}
          </View>
        )}

        {doc.firmas && (
          <View style={s.firmas}>
            {doc.firmas.map((f) => (
              <Text style={s.firma} key={f}>
                {f}
              </Text>
            ))}
          </View>
        )}

        <Text style={s.pie} fixed>
          {doc.pie}
        </Text>
      </Page>
    </Document>
  );
}
