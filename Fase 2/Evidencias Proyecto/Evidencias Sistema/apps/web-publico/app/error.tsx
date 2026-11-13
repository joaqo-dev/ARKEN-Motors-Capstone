'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useEffect } from 'react';

// Error al renderizar una página (p. ej. la API no responde): mensaje claro y
// opción de reintentar. Sin cabecera del marketplace, porque también puede
// aparecer dentro de una vitrina.
export default function ErrorPagina({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  // Vuelve a pedir los datos al servidor (router.refresh) y re-renderiza el segmento.
  const reintentar = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });

  return (
    <div className="mk vt mk-mercado">
      <main className="vt-vacio">
        <p className="vt-rotulo">Sin conexión</p>
        <h1>No pudimos cargar esta página</h1>
        <p>Estamos teniendo problemas para conectarnos. Intenta de nuevo en unos segundos.</p>
        <button type="button" className="boton boton-claro" onClick={reintentar}>
          Reintentar
        </button>
      </main>
    </div>
  );
}
