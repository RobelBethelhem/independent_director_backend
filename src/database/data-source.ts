import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

/**
 * Standalone DataSource used by the TypeORM CLI for migrations.
 * The runtime app configures TypeORM via TypeOrmModule in app.module.ts.
 *
 * Reads only DATABASE_URL (loaded from .env here) rather than the full app
 * configuration — migrations don't need JWT/storage secrets, and there are no
 * predictable in-code fallbacks for those (see config/configuration.ts).
 */
loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is required to run the migration CLI — set it in .env or the environment.');
}

export default new DataSource({
  type: 'postgres',
  url,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: (process.env.DB_LOGGING ?? '').toLowerCase() === 'true',
});
