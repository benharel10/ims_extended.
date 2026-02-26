/**
 * ONE-TIME database cleanup API route.
 * Access via: https://your-app.vercel.app/api/cleanup-db?secret=CLEANUP_KSW_2026
 *
 * DELETE THIS FILE after running it once.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Simple secret to prevent accidental triggering
const CLEANUP_SECRET = 'CLEANUP_KSW_2026';

export async function GET(request: NextRequest) {
    const secret = request.nextUrl.searchParams.get('secret');

    if (secret !== CLEANUP_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const results: Record<string, number> = {};

        // Delete in dependency order (children before parents)
        results.systemErrors = (await prisma.systemError.deleteMany({})).count;
        results.shipmentItems = (await prisma.packageItem.deleteMany({})).count;
        results.shipments = (await prisma.shipment.deleteMany({})).count;
        results.salesLines = (await prisma.salesLine.deleteMany({})).count;
        results.salesOrders = (await prisma.salesOrder.deleteMany({})).count;
        results.poLines = (await prisma.pOLine.deleteMany({})).count;
        results.purchaseOrders = (await prisma.purchaseOrder.deleteMany({})).count;
        results.productionRuns = (await prisma.productionRun.deleteMany({})).count;
        results.serialNumbers = (await prisma.serializedItem.deleteMany({})).count;
        results.itemStock = (await prisma.itemStock.deleteMany({})).count;
        results.boms = (await prisma.bOM.deleteMany({})).count;
        results.items = (await prisma.item.deleteMany({})).count;

        return NextResponse.json({
            success: true,
            message: '✅ Database cleaned. Warehouses and Users preserved.',
            deleted: results
        });

    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    } finally {
        await prisma.$disconnect();
    }
}
