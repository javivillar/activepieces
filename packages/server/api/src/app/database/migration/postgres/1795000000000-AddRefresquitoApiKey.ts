import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddRefresquitoApiKey1795000000000 implements MigrationInterface {
    name = 'AddRefresquitoApiKey1795000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "refresquito_api_key" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying NOT NULL,
                "displayName" character varying NOT NULL,
                "hashedValue" character varying NOT NULL,
                "truncatedValue" character varying NOT NULL,
                "lastUsedAt" character varying,
                CONSTRAINT "pk_refresquito_api_key" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_refresquito_api_key_hashed_value" ON "refresquito_api_key" ("hashedValue")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_refresquito_api_key_platform_id" ON "refresquito_api_key" ("platformId")
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE IF EXISTS "refresquito_api_key"')
    }
}
