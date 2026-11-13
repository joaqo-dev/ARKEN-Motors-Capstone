import { Menu } from 'lucide-react';
import { config, urlMarketplace } from '../lib/config';

const SECCIONES = [
  { clave: 'inicio', href: '/', texto: 'Inicio' },
  { clave: 'buscar', href: '/buscar', texto: 'Vehículos' },
] as const;

// Cabecera del marketplace y del detalle de un vehículo. La marca siempre lleva
// al marketplace del dominio raíz (también desde el subdominio de una automotora).
// `sobreImagen`: versión transparente, en blanco, para ir encima de una foto.
export function Cabecera({
  activa,
  sobreImagen = false,
}: {
  activa?: (typeof SECCIONES)[number]['clave'];
  sobreImagen?: boolean;
}) {
  return (
    <header className={`cabecera mk-cabecera${sobreImagen ? ' cabecera-transparente' : ''}`}>
      <div className="cabecera-interior">
        <a href={urlMarketplace()} className="marca mk-marca">
          Vitriauto
        </a>
        <nav aria-label="Principal" className="cabecera-nav">
          <ul>
            {SECCIONES.map((s) => (
              <li key={s.clave}>
                <a
                  href={`${urlMarketplace()}${s.href}`}
                  aria-current={activa === s.clave ? 'page' : undefined}
                >
                  {s.texto}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="cabecera-acciones">
          {/* Teléfonos y tablets: los enlaces de la cabecera no caben, van en un menú. */}
          <details className="cabecera-menu">
            <summary aria-label="Menú">
              <Menu className="icono" aria-hidden />
            </summary>
            <nav aria-label="Principal (móvil)">
              {SECCIONES.map((s) => (
                <a
                  key={s.clave}
                  href={`${urlMarketplace()}${s.href}`}
                  aria-current={activa === s.clave ? 'page' : undefined}
                >
                  {s.texto}
                </a>
              ))}
              {config.panelUrl && (
                <a href={`${config.panelUrl}/registro`} className="cabecera-menu-destacado">
                  Publica tu automotora
                </a>
              )}
            </nav>
          </details>
          {config.panelUrl && (
            <a
              href={`${config.panelUrl}/registro`}
              className={`boton boton-chico solo-escritorio${sobreImagen ? ' boton-claro' : ''}`}
            >
              Publica tu automotora
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
