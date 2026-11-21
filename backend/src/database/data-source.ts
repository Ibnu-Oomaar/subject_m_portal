import { DataSource, type DataSourceOptions } from 'typeorm';
import { entities } from './entities';
import { migrations } from './migrations';

export function buildDataSourceOptions(url: string, logging = false): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities,
    migrations,
    // The schema is owned by migrations, never by synchronize.
    synchronize: false,
    migrationsRun: false,
    // gen_random_uuid() is built in since PostgreSQL 13, so no extension needs installing.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    logging,
    extra: { max: 20, idleTimeoutMillis: 30_000 },
  };
}

export function createDataSource(url: string, logging = false): DataSource {
  return new DataSource(buildDataSourceOptions(url, logging));
}
