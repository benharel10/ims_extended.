import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log('--- PURCHASE ORDERS ---');
        const pos = await prisma.purchaseOrder.findMany({ take: 5 });
        console.log('Count:', pos.length);
        if (pos.length > 0) {
            console.log('Fields:', Object.keys(pos[0]));
            // Check for specific fields
            pos.forEach(p => console.log(`PO: ${p.id} | Number: ${p.poNumber || 'N/A'} | Status: ${p.status}`));
        }

        console.log('\n--- SALES ORDERS ---');
        const sos = await prisma.salesOrder.findMany({ take: 5 });
        console.log('Count:', sos.length);
        if (sos.length > 0) {
            console.log('Fields:', Object.keys(sos[0]));
            sos.forEach(s => console.log(`SO: ${s.id} | Number: ${s.soNumber || 'N/A'} | Status: ${s.status}`));
        }
    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
