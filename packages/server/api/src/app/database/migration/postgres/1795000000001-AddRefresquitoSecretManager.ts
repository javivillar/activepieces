import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddRefresquitoSecretManager1795000000001 implements MigrationInterface {
    name = 'AddRefresquitoSecretManager1795000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "refresquito_secret_manager" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying NOT NULL,
                "name" character varying NOT NULL,
                "namespace" character varying NOT NULL,
                "secretName" character varying NOT NULL,
                "scope" character varying NOT NULL,
                "projectIds" jsonb,
                CONSTRAINT "pk_refresquito_secret_manager" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_refresquito_secret_manager_platform_id" ON "refresquito_secret_manager" ("platformId")
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE IF EXISTS "refresquito_secret_manager"')
    }
}
