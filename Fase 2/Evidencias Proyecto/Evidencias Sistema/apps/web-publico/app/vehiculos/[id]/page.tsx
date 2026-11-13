import { PLAZO_INICIAL_CREDITO, plazosHasta, simularCredito } from '@vitriauto/shared-types';
import { ArrowLeft, ArrowRight, Clock, MapPin, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Cabecera } from '../../../components/cabecera';
import { Inspeccion } from '../../../components/inspeccion';
import { Tarjeta } from '../../../components/listado';
import { LogoAutomotora } from '../../../components/logo';
import { Pie } from '../../../components/pie';
import {
  BarraContactoMovil,
  BotonWhatsapp,
  ProveedorSimulacion,
  SimuladorCredito,
} from '../../../components/simulador-credito';
import { NavVitrina, PieVitrina } from '../../../components/vitrina/marco';
import { Mosaico } from '../../../components/vitrina/mosaico';
import { Carrusel } from '../../../components/marketplace/carrusel';
import { api, paramsBusqueda } from '../../../lib/api';
import { urlArchivo, urlMarketplace, urlPerfil } from '../../../lib/config';
import { etiqueta, kilometros, precio, tasaTexto } from '../../../lib/formato';
import { vitrinaActual } from '../../../lib/vitrina';

type Props = { params: Promise<{ id: string }> };

// El SEO se enfoca en las automotoras: el detalle de un vehículo no se indexa
// (es efímero), pero Google sigue sus enlaces a la vitrina. Sí lleva vista
// previa para compartirlo por WhatsApp o redes.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [v, vitrina] = await Promise.all([api.detalle((await params).id), vitrinaActual()]);
  if (!v) return {};
  const titulo = `${v.marca} ${v.modelo} ${v.anio}`;
  const descripcion = `${precio(v.precio)} · ${kilometros(v.kilometraje)} · ${v.sucursal.comuna}. Publicado por ${v.automotora.nombre}.`;
  const foto = v.fotos[0] ? urlArchivo(v.fotos[0]) : null;
  return {
    // En la vitrina, la pestaña lleva el nombre de la automotora, no el del marketplace.
    title: vitrina ? { absolute: `${titulo} · ${v.automotora.nombre}` } : titulo,
    description: descripcion,
    robots: { index: false, follow: true },
    openGraph: {
      title: `${titulo} | ${v.automotora.nombre}`,
      description: descripcion,
      images: foto ? [foto] : undefined,
    },
  };
}

