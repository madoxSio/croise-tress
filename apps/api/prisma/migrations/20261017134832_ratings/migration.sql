-- CreateTable
CREATE TABLE "ratings" (
    "user_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1200,
    "games_played" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "ratings_rating_idx" ON "ratings"("rating" DESC);

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
