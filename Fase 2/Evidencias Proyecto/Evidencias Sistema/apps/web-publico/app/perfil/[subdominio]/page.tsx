import { Mail, MessageCircle, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Filtros } from '../../../components/filtros';
import { Listado } from '../../../components/listado';
import { Carrusel } from '../../../components/marketplace/carrusel';
import { FormularioContacto } from '../../../components/vitrina/formulario-contacto';
import { AnclaInicial } from '../../../components/vitrina/ancla-inicial';
import { NavVitrina, PieVitrina, telefonoHref } from '../../../components/vitrina/marco';
import { Sucursales } from '../../../components/vitrina/sucursales';
import { formatearTelefono } from '@vitriauto/shared-types';
import { etiqueta } from '../../../lib/formato';
import { api, paramsBusqueda, type Busqueda } from '../../../lib/api';
import { urlArchivo, urlPerfil } from '../../../lib/config';
import { descripcionAutomotora, jsonLdAutomotora, tituloAutomotora } from '../../../lib/seo';

type Props = { params: Promise<{ subdominio: string }>; searchParams: Promise<Busqueda> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const a = await api.automotora((await params).subdominio);
  if (!a) return {};
  const filtrada = Object.values(await searchParams).some(Boolean);
  const url = `${urlPerfil(a.subdominio)}/`;
  const titulo = tituloAutomotora(a);
  const descripcion = descripcionAutomotora(a);
  const imagen = urlArchivo(a.bannerUrl) ?? urlArchivo(a.logoUrl);
  const logo = urlArchivo(a.logoUrl);
  return {
    title: { absolute: titulo },
    description: descripcion,
    // Una sola URL oficial por automotora: sin filtros y en su subdominio
    // (también se llega por /perfil/<subdominio> del dominio raíz).
    alternates: { canonical: url },
    // Con filtros es la misma página: se sigue pero no se indexa aparte.
    robots: filtrada ? { index: false, follow: true } : undefined,
    // Vista previa al compartir el enlace (WhatsApp, redes).
    openGraph: {
      type: 'website',
      url,
      siteName: a.nombre,
      locale: 'es_CL',
      title: titulo,
      description: descripcion,
      images: imagen ? [imagen] : undefined,
    },
    twitter: { card: imagen ? 'summary_large_image' : 'summary' },
    icons: logo ? { icon: logo, apple: logo } : undefined,
  };
}

