import { prisma } from '@/lib/prisma';

/**
 * Migration script to link existing items with warehouse strings to actual Warehouse entities
 * Run this once to fix existing data
 */
async function migrateWarehouseLinks() {
    console.log('Starting warehouse link migration...');

    // Get all items with warehouse strings but no stock links
    const items = await prisma.item.findMany({
        where: {
            warehouse: {
                not: ''
            }
        },
        include: {
            stocks: true
        }
    });

    console.log(`Found ${items.length} items with warehouse strings`);

    let linked = 0;
    let notFound = 0;

    for (const item of items) {
        if (!item.warehouse) continue;

        // Find matching warehouse (case-insensitive)
        const allWarehouses = await prisma.warehouse.findMany();
        const warehouse = allWarehouses.find(w =>
            w.name.toLowerCase() === item.warehouse!.toLowerCase()
        );

        if (warehouse) {
            // Check if stock link already exists
            const existingStock = item.stocks.find(s => s.warehouseId === warehouse.id);

            if (!existingStock && Number(item.currentStock) > 0) {
                // Create stock link
                await prisma.itemStock.create({
                    data: {
                        itemId: item.id,
                        warehouseId: warehouse.id,
                        quantity: item.currentStock
                    }
                });
                console.log(`✓ Linked ${item.sku} to warehouse ${warehouse.name} (${item.currentStock} units)`);
                linked++;
            }
        } else {
            console.log(`✗ Warehouse "${item.warehouse}" not found for ${item.sku}`);
            notFound++;
        }
    }

    console.log(`\nMigration complete:`);
    console.log(`- ${linked} items linked to warehouses`);
    console.log(`- ${notFound} items with unknown warehouses`);
}

// Run if called directly
if (require.main === module) {
    migrateWarehouseLinks()
        .then(() => {
            console.log('Done!');
            process.exit(0);
        })
        .catch(err => {
            console.error('Error:', err);
            process.exit(1);
        });
}

export { migrateWarehouseLinks };
