-- CreateEnum
CREATE TYPE "PuzzleFormat" AS ENUM ('freeform', 'classic');

-- AlterTable
ALTER TABLE "puzzles" ADD COLUMN     "format" "PuzzleFormat" NOT NULL DEFAULT 'freeform';