// Vitrina de una automotora: su identidad (banner, logo, nombre), el
// inventario de todas sus sucursales con filtros, "Encuéntranos" y contacto.
// Se sirve en <subdominio>.<dominio raíz>/ (ver middleware.ts).
export default async function PerfilPage({ params, searchParams }: Props) {
  const { subdominio } = await params;
  const busqueda = await searchParams;
  const automotora = await api.automotora(subdominio);
  if (!automotora) notFound();

  // Con filtros aplicados, el total de la vitrina se consulta aparte.
  const conFiltros = Object.keys(busqueda).some((k) => k !== 'orden' && k !== 'pagina');
  const [resultado, filtros, todos, filtrosTodos] = await Promise.all([
    api.buscar(paramsBusqueda(busqueda, { subdominio })),
    api.filtros(paramsBusqueda({}, { subdominio, marca: busqueda.marca })),
    // Inventario completo (para los totales y las fotos de las categorías),
    // si el listado está filtrado, reordenado o paginado.
    conFiltros || busqueda.orden || busqueda.pagina
      ? api.buscar(paramsBusqueda({}, { subdominio }))
      : null,
    // Categorías con su conteo completo, aunque haya una marca elegida.
    busqueda.marca ? api.filtros(paramsBusqueda({}, { subdominio })) : null,
  ]);
  const banner = urlArchivo(automotora.bannerUrl);
  const { sucursales } = automotora;
  const principal = sucursales[0]; // la API las ordena con la principal primero
  const comunas = [...new Set(sucursales.map((s) => s.comuna))];
  const inventario = todos ?? resultado;
  // Categorías para la fila de tipos, con la foto del primer vehículo de cada una.
  const fotoDe = (categoria: string) =>
    urlArchivo(
      inventario?.items.find((v) => v.fotoPortada && v.categoria === categoria)?.fotoPortada ??
        null,
    );
  const categorias = (filtrosTodos ?? filtros)?.categorias ?? [];

  return (
    <div className="mk mk-vitrina vt">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdAutomotora(automotora) }}
      />
      {/* Fija (se esconde al bajar): fuera del hero, que aísla su apilamiento. */}
      <NavVitrina automotora={automotora} />
      <header className="vt-hero">
        <div
          className={`vt-hero-fondo${banner ? '' : ' sin-banner'}`}
          style={banner ? { backgroundImage: `url(${banner})` } : undefined}
          aria-hidden
        />

        <div className="vt-hero-contenido" id="inicio">
          <div className="vt-hero-texto">
            <p className="vt-rotulo">Automotora en {comunas.join(' y ')}</p>
            <h1>{automotora.nombre}</h1>
            {automotora.descripcion && <p className="vt-hero-bajada">{automotora.descripcion}</p>}
            <div className="vt-hero-acciones">
              <a href="#vehiculos" className="boton boton-claro">
                Ver vehículos
              </a>
              {principal && (
                <a
                  href={principal.whatsapp}
                  className="boton boton-vidrio"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="icono" aria-hidden />
                  Escríbenos por WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <main>
        {categorias.length > 1 && (
          <section className="vt-seccion vt-tipos" aria-labelledby="titulo-tipos">
            <Carrusel
              idTitulo="titulo-tipos"
              titulo={
                <div>
                  <p className="vt-rotulo">Categorías</p>
                  <h2 id="titulo-tipos">Busca por tipo de vehículo</h2>
                </div>
              }
            >
              {categorias.map((c) => {
                const foto = fotoDe(c.valor);
                return (
                  <li key={c.valor}>
                    <Link
                      href={`/?categoria=${encodeURIComponent(c.valor)}#vehiculos`}
                      className="vt-tipo"
                      aria-current={busqueda.categoria === c.valor ? 'true' : undefined}
                    >
                      {foto ? (
                        <img src={foto} alt="" loading="lazy" />
                      ) : (
                        <span className="vt-tipo-vacio" />
                      )}
                      <span className="vt-tipo-texto">
                        <strong>{etiqueta(c.valor)}</strong>
                        <span className="num">{c.cantidad}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </Carrusel>
          </section>
        )}

        <section
          className="vt-seccion vt-inventario"
          id="vehiculos"
          aria-labelledby="titulo-vehiculos"
        >
          <div className="vt-encabezado">
            <div>
              <p className="vt-rotulo">Inventario</p>
              <h2 id="titulo-vehiculos">Nuestros vehículos</h2>
              <p className="vt-bajada">
                Inventario actualizado de{' '}
                {sucursales.length > 1 ? 'todas nuestras sucursales' : 'nuestra sucursal'}. Filtra y
                encuentra el que buscas.
              </p>
            </div>
            {resultado && (
              <p className="vt-cifra">
                <span className="num">{resultado.total}</span>
                <small>{conFiltros ? 'con estos filtros' : 'en stock hoy'}</small>
              </p>
            )}
          </div>
          <div className="busqueda">
            {filtros && (
              <Suspense>
                <Filtros filtros={filtros} conUbicacion={false} conSucursal />
              </Suspense>
            )}
            {resultado ? (
              <Listado resultado={resultado} busqueda={busqueda} ruta="/" />
            ) : (
              <p className="vacio">Revisa los filtros: algún valor no es válido.</p>
            )}
          </div>
        </section>

        <section className="v-seccion" id="contacto" aria-labelledby="titulo-contacto">
          <div className="v-contacto v-escenario">
            <div className="v-escenario-texto">
              <p className="vt-rotulo">Contacto</p>
              <h2 id="titulo-contacto">Conversemos</h2>
              <p className="v-seccion-bajada">
                Cotiza un vehículo, consulta por financiamiento o por dejar tu auto en parte de
                pago. Llámanos o déjanos un mensaje y te respondemos a la brevedad.
              </p>
              <ul className="v-canales">
                {sucursales.map((s) => (
                  <li key={s.id}>
                    <a href={telefonoHref(s.telefono)} className="v-canal">
                      <span className="v-canal-icono" aria-hidden>
                        <Phone className="icono" />
                      </span>
                      <span>
                        <small>{sucursales.length > 1 ? s.nombre : 'Teléfono'}</small>
                        <strong>{formatearTelefono(s.telefono)}</strong>
                      </span>
                    </a>
                  </li>
                ))}
                <li>
                  <a href={`mailto:${automotora.email}`} className="v-canal">
                    <span className="v-canal-icono" aria-hidden>
                      <Mail className="icono" />
                    </span>
                    <span>
                      <small>Correo</small>
                      <strong>{automotora.email}</strong>
                    </span>
                  </a>
                </li>
              </ul>
            </div>
            <div className="v-formulario">
              <FormularioContacto
                subdominio={automotora.subdominio}
                sucursales={sucursales.map((s) => ({ id: s.id, nombre: s.nombre }))}
              />
            </div>
          </div>
        </section>

        <section className="v-seccion" id="sucursales" aria-labelledby="titulo-sucursales">
          <div className="v-seccion-encabezado">
            <div>
              <p className="vt-rotulo">{sucursales.length > 1 ? 'Sucursales' : 'Ubicación'}</p>
              <h2 id="titulo-sucursales">
                {sucursales.length > 1 ? 'Encuéntranos' : 'Dónde estamos'}
              </h2>
              <p className="v-seccion-bajada">
                {sucursales.length > 1
                  ? 'Cada vehículo indica en qué sucursal está. Ven a verlo cuando quieras.'
                  : 'Te esperamos para que veas y pruebes el vehículo que te interesa.'}
              </p>
            </div>
          </div>
          <Sucursales sucursales={sucursales} />
        </section>
      </main>

      <PieVitrina automotora={automotora} />
      <AnclaInicial />
    </div>
  );
}
