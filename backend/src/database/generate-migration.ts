/**
 * Developer tool: diffs the entity metadata against an EMPTY scratch database and writes the DDL as a
 * migration file, so the schema SQL is generated from the entities instead of being hand-copied.
 *
 *   GEN_DATABASE_URL=postgres://.../mathportal_gen bun run src/database/generate-migration.ts <Name> <timestamp>
 */
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { entities } from './entities';

const [name, timestamp] = process.argv.slice(2);
const url = process.env.GEN_DATABASE_URL;
if (!name || !timestamp || !url) {
  console.error('Usage: GEN_DATABASE_URL=... bun run src/database/generate-migration.ts <Name> <timestamp>');
  process.exit(1);
}

const ds = new DataSource({
  type: 'postgres',
  url,
  entities,
  synchronize: false,
  uuidExtension: 'pgcrypto',
  installExtensions: false,
});
await ds.initialize();
const { upQueries, downQueries } = await ds.driver.createSchemaBuilder().log();
await ds.destroy();

const literal = (qs: { query: string }[]) => qs.map((q) => `  ${JSON.stringify(q.query)},`).join('\n');
const file = `import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Generated from the entity metadata by src/database/generate-migration.ts. */
const UP: string[] = [
${literal(upQueries)}
];

const DOWN: string[] = [
${literal([...downQueries].reverse())}
];

export class ${name}${timestamp} implements MigrationInterface {
  name = '${name}${timestamp}';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const sql of UP) await queryRunner.query(sql);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const sql of DOWN) await queryRunner.query(sql);
  }
}
`;
const out = new URL(`./migrations/${timestamp}-${name}.ts`, import.meta.url);
writeFileSync(out, file);
console.log(`Wrote ${upQueries.length} statements to ${out.pathname}`);
