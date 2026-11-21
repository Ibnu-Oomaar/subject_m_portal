import 'reflect-metadata';
import { env } from '../config/env';
import { createDataSource } from './data-source';

const direction = process.argv[2] === 'down' ? 'down' : 'up';
const ds = createDataSource(env.DATABASE_URL, env.DB_LOGGING);
await ds.initialize();
try {
  if (direction === 'down') {
    await ds.undoLastMigration({ transaction: 'each' });
    console.log('Reverted the last migration.');
  } else {
    const ran = await ds.runMigrations({ transaction: 'each' });
    console.log(ran.length ? `Applied: ${ran.map((m) => m.name).join(', ')}` : 'Database is up to date.');
  }
} finally {
  await ds.destroy();
}
