import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUpdatedAtTriggers1724332800004 implements MigrationInterface {
  name = 'AddUpdatedAtTriggers1724332800004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Function to update updated_at on row modification
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Apply trigger to streams
    await queryRunner.query(`
      CREATE TRIGGER update_streams_updated_at
        BEFORE UPDATE ON "streams"
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // Apply trigger to vesting_schedules
    await queryRunner.query(`
      CREATE TRIGGER update_vesting_schedules_updated_at
        BEFORE UPDATE ON "vesting_schedules"
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_vesting_schedules_updated_at ON "vesting_schedules"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_streams_updated_at ON "streams"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_updated_at_column`);
  }
}
