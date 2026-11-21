import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PostgresState1763000000003 implements MigrationInterface {
  name = 'PostgresState1763000000003';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE app_state (
        state_key text PRIMARY KEY,
        value jsonb NOT NULL,
        expires_at timestamptz,
        owner_key text
      )`);
    await q.query(`CREATE INDEX app_state_expires_at_idx ON app_state (expires_at) WHERE expires_at IS NOT NULL`);
    await q.query(`CREATE INDEX app_state_owner_key_idx ON app_state (owner_key) WHERE owner_key IS NOT NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE app_state`);
  }
}
