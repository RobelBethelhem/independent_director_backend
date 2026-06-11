import 'reflect-metadata';
import { DataSource } from 'typeorm';
import configuration from '../config/configuration';

/**
 * Standalone DataSource used by the TypeORM CLI for migrations.
 * The runtime app configures TypeORM via TypeOrmModule in app.module.ts.
 */
const cfg = configuration();

export default new DataSource({
  type: 'postgres',
  url: cfg.database.url,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: cfg.database.logging,
});
