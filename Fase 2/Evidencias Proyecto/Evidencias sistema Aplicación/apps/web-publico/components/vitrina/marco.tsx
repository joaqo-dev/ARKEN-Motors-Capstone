import { formatearTelefono } from '@vitriauto/shared-types';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import type { AutomotoraPublica } from '../../lib/api';
import { LogoAutomotora } from '../logo';
import { NavDesplazable } from './nav-desplazable';

// Navegación y pie propios de la vitrina de una automotora. Se usan en su
// portada y en la ficha de sus vehículos abierta desde su subdominio: la
// vitrina queda aislada del marketplace (sin enlaces a otras automotoras).
// `base`: '' en la portada (anclas en la misma página), '/' desde una ficha.

export const telefonoHref = (telefono: string) => `tel:${telefono.replace(/[^\d+]/g, '')}`;

export function NavVitrina({
  automotora,
  base = '',
}: {
  automotora: AutomotoraPublica;
  base?: '' | '/';
}) {
  const { sucursales } = automotora;
  return (
    <>
      <NavDesplazable>
        <div className="v-nav-interior">
          <a href={`${base}#inicio`} className="v-marca">
            <LogoAutomotora
              nombre={automotora.nombre}
              logoUrl={automotora.logoUrl}
              tamano="chico"
            />
            <span>{automotora.nombre}</span>
          </a>
          <ul className="v-nav-enlaces">
            <li>
              <a href={`${base}#vehiculos`}>Vehículos</a>
            </li>
            <li>
              <a href={`${base}#contacto`}>Contacto</a>
            </li>
            <li>
              <a href={`${base}#sucursales`}>
                {sucursales.length > 1 ? 'Sucursales' : 'Dónde estamos'}
              </a>
            </li>
          </ul>
          <div className="v-nav-acciones">
            <a href={`${base}#contacto`} className="boton boton-claro">
              Contáctanos
            </a>
          </div>
        </div>
      </NavDesplazable>
    </>
  );
}

export function PieVitrina({
  automotora,
  base = '',
}: {
  automotora: AutomotoraPublica;
  base?: '' | '/';
}) {
  const { sucursales } = automotora;
  const principal = sucursales[0]; // la API las ordena con la principal primero
  return (
    <footer className="v-pie">
      <div className="v-pie-interior">
        <div className="v-pie-marca">
          <a href={`${base}#inicio`} className="v-marca">
            <LogoAutomotora
              nombre={automotora.nombre}
              logoUrl={automotora.logoUrl}
              tamano="chico"
            />
            <span>{automotora.nombre}</span>
          </a>
          {automotora.descripcion && <p>{automotora.descripcion}</p>}
          {principal && (
            <a
              href={principal.whatsapp}
              className="boton boton-vidrio boton-chico"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="icono" aria-hidden />
              Escríbenos por WhatsApp
            </a>
          )}
        </div>

        <nav className="v-pie-columna" aria-label="Secciones">
          <h2>Explora</h2>
          <ul>
            <li>
              <a href={`${base}#vehiculos`}>Vehículos disponibles</a>
            </li>
            <li>
              <a href={`${base}#contacto`}>Contacto</a>
            </li>
            <li>
              <a href={`${base}#sucursales`}>
                {sucursales.length > 1 ? 'Sucursales' : 'Dónde estamos'}
              </a>
            </li>
          </ul>
        </nav>

        <div className="v-pie-columna">
          <h2>{sucursales.length > 1 ? 'Sucursales' : 'Dirección'}</h2>
          <ul>
            {sucursales.map((s) => (
              <li key={s.id} className="v-pie-sucursal">
                <strong>{s.nombre}</strong>
                <span>
                  {s.direccion}, {s.comuna}
                </span>
                {s.horarioAtencion && <span>{s.horarioAtencion}</span>}
              </li>
            ))}
          </ul>
        </div>

        <div className="v-pie-columna">
          <h2>Contacto</h2>
          <ul>
            {sucursales.map((s) => (
              <li key={s.id}>
                <a href={telefonoHref(s.telefono)} className="enlace-pie num">
                  <Phone className="icono" aria-hidden />
                  {formatearTelefono(s.telefono)}
                </a>
              </li>
            ))}
            <li>
              <a href={`mailto:${automotora.email}`} className="enlace-pie">
                <Mail className="icono" aria-hidden />
                {automotora.email}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="v-pie-legal">
        <span>
          © {new Date().getFullYear()} {automotora.nombre}. Precios en pesos chilenos (CLP), sujetos
          a disponibilidad.
        </span>
        {/* Rutas relativas: en el subdominio se quedan dentro de la vitrina. */}
        <nav aria-label="Legal">
          <a href="/terminos">Términos de uso</a>
          <a href="/privacidad">Privacidad</a>
          <span>Hecho con Vitriauto</span>
        </nav>
      </div>
    </footer>
  );
}
