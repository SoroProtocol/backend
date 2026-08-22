import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStreamsTable1724332800000 implements MigrationInterface {
  name = 'CreateStreamsTable1724332800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "streams" (
        "id"                  SERIAL PRIMARY KEY,
        "contract_stream_id"  BIGINT UNIQUE,
        "sender"              VARCHAR(56) NOT NULL,
        "recipient"           VARCHAR(56) NOT NULL,
        "token"               VARCHAR(56) NOT NULL DEFAULT 'native',
        "rate_per_second"     BIGINT NOT NULL DEFAULT 0,
        "start_time"          BIGINT NOT NULL DEFAULT 0,
        "stop_time"           BIGINT NOT NULL DEFAULT 0,
        "withdrawn"           BIGINT NOT NULL DEFAULT 0,
        "status"              VARCHAR(20) NOT NULL DEFAULT 'active',
        "tx_hash"             VARCHAR(64) NOT NULL,
        "created_at"          TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_streams_sender" ON "streams" ("sender")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_streams_recipient" ON "streams" ("recipient")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_streams_status" ON "streams" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_streams_status"`);
    await queryRunner.query(`DROP INDEX "idx_streams_recipient"`);
    await queryRunner.query(`DROP INDEX "idx_streams_sender"`);
    await queryRunner.query(`DROP TABLE "streams"`);
  }
}
