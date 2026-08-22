import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWebhookDeliveriesTable1724332800006 implements MigrationInterface {
  name = 'CreateWebhookDeliveriesTable1724332800006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webhook_deliveries" (
        "id"              SERIAL PRIMARY KEY,
        "subscription_id" INTEGER NOT NULL REFERENCES "webhook_subscriptions"("id") ON DELETE CASCADE,
        "event"           VARCHAR(50) NOT NULL,
        "attempt"         INTEGER NOT NULL DEFAULT 0,
        "status"          VARCHAR(10) NOT NULL CHECK("status" IN ('success', 'failed')),
        "http_status"     INTEGER,
        "error"           TEXT,
        "duration_ms"     INTEGER NOT NULL DEFAULT 0,
        "created_at"      TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_webhook_deliveries_subscription_id"
        ON "webhook_deliveries" ("subscription_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_webhook_deliveries_created_at"
        ON "webhook_deliveries" ("created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_webhook_deliveries_created_at"`);
    await queryRunner.query(`DROP INDEX "idx_webhook_deliveries_subscription_id"`);
    await queryRunner.query(`DROP TABLE "webhook_deliveries"`);
  }
}
