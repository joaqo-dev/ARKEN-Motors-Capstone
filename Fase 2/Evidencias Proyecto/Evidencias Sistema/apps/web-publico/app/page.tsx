import type { Metadata } from 'next';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { Cabecera } from '../components/cabecera';
import { Tarjeta } from '../components/listado';
import { Buscador } from '../components/marketplace/buscador';
import { Carrusel } from '../components/marketplace/carrusel';
import { HeroPortada } from '../components/marketplace/hero';
import { Pie } from '../components/pie';
import { api, paramsBusqueda } from '../lib/api';
import { config, urlArchivo } from '../lib/config';
import { etiqueta, precio } from '../lib/formato';

const miles = new Intl.NumberFormat('es-CL');
const plural = (n: number, uno: string, varios: string) =>
  `${miles.format(n)} ${n === 1 ? uno : varios}`;

export const metadata: Metadata = { alternates: { canonical: '/' } };

// Portada del marketplace: buscador, lo recién publicado y accesos por marca,
// tipo y región. Todo sale del inventario publicado: si una sección no tiene
// datos, no se muestra.
export default async function PortadaPage() {
  const [recientes, filtros, automotoras] = await Promise.all([
    api.buscar(paramsBusqueda({ orden: 'recientes' })),
    api.filtros(new URLSearchParams()),
    api.directorio(),
  ]);
  // Una foto por tipo de vehículo (el más reciente de cada uno).
  const tipos = await Promise.all(
    (filtros?.categorias ?? []).map(async (c) => {
      const r = await api.buscar(paramsBusqueda({ categoria: c.valor }));
      return { ...c, foto: r?.items.find((v) => v.fotoPortada)?.fotoPortada ?? null };
    }),
  );

  const total = recientes?.total ?? 0;
  const conFoto = (recientes?.items ?? []).filter((v) => v.fotoPortada);
  // El hero abre con autos (las motos van al final).
  const paraHero = [
    ...conFoto.filter((v) => v.categoria !== 'MOTO'),
    ...conFoto.filter((v) => v.categoria === 'MOTO'),
  ];
  const diapositivas = paraHero.slice(0, 4).map((v) => ({
    id: v.id,
    foto: urlArchivo(v.fotoPortada)!,
    titulo: `${v.marca} ${v.modelo}`,
    detalle: `${v.anio} · ${precio(v.precio)}`,
  }));
  const cantidadAutomotoras = automotoras?.length ?? 0;
  const cantidadRegiones = filtros?.regiones.length ?? 0;
  // Foto de la invitación: un auto del inventario que no esté en el hero.
  const fotoInvitacion = urlArchivo(
    paraHero.at(diapositivas.length)?.fotoPortada ?? paraHero.at(-1)?.fotoPortada ?? null,
  );

  return (
    <div className="mk vt mk-mercado">
      <HeroPortada diapositivas={diapositivas}>
        <Cabecera activa="inicio" sobreImagen />
        <div className="mk-hero-contenido">
          <h1>Encuentra tu próximo auto</h1>
          <p>
            {total > 0
              ? `${plural(total, 'vehículo', 'vehículos')} de ${plural(cantidadAutomotoras, 'automotora', 'automotoras')} en ${plural(cantidadRegiones, 'región', 'regiones')} de Chile. Sin registrarte y con WhatsApp directo a la sucursal.`
              : 'Autos publicados por automotoras de todo Chile, con WhatsApp directo a la sucursal.'}
          </p>
          <div className="mk-hero-acciones">
            <Link href="/buscar" className="boton boton-claro">
              Ver vehículos
              <ArrowRight className="icono" aria-hidden />
            </Link>
          </div>
        </div>
      </HeroPortada>

      <main>
        {filtros && (
          <div className="mk-buscador">
            <Buscador filtros={filtros} />
          </div>
        )}

        {tipos.length > 0 && (
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
              {tipos.map((t) => (
                <li key={t.valor}>
                  <Link href={`/buscar?categoria=${t.valor}`} className="vt-tipo">
                    {t.foto ? (
                      <img src={urlArchivo(t.foto)!} alt="" loading="lazy" />
                    ) : (
                      <span className="vt-tipo-vacio" />
                    )}
                    <span className="vt-tipo-texto">
                      <strong>{etiqueta(t.valor)}</strong>
                      <span className="num">{miles.format(t.cantidad)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </Carrusel>
          </section>
        )}

        {recientes && recientes.items.length > 0 && (
          <section className="vt-seccion vt-inventario" aria-labelledby="titulo-recientes">
            <div className="vt-encabezado vt-encabezado-centro">
              <div>
                <p className="vt-rotulo">Destacados</p>
                <h2 id="titulo-recientes">Recién publicados</h2>
                <p className="vt-bajada">Lo último que subieron las automotoras a su inventario.</p>
              </div>
            </div>
            <div className="vt-grilla">
              {recientes.items.slice(0, 6).map((v, i) => (
                <Tarjeta key={v.id} v={v} orden={i} />
              ))}
            </div>
            {total > 6 && (
              <div className="mk-pie-seccion">
                <Link href="/buscar" className="boton boton-contorno">
                  Ver los {miles.format(total)} vehículos
                  <ArrowRight className="icono" aria-hidden />
                </Link>
              </div>
            )}
          </section>
        )}

        {filtros && (filtros.marcas.length > 0 || filtros.regiones.length > 0) && (
          <section className="mk-banda" aria-labelledby="titulo-accesos">
            <div className="mk-banda-interior">
              <div className="mk-encabezado">
                <p className="vt-rotulo">Accesos</p>
                <h2 id="titulo-accesos">Busca a tu manera</h2>
              </div>
              <div className="mk-accesos">
                {filtros.marcas.length > 0 && (
                  <div>
                    <h3>Por marca</h3>
                    <ul className="mk-marcas">
                      {filtros.marcas.map((m) => (
                        <li key={m.valor}>
                          <Link href={`/buscar?marca=${encodeURIComponent(m.valor)}`}>
                            {m.valor}
                            <sup className="num">{m.cantidad}</sup>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {filtros.regiones.length > 0 && (
                  <div>
                    <h3>Por región</h3>
                    <ul className="mk-regiones">
                      {filtros.regiones.map((r) => (
                        <li key={r.codigo}>
                          <Link href={`/buscar?region=${r.codigo}`}>
                            <span>{r.nombre}</span>
                            <span className="num">{r.cantidad}</span>
                            <ArrowUpRight className="icono" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {config.panelUrl && (
          <section className="mk-invitacion" aria-labelledby="titulo-publica">
            {fotoInvitacion && <img src={fotoInvitacion} alt="" loading="lazy" />}
            <div className="mk-invitacion-interior">
              <h2 id="titulo-publica">¿Tienes una automotora?</h2>
              <p>
                Gestiona tu inventario, cotizaciones y ventas en un solo lugar, y obtén tu propia
                página para compartir. Tus autos publicados aparecen aquí automáticamente.
              </p>
              <div className="mk-hero-acciones">
                <a href={`${config.panelUrl}/registro`} className="boton boton-claro">
                  Registra tu automotora
                  <ArrowRight className="icono" aria-hidden />
                </a>
                <a href={`${config.panelUrl}/login`} className="boton boton-vidrio">
                  Ya tengo cuenta
                </a>
              </div>
            </div>
          </section>
        )}
      </main>
      <Pie />
    </div>
  );
}
