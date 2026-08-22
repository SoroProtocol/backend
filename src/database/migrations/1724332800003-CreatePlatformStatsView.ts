import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlatformStatsView1724332800003 implements MigrationInterface {
  name = 'CreatePlatformStatsView1724332800003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW "platform_stats" AS
      SELECT
        (SELECT COUNT(*) FROM "streams")                        AS total_streams,
        (SELECT COUNT(*) FROM "streams" WHERE status = 'active')    AS active_streams,
        (SELECT COUNT(*) FROM "streams" WHERE status = 'cancelled') AS cancelled_streams,
        (SELECT COUNT(*) FROM "streams" WHERE status = 'completed') AS completed_streams,
        (SELECT COALESCE(SUM(rate_per_second), 0) FROM "streams" WHERE status = 'active') AS total_active_rate,
        (SELECT COUNT(*) FROM "vesting_schedules")              AS total_vesting_schedules,
        (SELECT COUNT(*) FROM "vesting_schedules" WHERE revoked = false) AS active_vesting_schedules,
        (SELECT COALESCE(SUM(total_amount - claimed), 0) FROM "vesting_schedules" WHERE revoked = false) AS total_unvested_amount,
        (SELECT COUNT(*) FROM "webhook_subscriptions" WHERE active = true) AS active_webhook_subscriptions,
        NOW() AS refreshed_at
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_platform_stats_refreshed_at"
        ON "platform_stats" ("refreshed_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS "platform_stats"`);
  }
}
