'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import type { FiltrosDisponibles } from '../../lib/api';
import { etiqueta, precio } from '../../lib/formato';
import { Selector } from '../selector';

// Topes de "precio máximo" que calzan con el inventario publicado.
function topesDePrecio(max: number | null): number[] {
  if (!max) return [];
  const topes = [5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100].map((m) => m * 1_000_000);
  const utiles = topes.filter((t) => t < max);
  return [...utiles.slice(-6), Math.ceil(max / 1_000_000) * 1_000_000];
}

// Buscador de la portada: arma la URL de /buscar solo con lo elegido.
export function Buscador({ filtros }: { filtros: FiltrosDisponibles }) {
  const router = useRouter();
  const [buscando, iniciar] = useTransition();
  const [q, setQ] = useState('');
  const [marca, setMarca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [region, setRegion] = useState('');
  const [precioMax, setPrecioMax] = useState('');

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [clave, valor] of Object.entries({
      q: q.trim(),
      marca,
      categoria,
      region,
      precioMax,
    })) {
      if (valor) params.set(clave, valor);
    }
    iniciar(() => router.push(`/buscar${params.size ? `?${params}` : ''}`));
  };

  return (
    <form className="m-buscador" onSubmit={buscar} role="search">
      <div className="m-buscador-campo m-buscador-texto">
        <label htmlFor="buscador-q">Qué buscas</label>
        <div className="buscador">
          <Search className="icono" aria-hidden />
          <input
            id="buscador-q"
            className="control"
            placeholder="Marca, modelo o versión"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="m-buscador-campo">
        <label htmlFor="buscador-marca">Marca</label>
        <Selector
          id="buscador-marca"
          valor={marca}
          onCambiar={setMarca}
          opciones={[
            { valor: '', texto: 'Todas' },
            ...filtros.marcas.map((m) => ({ valor: m.valor, texto: m.valor })),
          ]}
        />
      </div>
      <div className="m-buscador-campo">
        <label htmlFor="buscador-tipo">Tipo</label>
        <Selector
          id="buscador-tipo"
          valor={categoria}
          onCambiar={setCategoria}
          opciones={[
            { valor: '', texto: 'Todos' },
            ...filtros.categorias.map((c) => ({ valor: c.valor, texto: etiqueta(c.valor) })),
          ]}
        />
      </div>
      <div className="m-buscador-campo">
        <label htmlFor="buscador-region">Región</label>
        <Selector
          id="buscador-region"
          valor={region}
          onCambiar={setRegion}
          opciones={[
            { valor: '', texto: 'Todo Chile' },
            ...filtros.regiones.map((r) => ({ valor: r.codigo, texto: r.nombre })),
          ]}
        />
      </div>
      <div className="m-buscador-campo">
        <label htmlFor="buscador-precio">Precio hasta</label>
        <Selector
          id="buscador-precio"
          valor={precioMax}
          onCambiar={setPrecioMax}
          opciones={[
            { valor: '', texto: 'Sin límite' },
            ...topesDePrecio(filtros.rangos.precio.max).map((t) => ({
              valor: String(t),
              texto: precio(t),
            })),
          ]}
        />
      </div>
      <button type="submit" className="boton m-buscador-boton" disabled={buscando}>
        <Search className="icono" aria-hidden />
        {buscando ? 'Buscando…' : 'Buscar'}
      </button>
    </form>
  );
}
