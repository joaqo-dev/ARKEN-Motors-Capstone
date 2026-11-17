import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from './pool';

// Helper de BEGIN/COMMIT/ROLLBACK. Los Services lo usan para operaciones
// multi-tabla y pasan el `client` recibido a cada método de Repository.
@Injectable()
export class TransactionRunner {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async run<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
