-- CreateTable
CREATE TABLE "word_lists" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "theme_id" UUID NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "status" "PuzzleStatus" NOT NULL DEFAULT 'draft',
    "rows" JSONB NOT NULL,
    "words" JSONB NOT NULL,
    "mystery" TEXT NOT NULL,
    "mystery_clue" TEXT NOT NULL,
    "estimated_minutes" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "word_lists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "word_lists_slug_key" ON "word_lists"("slug");

-- CreateIndex
CREATE INDEX "word_lists_theme_id_status_difficulty_idx" ON "word_lists"("theme_id", "status", "difficulty");

-- CreateIndex
CREATE INDEX "word_lists_status_difficulty_idx" ON "word_lists"("status", "difficulty");

-- AddForeignKey
ALTER TABLE "word_lists" ADD CONSTRAINT "word_lists_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
