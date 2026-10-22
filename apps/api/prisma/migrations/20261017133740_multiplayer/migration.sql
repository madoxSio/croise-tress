-- CreateEnum
CREATE TYPE "MatchMode" AS ENUM ('quick', 'private');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('waiting', 'active', 'finished', 'aborted');

-- CreateEnum
CREATE TYPE "MatchResult" AS ENUM ('win', 'loss', 'draw');

-- CreateTable
CREATE TABLE "match_queue" (
    "user_id" UUID NOT NULL,
    "mode" "MatchMode" NOT NULL DEFAULT 'quick',
    "enqueued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_queue_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" UUID NOT NULL,
    "mode" "MatchMode" NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'waiting',
    "puzzle_id" UUID NOT NULL,
    "invite_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "deadline_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "end_reason" TEXT,
    "winner_id" UUID,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_participants" (
    "match_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "slot" SMALLINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "solved_words" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_solved_at" TIMESTAMPTZ(3),
    "disconnected_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "result" "MatchResult",

    CONSTRAINT "match_participants_pkey" PRIMARY KEY ("match_id","user_id")
);

-- CreateTable
CREATE TABLE "match_events" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "client_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_queue_mode_enqueued_at_idx" ON "match_queue"("mode", "enqueued_at");

-- CreateIndex
CREATE UNIQUE INDEX "matches_invite_code_key" ON "matches"("invite_code");

-- CreateIndex
CREATE INDEX "matches_status_deadline_at_idx" ON "matches"("status", "deadline_at");

-- CreateIndex
CREATE INDEX "match_participants_user_id_idx" ON "match_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_participants_match_id_slot_key" ON "match_participants"("match_id", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "match_events_match_id_user_id_client_event_id_key" ON "match_events"("match_id", "user_id", "client_event_id");

-- AddForeignKey
ALTER TABLE "match_queue" ADD CONSTRAINT "match_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_puzzle_id_fkey" FOREIGN KEY ("puzzle_id") REFERENCES "puzzles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un joueur ne peut participer qu'à un seul match non terminé à la fois.
CREATE UNIQUE INDEX "match_participants_one_active" ON "match_participants" ("user_id") WHERE "active";
-- Un match privé en attente garde son code ; un match démarré n'en a plus.
ALTER TABLE "matches" ADD CONSTRAINT "matches_active_has_deadline" CHECK ("status" <> 'active' OR ("started_at" IS NOT NULL AND "deadline_at" IS NOT NULL));
