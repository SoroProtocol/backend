import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlatformStatsRefresh1724332800005 implements MigrationInterface {
  name = 'AddPlatformStatsRefresh1724332800005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Function to refresh the materialized view
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION refresh_platform_stats()
      RETURNS void AS $$
      BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY "platform_stats";
      END;
      $$ language 'plpgsql';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION IF EXISTS refresh_platform_stats`);
  }
}
