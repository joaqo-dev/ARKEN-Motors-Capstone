import { Cabecera } from '../../components/cabecera';

// Mientras el servidor arma la página (búsquedas, cambios de filtro).
export default function Cargando() {
  return (
    <div className="mk vt mk-mercado">
      <div className="mk-franja">
        <Cabecera activa="buscar" sobreImagen />
      </div>
      <main className="vt-seccion vt-inventario vt-busqueda" aria-busy="true" aria-label="Cargando">
        <div className="busqueda">
          <div className="filtros esqueleto" style={{ height: 420 }} />
          <div className="vt-grilla">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="esqueleto" style={{ height: 420 }} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
