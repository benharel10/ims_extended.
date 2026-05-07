/**
 * Migration Script: Move all stock from "nistec" warehouse → "Engs Dairy" warehouse
 *
 * Run with:  npx ts-node -P tsconfig.json --skip-project scripts/migrate-nistec-to-engs-dairy.ts
 *
 * Logic:
 *   - For each ItemStock in nistec:
 *       - If a matching ItemStock already exists in Engs Dairy → add quantities
 *       - If not → reassign the record's warehouseId to Engs Dairy
 *   - Deletes any leftover nistec ItemStock rows after merge
 *   - Also updates Item.warehouse string field if it reads "nistec"
 */

import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

const SOURCE_WAREHOUSE = "nistec";
const TARGET_WAREHOUSE = "Engs-Dairy";

async function main() {
  // ── 1. Resolve warehouse IDs ────────────────────────────────────────────────
  const source = await prisma.warehouse.findFirst({
    where: { name: { equals: SOURCE_WAREHOUSE, mode: "insensitive" } },
  });
  if (!source) throw new Error(`Source warehouse "${SOURCE_WAREHOUSE}" not found.`);

  const target = await prisma.warehouse.findFirst({
    where: { name: { equals: TARGET_WAREHOUSE, mode: "insensitive" } },
  });
  if (!target) throw new Error(`Target warehouse "${TARGET_WAREHOUSE}" not found.`);

  console.log(`Source : [${source.id}] ${source.name}`);
  console.log(`Target : [${target.id}] ${target.name}`);

  // ── 2. Fetch all source stocks ───────────────────────────────────────────────
  const sourceStocks = await prisma.itemStock.findMany({
    where: { warehouseId: source.id },
    include: { item: { select: { sku: true, name: true } } },
  });

  console.log(`\nFound ${sourceStocks.length} item(s) in "${source.name}".\n`);

  if (sourceStocks.length === 0) {
    console.log("Nothing to migrate. Exiting.");
    return;
  }

  // ── 3. Process each stock row inside a transaction ───────────────────────────
  await prisma.$transaction(async (tx) => {
    for (const stock of sourceStocks) {
      const existing = await tx.itemStock.findUnique({
        where: { itemId_warehouseId: { itemId: stock.itemId, warehouseId: target.id } },
      });

      if (existing) {
        // Merge: add quantities
        const merged = new Decimal(existing.quantity.toString()).plus(
          new Decimal(stock.quantity.toString())
        );
        await tx.itemStock.update({
          where: { id: existing.id },
          data: { quantity: merged },
        });
        // Remove the now-merged source row
        await tx.itemStock.delete({ where: { id: stock.id } });
        console.log(
          `  MERGED  [${stock.item.sku}] ${stock.item.name}: ` +
          `${existing.quantity} + ${stock.quantity} → ${merged}`
        );
      } else {
        // Reassign: simply move to target warehouse
        await tx.itemStock.update({
          where: { id: stock.id },
          data: { warehouseId: target.id },
        });
        console.log(
          `  MOVED   [${stock.item.sku}] ${stock.item.name}: qty=${stock.quantity}`
        );
      }
    }

    // ── 4. Update Item.warehouse string field (cosmetic field) ─────────────────
    const updatedItems = await tx.item.updateMany({
      where: { warehouse: { equals: SOURCE_WAREHOUSE, mode: "insensitive" } },
      data: { warehouse: TARGET_WAREHOUSE },
    });
    console.log(`\nUpdated Item.warehouse string on ${updatedItems.count} item(s).`);
  });

  // ── 5. Verify source is empty ────────────────────────────────────────────────
  const remaining = await prisma.itemStock.count({ where: { warehouseId: source.id } });
  console.log(
    remaining === 0
      ? `\n✅ All done. "${source.name}" is now empty.`
      : `\n⚠️  ${remaining} row(s) still remain in "${source.name}". Check for errors.`
  );
}

main()
  .catch((e) => {
    console.error("\n❌ Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
