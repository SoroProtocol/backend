import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWebhookSubscriptionsTable1724332800002 implements MigrationInterface {
  name = 'CreateWebhookSubscriptionsTable1724332800002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webhook_subscriptions" (
        "id"          SERIAL PRIMARY KEY,
        "address"     VARCHAR(56) NOT NULL,
        "url"         TEXT NOT NULL,
        "events"      TEXT[] NOT NULL DEFAULT '{}',
        "secret"      VARCHAR(128) NOT NULL,
        "active"      BOOLEAN NOT NULL DEFAULT true,
        "created_at"  TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_webhook_address" ON "webhook_subscriptions" ("address")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_webhook_address"`);
    await queryRunner.query(`DROP TABLE "webhook_subscriptions"`);
  }
}
