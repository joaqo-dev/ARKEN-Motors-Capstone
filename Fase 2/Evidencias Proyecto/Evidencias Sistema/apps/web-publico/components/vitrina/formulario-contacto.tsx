'use client';

import { AlertCircle, Check, Send } from 'lucide-react';
import { useActionState, useState } from 'react';
import { Selector } from '../selector';
import { enviarContacto, type EstadoContacto } from '../../app/perfil/[subdominio]/acciones';

const INICIAL: EstadoContacto = { estado: 'inicial' };

export function FormularioContacto({
  subdominio,
  sucursales,
}: {
  subdominio: string;
  sucursales: { id: string; nombre: string }[];
}) {
  const [estado, enviar, enviando] = useActionState(enviarContacto.bind(null, subdominio), INICIAL);
  // "Enviar otro mensaje": descarta esta confirmación y monta el formulario vacío.
  const [descartado, setDescartado] = useState<EstadoContacto | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const mostrarEnviado = estado.estado === 'enviado' && descartado !== estado;

  if (mostrarEnviado) {
    return (
      <div className="v-enviado" role="status">
        <span className="v-enviado-icono" aria-hidden>
          <Check className="icono" style={{ width: 24, height: 24 }} />
        </span>
        <h3>Mensaje enviado</h3>
        <p>Gracias por escribirnos. Te responderemos al correo que dejaste lo antes posible.</p>
        <button
          type="button"
          className="boton boton-contorno boton-chico"
          onClick={() => {
            setDescartado(estado);
            setVuelta(vuelta + 1);
          }}
        >
          Enviar otro mensaje
        </button>
      </div>
    );
  }

  const v = estado.estado === 'error' ? (estado.valores ?? {}) : {};
  const e = estado.errores ?? {};
  return (
    <form action={enviar} key={vuelta} noValidate>
      {estado.mensaje && (
        <p className="aviso-error" role="alert">
          <AlertCircle className="icono" aria-hidden />
          {estado.mensaje}
        </p>
      )}
      <div className="campo">
        <label htmlFor="contacto-nombre">Nombre</label>
        <input
          id="contacto-nombre"
          name="nombre"
          className="control"
          autoComplete="name"
          maxLength={120}
          required
          defaultValue={v.nombre}
          aria-invalid={Boolean(e.nombre)}
          aria-describedby={e.nombre ? 'error-nombre' : undefined}
        />
        {e.nombre && (
          <span id="error-nombre" className="error-campo">
            {e.nombre}
          </span>
        )}
      </div>
      <div className="campo">
        <label htmlFor="contacto-email">Correo</label>
        <input
          id="contacto-email"
          name="email"
          type="email"
          className="control"
          autoComplete="email"
          maxLength={200}
          required
          defaultValue={v.email}
          aria-invalid={Boolean(e.email)}
          aria-describedby={e.email ? 'error-email' : undefined}
        />
        {e.email && (
          <span id="error-email" className="error-campo">
            {e.email}
          </span>
        )}
      </div>
      <div className={`campo${sucursales.length > 1 ? '' : ' ancho-completo'}`}>
        <label htmlFor="contacto-telefono">
          Teléfono <span className="opcional">(opcional)</span>
        </label>
        <input
          id="contacto-telefono"
          name="telefono"
          type="tel"
          className="control"
          autoComplete="tel"
          maxLength={30}
          placeholder="+56 9 1234 5678"
          defaultValue={v.telefono}
        />
      </div>
      {sucursales.length > 1 && (
        <div className="campo">
          <label htmlFor="contacto-sucursal">Sucursal</label>
          <Selector
            id="contacto-sucursal"
            name="sucursalId"
            valorInicial={v.sucursalId ?? ''}
            opciones={[
              { valor: '', texto: 'Cualquiera' },
              ...sucursales.map((s) => ({ valor: s.id, texto: s.nombre })),
            ]}
          />
        </div>
      )}
      <div className="campo ancho-completo">
        <label htmlFor="contacto-mensaje">Mensaje</label>
        <textarea
          id="contacto-mensaje"
          name="mensaje"
          className="control"
          maxLength={2000}
          required
          placeholder="¿Qué vehículo te interesa? ¿Buscas financiamiento o dejar tu auto en parte de pago?"
          defaultValue={v.mensaje}
          aria-invalid={Boolean(e.mensaje)}
          aria-describedby={e.mensaje ? 'error-mensaje' : undefined}
        />
        {e.mensaje && (
          <span id="error-mensaje" className="error-campo">
            {e.mensaje}
          </span>
        )}
      </div>
      <div className="trampa" aria-hidden>
        <label htmlFor="contacto-sitio">No completar</label>
        <input id="contacto-sitio" name="sitioWeb" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="v-formulario-pie">
        <p>
          Tu mensaje llega directo al correo de la automotora, que usará tus datos solo para
          responderte. <a href="/privacidad">Privacidad</a>
        </p>
        <button type="submit" className="boton" disabled={enviando}>
          <Send className="icono" aria-hidden />
          {enviando ? 'Enviando…' : 'Enviar mensaje'}
        </button>
      </div>
    </form>
  );
}
