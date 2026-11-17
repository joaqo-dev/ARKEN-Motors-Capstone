import { Cabecera } from '../components/cabecera';

// Mientras el servidor arma la portada del marketplace: la misma silueta
// (portada a sangre, buscador y recién publicados sobre gris).
export default function Cargando() {
  return (
    <div className="mk vt mk-mercado" aria-busy="true" aria-label="Cargando">
      <div className="mk-hero">
        <Cabecera sobreImagen />
      </div>
      <div className="mk-buscador">
        <div className="esqueleto" style={{ height: 76 }} />
      </div>
      <div className="vt-seccion vt-inventario">
        <div className="vt-grilla">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="esqueleto" style={{ height: 420 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
