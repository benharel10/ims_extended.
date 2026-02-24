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

        // Only count active (non-soft-deleted) items
        const items = await prisma.item.findMany({
            where: { deletedAt: null },
            select: { type: true, cost: true, currentStock: true }
        });

        const summary = items.reduce(
            (acc, item) => {
                const value = Number(item.cost) * Number(item.currentStock);
                if (item.type === 'Raw') acc.rawMaterialValue += value;
                else if (item.type === 'Product' || item.type === 'Assembly') acc.finishedGoodsValue += value;
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

        const salesLines = await prisma.salesLine.findMany({
            where: { so: { status: 'Confirmed' } },
            include: {
                item: { select: { cost: true } },
                so: { select: { createdAt: true } }
            },
            orderBy: { so: { createdAt: 'asc' } }
        });

        const grouped = salesLines.reduce<Record<string, MonthBucket>>((acc, line) => {
            const date = new Date(line.so.createdAt);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const monthLabel = date.toLocaleString('default', { month: 'short', year: '2-digit' });

            if (!acc[monthKey]) {
                acc[monthKey] = { name: monthLabel, revenue: 0, cost: 0, profit: 0, originalDate: date.getTime() };
            }

            const revenue = Number(line.quantity) * Number(line.unitPrice);
            const cost = Number(line.quantity) * Number(line.item.cost || 0);

            acc[monthKey].revenue += revenue;
            acc[monthKey].cost += cost;
            acc[monthKey].profit += revenue - cost;

            return acc;
        }, {});

        const chartData = Object.values(grouped)
            .sort((a, b) => a.originalDate - b.originalDate)
            .map(item => ({
                name: item.name,
                Revenue: parseFloat(item.revenue.toFixed(2)),
                Costs: parseFloat(item.cost.toFixed(2)),
                Profit: parseFloat(item.profit.toFixed(2))
            }));

        return { success: true, data: chartData };
    } catch (error) {
        await logError('finance.getFinancialDataForChart', error);
        return { success: false, error: 'Failed to load financial chart data. Please try again.' };
    }
}
