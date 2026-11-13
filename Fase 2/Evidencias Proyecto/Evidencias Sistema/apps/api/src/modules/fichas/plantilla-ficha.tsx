import type * as ReactPdf from '@react-pdf/renderer';

export interface FichaVehiculo {
  automotora: string;
  logo: Buffer | null;
  vitrina: string; // "autos-demo.dominio.cl"
  titulo: string; // "Toyota Hilux"
  subtitulo: string; // "SR 4x4 · 2016"
  precio: string;
  datos: { etiqueta: string; valor: string }[];
  descripcion: string | null;
  qr: Buffer | null; // solo si el vehículo está publicado
}

const TINTA = '#18181b';
const SUAVE = '#52525b';
const TENUE = '#a1a1aa';
const BORDE = '#e4e4e7';

// Ficha para imprimir y pegar en el vehículo: carta vertical, legible a un par
// de metros (precio y modelo grandes).
export function plantillaFicha(rp: typeof ReactPdf, f: FichaVehiculo) {
  const { Document, Image, Page, StyleSheet, Text, View } = rp;
  const s = StyleSheet.create({
    pagina: { padding: 44, fontFamily: 'Helvetica', color: TINTA, flexDirection: 'column' },
    cabecera: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingBottom: 18,
      borderBottom: `1pt solid ${BORDE}`,
    },
    logo: { width: 44, height: 44, borderRadius: 8, objectFit: 'cover' },
    automotora: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
    vitrina: { fontSize: 10, color: SUAVE, marginTop: 2 },
    titulo: { fontSize: 40, fontFamily: 'Helvetica-Bold', marginTop: 24, lineHeight: 1.05 },
    subtitulo: { fontSize: 17, color: SUAVE, marginTop: 6 },
    precioCaja: {
      marginTop: 20,
      paddingVertical: 14,
      paddingHorizontal: 22,
      backgroundColor: TINTA,
      borderRadius: 12,
    },
    precioEtiqueta: { fontSize: 11, color: '#d4d4d8', letterSpacing: 1.2 },
    precio: { fontSize: 46, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginTop: 2 },
    grilla: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 },
    dato: {
      width: '50%',
      paddingVertical: 8,
      paddingRight: 16,
      borderBottom: `0.75pt solid ${BORDE}`,
    },
    datoEtiqueta: { fontSize: 9, color: TENUE, letterSpacing: 1, marginBottom: 3 },
    datoValor: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
    descripcion: { fontSize: 11, color: SUAVE, lineHeight: 1.45, marginTop: 14, marginBottom: 14 },
    // El pie va al final de la hoja; si la descripción es larga, lo empuja en vez
    // de superponerse.
    pie: {
      marginTop: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 18,
      paddingTop: 14,
      borderTop: `1pt solid ${BORDE}`,
    },
    qr: { width: 104, height: 104 },
    qrTexto: { flex: 1 },
    qrTitulo: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
    qrDetalle: { fontSize: 11, color: SUAVE, marginTop: 4, lineHeight: 1.4 },
  });

  return (
    <Document title={`${f.titulo} — ${f.automotora}`} author={f.automotora}>
      <Page size="LETTER" style={s.pagina}>
        <View style={s.cabecera}>
          {f.logo && <Image style={s.logo} src={{ data: f.logo, format: 'jpg' }} />}
          <View>
            <Text style={s.automotora}>{f.automotora}</Text>
            <Text style={s.vitrina}>{f.vitrina}</Text>
          </View>
        </View>

        <Text style={s.titulo}>{f.titulo}</Text>
        <Text style={s.subtitulo}>{f.subtitulo}</Text>

        <View style={s.precioCaja}>
          <Text style={s.precioEtiqueta}>PRECIO</Text>
          <Text style={s.precio}>{f.precio}</Text>
        </View>

        <View style={s.grilla}>
          {f.datos.map((d) => (
            <View style={s.dato} key={d.etiqueta}>
              <Text style={s.datoEtiqueta}>{d.etiqueta.toUpperCase()}</Text>
              <Text style={s.datoValor}>{d.valor}</Text>
            </View>
          ))}
        </View>

        {f.descripcion && <Text style={s.descripcion}>{f.descripcion}</Text>}

        <View style={s.pie} wrap={false}>
          {f.qr ? (
            <>
              <Image style={s.qr} src={{ data: f.qr, format: 'png' }} />
              <View style={s.qrTexto}>
                <Text style={s.qrTitulo}>Escanea para ver todas las fotos</Text>
                <Text style={s.qrDetalle}>y escríbenos por WhatsApp directo desde tu celular.</Text>
              </View>
            </>
          ) : (
            <View style={s.qrTexto}>
              <Text style={s.qrTitulo}>{f.automotora}</Text>
              <Text style={s.qrDetalle}>Más vehículos en {f.vitrina}</Text>
            </View>
          )}
        </View>
      </Page>
    </Document>
  );
}
