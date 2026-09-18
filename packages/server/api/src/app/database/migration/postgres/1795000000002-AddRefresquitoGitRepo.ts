import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddRefresquitoGitRepo1795000000002 implements MigrationInterface {
    name = 'AddRefresquitoGitRepo1795000000002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "refresquito_git_repo" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying NOT NULL,
                "remoteUrl" character varying NOT NULL,
                "branch" character varying NOT NULL,
                "branchType" character varying NOT NULL DEFAULT 'DEVELOPMENT',
                "sshPrivateKey" character varying,
                "slug" character varying NOT NULL,
                CONSTRAINT "pk_refresquito_git_repo" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_refresquito_git_repo_project_id" ON "refresquito_git_repo" ("projectId")
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE IF EXISTS "refresquito_git_repo"')
    }
}
