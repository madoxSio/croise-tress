-- Catalogue de thèmes : `puzzles.theme` (texte libre) devient une référence vers `themes`.
-- Les grilles existantes sont conservées : chaque ancien libellé devient un sous-thème du
-- thème « Divers », que l'administration pourra ensuite réaffecter.

-- CreateTable
CREATE TABLE "themes" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "parent_id" UUID,
    "skin" TEXT,
    "icon" TEXT,
    "accent" TEXT,
    "accent_alt" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "themes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "themes_slug_key" ON "themes"("slug");

-- CreateIndex
CREATE INDEX "themes_parent_id_sort_order_idx" ON "themes"("parent_id", "sort_order");

-- AddForeignKey
ALTER TABLE "themes" ADD CONSTRAINT "themes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "themes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reprise des données : un sous-thème « Divers » par ancien libellé (aucune ligne si la table est vide).
INSERT INTO "themes" ("id", "slug", "name", "description", "skin", "icon", "accent", "accent_alt", "sort_order", "updated_at")
SELECT gen_random_uuid(), 'divers', 'Divers', 'Grilles en attente de classement.', 'default', '🧩', '#64748B', '#94A3B8', 900, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "puzzles");

INSERT INTO "themes" ("id", "slug", "name", "parent_id", "updated_at")
SELECT gen_random_uuid(),
       'divers-' || left(md5(legacy.theme), 8),
       legacy.theme,
       (SELECT "id" FROM "themes" WHERE "slug" = 'divers'),
       CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "theme" FROM "puzzles") AS legacy;

-- AlterTable
ALTER TABLE "puzzles" ADD COLUMN "theme_id" UUID;

UPDATE "puzzles" AS p
SET "theme_id" = t."id"
FROM "themes" AS t
WHERE t."slug" = 'divers-' || left(md5(p."theme"), 8);

ALTER TABLE "puzzles" ALTER COLUMN "theme_id" SET NOT NULL;

-- DropIndex
DROP INDEX "puzzles_status_difficulty_theme_idx";

-- AlterTable
ALTER TABLE "puzzles" DROP COLUMN "theme";

-- CreateIndex
CREATE INDEX "puzzles_theme_id_status_difficulty_idx" ON "puzzles"("theme_id", "status", "difficulty");

-- CreateIndex
CREATE INDEX "puzzles_status_difficulty_idx" ON "puzzles"("status", "difficulty");

-- AddForeignKey
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
