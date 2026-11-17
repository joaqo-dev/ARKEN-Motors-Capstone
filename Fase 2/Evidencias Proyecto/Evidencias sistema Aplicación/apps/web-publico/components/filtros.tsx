'use client';

import { Check, Search, SlidersHorizontal, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { FiltrosDisponibles } from '../lib/api';
import { etiqueta } from '../lib/formato';
import { RangoDeslizable } from './rango-deslizable';
import { Selector } from './selector';

type Opcion = { valor: string; texto: string; cantidad: number };

// Lista de opciones de un solo valor: marcar la activa la quita.
function Opciones({
  titulo,
  opciones,
  activa,
  onElegir,
}: {
  titulo: string;
  opciones: Opcion[];
  activa: string;
  onElegir: (valor: string) => void;
}) {
  if (opciones.length === 0) return null;
  return (
    <div className="filtro-grupo" role="group" aria-label={titulo}>
      <span className="filtro-titulo">{titulo}</span>
      <ul className="opciones">
        {opciones.map((o) => {
          const marcada = o.valor === activa;
          return (
            <li key={o.valor}>
              <button
                type="button"
                className="opcion"
                aria-pressed={marcada}
                onClick={() => onElegir(marcada ? '' : o.valor)}
              >
                <span className="opcion-marca" aria-hidden>
                  <Check />
                </span>
                <span className="opcion-texto">{o.texto}</span>
                <span className="opcion-cantidad">{o.cantidad}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Filtros dinámicos: solo se ofrecen valores presentes en el inventario publicado.
// Cada cambio actualiza la URL (compartible) y el servidor vuelve a renderizar.
export function Filtros({
  filtros,
  conUbicacion,
  conSucursal,
}: {
  filtros: FiltrosDisponibles;
  conUbicacion: boolean;
  conSucursal: boolean;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [cargando, iniciar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  // Filtros activos (sin contar orden ni página), para el botón en móvil.
  const activos = [...params.keys()].filter((k) => k !== 'orden' && k !== 'pagina').length;

  const valor = (clave: string) => params.get(clave) ?? '';

  const cambiar = (cambios: Record<string, string>) => {
    const nuevos = new URLSearchParams(params);
    for (const [clave, v] of Object.entries(cambios)) {
      if (v) nuevos.set(clave, v);
      else nuevos.delete(clave);
    }
    nuevos.delete('pagina'); // cualquier filtro nuevo vuelve a la primera página
    iniciar(() => router.push(`${ruta}?${nuevos}`, { scroll: false }));
  };

  // Rango con manillas (solo si hay más de un valor distinto en el inventario).
  const rango = (
    titulo: string,
    limites: { min: number | null; max: number | null },
    claves: [string, string],
    opciones: { paso: number; prefijo?: string; sufijo?: string; conMiles?: boolean },
  ) =>
    limites.min !== null && limites.max !== null && limites.min < limites.max ? (
      <RangoDeslizable
        titulo={titulo}
        limites={{ min: limites.min, max: limites.max }}
        desdeUrl={valor(claves[0])}
        hastaUrl={valor(claves[1])}
        onAplicar={(desde, hasta) =>
          cambiar({ [claves[0]]: desde?.toString() ?? '', [claves[1]]: hasta?.toString() ?? '' })
        }
        {...opciones}
      />
    ) : null;

  const conEtiqueta = (lista: { valor: string; cantidad: number }[]) =>
    lista.map((o) => ({ ...o, texto: etiqueta(o.valor) }));
  const { rangos } = filtros;

  return (
    <aside className="filtros" aria-busy={cargando} data-abierto={abierto} aria-label="Filtros">
      <button
        type="button"
        className="alternar-filtros"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
      >
        {abierto ? (
          <X className="icono" aria-hidden />
        ) : (
          <SlidersHorizontal className="icono" aria-hidden />
        )}
        {abierto ? 'Ocultar filtros' : `Filtrar${activos ? ` (${activos})` : ''}`}
      </button>
      <div className="filtros-plegable">
        <div className="filtros-cuerpo">
          <form
            className="filtro-grupo"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              cambiar({ q: new FormData(e.currentTarget).get('q') as string });
            }}
          >
            <label htmlFor="q" className="filtro-titulo">
              Buscar
            </label>
            <div className="buscador">
              <Search className="icono" aria-hidden />
              <input
                key={valor('q')}
                id="q"
                name="q"
                type="search"
                className="control"
                placeholder="Marca, modelo o versión"
                defaultValue={valor('q')}
              />
            </div>
          </form>

          {conSucursal && filtros.sucursales.length > 1 && (
            <Opciones
              titulo="Sucursal"
              opciones={filtros.sucursales.map((s) => ({
                valor: s.id,
                texto: s.nombre,
                cantidad: s.cantidad,
              }))}
              activa={valor('sucursalId')}
              onElegir={(v) => cambiar({ sucursalId: v })}
            />
          )}

          <Opciones
            titulo="Tipo"
            opciones={conEtiqueta(filtros.categorias)}
            activa={valor('categoria')}
            onElegir={(v) => cambiar({ categoria: v })}
          />

          <Opciones
            titulo="Marca"
            opciones={conEtiqueta(filtros.marcas)}
            activa={valor('marca')}
            onElegir={(v) => cambiar({ marca: v, modelo: '' })}
          />

          {valor('marca') && (
            <Opciones
              titulo="Modelo"
              opciones={conEtiqueta(filtros.modelos)}
              activa={valor('modelo')}
              onElegir={(v) => cambiar({ modelo: v })}
            />
          )}

          <Opciones
            titulo="Transmisión"
            opciones={conEtiqueta(filtros.transmisiones)}
            activa={valor('transmision')}
            onElegir={(v) => cambiar({ transmision: v })}
          />

          {conUbicacion && (
            <>
              <Opciones
                titulo="Región"
                opciones={filtros.regiones.map((r) => ({
                  valor: r.codigo,
                  texto: r.nombre,
                  cantidad: r.cantidad,
                }))}
                activa={valor('region')}
                onElegir={(v) => cambiar({ region: v, comuna: '' })}
              />
              {valor('region') && (
                <Opciones
                  titulo="Comuna"
                  opciones={conEtiqueta(filtros.comunas)}
                  activa={valor('comuna')}
                  onElegir={(v) => cambiar({ comuna: v })}
                />
              )}
            </>
          )}

          {rango('Precio', rangos.precio, ['precioMin', 'precioMax'], {
            paso: 100_000,
            prefijo: '$',
          })}
          {rango('Año', rangos.anio, ['anioMin', 'anioMax'], { paso: 1, conMiles: false })}
          {rango('Kilometraje', rangos.kilometraje, ['kmMin', 'kmMax'], {
            paso: 1_000,
            sufijo: 'km',
          })}

          {activos > 0 && (
            <button
              type="button"
              className="boton boton-contorno boton-chico limpiar"
              onClick={() => iniciar(() => router.push(ruta, { scroll: false }))}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

const ORDENES = [
  { valor: 'recientes', texto: 'Más recientes' },
  { valor: 'precio_asc', texto: 'Menor precio' },
  { valor: 'precio_desc', texto: 'Mayor precio' },
  { valor: 'anio_desc', texto: 'Más nuevos' },
  { valor: 'anio_asc', texto: 'Más antiguos' },
  { valor: 'km_asc', texto: 'Menos kilómetros' },
  { valor: 'km_desc', texto: 'Más kilómetros' },
];

export function Orden() {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  return (
    <Selector
      etiqueta="Ordenar"
      opciones={ORDENES}
      valor={params.get('orden') ?? 'recientes'}
      onCambiar={(orden) => {
        const nuevos = new URLSearchParams(params);
        nuevos.set('orden', orden);
        nuevos.delete('pagina');
        router.push(`${ruta}?${nuevos}`, { scroll: false });
      }}
    />
  );
}
