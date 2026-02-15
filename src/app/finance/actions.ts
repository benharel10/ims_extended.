'use server'

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getSyncLogs() {
    try {
        const logs = await prisma.iCountSyncLog.findMany({
            orderBy: { timestamp: 'desc' },
            take: 50
        });
        return { success: true, data: logs };
    } catch (error) {
        return { success: false, error: 'Failed to fetch logs' };
    }
}

export async function getFinancialSummary() {
    try {
        const items = await prisma.item.findMany({
            select: {
                type: true,
                cost: true,
                currentStock: true
            }
        });

        const summary = items.reduce((acc, item) => {
            const value = item.cost * item.currentStock;
            if (item.type === 'Raw') acc.rawMaterialValue += value;
            else if (item.type === 'Product' || item.type === 'Assembly') acc.finishedGoodsValue += value;

            acc.totalInventoryValue += value;
            return acc;
        }, { rawMaterialValue: 0, finishedGoodsValue: 0, totalInventoryValue: 0 });

        return { success: true, data: summary };
    } catch (error) {
        return { success: false, error: 'Failed to calculate summary' };
    }
}

export async function getFinancialDataForChart() {
    try {
        // Fetch all confirmed sales lines with item cost data
        const salesLines = await prisma.salesLine.findMany({
            where: {
                so: {
                    status: 'Confirmed'
                }
            },
            include: {
                item: {
                    select: { cost: true }
                },
                so: {
                    select: { createdAt: true }
                }
            },
            orderBy: {
                so: { createdAt: 'asc' }
            }
        });

        // Group by Month (YYYY-MM)
        const grouped = salesLines.reduce((acc, line) => {
            const date = new Date(line.so.createdAt);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const monthLabel = date.toLocaleString('default', { month: 'short', year: '2-digit' });

            if (!acc[monthKey]) {
                acc[monthKey] = {
                    name: monthLabel,
                    revenue: 0,
                    cost: 0,
                    profit: 0,
                    originalDate: date.getTime() // for sorting
                };
            }

            const revenue = line.quantity * line.unitPrice;
            const cost = line.quantity * (line.item.cost || 0);

            acc[monthKey].revenue += revenue;
            acc[monthKey].cost += cost;
            acc[monthKey].profit += (revenue - cost);

            return acc;
        }, {} as Record<string, any>);

        // specific typing for recharts data
        const chartData = Object.values(grouped).sort((a, b) => a.originalDate - b.originalDate).map(item => ({
            name: item.name,
            Revenue: parseFloat(item.revenue.toFixed(2)),
            Costs: parseFloat(item.cost.toFixed(2)),
            Profit: parseFloat(item.profit.toFixed(2))
        }));

        return { success: true, data: chartData };
    } catch (error) {
        console.error('Failed to get chart data:', error);
        return { success: false, error: 'Failed to get financial chart data' };
    }
}
