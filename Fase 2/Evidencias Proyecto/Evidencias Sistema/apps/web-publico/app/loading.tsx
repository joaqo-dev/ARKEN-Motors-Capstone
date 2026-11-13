import { Cabecera } from '../components/cabecera';

// Silueta de la portada del marketplace mientras carga (portada, buscador y
// recién publicados).
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
