import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_CONFIG, AppConfig } from '../config/env';
import { PG_POOL } from './pool';
import { TransactionRunner } from './transaction';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new Pool({ connectionString: config.DATABASE_URL }),
    },
    TransactionRunner,
  ],
  exports: [PG_POOL, TransactionRunner],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
