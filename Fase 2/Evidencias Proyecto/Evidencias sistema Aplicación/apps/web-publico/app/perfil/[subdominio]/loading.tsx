// Mientras se arma la vitrina (primera carga).
export default function CargandoVitrina() {
  return (
    <div className="mk mk-vitrina vt" aria-busy="true" aria-label="Cargando">
      <div className="vt-hero">
        <div className="vt-hero-fondo sin-banner" aria-hidden />
      </div>
      <div className="vt-seccion vt-inventario">
        <div className="busqueda">
          <div className="esqueleto" style={{ height: 480 }} />
          <div className="vt-grilla">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="esqueleto" style={{ height: 420 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
