import { Cabecera } from '../../../components/cabecera';
import { vitrinaActual } from '../../../lib/vitrina';

// Silueta de la ficha mientras carga (mosaico, texto y tarjeta de precio). En
// la vitrina, una franja oscura en lugar de la cabecera del marketplace.
export default async function CargandoFicha() {
  const vitrina = await vitrinaActual();
  return (
    <div className={vitrina ? 'mk vt mk-vitrina mk-ficha' : 'mk vt mk-ficha'}>
      {vitrina ? <div className="v-cabecera" style={{ height: 76 }} aria-hidden /> : <Cabecera />}
      <main
        className="contenedor mk-contenedor mk-contenedor-detalle"
        aria-busy="true"
        aria-label="Cargando"
      >
        <div className="vt-ficha">
          <div className="esqueleto" style={{ width: 120, height: 20, marginBottom: 28 }} />
          <div className="vt-mosaico" data-cantidad={5}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="esqueleto" style={{ borderRadius: 12 }} />
            ))}
          </div>
          <div className="vt-ficha-cuerpo">
            <div>
              <div className="esqueleto" style={{ width: '45%', height: 48 }} />
              <div className="esqueleto" style={{ width: '30%', height: 20, marginTop: 12 }} />
            </div>
            <div className="esqueleto" style={{ height: 200, borderRadius: 14 }} />
          </div>
        </div>
      </main>
    </div>
  );
}
