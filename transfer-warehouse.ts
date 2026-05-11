/**
 * transfer-warehouse.ts
 * ---------------------
 * Moves ALL stock from the "engs-diary" warehouse to the "ksw" warehouse.
 *
 * Strategy (safe):
 *  1. Find both warehouses by name.
 *  2. Load every ItemStock row for engs-diary that has quantity > 0.
 *  3. For each item, UPSERT into ksw (add quantities together if the item
 *     already exists there), then set engs-diary quantity to 0.
 *  4. Recompute item.currentStock = sum of all warehouse stocks.
 *  5. Everything runs inside a single Prisma transaction → if anything
 *     fails the whole thing rolls back automatically.
 *
 * Run in DRY-RUN mode first (default):
 *   npx ts-node --project tsconfig.json transfer-warehouse.ts
 *
 * Run for real:
 *   npx ts-node --project tsconfig.json transfer-warehouse.ts --execute
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SOURCE_WAREHOUSE = 'engs-diary';
const TARGET_WAREHOUSE = 'ksw';
const DRY_RUN = !process.argv.includes('--execute');

async function main() {
    console.log(`\n===== Warehouse Transfer =====`);
    console.log(`  From : ${SOURCE_WAREHOUSE}`);
    console.log(`  To   : ${TARGET_WAREHOUSE}`);
    console.log(`  Mode : ${DRY_RUN ? '⚠️  DRY RUN (no changes will be made)' : '🚀 EXECUTE'}`);
    console.log(`==============================\n`);

    // ── 1. Resolve both warehouses ────────────────────────────────────────────
    const [sourceWh, targetWh] = await Promise.all([
        prisma.warehouse.findUnique({ where: { name: SOURCE_WAREHOUSE } }),
        prisma.warehouse.findUnique({ where: { name: TARGET_WAREHOUSE } }),
    ]);

    if (!sourceWh) {
        console.error(`❌  Source warehouse "${SOURCE_WAREHOUSE}" not found. Available warehouses:`);
        const all = await prisma.warehouse.findMany({ select: { id: true, name: true } });
        all.forEach(w => console.log(`    - ${w.name} (ID: ${w.id})`));
        process.exit(1);
    }

    if (!targetWh) {
        console.error(`❌  Target warehouse "${TARGET_WAREHOUSE}" not found. Available warehouses:`);
        const all = await prisma.warehouse.findMany({ select: { id: true, name: true } });
        all.forEach(w => console.log(`    - ${w.name} (ID: ${w.id})`));
        process.exit(1);
    }

    console.log(`✅  Source : ${sourceWh.name} (ID: ${sourceWh.id})`);
    console.log(`✅  Target : ${targetWh.name} (ID: ${targetWh.id})\n`);

    // ── 2. Load all source stocks with quantity > 0 ───────────────────────────
    const sourceStocks = await prisma.itemStock.findMany({
        where: {
            warehouseId: sourceWh.id,
            quantity: { gt: 0 },
        },
        include: {
            item: { select: { id: true, sku: true, name: true, deletedAt: true } },
        },
    });

    if (sourceStocks.length === 0) {
        console.log(`ℹ️  No stock found in "${SOURCE_WAREHOUSE}". Nothing to transfer.`);
        await prisma.$disconnect();
        return;
    }

    // ── 3. Print preview ──────────────────────────────────────────────────────
    console.log(`Found ${sourceStocks.length} item(s) to transfer:\n`);
    console.log(`  ${'SKU'.padEnd(30)} ${'Name'.padEnd(40)} ${'Qty'}`);
    console.log(`  ${'-'.repeat(80)}`);

    for (const s of sourceStocks) {
        const sku  = s.item.sku.padEnd(30);
        const name = s.item.name.substring(0, 38).padEnd(40);
        const qty  = Number(s.quantity).toFixed(4);
        const flag = s.item.deletedAt ? ' ⚠️ (soft-deleted item)' : '';
        console.log(`  ${sku} ${name} ${qty}${flag}`);
    }

    // ── 4. Early exit if dry run ──────────────────────────────────────────────
    if (DRY_RUN) {
        console.log(`\n⚠️  DRY RUN — no data was changed.`);
        console.log(`    To execute, run with --execute flag:`);
        console.log(`    npx ts-node --project tsconfig.json transfer-warehouse.ts --execute\n`);
        await prisma.$disconnect();
        return;
    }

    // ── 5. Execute inside a single transaction ────────────────────────────────
    console.log(`\nExecuting transfer…`);

    await prisma.$transaction(async (tx) => {
        for (const s of sourceStocks) {
            const itemId      = s.item.id;
            const moveQty     = Number(s.quantity);

            // a) Check existing stock in target warehouse
            const existingTarget = await tx.itemStock.findUnique({
                where: { itemId_warehouseId: { itemId, warehouseId: targetWh.id } },
            });
            const currentTargetQty = existingTarget ? Number(existingTarget.quantity) : 0;
            const newTargetQty     = currentTargetQty + moveQty;

            // b) Upsert target warehouse stock
            await tx.itemStock.upsert({
                where: { itemId_warehouseId: { itemId, warehouseId: targetWh.id } },
                update: { quantity: newTargetQty },
                create: { itemId, warehouseId: targetWh.id, quantity: newTargetQty },
            });

            // c) Zero out source warehouse stock
            await tx.itemStock.update({
                where: { itemId_warehouseId: { itemId, warehouseId: sourceWh.id } },
                data: { quantity: 0 },
            });

            // d) Recompute item.currentStock from all stocks
            const allStocks = await tx.itemStock.findMany({ where: { itemId } });
            const totalStock = allStocks.reduce((sum, st) => sum + Number(st.quantity), 0);

            await tx.item.update({
                where: { id: itemId },
                data: { currentStock: totalStock },
            });

            console.log(`  ✓ ${s.item.sku}: moved ${moveQty} → ${TARGET_WAREHOUSE} (${TARGET_WAREHOUSE} now ${newTargetQty})`);
        }
    });

    console.log(`\n✅  Transfer complete! ${sourceStocks.length} item(s) moved from "${SOURCE_WAREHOUSE}" to "${TARGET_WAREHOUSE}".`);
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error('\n❌  Fatal error:', e);
    await prisma.$disconnect();
    process.exit(1);
});
