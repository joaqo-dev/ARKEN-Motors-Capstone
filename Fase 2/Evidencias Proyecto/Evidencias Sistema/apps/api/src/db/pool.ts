import { Pool, PoolClient, types } from 'pg';

export const PG_POOL = Symbol('PG_POOL');

// Pool o cliente dentro de una transacción: los Repository aceptan ambos.
export type Queryable = Pool | PoolClient;

// DATE (OID 1082) se entrega como texto 'YYYY-MM-DD': convertirlo a Date lo
// interpretaría en la zona horaria local y podría correr los vencimientos un día.
types.setTypeParser(types.builtins.DATE, (valor) => valor);