// Detalle del vehículo: mosaico de fotos y, debajo, descripción, información
// clave, inspección y simulador a la izquierda; a la derecha precio con cuota
// de referencia, contacto y ubicación (aquí sí se identifican la automotora y
// la sucursal). Al final, más vehículos de la automotora.
// Desde el subdominio de una automotora la ficha queda dentro de su vitrina,
// sin enlaces al marketplace ni a otras automotoras.
export default async function VehiculoPage({ params }: Props) {
  const id = (await params).id;
  const [v, vitrina] = await Promise.all([api.detalle(id), vitrinaActual()]);
  if (!v) notFound();
  // Un vehículo de otra automotora no se muestra dentro de esta vitrina.
  if (vitrina && vitrina !== v.automotora.subdominio) {
    redirect(`${urlMarketplace()}/vehiculos/${encodeURIComponent(id)}`);
  }
  const automotora = vitrina ? await api.automotora(vitrina) : null;

  // Otras opciones de la misma automotora: las de precio más parecido primero.
  const inventario = await api.buscar(paramsBusqueda({}, { subdominio: v.automotora.subdominio }));
  const candidatas = (inventario?.items ?? [])
    .filter((o) => o.id !== v.id)
    .sort((a, b) => Math.abs(a.precio - v.precio) - Math.abs(b.precio - v.precio));
  // Una fila que se desplaza a mano: hasta 10 y luego el cierre al inventario.
  const otras = candidatas.slice(0, 10);

  const titulo = `${v.marca} ${v.modelo}`;
  const detalles = (
    [
      ['Año', String(v.anio)],
      ['Kilometraje', kilometros(v.kilometraje)],
      ['Transmisión', etiqueta(v.transmision)],
      ['Combustible', etiqueta(v.combustible)],
      ['Tracción', v.traccion ? etiqueta(v.traccion) : null], // no aplica a motos
      ['Cilindrada', v.cilindrada],
      ['Color', v.color],
      ['Versión', v.version],
    ] as [string, string | null][]
  ).filter((d): d is [string, string] => Boolean(d[1]));
  // En la vitrina todo vuelve a su inventario; en el marketplace, a la búsqueda.
  const volver = automotora ? '/#vehiculos' : '/buscar';
  const inventarioAutomotora = automotora ? '/#vehiculos' : urlPerfil(v.automotora.subdominio);
  const telefono = `tel:${v.sucursal.telefono.replace(/[^\d+]/g, '')}`;
  // Cuota de referencia: la misma que el simulador muestra al abrir (pie
  // mínimo y 36 cuotas, o el plazo más largo permitido si es menor).
  const plazos = v.financiamiento ? plazosHasta(v.financiamiento.plazoMaximo) : [];
  const cuotaDesde = v.financiamiento
    ? simularCredito(
        v.precio,
        v.financiamiento.pieMinimo,
        plazos.includes(PLAZO_INICIAL_CREDITO) ? PLAZO_INICIAL_CREDITO : plazos[plazos.length - 1],
        v.financiamiento.tasaMensual,
      ).cuota
    : null;

  return (
    <div className={automotora ? 'mk vt mk-vitrina mk-ficha' : 'mk vt mk-ficha'}>
      {automotora ? (
        <header className="v-cabecera">
          <NavVitrina automotora={automotora} base="/" />
        </header>
      ) : (
        <Cabecera />
      )}
      <ProveedorSimulacion>
        <main className="contenedor mk-contenedor mk-contenedor-detalle">
          <div className="vt-ficha">
            <Link href={volver} className="vt-volver">
              <ArrowLeft className="icono" aria-hidden />
              Ver vehículos
            </Link>
            <Mosaico fotos={v.fotos.map((f) => urlArchivo(f)!)} alt={titulo} />

            <div className="vt-ficha-cuerpo">
              <div className="vt-ficha-texto">
                <h1 id="titulo-vehiculo">{titulo}</h1>
                <p className="vt-ficha-sub">
                  <span className="num">{v.anio}</span>
                  {v.version && <> · {v.version}</>} · {etiqueta(v.categoria)} · {v.sucursal.comuna}
                </p>
                {v.descripcion && <p className="vt-ficha-descripcion">{v.descripcion}</p>}

                <section className="vt-ficha-bloque" aria-labelledby="titulo-informacion">
                  <h2 id="titulo-informacion">Información clave</h2>
                  <dl className="vt-info">
                    {detalles.map(([k, valor]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd className="num">{valor}</dd>
                      </div>
                    ))}
                  </dl>
                  {v.inspeccion && <Inspeccion inspeccion={v.inspeccion} />}
                </section>

                {v.financiamiento && (
                  <section
                    id="simulador"
                    className="vt-ficha-bloque"
                    aria-labelledby="titulo-simulador"
                  >
                    <div className="vt-ficha-bloque-cabeza">
                      <h2 id="titulo-simulador">Simula tu crédito</h2>
                      <span className="num">{tasaTexto(v.financiamiento.tasaMensual)}</span>
                    </div>
                    <SimuladorCredito precioVehiculo={v.precio} financiamiento={v.financiamiento} />
                  </section>
                )}
              </div>

              <aside className="vt-ficha-lateral" aria-label="Precio y contacto">
                <div className="vt-precio">
                  <p>
                    <strong className="num">{precio(v.precio)}</strong>
                    {cuotaDesde !== null && (
                      <a href="#simulador" className="num">
                        (~{precio(cuotaDesde)}/mes)
                      </a>
                    )}
                  </p>
                  <div className="fx-contacto">
                    <BotonWhatsapp href={v.whatsapp}>Contactar por WhatsApp</BotonWhatsapp>
                    <a href={telefono} className="boton boton-contorno">
                      <Phone className="icono" aria-hidden />
                      Llamar a la sucursal
                    </a>
                  </div>
                </div>
                <div className="vt-donde">
                  <div className="vt-donde-marca">
                    <LogoAutomotora
                      nombre={v.automotora.nombre}
                      logoUrl={v.automotora.logoUrl}
                      tamano="chico"
                    />
                    <p>
                      <strong>{v.automotora.nombre}</strong>
                      <span>{v.sucursal.nombre}</span>
                    </p>
                  </div>
                  <ul>
                    <li>
                      <MapPin className="icono" aria-label="Dirección" />
                      {v.sucursal.direccion}, {v.sucursal.comuna}
                    </li>
                    {v.sucursal.horarioAtencion && (
                      <li>
                        <Clock className="icono" aria-label="Horario" />
                        {v.sucursal.horarioAtencion}
                      </li>
                    )}
                  </ul>
                  {!automotora && (
                    <a href={inventarioAutomotora} className="vt-donde-enlace">
                      Ver todos sus vehículos
                      <ArrowRight className="icono" aria-hidden />
                    </a>
                  )}
                </div>
              </aside>
            </div>
          </div>

          {otras.length > 0 && (
            <section className="fx-otras vt-fila" aria-labelledby="titulo-otras">
              <Carrusel
                deUnoEnUno
                idTitulo="titulo-otras"
                titulo={
                  <div>
                    <p className="vt-rotulo">Ver otras opciones</p>
                    <h2 id="titulo-otras">Más de {v.automotora.nombre}</h2>
                  </div>
                }
              >
                {otras.map((o, i) => (
                  <li key={o.id}>
                    <Tarjeta v={o} orden={i} />
                  </li>
                ))}
                <li>
                  <a href={inventarioAutomotora} className="vt-fila-final">
                    <span className="vt-fila-final-icono" aria-hidden>
                      <ArrowRight className="icono" />
                    </span>
                    <strong>Ver todo el inventario</strong>
                    {inventario && (
                      <span className="num">
                        {inventario.total} {inventario.total === 1 ? 'vehículo' : 'vehículos'} de{' '}
                        {v.automotora.nombre}
                      </span>
                    )}
                  </a>
                </li>
              </Carrusel>
            </section>
          )}
        </main>
        {/* Teléfonos: precio y WhatsApp siempre a mano (la ficha es larga). */}
        <BarraContactoMovil>
          <div>
            <span className="cta-movil-titulo">{titulo}</span>
            <strong className="num">{precio(v.precio)}</strong>
          </div>
          <BotonWhatsapp href={v.whatsapp}>WhatsApp</BotonWhatsapp>
        </BarraContactoMovil>
      </ProveedorSimulacion>
      {automotora ? <PieVitrina automotora={automotora} base="/" /> : <Pie />}
    </div>
  );
}
