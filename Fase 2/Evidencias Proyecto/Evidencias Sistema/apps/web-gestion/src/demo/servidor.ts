import { datos, perfilActual } from './db';
import { fallo, type Contexto, type Manejador } from './comun';
import { rutasAdmin } from './rutas-admin';
import { rutasComercial } from './rutas-comercial';
import { rutasIndicadores } from './indicadores';
import { rutasInventario } from './rutas-inventario';

// "Servidor" de la demo: resuelve método + ruta contra los manejadores en
// memoria, con el usuario del perfil elegido como si viniera del JWT.

interface Ruta {
  metodo: string;
  patron: RegExp;
  claves: string[];
  manejador: Manejador;
}

const rutas: Ruta[] = Object.entries({
  ...rutasAdmin,
  ...rutasInventario,
  ...rutasComercial,
  ...rutasIndicadores,
})
  .map(([definicion, manejador]) => {
    const [metodo, camino] = definicion.split(' ') as [string, string];
    const claves: string[] = [];
    const patron = new RegExp(
      `^${camino.replace(/:(\w+)/g, (_, clave: string) => {
        claves.push(clave);
        return '([^/]+)';
      })}$`,
    );
    return { metodo, patron, claves, manejador };
  })
  // Los segmentos fijos ganan a los parámetros (/vehiculos/sugerencia… antes que /vehiculos/:id).
  .sort((a, b) => a.claves.length - b.claves.length);

export async function atender(metodo: string, ruta: string, body: unknown): Promise<unknown> {
  const url = new URL(ruta, 'http://demo.local');
  const usuario = datos().usuarios.find((u) => u.id === perfilActual());
  if (!usuario || usuario.estado !== 'ACTIVO') throw fallo(401, 'Sesión no válida');
  for (const r of rutas) {
    if (r.metodo !== metodo) continue;
    const m = r.patron.exec(url.pathname);
    if (!m) continue;
    const contexto: Contexto = {
      usuario,
      automotoraId: usuario.automotoraId,
      esGeneral: usuario.rol === 'ADMIN_GENERAL',
      esAdmin: usuario.rol !== 'VENDEDOR',
      params: Object.fromEntries(r.claves.map((k, i) => [k, decodeURIComponent(m[i + 1]!)])),
      query: url.searchParams,
      body,
    };
    return r.manejador(contexto);
  }
  throw fallo(501, 'Esta acción no está disponible en la demo');
}
