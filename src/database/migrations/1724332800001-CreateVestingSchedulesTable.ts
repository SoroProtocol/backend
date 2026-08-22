import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVestingSchedulesTable1724332800001 implements MigrationInterface {
  name = 'CreateVestingSchedulesTable1724332800001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "vesting_schedules" (
        "id"                    SERIAL PRIMARY KEY,
        "contract_schedule_id"  BIGINT UNIQUE,
        "funder"                VARCHAR(56) NOT NULL,
        "beneficiary"           VARCHAR(56) NOT NULL,
        "token"                 VARCHAR(56) NOT NULL DEFAULT 'native',
        "total_amount"          BIGINT NOT NULL DEFAULT 0,
        "start_time"            BIGINT NOT NULL DEFAULT 0,
        "cliff_time"            BIGINT NOT NULL DEFAULT 0,
        "end_time"              BIGINT NOT NULL DEFAULT 0,
        "claimed"               BIGINT NOT NULL DEFAULT 0,
        "revoked"               BOOLEAN NOT NULL DEFAULT false,
        "tx_hash"               VARCHAR(64) NOT NULL,
        "created_at"            TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_vesting_funder" ON "vesting_schedules" ("funder")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_vesting_beneficiary" ON "vesting_schedules" ("beneficiary")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_vesting_beneficiary"`);
    await queryRunner.query(`DROP INDEX "idx_vesting_funder"`);
    await queryRunner.query(`DROP TABLE "vesting_schedules"`);
  }
}
