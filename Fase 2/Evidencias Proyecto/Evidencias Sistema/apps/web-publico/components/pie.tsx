import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { config } from '../lib/config';

// Pie del marketplace (portada, búsqueda y detalle de vehículos).
export function Pie() {
  return (
    <footer className="mk-pie">
      <div className="mk-pie-interior">
        <div className="mk-pie-marca">
          <span className="mk-marca">Vitriauto</span>
          <p>
            Autos publicados por automotoras de todo Chile. Busca, compara y conversa directo con
            quien lo vende, sin registrarte.
          </p>
        </div>
        <nav className="mk-pie-columna" aria-label="Marketplace">
          <h2>Explora</h2>
          <ul>
            <li>
              <Link href="/buscar">Todos los vehículos</Link>
            </li>
            <li>
              <Link href="/buscar?orden=precio_asc">Los más económicos</Link>
            </li>
            <li>
              <Link href="/buscar?orden=anio_desc">Los más nuevos</Link>
            </li>
          </ul>
        </nav>
        <div className="mk-pie-columna">
          <h2>Cómo funciona</h2>
          <ul>
            <li>Cada vehículo lo publica una automotora, con su propia página.</li>
            <li>Contactas por WhatsApp directo a la sucursal donde está el auto.</li>
          </ul>
        </div>
        {config.panelUrl && (
          <div className="mk-pie-columna">
            <h2>Para automotoras</h2>
            <ul>
              <li>
                <a href={`${config.panelUrl}/registro`}>
                  Publica tu inventario
                  <ArrowUpRight className="icono" aria-hidden />
                </a>
              </li>
              <li>
                <a href={`${config.panelUrl}/login`}>
                  Ingresa a tu panel
                  <ArrowUpRight className="icono" aria-hidden />
                </a>
              </li>
            </ul>
          </div>
        )}
      </div>
      <div className="mk-pie-legal">
        <span>© {new Date().getFullYear()} Vitriauto</span>
        <span>Precios en pesos chilenos (CLP), informados por cada automotora.</span>
        <nav aria-label="Legal">
          <Link href="/terminos">Términos de uso</Link>
          <Link href="/privacidad">Privacidad</Link>
        </nav>
      </div>
    </footer>
  );
}
