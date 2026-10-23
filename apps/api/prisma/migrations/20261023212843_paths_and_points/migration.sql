-- CreateEnum
CREATE TYPE "PointReason" AS ENUM ('welcome', 'puzzle_completed', 'no_hint_bonus', 'path_step', 'path_completed', 'daily_challenge', 'match_result', 'hint_purchase');

-- CreateTable
CREATE TABLE "paths" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "status" "PuzzleStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "paths_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "path_steps" (
    "path_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "title" TEXT NOT NULL,
    "puzzle_id" UUID NOT NULL,

    CONSTRAINT "path_steps_pkey" PRIMARY KEY ("path_id","position")
);

-- CreateTable
CREATE TABLE "wallets" (
    "user_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "earned" INTEGER NOT NULL DEFAULT 0,
    "spent" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "point_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reason" "PointReason" NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "paths_slug_key" ON "paths"("slug");

-- CreateIndex
CREATE INDEX "paths_status_sort_order_idx" ON "paths"("status", "sort_order");

-- CreateIndex
CREATE INDEX "path_steps_puzzle_id_idx" ON "path_steps"("puzzle_id");

-- CreateIndex
CREATE UNIQUE INDEX "path_steps_path_id_puzzle_id_key" ON "path_steps"("path_id", "puzzle_id");

-- CreateIndex
CREATE INDEX "point_transactions_user_id_id_idx" ON "point_transactions"("user_id", "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "point_transactions_user_id_idempotency_key_key" ON "point_transactions"("user_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "path_steps" ADD CONSTRAINT "path_steps_path_id_fkey" FOREIGN KEY ("path_id") REFERENCES "paths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_steps" ADD CONSTRAINT "path_steps_puzzle_id_fkey" FOREIGN KEY ("puzzle_id") REFERENCES "puzzles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Règles d'intégrité garanties par la base, même si un service se trompe :
-- solde et totaux jamais négatifs, aucune écriture de montant nul, étapes numérotées à partir de 1.
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_non_negative" CHECK ("balance" >= 0 AND "earned" >= 0 AND "spent" >= 0);
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_amount_non_zero" CHECK ("amount" <> 0 AND "balance_after" >= 0);
ALTER TABLE "path_steps" ADD CONSTRAINT "path_steps_position_positive" CHECK ("position" >= 1);
