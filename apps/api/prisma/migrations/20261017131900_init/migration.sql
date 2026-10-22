-- Extension pour les e-mails et pseudos insensibles à la casse (extension « trusted » depuis PG 13).
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('player', 'admin');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('discovery', 'easy', 'intermediate', 'hard', 'expert');

-- CreateEnum
CREATE TYPE "PuzzleStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "PlayStatus" AS ENUM ('in_progress', 'completed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT,
    "username" CITEXT,
    "password_hash" TEXT,
    "email_verified_at" TIMESTAMPTZ(3),
    "role" "Role" NOT NULL DEFAULT 'player',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "csrf_secret" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puzzles" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "status" "PuzzleStatus" NOT NULL DEFAULT 'draft',
    "width" SMALLINT NOT NULL,
    "height" SMALLINT NOT NULL,
    "grid" JSONB NOT NULL,
    "clues" JSONB NOT NULL,
    "estimated_minutes" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "puzzles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_challenges" (
    "date" DATE NOT NULL,
    "puzzle_id" UUID NOT NULL,

    CONSTRAINT "daily_challenges_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "play_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "puzzle_id" UUID NOT NULL,
    "status" "PlayStatus" NOT NULL DEFAULT 'in_progress',
    "grid" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "cell_checks" INTEGER NOT NULL DEFAULT 0,
    "word_checks" INTEGER NOT NULL DEFAULT 0,
    "letters_revealed" INTEGER NOT NULL DEFAULT 0,
    "words_revealed" INTEGER NOT NULL DEFAULT 0,
    "solution_revealed" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "duration_ms" INTEGER,
    "score" INTEGER,

    CONSTRAINT "play_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "puzzles_slug_key" ON "puzzles"("slug");

-- CreateIndex
CREATE INDEX "puzzles_status_difficulty_theme_idx" ON "puzzles"("status", "difficulty", "theme");

-- CreateIndex
CREATE INDEX "play_sessions_user_id_status_updated_at_idx" ON "play_sessions"("user_id", "status", "updated_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_challenges" ADD CONSTRAINT "daily_challenges_puzzle_id_fkey" FOREIGN KEY ("puzzle_id") REFERENCES "puzzles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_puzzle_id_fkey" FOREIGN KEY ("puzzle_id") REFERENCES "puzzles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariants protégés par la base, même en cas de requêtes concurrentes.
CREATE UNIQUE INDEX "play_sessions_one_in_progress" ON "play_sessions" ("user_id", "puzzle_id") WHERE "status" = 'in_progress';
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_size_check" CHECK ("width" BETWEEN 3 AND 25 AND "height" BETWEEN 3 AND 25);
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_estimated_minutes_check" CHECK ("estimated_minutes" > 0);
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_counters_check" CHECK ("revision" >= 0 AND "cell_checks" >= 0 AND "word_checks" >= 0 AND "letters_revealed" >= 0 AND "words_revealed" >= 0);
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_completion_check" CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL AND "duration_ms" IS NOT NULL AND "score" IS NOT NULL));
