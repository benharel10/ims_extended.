'use server'

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { logError } from '@/lib/errorLogger';

// ─── iCount Sync Logs ─────────────────────────────────────────────────────────

export async function getSyncLogs() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const logs = await prisma.iCountSyncLog.findMany({
            orderBy: { timestamp: 'desc' },
            take: 50
        });
        return { success: true, data: logs };
    } catch (error) {
        await logError('finance.getSyncLogs', error);
        return { success: false, error: 'Failed to fetch sync logs. Please try again.' };
    }
}

// ─── Financial Summary ────────────────────────────────────────────────────────

export async function getFinancialSummary() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        // Calculate aggregations directly in the database to avoid transferring all item rows
        const rows = await prisma.$queryRaw<[{ type: string, value: number }]>`
            SELECT type, COALESCE(SUM(CAST(cost AS DOUBLE PRECISION) * CAST("currentStock" AS DOUBLE PRECISION)), 0) as value 
            FROM "Item" 
            WHERE "deletedAt" IS NULL 
            GROUP BY type
        `;

        const summary = rows.reduce(
            (acc, row) => {
                const value = Number(row.value);
                if (row.type === 'Raw') acc.rawMaterialValue += value;
                else if (row.type === 'Product' || row.type === 'Assembly') acc.finishedGoodsValue += value;
                acc.totalInventoryValue += value;
                return acc;
            },
            { rawMaterialValue: 0, finishedGoodsValue: 0, totalInventoryValue: 0 }
        );

        return { success: true, data: summary };
    } catch (error) {
        await logError('finance.getFinancialSummary', error);
        return { success: false, error: 'Failed to calculate financial summary. Please try again.' };
    }
}

// ─── Chart Data ───────────────────────────────────────────────────────────────

type MonthBucket = {
    name: string;
    revenue: number;
    cost: number;
    profit: number;
    originalDate: number;
};

export async function getFinancialDataForChart() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        // Use raw SQL to aggregate monthly financial metrics directly in the database,
        // transmitting only ~12-24 aggregate rows instead of thousands of SalesLine items.
        const rows = await prisma.$queryRaw<[{ monthKey: string, monthLabel: string, revenue: number, cost: number }]>`
            SELECT 
                TO_CHAR(o."createdAt", 'YYYY-MM') as "monthKey",
                TO_CHAR(o."createdAt", 'Mon YY') as "monthLabel",
                COALESCE(SUM(CAST(l.quantity AS DOUBLE PRECISION) * CAST(l."unitPrice" AS DOUBLE PRECISION)), 0) as "revenue",
                COALESCE(SUM(CAST(l.quantity AS DOUBLE PRECISION) * CAST(i.cost AS DOUBLE PRECISION)), 0) as "cost"
            FROM "SalesLine" l
            JOIN "SalesOrder" o ON l."soId" = o.id
            JOIN "Item" i ON l."itemId" = i.id
            WHERE o.status != 'Draft'
            GROUP BY "monthKey", "monthLabel"
            ORDER BY "monthKey" ASC
        `;

        const chartData = rows.map(row => {
            const revenue = Number(row.revenue);
            const cost = Number(row.cost);
            return {
                name: row.monthLabel,
                Revenue: parseFloat(revenue.toFixed(2)),
                Costs: parseFloat(cost.toFixed(2)),
                Profit: parseFloat((revenue - cost).toFixed(2))
            };
        });

        return { success: true, data: chartData };
    } catch (error) {
        await logError('finance.getFinancialDataForChart', error);
        return { success: false, error: 'Failed to load financial chart data. Please try again.' };
    }
}
