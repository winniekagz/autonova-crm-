-- CreateEnum
CREATE TYPE "ContactRole" AS ENUM ('OWNER', 'MANAGER', 'FINANCE', 'TECHNICAL', 'OTHER');

-- AlterTable: optional, so every existing contact stays unassigned rather than guessed.
ALTER TABLE "contacts" ADD COLUMN     "role" "ContactRole";
