import { PrismaClient } from '@prisma/client';

const prodPrisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.PROD_DATABASE_URL
        }
    }
});

const localPrisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    }
});

async function resetSequence(tableName: string, idColumn: string = 'id') {
    try {
        await localPrisma.$executeRawUnsafe(`SELECT setval('"${tableName}_${idColumn}_seq"', COALESCE((SELECT MAX("${idColumn}") FROM "${tableName}") + 1, 1), false);`);
    } catch (e) {
        console.log(`Could not reset sequence for ${tableName}:`, e);
    }
}

async function main() {
    try {
        console.log('Fetching base data from production...');
        console.log('Fetching Warehouses...');
        const warehouses = await prodPrisma.warehouse.findMany();
        console.log('Fetching Items...');
        const items = await prodPrisma.item.findMany();
        console.log('Fetching ItemStocks...');
        const itemStocks = await prodPrisma.itemStock.findMany();
        console.log('Fetching BOMs...');
        const boms = await prodPrisma.bOM.findMany();
        console.log('Fetching Customers...');
        const customers = await prodPrisma.customer.findMany();
        console.log('Fetching ExternalMappings...');
        const externalMappings = await prodPrisma.externalMapping.findMany();

        console.log(`Found ${warehouses.length} warehouses, ${items.length} items, ${itemStocks.length} stocks.`);
        console.log('Copying to local...');

        // Clear existing local base data
        await localPrisma.bOM.deleteMany();
        await localPrisma.itemStock.deleteMany();
        await localPrisma.externalMapping.deleteMany();
        await localPrisma.item.deleteMany();
        await localPrisma.warehouse.deleteMany();
        await localPrisma.customer.deleteMany();

        if (warehouses.length > 0) {
            await localPrisma.warehouse.createMany({ data: warehouses });
            await resetSequence('Warehouse');
            console.log('Copied Warehouses');
        }

        if (items.length > 0) {
            await localPrisma.item.createMany({ data: items });
            await resetSequence('Item');
            console.log('Copied Items');
        }

        if (itemStocks.length > 0) {
            await localPrisma.itemStock.createMany({ data: itemStocks });
            await resetSequence('ItemStock');
            console.log('Copied ItemStocks');
        }

        if (boms.length > 0) {
            await localPrisma.bOM.createMany({ data: boms });
            await resetSequence('BOM');
            console.log('Copied BOMs');
        }
        
        if (customers.length > 0) {
            await localPrisma.customer.createMany({ data: customers });
            await resetSequence('Customer');
            console.log('Copied Customers');
        }

        if (externalMappings.length > 0) {
            await localPrisma.externalMapping.createMany({ data: externalMappings });
            await resetSequence('ExternalMapping');
            console.log('Copied External Mappings');
        }

        console.log('✅ Sync complete!');
    } catch (error) {
        console.error('Error syncing:', error);
    } finally {
        await prodPrisma.$disconnect();
        await localPrisma.$disconnect();
    }
}

main();
