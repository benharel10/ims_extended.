-- Migration: add_reliability_fields
-- Adds soft delete, optimistic concurrency, and SystemError logging table
-- All changes are ADDITIVE -- no data loss

-- Soft delete columns
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "BOM" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- SystemError table for error logging
CREATE TABLE IF NOT EXISTS "SystemError" (
    "id" SERIAL NOT NULL,
    "context" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemError_pkey" PRIMARY KEY ("id")
);

-- SystemLog table (if it doesn't exist from the init migration)
CREATE TABLE IF NOT EXISTS "SystemLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" INTEGER,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- Ensure leadTimeDays on PurchaseOrder exists
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "leadTimeDays" INTEGER;

-- Ensure newItemName and newItemSku on POLine exist
ALTER TABLE "POLine" ADD COLUMN IF NOT EXISTS "newItemName" TEXT;
ALTER TABLE "POLine" ADD COLUMN IF NOT EXISTS "newItemSku" TEXT;
