'use client';

import { formatearTelefono } from '@vitriauto/shared-types';
import { Check, Clock, MapPin, MessageCircle, Navigation, Phone } from 'lucide-react';
import { useState } from 'react';
import type { AutomotoraPublica } from '../../lib/api';

type Sucursal = AutomotoraPublica['sucursales'][number];

const direccionCompleta = (s: Sucursal) => `${s.direccion}, ${s.comuna}, ${s.region.nombre}, Chile`;
const telefonoHref = (telefono: string) => `tel:${telefono.replace(/[^\d+]/g, '')}`;

// "Encuéntranos": las sucursales a un lado y, al otro, el mapa de la elegida
// con sus datos y accesos (WhatsApp, llamar, cómo llegar).
export function Sucursales({ sucursales }: { sucursales: Sucursal[] }) {
  const [elegidaId, setElegidaId] = useState(sucursales[0]?.id);
  const elegida = sucursales.find((s) => s.id === elegidaId) ?? sucursales[0];
  if (!elegida) return null;
  const varias = sucursales.length > 1;
  const mapa = `https://maps.google.com/maps?q=${encodeURIComponent(
    direccionCompleta(elegida),
  )}&z=15&output=embed`;
  const comoLlegar = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    direccionCompleta(elegida),
  )}`;

  return (
    <div className="v-ubicacion">
      <div className="v-ubicacion-datos">
        {varias && (
          <ul className="v-ubicacion-lista" aria-label="Sucursales">
            {sucursales.map((s) => {
              const activa = s.id === elegida.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className="v-ubicacion-opcion"
                    aria-pressed={activa}
                    onClick={() => setElegidaId(s.id)}
                  >
                    <span className="v-ubicacion-opcion-texto">
                      <strong>{s.nombre}</strong>
                      <span>
                        {s.comuna}, {s.region.nombre}
                      </span>
                    </span>
                    {activa && <Check className="icono" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="v-ubicacion-detalle" aria-live="polite">
          <div className="v-ubicacion-nombre">
            <h3>{elegida.nombre}</h3>
            {varias && elegida.esPrincipal && <span className="etiqueta-principal">Principal</span>}
          </div>
          <dl>
            <div>
              <dt>
                <MapPin className="icono" aria-label="Dirección" />
              </dt>
              <dd>
                {elegida.direccion}, {elegida.comuna}
                <span>{elegida.region.nombre}</span>
              </dd>
            </div>
            <div>
              <dt>
                <Phone className="icono" aria-label="Teléfono" />
              </dt>
              <dd>
                <a href={telefonoHref(elegida.telefono)} className="num">
                  {formatearTelefono(elegida.telefono)}
                </a>
              </dd>
            </div>
            {elegida.horarioAtencion && (
              <div>
                <dt>
                  <Clock className="icono" aria-label="Horario" />
                </dt>
                <dd>{elegida.horarioAtencion}</dd>
              </div>
            )}
          </dl>
          <div className="v-ubicacion-acciones">
            <a
              href={elegida.whatsapp}
              className="boton-whatsapp boton-chico"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="icono" aria-hidden />
              WhatsApp
            </a>
            <a
              href={comoLlegar}
              className="boton boton-contorno boton-chico"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Navigation className="icono" aria-hidden />
              Cómo llegar
            </a>
          </div>
        </div>
      </div>

      <div className="v-ubicacion-mapa">
        <iframe
          key={elegida.id}
          src={mapa}
          title={`Mapa de ${elegida.nombre}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
}
